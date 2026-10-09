/**
 * Sharefullの案件確定メールを受け、MyFamilleへタイミー募集停止を依頼する。
 * Script Properties:
 * - MYFAMILLE_API_BASE_URL (https://myfamille.shi-on.net)
 * - SHAREFULL_CONFIRMATION_GAS_TOKEN
 * - SHAREFULL_CONFIRMATION_GMAIL_QUERY (例: from:(sharefull) newer_than:14d)
 * - SHAREFULL_CONFIRMATION_FROM_EMAIL (確認メールの送信元アドレス)
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

  for (var start = 0; ; start += 100) {
    var threads = GmailApp.search(config.gmailQuery, start, 100);
    threads.forEach(function(thread) {
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
          return;
        }

        processed[messageId] = true;
        saveSharefullCloseProcessedIds_(processed);
      });
    });
    if (threads.length < 100) break;
  }
}

/** 初回設定時に一度実行し、1分ごとのGmail確認トリガーを作成する。 */
function installSharefullConfirmationTaimeeCloseTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "processSharefullConfirmationsForTaimeeClose") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("processSharefullConfirmationsForTaimeeClose").timeBased().everyMinutes(1).create();
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
    JSON.stringify(ids.slice(-1000))
  );
}
