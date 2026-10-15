// Database error details can contain source text or credentials. Retain only
// a known code and a diagnostic category for non-Error objects.
export function safeSyncError(error: unknown) {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
  const code = typeof record.code === "string" && /^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(record.code) ? record.code : null;
  const rawMessage = typeof record.message === "string" ? record.message : "";
  if (/timeout|timed out|abort|時間予算|タイムアウト/i.test(rawMessage) || code === "57014") {
    return { code: "SYNC_TIMEOUT", message: "同期が時間上限に達しました。保存済みの範囲から再試行します。" };
  }
  if (/token|secret|authorization|credential|password|api.?key/i.test(rawMessage)) {
    return { code: "CONNECTION_FAILED", message: "外部サービスの認証または接続に失敗しました。" };
  }
  if (code) {
    const category = code === "23505" ? "重複または同時更新" : code === "42501" ? "アクセス権限" : "データ保存・取得";
    return { code, message: `同期中の${category}でエラーが発生しました（${code}）。` };
  }
  return { code: "SYNC_FAILED", message: error instanceof Error ? error.message.slice(0, 1_000) : "同期中に外部サービスとの通信またはデータ保存に失敗しました。" };
}
