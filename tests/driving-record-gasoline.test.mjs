import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/app/portal/driving_record/page.tsx", import.meta.url), "utf8");

test("社用車利用の契約社員には月間移動 allowance を加算しない", () => {
  for (const name of ["佐藤 美佐子", "片岡 由美子", "小林 千佳", "山岡 幸洋"]) {
    assert.match(source, new RegExp(`\\"${name}\\"`));
  }
  assert.match(source, /includeMonthlyMovementAllowance/);
  assert.match(source, /includeMonthlyMovementAllowance \? MONTHLY_MOVEMENT_ALLOWANCE_YEN : 0/);
});
