import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeShiftEventAlerts,
  tokenizeShiftAlertText,
} from "../src/lib/shiftEventAlerts.ts";

const alert = {
  id: "task-1",
  template_id: "template-1",
  event_name: "利用契約更新",
  memo: "電子サイン：\nhttps://example.com/sign?id=1",
  user_id: null,
  kaipoke_cs_id: "client-1",
  due_date: "2026-08-01",
};

test("ViewのイベントJSONからメモ全文と利用者・期日を保持する", () => {
  assert.deepEqual(normalizeShiftEventAlerts([alert]), [alert]);
});

test("同じイベントは重複表示せず、不正な行を除外する", () => {
  assert.deepEqual(
    normalizeShiftEventAlerts([alert, alert, { id: "broken" }, null]),
    [alert],
  );
});

test("メモ内のhttp/https URLだけをリンク用tokenにする", () => {
  const tokens = tokenizeShiftAlertText(
    "電子サイン：https://example.com/sign?id=1。\n確認：http://example.org/x",
  );
  assert.deepEqual(
    tokens.filter((token) => token.kind === "url").map((token) => token.href),
    ["https://example.com/sign?id=1", "http://example.org/x"],
  );
  assert.equal(tokens.map((token) => token.value).join(""),
    "電子サイン：https://example.com/sign?id=1。\n確認：http://example.org/x");
});

test("javascript URLはリンク化しない", () => {
  const tokens = tokenizeShiftAlertText("javascript:alert(1)");
  assert.equal(tokens.some((token) => token.kind === "url"), false);
});
