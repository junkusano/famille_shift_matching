import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const routeSource = readFileSync(new URL("../src/app/api/rpa/sharefull/confirmed/route.ts", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "");

function loadRoute({ rpcResult = { ok: true }, notificationError = null } = {}) {
  const calls = { recorded: [], closeRequests: [], notifications: [] };
  const target = {
    id: "request-1",
    sharefull_job_id: "job-123",
    sharefull_order_id: "order-456",
    taimee_job_id: "timee-789",
    shift_start_date: "2026-10-30",
    shift_start_time: "09:00:00",
  };
  const context = vm.createContext({
    exports: {},
    process: { env: { SHAREFULL_CONFIRMATION_GAS_TOKEN: "test-token" } },
    Buffer,
    console: { error: () => {} },
    timingSafeEqual: (left, right) => left.length === right.length && left.equals(right),
    NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) },
    supabaseAdmin: {
      from: (table) => {
        assert.equal(table, "spot_offer_request_table");
        const builder = {
          select: () => builder,
          eq: () => builder,
          limit: () => builder,
          then: (resolve, reject) => Promise.resolve({ data: [target], error: null }).then(resolve, reject),
        };
        return builder;
      },
      rpc: async (name, args) => {
        calls.recorded.push({ name, args });
        return { data: rpcResult, error: null };
      },
    },
    createCloseRequest: async (...args) => { calls.closeRequests.push(args); },
    notifySharefullApplication: async (input) => {
      calls.notifications.push(input);
      if (notificationError) throw notificationError;
      return { sent: true };
    },
  });
  const output = ts.transpileModule(routeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(`${output}\nexports.POST = POST;`, context);
  return { route: context.exports, calls };
}

function request() {
  return {
    headers: { get: () => "Bearer test-token" },
    json: async () => ({
      sharefull_job_id: "job-123",
      sharefull_order_id: "order-456",
      event_id: "gmail-event-1",
      application_key: "application-1",
      occurred_at: "2026-10-22T00:00:00.000Z",
      applicant_name: "テスト応募者",
    }),
  };
}

test("Sharefull確定を本番応募イベントとして記録した後、個人名を含めずLINE WORKSへ通知する", async () => {
  const { route, calls } = loadRoute();
  const response = await route.POST(request());

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(calls.recorded[0].args.p_state, "confirmed");
  assert.equal(calls.closeRequests.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.notifications[0])), {
    provider: "sharefull",
    eventId: "gmail-event-1",
    text: [
      "【Sharefull 応募確定】",
      "管理番号: order-456",
      "求人ID: job-123",
      "勤務日: 2026-10-30",
      "勤務開始: 09:00",
      "シェアフルからの確定通知を検知しました。関連する他媒体の募集停止状況を確認してください。",
    ].join("\n"),
    eventTable: "spot_offer_application_events",
  });
  assert.doesNotMatch(calls.notifications[0].text, /テスト応募者/);
});

test("LINE WORKS送信失敗はAPI失敗としてGASの再試行対象にする", async () => {
  const { route, calls } = loadRoute({ notificationError: new Error("send failed") });
  const response = await route.POST(request());

  assert.equal(response.status, 500);
  assert.equal(calls.closeRequests.length, 1);
  assert.equal(calls.notifications.length, 1);
});

test("古い確定イベントはLINE WORKS通知を送らない", async () => {
  const { route, calls } = loadRoute({ rpcResult: { stale: true } });
  const response = await route.POST(request());

  assert.equal(response.status, 200);
  assert.equal(calls.notifications.length, 0);
  assert.equal(calls.closeRequests.length, 0);
});
