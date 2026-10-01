import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadNotifier({ notifiedAt = null, sendFails = false } = {}) {
  const source = readFileSync(new URL("../src/lib/spot-sync/sharefullApplicationNotification.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const calls = [];
  let currentNotifiedAt = notifiedAt;
  let claimAllowed = !notifiedAt;
  const db = {
    from(table) {
      assert.equal(table, "sharefull_rpa_test_spot_offer_application_events");
      const state = { operation: "select", values: null };
      const builder = {
        update(values) { state.operation = "update"; state.values = values; return builder; },
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        or() { return builder; },
        maybeSingle() {
          if (state.operation === "update" && state.values.notification_claimed_at) {
            if (!claimAllowed) return Promise.resolve({ data: null, error: null });
            claimAllowed = false;
            return Promise.resolve({ data: { event_id: "event-1" }, error: null });
          }
          if (state.operation === "select") return Promise.resolve({ data: currentNotifiedAt ? { notified_at: currentNotifiedAt } : null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve, reject) {
          if (state.operation === "update" && state.values.notified_at) currentNotifiedAt = state.values.notified_at;
          calls.push({ table, operation: state.operation, values: state.values });
          return Promise.resolve({ error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const context = vm.createContext({
    exports: {},
    process: { env: { SHAREFULL_CONTENT_POLICY_CHANNEL_ID: "99142491" } },
    supabaseAdmin: db,
    getAccessToken: async () => "opaque-access-token",
    sendLWBotMessage: async (channelId, text, token) => {
      calls.push({ channelId, text, token });
      if (sendFails) throw new Error("simulated send failure");
    },
    Date,
  });
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${output}\nexports.notifySharefullApplication = notifySharefullApplication;`, context);
  return { notifier: context.exports, calls, get notifiedAt() { return currentNotifiedAt; } };
}

test("応募イベント通知は性別表現通知と同じLINE WORKS送信設定を使い送信状態を記録する", async () => {
  const { notifier, calls, notifiedAt } = loadNotifier();
  const result = await notifier.notifySharefullApplication({ provider: "sharefull", eventId: "event-1", text: "【テスト】応募通知" });
  assert.equal(result.sent, true);
  assert.equal(calls.find((call) => call.channelId)?.channelId, "99142491");
  assert.match(calls.find((call) => call.channelId).text, /【テスト】/);
});

test("送信済みイベントは二重送信しない", async () => {
  const { notifier, calls } = loadNotifier({ notifiedAt: "2026-10-01T00:00:00Z" });
  const result = await notifier.notifySharefullApplication({ provider: "sharefull", eventId: "event-1", text: "duplicate" });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { sent: true, alreadySent: true });
  assert.equal(calls.some((call) => call.channelId), false);
});

test("送信失敗はclaimを解除して再試行できるようにする", async () => {
  const { notifier, calls } = loadNotifier({ sendFails: true });
  await assert.rejects(notifier.notifySharefullApplication({ provider: "sharefull", eventId: "event-1", text: "retry" }), /simulated send failure/);
  assert.equal(calls.at(-1).values.notification_claimed_at, null);
  assert.match(calls.at(-1).values.notification_error, /simulated send failure/);
});
