/**
 * Sharefullの案件確定メールを受け、MyFamilleへタイミー募集停止を依頼する。
 * Script Properties:
 * - MYFAMILLE_API_BASE_URL (https://myfamille.shi-on.net)
 * - SHAREFULL_CONFIRMATION_GAS_TOKEN
 * - SHAREFULL_CONFIRMATION_GMAIL_QUERY (例: from:(sharefull) newer_than:14d)
 * - SHAREFULL_CONFIRMATION_FROM_EMAIL (確認メールの送信元アドレス)
 * - TAIMEE_CONFIRMATION_GAS_TOKEN
 * - TAIMEE_CONFIRMATION_GMAIL_QUERY (例: from:supporter@timee.co.jp newer_than:14d)
 * - TAIMEE_CONFIRMATION_FROM_EMAIL (supporter@timee.co.jp)
 */
function processSharefullConfirmationsForTaimeeClose() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSharefullConfirmationsForTaimeeCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

function processSharefullConfirmationsForTaimeeCloseLocked_() {
  var config = readSharefullCloseConfig_();
  var processed = sharefullCloseProcessedIds_();
  var label = confirmationProcessedLabel_("MYFAMILLE_SHAREFULL_CONFIRMATION_PROCESSED");

  for (;;) {
    // 処理済みスレッドを検索対象から外し、先頭から確実に読み進める。
    var threads = GmailApp.search(config.gmailQuery + " -label:" + label.getName(), 0, 100);
    if (!threads.length) break;
    var failed = false;
    threads.forEach(function(thread) {
      var threadSucceeded = true;
      thread.getMessages().forEach(function(message) {
        var messageId = message.getId();
        if (processed[messageId]) return;

        var event = parseSharefullConfirmationMail_(message, config.senderEmail);
        if (!event) return;

        var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/sharefull/confirmed", {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + config.apiToken },
          payload: JSON.stringify(event),
          muteHttpExceptions: true
        });
        var code = response.getResponseCode();
        var result;
        try { result = JSON.parse(response.getContentText() || "{}"); } catch (e) { result = {}; }
        if (code < 200 || code >= 300 || !result.ok) {
          console.warn("Sharefull確定通知の処理に失敗しました。HTTP " + code);
          threadSucceeded = false;
          return;
        }

        processed[messageId] = true;
        saveSharefullCloseProcessedIds_(processed);
      });
      if (threadSucceeded) thread.addLabel(label);
      else failed = true;
    });
    // 失敗メールを残して次回トリガーで再試行する。
    if (failed) break;
  }
}

/** 両媒体のメールをまとめて1分ごとに確認する。 */
function processSpotOfferConfirmationEmails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSharefullConfirmationsForTaimeeCloseLocked_();
    processTaimeeConfirmationsForSharefullCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

/** 初回設定時に一度実行し、両メール種別の1分ごとの確認トリガーを作成する。 */
function installSpotOfferConfirmationTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if ([
      "processSpotOfferConfirmationEmails",
      "processSharefullConfirmationsForTaimeeClose",
      "processTaimeeConfirmationsForSharefullClose"
    ].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("processSpotOfferConfirmationEmails").timeBased().everyMinutes(1).create();
}

function parseSharefullConfirmationMail_(message, expectedSender) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== expectedSender) return null;

  var subject = message.getSubject();
  var body = message.getPlainBody();
  var text = subject + "\n" + body;
  // 一般的な「確定」を含むだけのメールを誤検知しないよう、決定を表す語を限定する。
  if (!/(応募確定|応募が確定|採用決定|採用が決定|マッチング成立|候補者決定|案件確定)/.test(text)) return null;

  var jobId = sharefullCloseCapture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = sharefullCloseCapture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicationId = sharefullCloseCapture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = sharefullCloseCapture_(text, /(?:応募者|氏名)\s*[：:]?\s*([^\n\r]+)/i);
  if (!jobId && !orderId) return null;

  return {
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    application_key: applicationId || [jobId || orderId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    applicant_name: applicant || null,
    occurred_at: message.getDate().toISOString()
  };
}

function readSharefullCloseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiBaseUrl = sharefullCloseRequired_(props, "MYFAMILLE_API_BASE_URL").replace(/\/$/, "");
  if (apiBaseUrl !== "https://myfamille.shi-on.net") {
    throw new Error("MYFAMILLE_API_BASE_URLは本番URL https://myfamille.shi-on.net に設定してください");
  }
  return {
    apiBaseUrl: apiBaseUrl,
    apiToken: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_GAS_TOKEN"),
    gmailQuery: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_GMAIL_QUERY"),
    senderEmail: sharefullCloseRequired_(props, "SHAREFULL_CONFIRMATION_FROM_EMAIL").toLowerCase()
  };
}

function sharefullCloseRequired_(props, key) {
  var value = props.getProperty(key);
  if (!value || !value.trim()) throw new Error("Script Properties未設定: " + key);
  return value.trim();
}

function confirmationProcessedLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function sharefullCloseCapture_(text, pattern) {
  var match = pattern.exec(text);
  return match ? match[1].trim() : "";
}

function sharefullCloseProcessedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty("SHAREFULL_CONFIRMATION_PROCESSED_MESSAGE_IDS") || "[]";
  try {
    return JSON.parse(raw).reduce(function(map, id) { map[id] = true; return map; }, {});
  } catch (e) {
    return {};
  }
}

function saveSharefullCloseProcessedIds_(processed) {
  var ids = Object.keys(processed);
  PropertiesService.getScriptProperties().setProperty(
    "SHAREFULL_CONFIRMATION_PROCESSED_MESSAGE_IDS",
    JSON.stringify(ids.slice(-100))
  );
}

/** タイミーのマッチング通知を受け、シェアフル募集停止を依頼する。 */
function processTaimeeConfirmationsForSharefullClose() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processTaimeeConfirmationsForSharefullCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

function processTaimeeConfirmationsForSharefullCloseLocked_() {
  var config = readTaimeeCloseConfig_();
  var processed = taimeeCloseProcessedIds_();
  var label = confirmationProcessedLabel_("MYFAMILLE_TAIMEE_CONFIRMATION_PROCESSED");

  for (;;) {
    // 処理済みスレッドを検索対象から外し、先頭から確実に読み進める。
    var threads = GmailApp.search(config.gmailQuery + " -label:" + label.getName(), 0, 100);
    if (!threads.length) break;
    var failed = false;
    threads.forEach(function(thread) {
      var threadSucceeded = true;
      thread.getMessages().forEach(function(message) {
        var messageId = message.getId();
        if (processed[messageId]) return;

        var event = parseTaimeeConfirmationMail_(message, config.senderEmail);
        if (!event) return;

        var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/taimee/confirmed", {
          method: "post",
          contentType: "application/json",
          headers: { Authorization: "Bearer " + config.apiToken },
          payload: JSON.stringify(event),
          muteHttpExceptions: true
        });
        var code = response.getResponseCode();
        var result;
        try { result = JSON.parse(response.getContentText() || "{}"); } catch (e) { result = {}; }
        if (code < 200 || code >= 300 || !result.ok) {
          console.warn("タイミーマッチング通知の処理に失敗しました。HTTP " + code);
          threadSucceeded = false;
          return;
        }

        processed[messageId] = true;
        saveTaimeeCloseProcessedIds_(processed);
      });
      if (threadSucceeded) thread.addLabel(label);
      else failed = true;
    });
    // 失敗メールを残して次回トリガーで再試行する。
    if (failed) break;
  }
}

function parseTaimeeConfirmationMail_(message, expectedSender) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== expectedSender) return null;

  var subject = message.getSubject();
  var body = message.getPlainBody();
  var fullText = subject + "\n" + body;
  // Daily matching-status summaries and chat notices also mention matching.
  // Only accept the individual worker-confirmation notification.
  if (!/ワーカーが\s*\d+名マッチングしました/.test(fullText)) return null;

  var taimeeJobId = taimeeCloseCapture_(fullText, /(?:求人ID|求人番号|募集ID|募集番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var title = taimeeCloseCapture_(fullText, /(?:業務タイトル|求人タイトル|仕事タイトル)\s*[：:]?\s*([^\n\r]+)/i);
  var titleJobId = /@([0-9]{4,})@/.exec(title);
  if (!taimeeJobId && titleJobId) taimeeJobId = titleJobId[1];
  if (titleJobId) title = title.replace(/\s*@([0-9]{4,})@\s*/g, " ").trim();
  var workStart = parseTaimeeWorkStart_(fullText);
  if (!taimeeJobId && (!title || !workStart)) return null;

  return {
    taimee_job_id: taimeeJobId || undefined,
    template_title: title || undefined,
    shift_start_date: workStart ? workStart.date : undefined,
    shift_start_time: workStart ? workStart.time : undefined,
    application_key: [taimeeJobId || title, workStart ? workStart.date : "", workStart ? workStart.time : ""].join("::"),
    event_id: message.getId(),
    occurred_at: message.getDate().toISOString()
  };
}

function parseTaimeeWorkStart_(text) {
  var scheduleLine = /(?:就業日時|勤務日時|就業時間|勤務時間|日時)\s*[：:]?\s*([^\n\r]+)/.exec(text);
  if (!scheduleLine) return null;
  var dateMatch = /(20\d{2})[年\/-](\d{1,2})[月\/-](\d{1,2})日?/.exec(scheduleLine[1]);
  var timeMatch = /(\d{1,2}):(\d{2})/.exec(scheduleLine[1]);
  if (!dateMatch || !timeMatch) return null;
  return {
    date: dateMatch[1] + "-" + ("0" + dateMatch[2]).slice(-2) + "-" + ("0" + dateMatch[3]).slice(-2),
    time: ("0" + timeMatch[1]).slice(-2) + ":" + timeMatch[2]
  };
}

function readTaimeeCloseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiBaseUrl = sharefullCloseRequired_(props, "MYFAMILLE_API_BASE_URL").replace(/\/$/, "");
  if (apiBaseUrl !== "https://myfamille.shi-on.net") {
    throw new Error("MYFAMILLE_API_BASE_URLは本番URL https://myfamille.shi-on.net に設定してください");
  }
  return {
    apiBaseUrl: apiBaseUrl,
    apiToken: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_GAS_TOKEN"),
    gmailQuery: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_GMAIL_QUERY"),
    senderEmail: sharefullCloseRequired_(props, "TAIMEE_CONFIRMATION_FROM_EMAIL").toLowerCase()
  };
}

function taimeeCloseCapture_(text, pattern) {
  var match = pattern.exec(text);
  return match ? match[1].trim() : "";
}

function taimeeCloseProcessedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty("TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS") || "[]";
  try {
    return JSON.parse(raw).reduce(function(map, id) { map[id] = true; return map; }, {});
  } catch (e) {
    return {};
  }
}

function saveTaimeeCloseProcessedIds_(processed) {
  var ids = Object.keys(processed);
  PropertiesService.getScriptProperties().setProperty(
    "TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS",
    JSON.stringify(ids.slice(-100))
  );
}
