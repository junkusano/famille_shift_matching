import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/lib/roster/rosterDailyRepo.ts", import.meta.url),
  "utf8",
);

test("日次Viewに未導入の複数サービス列を要求せず、不備情報の取得を維持する", () => {
  const shiftSelect = source.match(/const shiftSel = \[([\s\S]*?)\]\.join\(","\);/u)?.[1] ?? "";

  assert.match(shiftSelect, /"shift_event_alerts"/u);
  assert.match(shiftSelect, /"has_roster_error"/u);
  assert.doesNotMatch(shiftSelect, /"multiple_service_group_id"/u);
});

test("複数サービス識別子は既存のshift詳細取得から補完する", () => {
  assert.match(source, /staff_03_attend_flg,head_shift_id/u);
  assert.match(
    source,
    /row\.multiple_service_group_id \?\? details\.head_shift_id \?\? null/u,
  );
});
