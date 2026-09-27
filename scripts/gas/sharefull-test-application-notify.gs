/**
 * Sharefullテスト応募通知（Google Apps Script）。
 *
 * Script Propertiesに次を設定してから時間主導トリガーで実行する。
 * - MYFAMILLE_TEST_API_BASE_URL
 * - MYFAMILLE_TEST_API_TOKEN
 * - SHAREFULL_TEST_GMAIL_QUERY（例: from:(sharefull) newer_than:7d）
 * - SHAREFULL_TEST_LINEWORKS_API_URL
 * - SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN
 * - SHAREFULL_TEST_LINEWORKS_CHANNEL_ID
 *
 * 本番Gmail・本番API・本番LINE WORKSの値は設定しない。
 */
function processSharefullTestApplicationNotifications() {
  var config = readConfig_();
  var threads = GmailApp.search(config.gmailQuery, 0, 50);
  var processed = processedIds_();

  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(message) {
      var messageId = message.getId();
      if (processed[messageId]) return;

      var event = parseSharefullTestMail_(message);
      if (!event) return;

      var ingest = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/sharefull/test-application", {
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + config.apiToken },
        payload: JSON.stringify(event),
        muteHttpExceptions: true
      });
      var ingestCode = ingest.getResponseCode();
      var ingestBody = JSON.parse(ingest.getContentText() || "{}");
      if (ingestCode < 200 || ingestCode >= 300 || !ingestBody.ok) {
        console.warn("Sharefull応募の登録に失敗: " + ingestCode);
        return;
      }

      // API側で重複だった場合も、このGmailメッセージは処理済みにする。
      if (!ingestBody.duplicate) {
        sendLineWorks_(config, buildNotificationText_(event, ingestBody.request || {}));
      }
      markProcessed_(messageId);
    });
  });
}

function parseSharefullTestMail_(message) {
  var body = message.getPlainBody();
  var subject = message.getSubject();
  var text = subject + "\n" + body;
  var jobId = capture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = capture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicationId = capture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = capture_(text, /(?:応募者|氏名)\s*[：:]?\s*([^\n\r]+)/i);
  if (!jobId && !orderId) return null;

  return {
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    provider: "sharefull",
    // 応募メールと応募確定メールが同じ応募を更新できるよう、message IDとは分離した安定キーにする。
    application_key: applicationId || [jobId || orderId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    state: detectState_(text),
    applicant_name: applicant || null,
    occurred_at: message.getDate().toISOString()
  };
}

function detectState_(text) {
  return /応募確定|採用決定|マッチング成立|確定/.test(text) ? "confirmed" : "applied";
}

function sendLineWorks_(config, text) {
  var response = UrlFetchApp.fetch(config.lineworksApiUrl + "/channels/" + encodeURIComponent(config.lineworksChannelId) + "/messages", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + config.lineworksAccessToken },
    payload: JSON.stringify({ content: { type: "text", text: text } }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("LINE WORKS通知に失敗: " + response.getResponseCode());
  }
}

function buildNotificationText_(event, request) {
  return [
    "【テスト】シェアフル応募通知",
    "状態: " + event.state,
    "応募者: " + (event.applicant_name || "不明"),
    "求人ID: " + (request.sharefull_job_id || event.sharefull_job_id || "不明"),
    "管理番号: " + (request.sharefull_order_id || event.sharefull_order_id || "不明"),
    "勤務日: " + (request.shift_start_date || "不明"),
    "勤務開始: " + (request.shift_start_time || "不明"),
    "受信日時: " + event.occurred_at
  ].join("\n");
}

function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    apiBaseUrl: required_(props, "MYFAMILLE_TEST_API_BASE_URL").replace(/\/$/, ""),
    apiToken: required_(props, "MYFAMILLE_TEST_API_TOKEN"),
    gmailQuery: required_(props, "SHAREFULL_TEST_GMAIL_QUERY"),
    lineworksApiUrl: required_(props, "SHAREFULL_TEST_LINEWORKS_API_URL").replace(/\/$/, ""),
    lineworksAccessToken: required_(props, "SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN"),
    lineworksChannelId: required_(props, "SHAREFULL_TEST_LINEWORKS_CHANNEL_ID")
  };
  if (config.apiBaseUrl.indexOf("famille-shift-matching-test.vercel.app") === -1) {
    throw new Error("テスト用Vercel URL以外は設定できません");
  }
  return config;
}

function required_(props, key) {
  var value = props.getProperty(key);
  if (!value) throw new Error("Script Properties未設定: " + key);
  return value.trim();
}

function capture_(text, pattern) {
  var match = pattern.exec(text);
  return match ? match[1].trim() : "";
}

function processedIds_() {
  var raw = PropertiesService.getScriptProperties().getProperty("SHAREFULL_TEST_PROCESSED_MESSAGE_IDS") || "[]";
  try { return JSON.parse(raw).reduce(function(map, id) { map[id] = true; return map; }, {}); } catch (e) { return {}; }
}

function markProcessed_(messageId) {
  var props = PropertiesService.getScriptProperties();
  var current = Object.keys(processedIds_());
  current.push(messageId);
  props.setProperty("SHAREFULL_TEST_PROCESSED_MESSAGE_IDS", JSON.stringify(current.slice(-1000)));
}
