/**
 * Sharefullテスト応募通知（Google Apps Script）。
 *
 * Script Propertiesに次を設定してから時間主導トリガーで実行する。
 * - MYFAMILLE_TEST_API_BASE_URL
 * - MYFAMILLE_TEST_API_TOKEN
 * - SHAREFULL_TEST_GMAIL_QUERY（必須: label:SharefullTest を含む、実メール用検索条件）
 * - SHAREFULL_TEST_ALLOWED_SENDERS (comma-separated exact email addresses)
 * - SHAREFULL_TEST_JOB_ID, SHAREFULL_TEST_ORDER_ID, or SHAREFULL_TEST_REQUEST_ID (test fixture)
 *
 * LINE WORKS認証情報はGASに置かず、テストAPI側で既存の送信設定を使う。
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

        // APIはテストDBへの記録とLINE WORKS送信の両方が成功してから200を返す。
        // LINE WORKSの資格情報・チャンネル選択はAPI側で既存設定を共有する。
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
  var requestId = capture_(text, /(?:テスト案件ID|request_id)\s*[：:]?\s*([0-9a-f-]{36})/i);
  var applicationId = capture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var applicant = capture_(text, /(?:応募者|氏名)\s*[：:]?\s*([^\n\r]+)/i);
  if (!jobId && !orderId && !requestId) return null;
  if (syntheticTestMail && (jobId !== config.testJobId && orderId !== config.testOrderId && requestId !== config.testRequestId)) return null;

  return {
    request_id: requestId || undefined,
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    provider: "sharefull",
    // 応募メールと応募確定メールが同じ応募を更新できるよう、message IDとは分離した安定キーにする。
    application_key: applicationId || [jobId || orderId || requestId, applicant || "unknown"].join("::"),
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

function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    apiBaseUrl: required_(props, "MYFAMILLE_TEST_API_BASE_URL").replace(/\/$/, ""),
    apiToken: required_(props, "MYFAMILLE_TEST_API_TOKEN"),
    gmailQuery: required_(props, "SHAREFULL_TEST_GMAIL_QUERY"),
    allowedSenders: (props.getProperty("SHAREFULL_TEST_ALLOWED_SENDERS") || "").split(",").map(function(value) { return value.trim().toLowerCase(); }).filter(Boolean),
    testJobId: (props.getProperty("SHAREFULL_TEST_JOB_ID") || "").trim(),
    testOrderId: (props.getProperty("SHAREFULL_TEST_ORDER_ID") || "").trim(),
    testRequestId: (props.getProperty("SHAREFULL_TEST_REQUEST_ID") || "").trim()
  };
  if (!/^https:\/\/famille-shift-matching-test\.vercel\.app\/?$/.test(config.apiBaseUrl)) {
    throw new Error("テスト用Vercel URL以外は設定できません");
  }
  if (!/\blabel:[^\s]+/i.test(config.gmailQuery) || /\bin:anywhere\b/i.test(config.gmailQuery)) {
    throw new Error("実メール検索条件にはテスト用Gmailラベルを指定してください（label:...）。");
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
 * 実メール形式の疎通確認用。テスト案件ID/管理番号/テスト案件UUIDが設定済みの場合だけ、
 * ログイン中のGoogleアカウント自身へ合成テストメールを1通送信する。
 * 外部送信を伴うため、検証者が明示的に手動実行する。
 */
function sendSharefullSyntheticTestEmail() {
  var config = readConfig_();
  var recipient = Session.getActiveUser().getEmail();
  if (!recipient) throw new Error("送信先アカウントを特定できません");
  if (!config.testJobId && !config.testOrderId && !config.testRequestId) throw new Error("テスト求人ID・管理番号・案件UUIDのいずれかが未設定です");
  var applicationId = "GAS-TEST-" + Utilities.getUuid();
  var lines = [
    "SHAREFULL_TEST_EVENT",
    "応募ID: " + applicationId,
    config.testRequestId ? "テスト案件ID: " + config.testRequestId : null,
    config.testJobId ? "求人ID: " + config.testJobId : null,
    config.testOrderId ? "管理番号: " + config.testOrderId : null,
    "応募者: テスト応募者",
    "応募日時: " + new Date().toISOString()
  ].filter(Boolean);
  GmailApp.sendEmail(recipient, "[テスト] Sharefull応募通知", lines.join("\n"));
  console.info("合成テストメールを自身のアカウントへ送信しました。応募ID: " + applicationId);
}
