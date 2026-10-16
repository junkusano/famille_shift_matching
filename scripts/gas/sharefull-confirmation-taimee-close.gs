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
  var activationTimestamp = confirmationActivationTimestamp_();

  for (var start = 0; ; start += 100) {
    // 通常の確定メールは処理済みスレッドを除外する。
    var threads = GmailApp.search(config.gmailQuery + " -label:" + label.getName(), start, 100);
    if (!threads.length) break;
    var failed = false;
    threads.forEach(function(thread) {
      var threadSucceeded = true;
      thread.getMessages().forEach(function(message) {
        if (!processSharefullConfirmationMessage_(message, config, activationTimestamp, processed, "confirmed")) threadSucceeded = false;
      });
      if (threadSucceeded) thread.addLabel(label);
      else failed = true;
    });
    // 失敗メールを残して次回トリガーで再試行する。
    if (failed) break;
  }

  // 処理済みラベルが付いたスレッドにも後からキャンセル通知が届くため、
  // キャンセルだけはラベルを除外せず検索する。通常の確定メールは再送しない。
  for (var cancellationStart = 0; ; cancellationStart += 100) {
    var cancellationThreads = GmailApp.search(config.gmailQuery, cancellationStart, 100);
    if (!cancellationThreads.length) break;
    var cancellationFailed = false;
    cancellationThreads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        if (!processSharefullConfirmationMessage_(message, config, activationTimestamp, processed, "cancelled")) {
          cancellationFailed = true;
        }
      });
    });
    if (cancellationFailed) break;
  }
}

function processSharefullConfirmationMessage_(message, config, activationTimestamp, processed, requiredState) {
  var messageId = message.getId();
  if (processed[messageId]) return true;
  if (isConfirmationMessageBeforeActivation_(message, activationTimestamp)) {
    processed[messageId] = true;
    saveSharefullCloseProcessedIds_(processed);
    return true;
  }

  var event = parseSharefullConfirmationMail_(message, config.senderEmail);
  if (!event) {
    // 検索条件に合う送信元から届いた確定/取消通知なのにIDを抽出できない場合、
    // 成功扱いにするとスレッドが処理済みになり、次回以降の再試行から漏れる。
    var from = message.getFrom();
    var senderMatch = /<([^>]+)>/.exec(from);
    var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
    var text = message.getSubject() + "\n" + message.getPlainBody();
    var hasEventSignal = sharefullConfirmationSignal_(text, requiredState);
    if (senderEmail === config.senderEmail && hasEventSignal) {
      console.warn("Sharefull通知の案件IDを抽出できません。処理済みにせず次回再試行します。");
      return false;
    }
    return true;
  }
  if (event.state !== requiredState) return true;

  var endpoint = event.state === "cancelled" ? "cancelled" : "confirmed";
  var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/sharefull/" + endpoint, {
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
    console.warn("Sharefull応募イベントの処理に失敗しました。HTTP " + code);
    return false;
  }

  processed[messageId] = true;
  saveSharefullCloseProcessedIds_(processed);
  return true;
}

/** 両媒体のメールをまとめて5分ごとに確認する。 */
function processSpotOfferConfirmationEmails() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSharefullConfirmationsForTaimeeCloseLocked_();
    processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

/** 初回設定時に一度実行し、両メール種別の5分ごとの確認トリガーを作成する。 */
function installSpotOfferConfirmationTriggers() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT")) {
    props.setProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT", new Date().toISOString());
  }
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if ([
      "processSpotOfferConfirmationEmails",
      "processSharefullConfirmationsForTaimeeClose",
      "processTaimeeConfirmationsForSharefullClose"
    ].includes(trigger.getHandlerFunction())) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("processSpotOfferConfirmationEmails").timeBased().everyMinutes(5).create();
}

function confirmationActivationTimestamp_() {
  var raw = PropertiesService.getScriptProperties().getProperty("SPOT_OFFER_CONFIRMATION_ACTIVATED_AT");
  var timestamp = raw ? Date.parse(raw) : NaN;
  if (!isFinite(timestamp)) {
    throw new Error("installSpotOfferConfirmationTriggersを先に実行し、起動時刻を保存してください");
  }
  return timestamp;
}

function isConfirmationMessageBeforeActivation_(message, activationTimestamp) {
  return message.getDate().getTime() <= activationTimestamp;
}

function parseSharefullConfirmationMail_(message, expectedSender) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== expectedSender) return null;

  var subject = message.getSubject();
  var body = message.getPlainBody();
  var text = subject + "\n" + body;
  var cancelled = sharefullConfirmationSignal_(text, "cancelled");
  // 一般的な「確定」を含むだけのメールを誤検知しないよう、決定を表す語を限定する。
  if (!cancelled && !sharefullConfirmationSignal_(text, "confirmed")) return null;

  var jobId = sharefullCloseCapture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = sharefullCloseCapture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i)
    || sharefullCloseCapture_(text, /https?:\/\/client\.sharefull\.com\/orders\/([0-9]+)/i)
    || sharefullCloseCapture_(text, /(?:^|[\s(])\/orders\/([0-9]+)/im);
  var applicationId = sharefullCloseCapture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = sharefullCloseCapture_(text, /(?:^|\r?\n)[ \t]*[◆♦]?[ \t]*(?:キャンセルした応募者|応募者|候補者|氏名)[ \t]*[：:][ \t]*([^\n\r]+)/i)
    || sharefullCloseCapture_(text, /(?:^|\r?\n)[ \t]*[◆♦]?[ \t]*(?:キャンセルした応募者|応募者|候補者)[ \t]*\r?\n[ \t]*([^\n\r]+)/i);
  applicant = applicant.replace(/\s*さん.*$/i, "").replace(/\s*\d+\s*歳.*$/, "").replace(/\s*[（(](女性|男性|その他).*$/, "").trim();
  var cancellationReason = sharefullCloseCapture_(text, /(?:選択した理由|キャンセル理由)[ \t]*[：:][ \t]*([^\n\r]+)/i);
  var reasonComment = sharefullCloseCapture_(text, /理由詳細コメント[ \t]*[：:][ \t]*([^\n\r]+)/i);
  if (reasonComment) cancellationReason = [cancellationReason, reasonComment].filter(Boolean).join(" / ");
  if (!jobId && !orderId) return null;

  return {
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    application_key: applicationId || [jobId || orderId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    applicant_name: applicant || null,
    cancellation_reason: cancelled ? cancellationReason || null : null,
    state: cancelled ? "cancelled" : "confirmed",
    occurred_at: message.getDate().toISOString()
  };
}

function sharefullConfirmationSignal_(text, state) {
  if (state === "cancelled") {
    return /応募キャンセル|応募者のキャンセル|キャンセルした応募者|応募をキャンセル/.test(text);
  }
  return /応募確定|応募が確定|採用決定|採用が決定|マッチング成立|候補者決定|候補者が決定|案件確定/.test(text);
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
function processSpotOfferTaimeeConfirmationsForSharefullClose() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_();
  } finally {
    lock.releaseLock();
  }
}

function processSpotOfferTaimeeConfirmationsForSharefullCloseLocked_() {
  var config = readTaimeeCloseConfig_();
  var processed = taimeeCloseProcessedIds_();
  var label = confirmationProcessedLabel_("MYFAMILLE_TAIMEE_CONFIRMATION_PROCESSED");
  var activationTimestamp = confirmationActivationTimestamp_();

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

        if (isConfirmationMessageBeforeActivation_(message, activationTimestamp)) {
          processed[messageId] = true;
          saveTaimeeCloseProcessedIds_(processed);
          return;
        }

        var event = parseSpotOfferTaimeeConfirmationMail_(message, config.senderEmail);
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

function parseSpotOfferTaimeeConfirmationMail_(message, expectedSender) {
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

  // タイミー通知に含まれる /offerings/{id} は実際のタイミー求人ID。
  // 業務タイトルの @数字@ はMyFamille側の介護事業所IDとして使われるため、求人IDには使わない。
  var taimeeJobId = taimeeCloseCapture_(fullText, /\/offerings\/([0-9]{4,})(?:[/?#\s)\]>]|$)/i);
  if (!taimeeJobId) {
    taimeeJobId = taimeeCloseCapture_(fullText, /(?:求人ID|求人番号|募集ID|募集番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  }
  var title = taimeeCloseCapture_(fullText, /(?:業務タイトル|求人タイトル|仕事タイトル)\s*[：:]?\s*([^\n\r]+)/i);
  var titleJobId = /@([0-9]{4,})@/.exec(title);
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

