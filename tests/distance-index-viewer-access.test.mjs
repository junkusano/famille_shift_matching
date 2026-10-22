import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const roleSource = await readFile(new URL("../src/context/RoleContext.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/app/portal/driving_record/page.tsx", import.meta.url), "utf8");

test("社用車利用の契約社員4名を走行距離指数の閲覧対象にする", () => {
  for (const name of ["佐藤 美佐子", "片岡 由美子", "小林 千佳", "山岡 幸洋"]) {
    assert.match(roleSource, new RegExp(`'${name}'`));
  }
  assert.match(roleSource, /currentRole === 'admin'[\s\S]*DISTANCE_INDEX_VIEWER_NAMES\.has\(staffName\)/);
});

test("閲覧対象者には距離更新操作を表示しない", () => {
  assert.match(pageSource, /const canManageDistanceIndex = role === "admin" \|\| role === "manager"/);
  assert.match(pageSource, /\{canManageDistanceIndex && \(/);
});
