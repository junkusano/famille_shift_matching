import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const code = ts.transpileModule(
  fs.readFileSync(new URL("../src/lib/teamScoreRosterSync.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", code)(require, module, module.exports);
const {
  findStaleTeamSummaryIds,
  resolveLatestTeamOrgunitId,
} = module.exports;

test("現在在籍する職員は保存済みの旧所属より最新所属を優先する", () => {
  const latestTeams = new Map([
    ["staff-a", "team-conan"],
    ["staff-b", null],
  ]);

  assert.equal(
    resolveLatestTeamOrgunitId(latestTeams, "staff-a", "team-gundam"),
    "team-conan",
  );
  assert.equal(
    resolveLatestTeamOrgunitId(latestTeams, "staff-b", "team-gundam"),
    null,
  );
});

test("現在の職員一覧にいない過去職員は保存済み所属を保持する", () => {
  assert.equal(
    resolveLatestTeamOrgunitId(new Map(), "former-staff", "team-gundam"),
    "team-gundam",
  );
});

test("最新チーム一覧から外れた月次チームレコードを削除対象にする", () => {
  assert.deepEqual(
    findStaleTeamSummaryIds(
      ["team-gundam", "team-conan", "team-retired", "team-retired"],
      ["team-gundam", "team-conan"],
    ),
    ["team-retired"],
  );
  assert.deepEqual(
    findStaleTeamSummaryIds(["team-gundam", "team-conan"], []),
    ["team-gundam", "team-conan"],
  );
});
