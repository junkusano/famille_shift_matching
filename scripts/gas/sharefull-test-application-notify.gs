/**
 * Sharefullテスト応募通知（Google Apps Script）。
 *
 * Script Propertiesに次を設定してから時間主導トリガーで実行する。
 * - MYFAMILLE_TEST_API_BASE_URL
 * - MYFAMILLE_TEST_API_TOKEN
 * - SHAREFULL_TEST_GMAIL_QUERY（必須: label:SharefullTest を含む、実メール用検索条件）
 * - SHAREFULL_TEST_LINEWORKS_BOT_ID
 * - SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN
 * - SHAREFULL_TEST_LINEWORKS_CHANNEL_ID
 * - SHAREFULL_TEST_ALLOWED_SENDERS (comma-separated exact email addresses)
 * - SHAREFULL_TEST_JOB_ID or SHAREFULL_TEST_ORDER_ID (test fixture for synthetic mail)
 *
 * 本番Gmail・本番API・本番LINE WORKSの値は設定しない。
 */
function processSharefullTestApplicationNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.warn("別の通知処理が実行中のため、今回はスキップしました");
    return;
  }
  try {
    var config = readConfig_();
    var processed = notificationState_();
    var threadsById = {};
    GmailApp.search(config.gmailQuery, 0, 50).forEach(function(thread) { threadsById[thread.getId()] = thread; });
    // 実メール検索とは別に、合成メールは自分宛て・専用件名だけを追加取得する。
    GmailApp.search('in:anywhere from:me to:me subject:"[テスト] Sharefull応募通知" newer_than:2d', 0, 20)
      .forEach(function(thread) { threadsById[thread.getId()] = thread; });
    var threads = Object.keys(threadsById).map(function(id) { return threadsById[id]; });

    threads.forEach(function(thread) {
      thread.getMessages().forEach(function(message) {
        var messageId = message.getId();
        if (processed[messageId] === "sent") return;

        var event = parseSharefullTestMail_(message, config);
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

        // DB登録済みでも通知未達の可能性があるため、GAS側の送信済み記録が
        // 確認できない限り通知を再試行する。送信後にのみ処理済みにする。
        sendLineWorks_(config, buildNotificationText_(event, ingestBody.request || {}));
        markNotificationSent_(messageId);
        processed[messageId] = "sent";
      });
    });
  } finally {
    lock.releaseLock();
  }
}

function parseSharefullTestMail_(message, config) {
  var body = message.getPlainBody();
  var subject = message.getSubject();
  var text = subject + "\n" + body;
  var from = String(message.getFrom() || "").match(/<([^>]+)>/);
  from = (from ? from[1] : String(message.getFrom() || "")).trim().toLowerCase();
  var senderAllowed = config.allowedSenders.indexOf(from) >= 0;
  var syntheticTestMail = /^\[テスト\]\s*sharefull応募通知/i.test(subject) && /SHAREFULL_TEST_EVENT/.test(body);
  if (!senderAllowed && !syntheticTestMail) return null;
  if (!/(応募|マッチング|採用)/i.test(subject)) return null;
  var jobId = capture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = capture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicationId = capture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = capture_(text, /(?:応募者|氏名)\s*[：:]?\s*([^\n\r]+)/i);
  if (!jobId && !orderId) return null;
  if (syntheticTestMail && (jobId !== config.testJobId && orderId !== config.testOrderId)) return null;

  return {
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    provider: "sharefull",
    // 応募メールと応募確定メールが同じ応募を更新できるよう、message IDとは分離した安定キーにする。
    application_key: applicationId || [jobId || orderId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    state: detectState_(subject + "\n" + body),
    applicant_name: applicant || null,
    occurred_at: message.getDate().toISOString()
  };
}

function detectState_(text) {
  if (/応募取消|応募キャンセル|辞退/.test(text)) return "cancelled";
  return /応募確定|採用決定|マッチング成立|確定/.test(text) ? "confirmed" : "applied";
}

function sendLineWorks_(config, text) {
  var url = "https://www.worksapis.com/v1.0/bots/" + encodeURIComponent(config.lineworksBotId) +
    "/channels/" + encodeURIComponent(config.lineworksChannelId) + "/messages";
  var response = UrlFetchApp.fetch(url, {
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
    lineworksBotId: required_(props, "SHAREFULL_TEST_LINEWORKS_BOT_ID"),
    lineworksAccessToken: required_(props, "SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN"),
    lineworksChannelId: required_(props, "SHAREFULL_TEST_LINEWORKS_CHANNEL_ID"),
    allowedSenders: (props.getProperty("SHAREFULL_TEST_ALLOWED_SENDERS") || "").split(",").map(function(value) { return value.trim().toLowerCase(); }).filter(Boolean),
    testJobId: (props.getProperty("SHAREFULL_TEST_JOB_ID") || "").trim(),
    testOrderId: (props.getProperty("SHAREFULL_TEST_ORDER_ID") || "").trim()
  };
  if (!/^https:\/\/famille-shift-matching-test\.vercel\.app\/?$/.test(config.apiBaseUrl)) {
    throw new Error("テスト用Vercel URL以外は設定できません");
  }
  if (!/\blabel:[^\s]+/i.test(config.gmailQuery) || /\bin:anywhere\b/i.test(config.gmailQuery)) {
    throw new Error("実メール検索条件にはテスト用Gmailラベルを指定してください（label:...）。");
  }
  if (["52e31296-6764-0a1e-5b37-11023360216b", "99142491"].indexOf(config.lineworksChannelId) >= 0) {
    throw new Error("本番LINE WORKSチャンネルIDはテスト送信先に設定できません");
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

function notificationState_() {
  var raw = PropertiesService.getScriptProperties().getProperty("SHAREFULL_TEST_NOTIFICATION_STATE") || "{}";
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

function markNotificationSent_(messageId) {
  var props = PropertiesService.getScriptProperties();
  var state = notificationState_();
  state[messageId] = "sent";
  var ids = Object.keys(state);
  if (ids.length > 1000) ids.slice(0, ids.length - 1000).forEach(function(id) { delete state[id]; });
  props.setProperty("SHAREFULL_TEST_NOTIFICATION_STATE", JSON.stringify(state));
}

/**
 * 実メール形式の疎通確認用。テスト案件ID/管理番号が設定済みの場合だけ、
 * ログイン中のGoogleアカウント自身へ合成テストメールを1通送信する。
 * 外部送信を伴うため、検証者が明示的に手動実行する。
 */
function sendSharefullSyntheticTestEmail() {
  var config = readConfig_();
  var recipient = Session.getActiveUser().getEmail();
  if (!recipient) throw new Error("送信先アカウントを特定できません");
  if (!config.testJobId && !config.testOrderId) throw new Error("テスト案件IDまたは管理番号が未設定です");
  var applicationId = "GAS-TEST-" + Utilities.getUuid();
  var lines = [
    "SHAREFULL_TEST_EVENT",
    "応募ID: " + applicationId,
    config.testJobId ? "求人ID: " + config.testJobId : null,
    config.testOrderId ? "管理番号: " + config.testOrderId : null,
    "応募者: テスト応募者",
    "応募日時: " + new Date().toISOString()
  ].filter(Boolean);
  GmailApp.sendEmail(recipient, "[テスト] Sharefull応募通知", lines.join("\n"));
  console.info("合成テストメールを自身のアカウントへ送信しました。応募ID: " + applicationId);
}
