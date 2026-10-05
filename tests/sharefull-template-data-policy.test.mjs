import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadRoute(template) {
  const blocks = [];
  const envRows = [];
  const context = vm.createContext({
    exports: {},
    console,
    NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200 }) },
    supabaseAdmin: {
      from: (table) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: template, error: null }),
          then: (resolve, reject) => Promise.resolve({ data: table === "env_variables" ? envRows : [], error: null }).then(resolve, reject),
        };
        return builder;
      },
    },
    requireTaimeeRpaOperator: async () => undefined,
    isRpaTaimeeError: () => false,
    isSharefullSyncClient: () => true,
    sharefullTemplateTableName: () => "spot_offer_template_unified",
    applySharefullContentPolicy: (source) => ({
      data: source,
      report: { status: "blocked", findings: [{ ruleId: "gender-sensitive-recruiting", action: "block", field: "work_description", matchedText: "女性ヘルパー" }] },
    }),
    recordSharefullContentPolicyBlock: async (input) => {
      blocks.push(input);
      return { recorded: true, notified: true };
    },
  });
  const code = readFileSync(new URL("../src/app/api/rpa/sharefull/template-data/route.ts", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  const output = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInContext(output, context);
  return { route: context.exports, blocks };
}

test("拡張機能への本文取得時に要確認文言を止め、監査記録と通知を行う", async () => {
  const { route, blocks } = loadRoute({
    core_id: "core-1",
    kaipoke_cs_id: "client-1",
    sharefull_template_id: null,
    template_title: "訪問介護",
    work_description: "女性ヘルパー活躍中",
  });
  const response = await route.GET({ nextUrl: { searchParams: new URLSearchParams("core_id=core-1") } });

  assert.equal(response.status, 422);
  assert.equal(response.body.notification.notified, true);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].coreId, "core-1");
  assert.equal(blocks[0].source, "rpa.sharefull.template-data");
  assert.equal(blocks[0].report.findings[0].ruleId, "gender-sensitive-recruiting");
});
