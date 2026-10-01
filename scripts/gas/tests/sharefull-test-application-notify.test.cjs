const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "sharefull-test-application-notify.gs"), "utf8");

function createHarness({ apiDuplicate = false, apiStatus = 200, orderId = "TEST-ORDER-42", requestId = "ecdb477f-0735-447a-81c5-3089d4d03060", apiBaseUrl, gmailQuery } = {}) {
  const properties = {
    MYFAMILLE_TEST_API_BASE_URL: apiBaseUrl || "https://famille-shift-matching-test.vercel.app",
    MYFAMILLE_TEST_API_TOKEN: "test-token-not-a-secret",
    SHAREFULL_TEST_GMAIL_QUERY: gmailQuery || 'label:SharefullTest newer_than:7d',
    SHAREFULL_TEST_ALLOWED_SENDERS: "sharefull@example.test",
    SHAREFULL_TEST_ORDER_ID: orderId,
    SHAREFULL_TEST_REQUEST_ID: requestId,
  };
  const messages = {
    "gmail-message-1": { id: "gmail-message-1", from: "Sharefull <sharefull@example.test>", subject: "Sharefull 応募通知", body: "求人ID: JOB-42\n管理番号: TEST-ORDER-42\n応募ID: APP-7\n応募者: 個人名は送らない\n応募日時: 2026-10-01T00:00:00Z", date: "2026-10-01T00:00:00.000Z" },
    "gmail-message-synthetic": { id: "gmail-message-synthetic", from: "tester@example.test", subject: "[テスト] Sharefull応募通知", body: "SHAREFULL_TEST_EVENT\nテスト案件ID: ecdb477f-0735-447a-81c5-3089d4d03060\n応募ID: APP-SYNTHETIC\n応募者: テスト応募者", date: "2026-10-01T00:00:00.000Z" },
  };
  const calls = [];
  const context = {
    console,
    JSON,
    Date,
    URL,
    Utilities: {
      getUuid: () => "uuid-test",
      newBlob: value => ({
        getBytes: () => Buffer.from(value),
        getDataAsString: () => Buffer.from(value).toString("utf8"),
      }),
      base64Encode: value => Buffer.from(value).toString("base64"),
      base64EncodeWebSafe: value => Buffer.from(value).toString("base64url"),
      base64DecodeWebSafe: value => Buffer.from(value, "base64url"),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties[key] || null,
      setProperty: (key, value) => { properties[key] = value; },
    }) },
    ScriptApp: { getOAuthToken: () => "oauth-token" },
    Session: { getActiveUser: () => ({ getEmail: () => "tester@example.test" }) },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ type: "fetch", url, options });
      if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=")) {
        const isSynthetic = decodeURIComponent(url).includes("subject:");
        return response(200, { messages: [{ id: isSynthetic ? "gmail-message-synthetic" : "gmail-message-1" }] });
      }
      const messageMatch = url.match(/\/messages\/([^?]+)\?format=full$/);
      if (messageMatch) {
        const item = messages[decodeURIComponent(messageMatch[1])];
        return response(200, { id: item.id, internalDate: String(Date.parse(item.date)), payload: {
          mimeType: "text/plain",
          headers: [{ name: "From", value: item.from }, { name: "Subject", value: item.subject }],
          body: { data: Buffer.from(item.body).toString("base64url") },
        } });
      }
      if (url.endsWith("/messages/send")) {
        calls.push({ type: "email", raw: JSON.parse(options.payload).raw });
        return response(200, { id: "sent-message" });
      }
      if (url.endsWith("/api/rpa/sharefull/test-application")) {
        return response(apiStatus, { ok: apiStatus < 300, duplicate: apiDuplicate, request: {
          sharefull_job_id: "JOB-42", sharefull_order_id: "TEST-ORDER-42",
          shift_start_date: "2026-10-02", shift_start_time: "09:00",
        } });
      }
      throw new Error("GAS should not call LINE WORKS directly");
    } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls, properties };
}

function response(code, payload) {
  return { getResponseCode: () => code, getContentText: () => JSON.stringify(payload) };
}

test("Gmail応募をテストAPIへ登録し、LINE WORKS認証情報をGASに持たず処理済みにする", () => {
  const { context, calls, properties } = createHarness();
  context.processSharefullTestApplicationNotifications();
  const api = calls.find(call => call.url && call.url.endsWith("/api/rpa/sharefull/test-application"));
  const payload = JSON.parse(api.options.payload);
  assert.equal(payload.provider, "sharefull");
  assert.equal(payload.state, "applied");
  assert.equal(payload.sharefull_order_id, "TEST-ORDER-42");
  assert.equal(payload.request_id, undefined);
  assert.equal(payload.application_key, "APP-7");
  assert.equal(Object.hasOwn(payload, "applicant_name"), false);
  assert.equal(JSON.stringify(payload).includes("個人名は送らない"), false);
  const notifications = calls.filter(call => call.url && call.url.includes("/bots/"));
  assert.equal(notifications.length, 0);
  assert.equal(Object.keys(properties).some(key => key.includes("LINEWORKS")), false);
  assert.equal(JSON.parse(properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-1"], "sent");
  assert.equal(JSON.parse(properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-synthetic"], "sent");
});

test("APIの重複制御に委ね、通知API失敗時はGmailを処理済みにしない", () => {
  const retry = createHarness({ apiDuplicate: true });
  retry.context.processSharefullTestApplicationNotifications();
  assert.equal(retry.calls.filter(call => call.url && call.url.includes("/bots/")).length, 0);
  assert.equal(JSON.parse(retry.properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-1"], "sent");

  const failure = createHarness({ apiStatus: 502 });
  assert.doesNotThrow(() => failure.context.processSharefullTestApplicationNotifications());
  assert.equal(failure.properties.SHAREFULL_TEST_NOTIFICATION_STATE, undefined);
});

test("合成テストメールは設定済みテスト案件UUIDを含め、自分自身にだけ送る", () => {
  const { context, calls } = createHarness({ orderId: "" });
  context.sendSharefullSyntheticTestEmail();
  const email = calls.find(call => call.type === "email");
  assert.ok(email, JSON.stringify(calls.map(call => call.url)));
  const mime = Buffer.from(email.raw, "base64url").toString("utf8");
  assert.match(mime, /To: tester@example\.test/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /SHAREFULL_TEST_EVENT/);
  assert.match(mime, /ecdb477f-0735-447a-81c5-3089d4d03060/);
  const synthetic = {
    id: "synthetic",
    from: "tester@example.test",
    subject: "[テスト] Sharefull応募通知",
    body: mime.slice(mime.indexOf("\r\n\r\n") + 4),
    date: "2026-10-01T00:00:00.000Z",
  };
  const event = context.parseSharefullTestMail_(synthetic, context.readConfig_());
  assert.equal(event.request_id, "ecdb477f-0735-447a-81c5-3089d4d03060");
  assert.equal(event.sharefull_job_id, undefined);
  assert.equal(event.sharefull_order_id, undefined);
});

test("応募取消メールはcancelled状態として検出する", () => {
  const { context } = createHarness();
  assert.equal(context.detectState_("応募キャンセルのお知らせ"), "cancelled");
});

test("明示OAuthスコープはGmail読み取り・送信だけで、完全メールボックス権限を含まない", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "appsscript.json"), "utf8"));
  assert.deepEqual(manifest.oauthScopes, [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/userinfo.email",
  ]);
  assert.equal(source.includes("GmailApp."), false);
  assert.equal(manifest.oauthScopes.includes("https://mail.google.com/"), false);
});

test("本番API URLとGmailラベルなし検索を拒否し、GASへLINE WORKS資格情報を要求しない", () => {
  for (const options of [
    { apiBaseUrl: "https://myfamille.shi-on.net" },
    { gmailQuery: "in:anywhere newer_than:7d" },
  ]) {
    const { context, calls } = createHarness(options);
    assert.throws(() => context.readConfig_());
    assert.equal(calls.length, 0);
  }
  const { context, properties } = createHarness();
  context.readConfig_();
  assert.equal(Object.keys(properties).some(key => key.includes("LINEWORKS")), false);
});
