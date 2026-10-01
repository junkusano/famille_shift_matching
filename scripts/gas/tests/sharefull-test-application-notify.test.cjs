const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "sharefull-test-application-notify.gs"), "utf8");

function createHarness({ apiDuplicate = false, apiStatus = 200, orderId = "TEST-ORDER-42", apiBaseUrl, gmailQuery } = {}) {
  const properties = {
    MYFAMILLE_TEST_API_BASE_URL: apiBaseUrl || "https://famille-shift-matching-test.vercel.app",
    MYFAMILLE_TEST_API_TOKEN: "test-token-not-a-secret",
    SHAREFULL_TEST_GMAIL_QUERY: gmailQuery || 'label:SharefullTest newer_than:7d',
    SHAREFULL_TEST_ALLOWED_SENDERS: "sharefull@example.test",
    SHAREFULL_TEST_ORDER_ID: orderId,
  };
  const message = {
    getId: () => "gmail-message-1",
    getThreadId: () => "gmail-thread-1",
    getFrom: () => "Sharefull <sharefull@example.test>",
    getSubject: () => "Sharefull 応募通知",
    getPlainBody: () => "求人ID: JOB-42\n管理番号: TEST-ORDER-42\n応募ID: APP-7\n応募者: テスト応募者\n応募日時: 2026-10-01T00:00:00Z",
    getDate: () => new Date("2026-10-01T00:00:00Z"),
  };
  const syntheticMessage = {
    ...message,
    getId: () => "gmail-message-synthetic",
    getThreadId: () => "gmail-thread-synthetic",
    getSubject: () => "[テスト] Sharefull応募通知",
    getPlainBody: () => "SHAREFULL_TEST_EVENT\n求人ID: JOB-42\n管理番号: TEST-ORDER-42\n応募ID: APP-SYNTHETIC\n応募者: テスト応募者",
  };
  const calls = [];
  const context = {
    console,
    JSON,
    Date,
    URL,
    Utilities: { getUuid: () => "uuid-test" },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties[key] || null,
      setProperty: (key, value) => { properties[key] = value; },
    }) },
    GmailApp: {
      search: query => {
        if (query === 'label:SharefullTest newer_than:7d') return [{ getId: () => "gmail-thread-1", getMessages: () => [message] }];
        assert.equal(query, 'in:anywhere from:me to:me subject:"[テスト] Sharefull応募通知" newer_than:2d');
        return [{ getId: () => "gmail-thread-synthetic", getMessages: () => [syntheticMessage] }];
      },
      sendEmail: (...args) => calls.push({ type: "email", args }),
    },
    Session: { getActiveUser: () => ({ getEmail: () => "tester@example.test" }) },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ type: "fetch", url, options });
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
  assert.equal(payload.application_key, "APP-7");
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

test("合成テストメールは設定済みのテスト案件を含め、自分自身にだけ送る", () => {
  const { context, calls } = createHarness();
  context.sendSharefullSyntheticTestEmail();
  const email = calls.find(call => call.type === "email");
  assert.equal(email.args[0], "tester@example.test");
  assert.equal(email.args[1], "[テスト] Sharefull応募通知");
  assert.match(email.args[2], /SHAREFULL_TEST_EVENT/);
  assert.match(email.args[2], /TEST-ORDER-42/);
});

test("応募取消メールはcancelled状態として検出する", () => {
  const { context } = createHarness();
  assert.equal(context.detectState_("応募キャンセルのお知らせ"), "cancelled");
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
