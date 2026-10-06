/**
 * Sharefullの「候補者が決定しました」通知をテスト環境へ連携するGAS。
 *
 * Script Properties:
 * - MYFAMILLE_TEST_API_BASE_URL (famille-shift-matching-test.vercel.app のみ)
 * - MYFAMILLE_TEST_API_TOKEN
 * - SHAREFULL_TEST_GMAIL_QUERY
 * - SHAREFULL_TEST_SENDER_EMAIL (Sharefull通知の実際の送信元アドレス)
 * - SHAREFULL_TEST_LINEWORKS_API_URL
 * - SHAREFULL_TEST_LINEWORKS_CLIENT_ID
 * - SHAREFULL_TEST_LINEWORKS_CLIENT_SECRET
 * - SHAREFULL_TEST_LINEWORKS_SERVICE_ACCOUNT
 * - SHAREFULL_TEST_LINEWORKS_PRIVATE_KEY (PEM; store line breaks as \\n)
 * - SHAREFULL_TEST_LINEWORKS_BOT_ID
 * - SHAREFULL_TEST_LINEWORKS_CHANNEL_ID (テスト用グループのみ)
 *
 * 本番データ・本番LINE WORKS送信先では実行しない。候補者情報を扱うため、
 * テスト用のメールとテスト案件であることを人が確認してからトリガーを有効化する。
 */
function processSharefullTestApplicationNotifications() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    var config = readConfig_();
    var props = PropertiesService.getScriptProperties();
    pruneOldMessageStates_(props, Date.now());
    var pageSize = 50;
    var maxThreadsPerRun = 500;
    for (var start = 0; start < maxThreadsPerRun; start += pageSize) {
      var threads = GmailApp.search(config.gmailQuery, start, pageSize);
      if (!threads.length) break;
      threads.forEach(function(thread) {
        thread.getMessages().forEach(function(message) {
          try {
            var event = parseSharefullTestMail_(message, config);
            if (!event) return;

            var stateKey = messageStateKey_(message.getId());
            var state = props.getProperty(stateKey) || "";
            if (state === "notified" || /^notified:\d+$/.test(state)) return;

            var apiEvent = {
              request_id: event.request_id,
              sharefull_job_id: event.sharefull_job_id,
              sharefull_order_id: event.sharefull_order_id,
              provider: event.provider,
              application_key: event.application_key,
              event_id: event.event_id,
              state: event.state,
              applicant_name: event.applicant_name,
              occurred_at: event.occurred_at
            };
            var ingest = UrlFetchApp.fetch(config.apiBaseUrl + "/api/rpa/sharefull/test-application", {
              method: "post",
              contentType: "application/json",
              headers: { Authorization: "Bearer " + config.apiToken },
              payload: JSON.stringify(apiEvent),
              muteHttpExceptions: true
            });
            var ingestCode = ingest.getResponseCode();
            var ingestBody = safeJson_(ingest.getContentText());
            if (ingestCode < 200 || ingestCode >= 300 || !ingestBody.ok) {
              console.warn("Sharefullテスト応募の登録に失敗: message=" + message.getId() + " status=" + ingestCode);
              return;
            }

            // duplicateでも通知する。API登録後に前回実行が中断した場合の通知欠落を防ぐ。
            // 通知成功後の状態を保存し、通常の再実行で二重送信しない。
            sendLineWorks_(config, buildNotificationText_(event, ingestBody.request || {}));
            props.setProperty(stateKey, "notified:" + Date.now());
          } catch (error) {
            console.error("Sharefull通知処理に失敗: message=" + message.getId() + " error=" + safeError_(error));
          }
        });
      });
      if (threads.length < pageSize) break;
    }
  } finally {
    lock.releaseLock();
  }
}

/** Remove only our own successful-message markers after 30 days to bound Script Properties. */
function pruneOldMessageStates_(props, nowMs) {
  var retentionMs = 30 * 24 * 60 * 60 * 1000;
  var cutoff = nowMs - retentionMs;
  var all = props.getProperties();
  Object.keys(all).forEach(function(key) {
    if (key.indexOf("SHAREFULL_TEST_MESSAGE_") !== 0) return;
    var match = /^notified:(\d+)$/.exec(all[key]);
    if (match && Number(match[1]) < cutoff) props.deleteProperty(key);
  });
}

/** 指定件名・指定送信元のみ処理し、APIが必要とする案件IDがないメールは安全に除外する。 */
function parseSharefullTestMail_(message, config) {
  var subject = message.getSubject() || "";
  if (!/^【候補者が決定しました】/.test(subject)) return null;
  if (normalizeEmail_(message.getFrom()) !== normalizeEmail_(config.senderEmail)) return null;

  var text = subject + "\n" + message.getPlainBody();
  var jobId = capture_(text, /(?:求人ID|求人番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var orderId = capture_(text, /(?:管理番号|URL管理番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var requestId = capture_(text, /(?:テスト案件ID|request_id)\s*[：:]?\s*([0-9a-f-]{36})/i);
  var applicationId = capture_(text, /(?:応募ID|応募番号)\s*[：:]?\s*([A-Za-z0-9_-]+)/i);
  var isTestTarget = (jobId && jobId === config.testJobId) ||
    (orderId && orderId === config.testOrderId) || (requestId && requestId === config.testRequestId);
  if (!isTestTarget) {
    console.warn("許可済みテスト案件と一致しないため保留: message=" + message.getId());
    return null;
  }
  var applicant = capture_(text, /◆\s*候補者\s*([^\n\r]+?)(?:\s+\d{1,3}歳|$)/);
  var jobTitle = capture_(text, /◆\s*求人\s*求人名称\s*[：:]\s*([^\n\r]+)/);
  var shift = capture_(text, /就業日時\s*[：:]\s*([^\n\r]+)/);
  var worksite = capture_(text, /就業先\s*[：:]\s*([^\n\r]+)/);

  // この通知形式にはIDが含まれない場合がある。タイトル等から案件を推測して
  // 別案件へ登録することはせず、IDが得られないメールは手動確認に回す。
  if (!jobId && !orderId && !requestId) {
    console.warn("対象メールに求人ID/管理番号がないため保留: message=" + message.getId());
    return null;
  }

  return {
    request_id: requestId || undefined,
    sharefull_job_id: jobId || undefined,
    sharefull_order_id: orderId || undefined,
    provider: "sharefull",
    application_key: applicationId || [jobId || orderId || requestId, applicant || "unknown"].join("::"),
    event_id: message.getId(),
    state: "confirmed",
    applicant_name: applicant || null,
    occurred_at: message.getDate().toISOString(),
    // 追加の抽出情報は通知にだけ使い、APIへは送らない。
    _job_title: jobTitle,
    _shift: shift,
    _worksite: worksite
  };
}

function sendLineWorks_(config, text) {
  var cache = CacheService.getScriptCache();
  var token = getLineWorksAccessToken_(config, cache);
  var response = postLineWorksMessage_(config, token, text);
  // 401はアクセストークン失効の可能性があるため、キャッシュを破棄して一度だけ再発行する。
  if (response.getResponseCode() === 401) {
    cache.remove("SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN");
    token = getLineWorksAccessToken_(config, cache);
    response = postLineWorksMessage_(config, token, text);
  }
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("LINE WORKS通知 status=" + code);
}

function postLineWorksMessage_(config, token, text) {
  return UrlFetchApp.fetch(config.lineworksApiUrl + "/bots/" + encodeURIComponent(config.lineworksBotId) + "/channels/" + encodeURIComponent(config.lineworksChannelId) + "/messages", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + token },
    payload: JSON.stringify({ content: { type: "text", text: text } }),
    muteHttpExceptions: true
  });
}

function getLineWorksAccessToken_(config, cache) {
  var cacheKey = "SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN";
  var cached = cache.get(cacheKey);
  if (cached) return cached;

  var now = Math.floor(Date.now() / 1000);
  var header = base64UrlJson_({ alg: "RS256", typ: "JWT" });
  var claims = base64UrlJson_({ iss: config.lineworksClientId, sub: config.lineworksServiceAccount, iat: now, exp: now + 300 });
  var signingInput = header + "." + claims;
  var signature = Utilities.computeRsaSha256Signature(signingInput, config.lineworksPrivateKey, Utilities.Charset.US_ASCII);
  var assertion = signingInput + "." + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, "");
  var form = [
    "assertion=" + encodeURIComponent(assertion),
    "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer"),
    "client_id=" + encodeURIComponent(config.lineworksClientId),
    "client_secret=" + encodeURIComponent(config.lineworksClientSecret),
    "scope=" + encodeURIComponent("bot.message")
  ].join("&");
  var response = UrlFetchApp.fetch("https://auth.worksmobile.com/oauth2/v2.0/token", {
    method: "post",
    contentType: "application/x-www-form-urlencoded",
    payload: form,
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  var body = safeJson_(response.getContentText());
  if (status < 200 || status >= 300 || !body.access_token) {
    // 認証応答本文や秘密情報はログに出さない。
    throw new Error("LINE WORKSアクセストークン取得失敗 status=" + status);
  }
  var expiresIn = Number(body.expires_in) || 3600;
  var cacheTtl = Math.min(expiresIn - 300, 21600);
  if (cacheTtl > 0) cache.put(cacheKey, body.access_token, cacheTtl);
  return body.access_token;
}

function base64UrlJson_(value) {
  return Utilities.base64EncodeWebSafe(JSON.stringify(value), Utilities.Charset.UTF_8).replace(/=+$/, "");
}

function buildNotificationText_(event, request) {
  return [
    "【テスト】シェアフル候補者決定通知",
    "応募者: " + (event.applicant_name || "不明"),
    "求人: " + (event._job_title || request.template_title || "不明"),
    "求人ID: " + (request.sharefull_job_id || event.sharefull_job_id || "不明"),
    "管理番号: " + (request.sharefull_order_id || event.sharefull_order_id || "不明"),
    "就業日時: " + (event._shift || [request.shift_start_date, request.shift_start_time].filter(Boolean).join(" ") || "不明"),
    "就業先: " + (event._worksite || "不明"),
    "受信日時: " + event.occurred_at
  ].join("\n");
}

function readConfig_() {
  var props = PropertiesService.getScriptProperties();
  var config = {
    apiBaseUrl: required_(props, "MYFAMILLE_TEST_API_BASE_URL").replace(/\/$/, ""),
    apiToken: required_(props, "MYFAMILLE_TEST_API_TOKEN"),
    gmailQuery: required_(props, "SHAREFULL_TEST_GMAIL_QUERY"),
    senderEmail: required_(props, "SHAREFULL_TEST_SENDER_EMAIL"),
    testJobId: (props.getProperty("SHAREFULL_TEST_JOB_ID") || "").trim(),
    testOrderId: (props.getProperty("SHAREFULL_TEST_ORDER_ID") || "").trim(),
    testRequestId: (props.getProperty("SHAREFULL_TEST_REQUEST_ID") || "").trim(),
    lineworksApiUrl: required_(props, "SHAREFULL_TEST_LINEWORKS_API_URL").replace(/\/$/, ""),
    lineworksClientId: required_(props, "SHAREFULL_TEST_LINEWORKS_CLIENT_ID"),
    lineworksClientSecret: required_(props, "SHAREFULL_TEST_LINEWORKS_CLIENT_SECRET"),
    lineworksServiceAccount: required_(props, "SHAREFULL_TEST_LINEWORKS_SERVICE_ACCOUNT"),
    lineworksPrivateKey: required_(props, "SHAREFULL_TEST_LINEWORKS_PRIVATE_KEY").replace(/\\n/g, "\n"),
    lineworksBotId: required_(props, "SHAREFULL_TEST_LINEWORKS_BOT_ID"),
    lineworksChannelId: required_(props, "SHAREFULL_TEST_LINEWORKS_CHANNEL_ID")
  };
  if (!/^https:\/\/famille-shift-matching-test\.vercel\.app$/i.test(config.apiBaseUrl)) {
    throw new Error("テスト用Vercel URL以外は設定できません");
  }
  if (!config.testJobId && !config.testOrderId && !config.testRequestId) {
    throw new Error("許可するテスト案件ID/管理番号/UUIDを設定してください");
  }
  if (!/\blabel:[^\s]+/i.test(config.gmailQuery) || /\bin:anywhere\b/i.test(config.gmailQuery)) {
    throw new Error("Gmail検索条件にはテスト用ラベルを指定してください（label:...）。");
  }
  if (!/^https:\/\/www\.worksapis\.com\/v1\.0$/i.test(config.lineworksApiUrl)) {
    throw new Error("LINE WORKS API URLはhttps://www.worksapis.com/v1.0に固定してください");
  }
  if (!/^\d+$/.test(config.lineworksBotId)) throw new Error("LINE WORKS Bot IDが不正です");
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

function normalizeEmail_(value) {
  var match = String(value || "").match(/<([^>]+)>/);
  return (match ? match[1] : String(value || "")).trim().toLowerCase();
}

function messageStateKey_(messageId) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, messageId);
  return "SHAREFULL_TEST_MESSAGE_" + Utilities.base64EncodeWebSafe(digest).replace(/=+$/, "");
}

function safeJson_(text) {
  try { return JSON.parse(text || "{}"); } catch (e) { return {}; }
}

function safeError_(error) {
  return error && error.message ? String(error.message).slice(0, 200) : "unknown";
}
