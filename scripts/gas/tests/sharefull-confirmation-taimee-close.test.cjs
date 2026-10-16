const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const source = fs.readFileSync(path.join(__dirname, "..", "sharefull-confirmation-taimee-close.gs"), "utf8");
const context = vm.createContext({});
const requests = [];
context.UrlFetchApp = {
  fetch(url, options) {
    requests.push({ url, payload: JSON.parse(options.payload) });
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
  },
};
context.PropertiesService = {
  getScriptProperties: () => ({ setProperty: () => {} }),
};
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

test("ホスト名のない /orders/ID リンクから注文IDを抽出する", () => {
  const result = context.parseSharefullConfirmationMail_(message(
    "【候補者が決定しました】訪問介護",
    "候補者\n候補者名\n/orders/8348295?source=email",
  ), "system@sharefull.com");

  assert.equal(result.sharefull_order_id, "8348295");
});

test("Sharefull以外のホストにある /orders/ID は注文IDとして受け入れない", () => {
  const result = context.parseSharefullConfirmationMail_(message(
    "【候補者が決定しました】訪問介護",
    "候補者\n候補者名\nhttps://example.invalid/orders/8348295",
  ), "system@sharefull.com");

  assert.equal(result, null);
});

test("別の送信元から来たメールはSharefullイベントとして扱わない", () => {
  const result = context.parseSharefullConfirmationMail_(
    { ...message("【応募キャンセル】", "応募キャンセル\n管理番号: 123"), getFrom: () => "attacker@example.com" },
    "system@sharefull.com",
  );
  assert.equal(result, null);
});

test("IDのない確定通知は成功扱いせず、API送信も処理済み記録もしない", () => {
  const config = { apiBaseUrl: "https://myfamille.shi-on.net", apiToken: "token", senderEmail: "system@sharefull.com" };
  const processed = {};
  const malformed = message("【候補者が決定しました】", "候補者が決定しました。案件URLは本文にありません。");

  assert.equal(context.processSharefullConfirmationMessage_(malformed, config, 0, processed, "confirmed"), false);
  assert.equal(processed[malformed.getId()], undefined);
  assert.equal(requests.length, 0);
});

test("キャンセル検索では確定イベントを再送せず、キャンセルをキャンセルAPIへ送る", () => {
  const config = { apiBaseUrl: "https://myfamille.shi-on.net", apiToken: "token", senderEmail: "system@sharefull.com" };
  const processed = {};
  const confirmed = message("【候補者が決定しました】", "候補者\n坪下由奈さん\nhttps://client.sharefull.com/orders/8302484");
  const cancelled = message("【応募キャンセル】", "キャンセルした応募者\n坪下由奈 さん（女性）\nhttps://client.sharefull.com/orders/8302484");

  assert.equal(context.processSharefullConfirmationMessage_(confirmed, config, 0, processed, "cancelled"), true);
  assert.equal(context.processSharefullConfirmationMessage_(cancelled, config, 0, processed, "cancelled"), true);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/api\/rpa\/sharefull\/cancelled$/);
  assert.equal(requests[0].payload.state, "cancelled");
});
