const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "sharefull-test-application-notify.gs"), "utf8");

function createHarness({ apiDuplicate = false, lineworksStatus = 201, orderId = "TEST-ORDER-42", apiBaseUrl, gmailQuery, channelId } = {}) {
  const properties = {
    MYFAMILLE_TEST_API_BASE_URL: apiBaseUrl || "https://famille-shift-matching-test.vercel.app",
    MYFAMILLE_TEST_API_TOKEN: "test-token-not-a-secret",
    SHAREFULL_TEST_GMAIL_QUERY: gmailQuery || 'label:SharefullTest newer_than:7d',
    SHAREFULL_TEST_LINEWORKS_BOT_ID: "6807751",
    SHAREFULL_TEST_LINEWORKS_ACCESS_TOKEN: "test-lineworks-token",
    SHAREFULL_TEST_LINEWORKS_CHANNEL_ID: channelId || "test-channel-id",
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
        return response(200, { ok: true, duplicate: apiDuplicate, request: {
          sharefull_job_id: "JOB-42", sharefull_order_id: "TEST-ORDER-42",
          shift_start_date: "2026-10-02", shift_start_time: "09:00",
        } });
      }
      return response(lineworksStatus, {});
    } },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls, properties };
}

function response(code, payload) {
  return { getResponseCode: () => code, getContentText: () => JSON.stringify(payload) };
}

test("Gmail応募をテストAPIへ登録し、正しいBotチャンネルへ通知してから処理済みにする", () => {
  const { context, calls, properties } = createHarness();
  context.processSharefullTestApplicationNotifications();
  const api = calls.find(call => call.url && call.url.endsWith("/api/rpa/sharefull/test-application"));
  const payload = JSON.parse(api.options.payload);
  assert.equal(payload.provider, "sharefull");
  assert.equal(payload.state, "applied");
  assert.equal(payload.sharefull_order_id, "TEST-ORDER-42");
  assert.equal(payload.application_key, "APP-7");
  const notifications = calls.filter(call => call.url && call.url.includes("/bots/6807751/channels/test-channel-id/messages"));
  assert.equal(notifications.length, 2);
  assert.equal(JSON.parse(notifications[0].options.payload).content.text.startsWith("【テスト】"), true);
  assert.equal(JSON.parse(properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-1"], "sent");
  assert.equal(JSON.parse(properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-synthetic"], "sent");
});

test("DBで重複扱いでも通知未送信なら再送し、API失敗時は送信済みにしない", () => {
  const retry = createHarness({ apiDuplicate: true });
  retry.context.processSharefullTestApplicationNotifications();
  assert.equal(retry.calls.filter(call => call.url && call.url.includes("/bots/6807751/channels/")).length, 2);
  assert.equal(JSON.parse(retry.properties.SHAREFULL_TEST_NOTIFICATION_STATE)["gmail-message-1"], "sent");

  const failure = createHarness({ lineworksStatus: 500 });
  assert.throws(() => failure.context.processSharefullTestApplicationNotifications(), /LINE WORKS通知に失敗/);
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

test("本番API URL・ラベルなし検索・既知の本番チャンネルを拒否する", () => {
  for (const options of [
    { apiBaseUrl: "https://myfamille.shi-on.net" },
    { gmailQuery: "in:anywhere newer_than:7d" },
    { channelId: "52e31296-6764-0a1e-5b37-11023360216b" },
  ]) {
    const { context, calls } = createHarness(options);
    assert.throws(() => context.readConfig_());
    assert.equal(calls.length, 0);
  }
});
