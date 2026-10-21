import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthCheckPersonCommentNotification } from "../src/lib/healthCheckNotification.ts";

test("person comment notification uses the privacy-safe navigation message", () => {
  const notification = buildHealthCheckPersonCommentNotification();

  assert.equal(notification, "産業医が本人向けコメントを登録しました。マイファミーユの全員共通メニュー＞健康診断結果＞医師の意見欄　を確認お願いします。");
  assert.doesNotMatch(notification, /要配慮の健康情報を含む本人向けコメント本文/);
});
