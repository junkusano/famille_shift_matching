import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = readFileSync(new URL("../src/lib/spot-offer/latestSharefullTemplates.ts", import.meta.url), "utf8");
const context = vm.createContext({ exports: {} });
vm.runInContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { activeSharefullTemplates } = context.exports;

test("同一利用者の全テンプレートを残し、更新日時の新しい順に並べる", () => {
  const rows = [
    { core_id: "old-a", kaipoke_cs_id: "client-a", updated_at: "2026-09-01T00:00:00Z" },
    { core_id: "new-b", kaipoke_cs_id: "client-b", updated_at: "2026-09-03T00:00:00Z" },
    { core_id: "new-a", kaipoke_cs_id: "client-a", updated_at: "2026-09-02T00:00:00Z" },
  ];

  assert.deepEqual([...activeSharefullTemplates(rows).map((row) => row.core_id)], ["new-a", "old-a", "new-b"]);
});

test("更新日時が同じときcreated_at、さらに同一ならcore_idで順序を決める", () => {
  const rows = [
    { core_id: "a", kaipoke_cs_id: "client-a", updated_at: "2026-09-03T00:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    { core_id: "b", kaipoke_cs_id: "client-a", updated_at: "2026-09-03T00:00:00Z", created_at: "2026-09-02T00:00:00Z" },
    { core_id: "c", kaipoke_cs_id: "client-a", updated_at: "2026-09-03T00:00:00Z", created_at: "2026-09-02T00:00:00Z" },
  ];

  assert.deepEqual([...activeSharefullTemplates(rows).map((row) => row.core_id)], ["c", "b", "a"]);
});

test("利用者IDまたはcore_idがない行は対象にしない", () => {
  const rows = [
    { core_id: "", kaipoke_cs_id: "client-a", updated_at: "2026-09-03T00:00:00Z" },
    { core_id: "valid", kaipoke_cs_id: "", updated_at: "2026-09-03T00:00:00Z" },
  ];

  assert.deepEqual([...activeSharefullTemplates(rows)], []);
});
