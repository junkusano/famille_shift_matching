import assert from "node:assert/strict";
import test from "node:test";
import { buildWeeklyShiftServiceContext } from "../src/lib/plans/weekly-shift-service-context.ts";

test("週間シフトの曜日・時間・区分をAI向け根拠テキストへ全件変換する", () => {
  const context = buildWeeklyShiftServiceContext([
    {
      templateId: 2,
      weekday: 3,
      weekdayJp: "水",
      startTime: "14:00:00",
      endTime: "15:00:00",
      serviceCode: "生活援助",
      planServiceCategory: "家事",
      planDisplayName: "生活援助",
      requiredStaffCount: 1,
      isBiweekly: false,
      nthWeeks: null,
    },
    {
      templateId: 1,
      weekday: 1,
      weekdayJp: "月",
      startTime: "09:00:00",
      endTime: "10:00:00",
      serviceCode: "身体介護",
      planServiceCategory: "身体",
      planDisplayName: "身体介護",
      requiredStaffCount: 1,
      isBiweekly: false,
      nthWeeks: null,
    },
  ]);

  assert.equal(context.weeklyShiftCount, 2);
  assert.deepEqual(context.weeklyShiftIds, [1, 2]);
  assert.equal(context.serviceContentCount, 2);
  assert.match(context.text, /月曜日.*09:00〜10:00/);
  assert.match(context.text, /水曜日.*14:00〜15:00/);
  assert.match(context.text, /身体/);
  assert.match(context.text, /家事/);
});
