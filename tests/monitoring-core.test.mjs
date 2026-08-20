import assert from "node:assert/strict";
import test from "node:test";
import {
  detectMonitoringServiceType,
  monthEnd,
  monthStart,
  sanitizeEvidenceIds,
  validateMonitoringPeriod,
} from "../src/lib/monitoring/core.ts";

test("介護保険利用者と障害福祉利用者を既存のサービス表記から判定する", () => {
  assert.equal(detectMonitoringServiceType("要介護", null), "care_insurance");
  assert.equal(detectMonitoringServiceType("障害", null), "disability");
  assert.equal(detectMonitoringServiceType(null, "移動支援サービス"), "disability");
  assert.equal(detectMonitoringServiceType(null, null), null);
});

test("1か月・3か月の年月入力を日付範囲へ変換する", () => {
  assert.equal(monthStart("2026-07"), "2026-07-01");
  assert.equal(monthEnd("2026-07"), "2026-07-31");
  assert.equal(validateMonitoringPeriod("2026-07-01", "2026-07-31"), null);
  assert.equal(validateMonitoringPeriod("2026-05-01", "2026-07-31"), null);
  assert.equal(monthStart(""), "");
  assert.equal(monthEnd(""), "");
});

test("開始終了の逆転と12か月以上を拒否する", () => {
  assert.match(validateMonitoringPeriod("2026-08-01", "2026-07-31") ?? "", /開始日/);
  assert.match(validateMonitoringPeriod("2026-01-01", "2027-01-01") ?? "", /12か月/);
});

test("AIが返した存在しない訪問記録IDを根拠から除外する", () => {
  assert.deepEqual(
    sanitizeEvidenceIds(["visit-1", "fabricated", "visit-1", "visit-2"], new Set(["visit-1", "visit-2"])),
    ["visit-1", "visit-2"],
  );
});

test("訪問記録0件ではAI根拠を保存しない", () => {
  assert.deepEqual(sanitizeEvidenceIds(["fabricated"], new Set()), []);
});
