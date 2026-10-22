import assert from "node:assert/strict";
import test from "node:test";

import {
  isMeetingMonthEligible,
  isMeetingMonthOnOrAfterFirstShift,
  isRetiredStaffStatus,
  parseMonthlyMeetingAlertKey,
  shouldResolveMonthlyMeetingAlert,
} from "../src/lib/monthlyMeeting/eligibility.ts";
import { shouldKeepParkingPlaceAlert } from "../src/lib/alert_add/parking_place_alert_policy.ts";

test("入社前に丸ごと該当する月は月例会議の対象外", () => {
  assert.equal(isMeetingMonthEligible(null, "2026-10-01", "2026-09"), false);
  assert.equal(isMeetingMonthEligible(null, "2026-10-01", "2026-10"), true);
  assert.equal(isMeetingMonthEligible(null, "2026-08-01", "2026-03"), false);
});

test("退職扱いの職員は月例会議の不備対象外", () => {
  assert.equal(isRetiredStaffStatus("removed_from_lineworks_kaipoke"), true);
  assert.equal(isRetiredStaffStatus("REMOVED_FROM_LINEWORKS_KAIPOKE"), true);
  assert.equal(isRetiredStaffStatus("active"), false);
  assert.equal(isRetiredStaffStatus(null), false);
});

test("入社日が不明な既存職員は従来どおり月例会議の対象", () => {
  assert.equal(isMeetingMonthEligible(null, null, "2026-09"), true);
});

test("入社日が空の場合は勤務シフト判定に委ねる", () => {
  assert.equal(isMeetingMonthEligible(null, null, "2026-03"), true);
  assert.equal(isMeetingMonthEligible(null, null, "2026-08"), true);
});

test("既存の入社前月アラートだけを解消対象として識別する", () => {
  assert.deepEqual(
    parseMonthlyMeetingAlertKey("monthly_meeting:unchecked:2026-03:user-123"),
    { targetYm: "2026-03", userId: "user-123" },
  );
  assert.equal(parseMonthlyMeetingAlertKey("other-alert:user-123"), null);
  assert.equal(
    shouldResolveMonthlyMeetingAlert({
      entryDateOriginal: null,
      entryDateLatest: "2026-08-01",
      targetYm: "2026-03",
    }),
    true,
  );
  assert.equal(
    shouldResolveMonthlyMeetingAlert({
      entryDateOriginal: null,
      entryDateLatest: "2026-08-01",
      targetYm: "2026-08",
    }),
    false,
  );
  assert.equal(
    shouldResolveMonthlyMeetingAlert({
      entryDateOriginal: null,
      entryDateLatest: null,
      targetYm: "2026-03",
    }),
    false,
  );
});

test("入社日空白者は初回勤務月より前の会議を対象外にする", () => {
  assert.equal(
    isMeetingMonthOnOrAfterFirstShift("2026-08-25", "2026-07"),
    false,
  );
  assert.equal(
    isMeetingMonthOnOrAfterFirstShift("2026-08-25", "2026-08"),
    true,
  );
  assert.equal(
    isMeetingMonthOnOrAfterFirstShift(null, "2026-08"),
    false,
  );
});

test("駐車場あり・許可証不要でも駐車場所未入力アラートを対象外にする", () => {
  assert.equal(
    shouldKeepParkingPlaceAlert({ hasActiveParkingPlace: true, permitRequired: false }),
    false,
  );
  assert.equal(
    shouldKeepParkingPlaceAlert({ hasActiveParkingPlace: false, permitRequired: false }),
    true,
  );
});
