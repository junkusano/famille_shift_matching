/**
 * タイミーの案件確定メールを検知し、対応するシェアフル募集の停止を依頼する。
 * Script Properties:
 * - MYFAMILLE_API_BASE_URL (https://myfamille.shi-on.net)
 * - TAIMEE_CONFIRMATION_GAS_TOKEN
 * - TAIMEE_CONFIRMATION_GMAIL_QUERY
 * - TAIMEE_CONFIRMATION_FROM_EMAIL
 * - TAIMEE_CONFIRMATION_JOB_ID_REGEX (案件IDを含む正規表現。第1キャプチャが案件ID)
 * - TAIMEE_CONFIRMATION_APPLICATION_KEY_REGEX (応募を安定して識別する正規表現。第1キャプチャ)
 * - TAIMEE_CONFIRMATION_CONFIRMED_REGEX (確定メール本文を識別する正規表現)
 * - TAIMEE_CONFIRMATION_APPLICANT_NAME_REGEX (任意。第1キャプチャが応募者名)
 */
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
  var config = readTaimeeConfirmationConfig_();
  var processed = taimeeConfirmationProcessedIds_();
  for (var start = 0; ; start += 100) {
    var threads = GmailApp.search(config.gmailQuery, start, 100);
    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        var messageId = message.getId();
        if (processed[messageId]) return;
        var event = parseTaimeeConfirmationMail_(message, config);
        if (!event) return;
        var response = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/taimee/confirmed", {
          method: "post", contentType: "application/json",
          headers: { Authorization: "Bearer " + config.apiToken },
          payload: JSON.stringify(event), muteHttpExceptions: true
        });
        var code = response.getResponseCode();
        var result;
        try { result = JSON.parse(response.getContentText() || "{}"); } catch (e) { result = {}; }
        if (code < 200 || code >= 300 || !result.ok) {
          console.warn("タイミー確定通知の処理に失敗しました。HTTP " + code);
          return;
        }
        processed[messageId] = true;
        saveTaimeeConfirmationProcessedIds_(processed);
      });
    });
    if (threads.length < 100) break;
  }
}

/** 初回設定時に一度実行し、1分ごとのGmail確認トリガーを作成する。 */
function installTaimeeConfirmationSharefullCloseTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === "processTaimeeConfirmationsForSharefullClose") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("processTaimeeConfirmationsForSharefullClose").timeBased().everyMinutes(1).create();
}

function parseTaimeeConfirmationMail_(message, config) {
  var from = message.getFrom();
  var senderMatch = /<([^>]+)>/.exec(from);
  var senderEmail = (senderMatch ? senderMatch[1] : from).trim().toLowerCase();
  if (senderEmail !== config.senderEmail) return null;
  var text = message.getSubject() + "\n" + message.getPlainBody();
  if (!config.confirmedRegex.test(text)) return null;
  var jobId = taimeeConfirmationCapture_(text, config.jobIdRegex);
  var applicationKey = taimeeConfirmationCapture_(text, config.applicationKeyRegex);
  if (!jobId || !applicationKey) return null;
  return {
    taimee_job_id: jobId,
    application_key: applicationKey,
    event_id: message.getId(),
    applicant_name: taimeeConfirmationCapture_(text, config.applicantNameRegex) || null,
    occurred_at: message.getDate().toISOString()
  };
}

function readTaimeeConfirmationConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiBaseUrl = taimeeConfirmationRequired_(props, "MYFAMILLE_API_BASE_URL").replace(/\/$/, "");
  if (apiBaseUrl !== "https://myfamille.shi-on.net") throw new Error("MYFAMILLE_API_BASE_URLは本番URL https://myfamille.shi-on.net に設定してください");
  var applicantNamePattern = props.getProperty("TAIMEE_CONFIRMATION_APPLICANT_NAME_REGEX");
  return {
    apiBaseUrl: apiBaseUrl,
    apiToken: taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_GAS_TOKEN"),
    gmailQuery: taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_GMAIL_QUERY"),
    senderEmail: taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_FROM_EMAIL").toLowerCase(),
    jobIdRegex: new RegExp(taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_JOB_ID_REGEX"), "i"),
    applicationKeyRegex: new RegExp(taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_APPLICATION_KEY_REGEX"), "i"),
    confirmedRegex: new RegExp(taimeeConfirmationRequired_(props, "TAIMEE_CONFIRMATION_CONFIRMED_REGEX"), "i"),
    applicantNameRegex: applicantNamePattern ? new RegExp(applicantNamePattern, "i") : null
  };
}

function taimeeConfirmationRequired_(props, key) {
  var value = props.getProperty(key);
  if (!value || !value.trim()) throw new Error("Script Properties未設定: " + key);
  return value.trim();
}

function taimeeConfirmationCapture_(text, pattern) {
  if (!pattern) return "";
  var match = pattern.exec(text);
  return match && match[1] ? match[1].trim() : "";
}

function taimeeConfirmationProcessedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty("TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS") || "[]";
  try { return JSON.parse(raw).reduce(function(map, id) { map[id] = true; return map; }, {}); }
  catch (e) { return {}; }
}

function saveTaimeeConfirmationProcessedIds_(processed) {
  var ids = Object.keys(processed);
  PropertiesService.getScriptProperties().setProperty("TAIMEE_CONFIRMATION_PROCESSED_MESSAGE_IDS", JSON.stringify(ids.slice(-1000)));
}
