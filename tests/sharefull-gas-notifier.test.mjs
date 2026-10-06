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
