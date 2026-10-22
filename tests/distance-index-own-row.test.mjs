import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/portal/driving_record/page.tsx", import.meta.url), "utf8");

test("閲覧専用ユーザーは本人の走行距離行だけを表示する", () => {
  assert.match(source, /const canViewOwnDistanceOnly = !canManageDistanceIndex/);
  assert.match(source, /if \(canViewOwnDistanceOnly && row\.user_id !== userId\) continue;/);
  assert.match(source, /\[canViewOwnDistanceOnly, monthKeys, rows, userId\]/);
});
