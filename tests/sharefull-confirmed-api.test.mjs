import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadRoute(target) {
  const calls = [];
  const context = vm.createContext({
    exports: {},
    process: { env: { SHAREFULL_CONFIRMATION_GAS_TOKEN: "test-token" } },
    Buffer,
    timingSafeEqual: (left, right) => left.equals(right),
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) },
    supabaseAdmin: {
      from(table) {
        assert.equal(table, "spot_offer_request_table");
        const builder = {
          select: () => builder,
          limit: () => builder,
          eq: () => builder,
          then: (resolve, reject) => Promise.resolve({ data: [target], error: null }).then(resolve, reject),
        };
        return builder;
      },
      rpc: async (...args) => {
        calls.push(["record", ...args]);
        return { data: { ok: true }, error: null };
      },
    },
    createCloseRequest: async (...args) => calls.push(["close", ...args]),
  });
  const source = readFileSync(new URL("../src/app/api/rpa/sharefull/confirmed/route.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(output, context);
  return { route: context.exports, calls };
}

function request() {
  return {
    headers: { get: () => "Bearer test-token" },
    json: async () => ({
      sharefull_job_id: "sf-123",
      event_id: "gmail-message-1",
      application_key: "application-1",
      occurred_at: "2026-10-22T01:00:00.000Z",
    }),
  };
}

test("タイミー求人IDが未登録なら、応募確定を記録せず409を返してGASに再試行させる", async () => {
  const { route, calls } = loadRoute({
    id: "request-1",
    sharefull_job_id: "sf-123",
    taimee_job_id: null,
  });

  const response = await route.POST(request());

  assert.equal(response.status, 409);
  assert.match(response.body.error, /停止対象のタイミー求人ID/);
  assert.deepEqual(calls, []);
});

test("タイミー求人IDが登録済みなら、確定記録に続けて停止ジョブを登録する", async () => {
  const { route, calls } = loadRoute({
    id: "request-1",
    sharefull_job_id: "sf-123",
    taimee_job_id: "timee-456",
  });

  const response = await route.POST(request());

  assert.equal(response.status, 200);
  assert.equal(calls[0][0], "record");
  assert.equal(calls[1][0], "close");
  assert.equal(calls[1][1].taimee_job_id, "timee-456");
  assert.equal(calls[1][2], "other_application");
  assert.equal(calls[1][3].createdFrom, "/api/rpa/sharefull/confirmed");
});
