const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "sharefull-confirmation-taimee-close.gs"), "utf8");
const context = vm.createContext({});
vm.runInContext(source, context);

function message(subject, body) {
  return {
    getFrom: () => "シェアフル <system@sharefull.com>",
    getSubject: () => subject,
    getPlainBody: () => body,
    getDate: () => new Date("2026-10-10T07:50:00.000Z"),
    getId: () => "gmail-event-1",
  };
}

test("候補者決定メールと応募キャンセルメールを同じ応募キーに紐付ける", () => {
  const confirmed = context.parseSharefullConfirmationMail_(message(
    "【候補者が決定しました】訪問介護",
    "候補者\n坪下由奈 49歳 (女性)\nhttps://client.sharefull.com/orders/8302484",
  ), "system@sharefull.com");
  const cancelled = context.parseSharefullConfirmationMail_(message(
    "【応募キャンセル】2026/10/10(土) 訪問介護",
    "応募者のキャンセルがありました。\nキャンセルした応募者\n坪下由奈 さん（女性）\n選択した理由：間違えて応募したため\n理由詳細コメント：\nhttps://client.sharefull.com/orders/8302484",
  ), "system@sharefull.com");

  assert.equal(confirmed.state, "confirmed");
  assert.equal(cancelled.state, "cancelled");
  assert.equal(confirmed.sharefull_order_id, "8302484");
  assert.equal(cancelled.sharefull_order_id, "8302484");
  assert.equal(confirmed.applicant_name, "坪下由奈");
  assert.equal(cancelled.applicant_name, "坪下由奈");
  assert.equal(cancelled.cancellation_reason, "間違えて応募したため");
  assert.equal(confirmed.application_key, cancelled.application_key);
});

test("別の送信元から来たメールはSharefullイベントとして扱わない", () => {
  const result = context.parseSharefullConfirmationMail_(
    { ...message("【応募キャンセル】", "応募キャンセル\n管理番号: 123"), getFrom: () => "attacker@example.com" },
    "system@sharefull.com",
  );
  assert.equal(result, null);
});
