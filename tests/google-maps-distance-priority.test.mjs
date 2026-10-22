import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../src/app/portal/driving_record/page.tsx", import.meta.url), "utf8");
const distanceSource = await readFile(new URL("../src/lib/googleMapsDistance.ts", import.meta.url), "utf8");

test("職員単位の距離更新は現在月を対象にする", () => {
  assert.match(
    pageSource,
    /staff_user_id=.*target_month=.*currentMonthKey/,
    "個別計算が対象月を指定していないため、過去・未来月の処理に埋もれる可能性があります",
  );
});

test("距離更新は成功済み明細より未処理明細を先に並べる", () => {
  assert.match(distanceSource, /select\("shift_id, staff_user_id, segment_date, segment_kind, status, distance_meters"\)/);
  const pendingPriority = distanceSource.indexOf("const aNeedsCalculation =");
  const staffPriority = distanceSource.indexOf("const aHasAnySegments =");
  assert.ok(pendingPriority >= 0, "未処理明細の優先順位がありません");
  assert.ok(staffPriority >= 0, "職員単位の優先順位がありません");
  assert.ok(pendingPriority < staffPriority, "職員単位の優先順位が未処理明細より先に評価されています");
});
