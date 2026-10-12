import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../scripts/gas/sharefull-test-application-notify.gs", import.meta.url),
  "utf8",
);

function loadContext(extra = {}) {
  const context = vm.createContext({ console, Date, JSON, Math, Number, Object, String, RegExp, ...extra });
  vm.runInContext(source, context);
  return context;
}

function apiMessage({ id, from, subject, body, date = "2026-10-06T00:00:00.000Z" }) {
  return {
    id,
    internalDate: String(Date.parse(date)),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "Subject", value: subject },
      ],
      body: { data: Buffer.from(body).toString("base64url") },
    },
  };
}

test("parses only the exact approved sender and test job as a confirmed event", () => {
  const context = loadContext();
  const message = {
    id: "gmail-message-1",
    from: "Sharefull <notice@example.test>",
    subject: "【候補者が決定しました】求人のお知らせ",
    body: "求人ID：JOB-123\n応募ID：APP-9\n応募確定\n就業日時：2026/10/10 09:00",
    date: "2026-10-06T00:00:00.000Z",
  };
  const event = context.parseSharefullTestMail_(message, {
    allowedSenders: ["notice@example.test"],
    testJobId: "JOB-123",
    testOrderId: "",
    testRequestId: "",
  });

  assert.equal(event.state, "confirmed");
  assert.equal(event.sharefull_job_id, "JOB-123");
  assert.equal(event.application_key, "APP-9");
  assert.equal(event.event_id, "gmail-message-1");
});

test("rejects unrelated sender, subject, and non-allowlisted job", () => {
  const context = loadContext();
  const message = {
    id: "gmail-message-2",
    from: "other@example.test",
    subject: "【候補者が決定しました】求人のお知らせ",
    body: "求人ID：JOB-123",
    date: "2026-10-06T00:00:00.000Z",
  };
  const config = { allowedSenders: ["notice@example.test"], testJobId: "JOB-123" };
  assert.equal(context.parseSharefullTestMail_(message, config), null);
  message.from = "notice@example.test";
  message.body = "求人ID：JOB-OTHER";
  assert.equal(context.parseSharefullTestMail_(message, config), null);
  message.body = "求人ID：JOB-123";
  message.subject = "別の通知";
  assert.equal(context.parseSharefullTestMail_(message, config), null);
});

test("records sent message IDs without exposing unrelated Script Properties", () => {
  const entries = { unrelated: "keep" };
  const props = {
    getProperty: (key) => key === "SHAREFULL_TEST_NOTIFICATION_STATE" ? JSON.stringify({ old: "sent" }) : null,
    setProperty: (key, value) => { entries[key] = value; },
  };
  const context = loadContext({ PropertiesService: { getScriptProperties: () => props } });
  context.markNotificationSent_("new-message");
  const state = JSON.parse(entries.SHAREFULL_TEST_NOTIFICATION_STATE);
  assert.equal(state.old, "sent");
  assert.equal(state["new-message"], "sent");
  assert.equal(entries.unrelated, "keep");
});

test("uses the Gmail API and the approved MyFamille API notification path", () => {
  const calls = [];
  const properties = {
    MYFAMILLE_TEST_API_BASE_URL: "https://famille-shift-matching-test.vercel.app",
    MYFAMILLE_TEST_API_TOKEN: "test-token",
    SHAREFULL_TEST_GMAIL_QUERY: "label:sharefull-test",
    SHAREFULL_TEST_ALLOWED_SENDERS: "notice@example.test",
    SHAREFULL_TEST_JOB_ID: "JOB-TEST-44",
  };
  const scriptState = {};
  const scriptProps = {
    getProperty: (key) => key === "SHAREFULL_TEST_NOTIFICATION_STATE"
      ? scriptState.value || null
      : properties[key] || null,
    setProperty: (key, value) => { if (key === "SHAREFULL_TEST_NOTIFICATION_STATE") scriptState.value = value; },
  };
  const message = apiMessage({
    id: "gmail-confirmed-test-1",
    from: "Sharefull <notice@example.test>",
    subject: "【候補者が決定しました】求人のお知らせ",
    body: "求人ID：JOB-TEST-44\n応募ID：APP-TEST-7\n応募確定",
  });
  const context = loadContext({
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => scriptProps },
    ScriptApp: { getOAuthToken: () => "gmail-read-token" },
    Utilities: {
      base64DecodeWebSafe: (value) => Buffer.from(value, "base64url"),
      newBlob: (value) => ({ getDataAsString: () => Buffer.from(value).toString("utf8") }),
    },
    UrlFetchApp: { fetch: (url, options) => {
      calls.push({ url, options });
      if (url.includes("messages?q=")) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ messages: [{ id: message.id }] }) };
      if (url.endsWith(`/messages/${message.id}?format=full`)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify(message) };
      if (url.endsWith("/api/rpa/sharefull/test-application")) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
      throw new Error(`Unexpected external URL in test: ${url}`);
    } },
  });

  context.processSharefullTestApplicationNotifications();
  const apiCall = calls.find((call) => call.url.endsWith("/api/rpa/sharefull/test-application"));
  assert.ok(apiCall);
  const apiEvent = JSON.parse(apiCall.options.payload);
  assert.equal(apiEvent.state, "confirmed");
  assert.equal(apiEvent.sharefull_job_id, "JOB-TEST-44");
  assert.equal(apiEvent.event_id, message.id);
  assert.equal(JSON.parse(scriptState.value)[message.id], "sent");
  assert.equal(calls.some((call) => call.url.includes("worksapis.com") || call.url.includes("/api/lw-send-botmessage")), false);
});
