import assert from "node:assert/strict";
import test from "node:test";
import { buildHealthCheckPersonCommentNotification } from "../src/lib/healthCheckNotification.ts";

test("person comment notification never includes the private comment body", () => {
  const notification = buildHealthCheckPersonCommentNotification("山田 花子", "request-123");

  assert.match(notification, /産業医が本人向けコメントを登録しました/);
  assert.match(notification, /対象者：山田 花子/);
  assert.match(notification, /申請ID：request-123/);
  assert.doesNotMatch(notification, /要配慮の健康情報を含む本人向けコメント本文/);
});
