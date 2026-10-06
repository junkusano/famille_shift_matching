import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../scripts/gas/sharefull-test-application-notify.gs", import.meta.url),
  "utf8",
);
const context = vm.createContext({ console, Date, JSON, Math, Number, Object, String, RegExp });
vm.runInContext(source, context);

test("parses only the exact approved sender and test job as a confirmed event", () => {
  const message = {
    getSubject: () => "【候補者が決定しました】求人のお知らせ",
    getFrom: () => "Sharefull <notice@example.test>",
    getPlainBody: () => "求人ID：JOB-123\n応募ID：APP-9\n◆候補者 山田 太郎 30歳\n就業日時：2026/10/10 09:00\n就業先：名古屋店",
    getDate: () => new Date("2026-10-06T00:00:00Z"),
    getId: () => "gmail-message-1",
  };
  const event = context.parseSharefullTestMail_(message, {
    senderEmail: "notice@example.test",
    testJobId: "JOB-123",
    testOrderId: "",
    testRequestId: "",
  });

  assert.equal(event.state, "confirmed");
  assert.equal(event.sharefull_job_id, "JOB-123");
  assert.equal(event.application_key, "APP-9");
  assert.equal(event.applicant_name, "山田 太郎");
  assert.equal(event._worksite, "名古屋店");
});

test("rejects unrelated sender, subject, and non-allowlisted job", () => {
  const message = {
    getSubject: () => "【候補者が決定しました】求人のお知らせ",
    getFrom: () => "other@example.test",
    getPlainBody: () => "求人ID：JOB-123",
    getId: () => "gmail-message-2",
  };
  const config = { senderEmail: "notice@example.test", testJobId: "JOB-123" };
  assert.equal(context.parseSharefullTestMail_(message, config), null);
  message.getFrom = () => "notice@example.test";
  config.testJobId = "JOB-OTHER";
  assert.equal(context.parseSharefullTestMail_(message, config), null);
  message.getSubject = () => "別の通知";
  assert.equal(context.parseSharefullTestMail_(message, config), null);
});

test("prunes only old notifier markers and retains recent or unrelated properties", () => {
  const entries = {
    SHAREFULL_TEST_MESSAGE_old: "notified:1000",
    SHAREFULL_TEST_MESSAGE_recent: "notified:9999999999",
    SHAREFULL_TEST_MESSAGE_bad: "processing",
    SOME_OTHER_PROPERTY: "notified:1",
  };
  const deleted = [];
  const props = {
    getProperties: () => ({ ...entries }),
    deleteProperty: (key) => {
      deleted.push(key);
      delete entries[key];
    },
  };
  context.pruneOldMessageStates_(props, 10000000000);
  assert.deepEqual(deleted, ["SHAREFULL_TEST_MESSAGE_old"]);
  assert.ok(entries.SHAREFULL_TEST_MESSAGE_recent);
  assert.ok(entries.SHAREFULL_TEST_MESSAGE_bad);
  assert.ok(entries.SOME_OTHER_PROPERTY);
});

test("runs the pictured confirmed-candidate email through test API and test Bot mocks only", () => {
  const calls = [];
  const properties = {
    MYFAMILLE_TEST_API_BASE_URL: "https://famille-shift-matching-test.vercel.app",
    MYFAMILLE_TEST_API_TOKEN: "test-token",
    SHAREFULL_TEST_GMAIL_QUERY: "label:sharefull-test",
    SHAREFULL_TEST_SENDER_EMAIL: "notice@example.test",
    SHAREFULL_TEST_JOB_ID: "JOB-TEST-44",
    SHAREFULL_TEST_LINEWORKS_API_URL: "https://www.worksapis.com/v1.0",
    SHAREFULL_TEST_LINEWORKS_CLIENT_ID: "test-client",
    SHAREFULL_TEST_LINEWORKS_CLIENT_SECRET: "test-secret",
    SHAREFULL_TEST_LINEWORKS_SERVICE_ACCOUNT: "test-service@example.test",
    SHAREFULL_TEST_LINEWORKS_PRIVATE_KEY: "test-key",
    SHAREFULL_TEST_LINEWORKS_BOT_ID: "123456",
    SHAREFULL_TEST_LINEWORKS_CHANNEL_ID: "test-channel-id",
  };
  const message = {
    getSubject: () => "【候補者が決定しました】 2026/12/31(木) - ✨未経験歓迎✨求人",
    getFrom: () => "Sharefull <notice@example.test>",
    getPlainBody: () => [
      "求人ID：JOB-TEST-44",
      "管理番号：ORDER-TEST-44",
      "応募ID：APP-TEST-7",
      "◆候補者 山田 太郎 30歳",
      "◆求人 求人名称：未経験歓迎の支援スタッフ",
      "就業日時：2026/12/31 09:00〜10:00",
      "就業先：名古屋テスト事業所",
    ].join("\n"),
    getDate: () => new Date("2026-10-06T01:00:00Z"),
    getId: () => "gmail-confirmed-test-1",
  };
  const thread = { getMessages: () => [message] };
  const propsStore = {};
  const scriptProps = {
    getProperty: (key) => properties[key] || null,
    getProperties: () => ({ ...propsStore }),
    setProperty: (key, value) => { propsStore[key] = value; },
    deleteProperty: (key) => { delete propsStore[key]; },
  };
  const cacheStore = {};
  const testContext = vm.createContext({
    console: { warn() {}, error() {}, log() {} }, Date, JSON, Math, Number, Object, String, RegExp,
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => scriptProps },
    GmailApp: { search: (query, start, max) => {
      assert.equal(query, "label:sharefull-test");
      return start === 0 ? [thread] : [];
    } },
    CacheService: { getScriptCache: () => ({
      get: (key) => cacheStore[key] || null,
      put: (key, value) => { cacheStore[key] = value; },
      remove: (key) => { delete cacheStore[key]; },
    }) },
    Utilities: {
      computeDigest: () => [1, 2, 3],
      DigestAlgorithm: { SHA_256: "SHA_256" },
      computeRsaSha256Signature: () => [4, 5, 6],
      base64EncodeWebSafe: (value) => Buffer.from(value).toString("base64url"),
      Charset: { UTF_8: "UTF_8", US_ASCII: "US_ASCII" },
    },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/api/rpa/sharefull/test-application")) {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({
          ok: true,
          request: { sharefull_job_id: "JOB-TEST-44", sharefull_order_id: "ORDER-TEST-44", template_title: "テスト案件" },
        }) };
      }
      if (url === "https://auth.worksmobile.com/oauth2/v2.0/token") {
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: "test-access-token", expires_in: 3600 }) };
      }
      if (url.endsWith("/bots/123456/channels/test-channel-id/messages")) {
        return { getResponseCode: () => 201, getContentText: () => "{}" };
      }
      throw new Error(`Unexpected external URL in test: ${url}`);
    } },
  });
  vm.runInContext(source, testContext);
  testContext.processSharefullTestApplicationNotifications();

  const apiCall = calls.find((call) => call.url.endsWith("/api/rpa/sharefull/test-application"));
  assert.ok(apiCall, "test-only MyFamille API should be called");
  const apiEvent = JSON.parse(apiCall.options.payload);
  assert.equal(apiEvent.state, "confirmed");
  assert.equal(apiEvent.sharefull_job_id, "JOB-TEST-44");
  assert.equal(apiEvent.event_id, "gmail-confirmed-test-1");
  assert.equal(apiEvent.applicant_name, "山田 太郎");

  const botCall = calls.find((call) => call.url.endsWith("/bots/123456/channels/test-channel-id/messages"));
  assert.ok(botCall, "only the configured test Bot channel should be called");
  const notification = JSON.parse(botCall.options.payload).content.text;
  assert.match(notification, /【テスト】シェアフル候補者決定通知/);
  assert.match(notification, /山田 太郎/);
  assert.match(notification, /JOB-TEST-44/);
  assert.match(notification, /名古屋テスト事業所/);
  assert.ok(Object.entries(propsStore).some(([key, value]) =>
    key.startsWith("SHAREFULL_TEST_MESSAGE_") && /^notified:\d+$/.test(value)),
  "success marker should be persisted");
});
