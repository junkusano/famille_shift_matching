import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDisabilityCheckHref,
  formatRosterErrorYearMonth,
  hasRosterIssues,
} from "../src/lib/roster/rosterErrors.ts";

const baseShift = {
  shift_id: 1,
  shift_date: "2026-08-28",
  start_at: "09:00:00",
  end_at: "10:00:00",
  client_name: "テスト利用者",
  service_code: "居宅介護",
  service_name: "居宅介護",
};

test("不備がないシフトは通常表示のままになる", () => {
  assert.equal(hasRosterIssues(baseShift), false);
});

test("複数種別の不備があるシフトを要確認として扱う", () => {
  assert.equal(
    hasRosterIssues({
      ...baseShift,
      roster_error_visit_record: true,
      roster_error_actual_record: true,
      roster_error_care_consultant: true,
      roster_error_transport_info: true,
      roster_error_kodoengo_plan: true,
    }),
    true,
  );
});

test("未提出月リンクは年月・利用者・未提出フィルターを保持する", () => {
  const href = buildDisabilityCheckHref("2026-07", "12345");
  const url = new URL(href, "https://myfamille.shi-on.net");

  assert.equal(url.pathname, "/portal/disability-check");
  assert.equal(url.searchParams.get("ym"), "2026-07");
  assert.equal(url.searchParams.get("kaipoke_cs_id"), "12345");
  assert.equal(url.searchParams.get("check"), "unsubmitted");
  assert.equal(formatRosterErrorYearMonth("2026-07"), "2026年7月");
});
