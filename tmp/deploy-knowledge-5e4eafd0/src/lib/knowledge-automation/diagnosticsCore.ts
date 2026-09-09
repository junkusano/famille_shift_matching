export type DiagnosticFinding = {
  key: string; provider: string; category: string; severity: string; route: string;
  count: number; recommendation: string; codePaths: string[];
};

export function classifyRuntime(message: string) {
  if (/timed out|statement timeout/i.test(message)) return { category: "timeout", recommendation: "処理時間とDB実行計画を確認し、小分け処理・再開位置・検索索引を見直してください。" };
  if (/Group member already exist/i.test(message)) return { category: "already_member", recommendation: "既存メンバーの応答だけを追加済みとして扱ってください。" };
  if (/Mentioned user does not exist/i.test(message)) return { category: "invalid_mention", recommendation: "送信先チャンネルとメンション対象の所属を確認してください。" };
  if (/Not Found|見つかりません/i.test(message)) return { category: "missing_reference", recommendation: "対象ID・ファイルの存在・共有権限を確認してください。" };
  return { category: "runtime_error", recommendation: "管理画面の原本ログと該当コードを確認してください。原因は未確定です。" };
}

export function safeRoute(value: unknown) {
  const route = String(value ?? "").split("?")[0];
  // Retain static API route names only; omit user IDs and arbitrary text.
  return /^\/api(?:\/[a-z][a-z0-9_-]{0,80}){1,12}$/.test(route) ? route : "(経路省略)";
}

export function aggregateRuntime(rows: Array<{ requestId?: string; requestPath?: string; logs?: Array<{ level?: string; message?: string }> }>) {
  const grouped = new Map<string, DiagnosticFinding>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.requestId || seen.has(row.requestId)) continue;
    seen.add(row.requestId);
    const perRequest = new Set<string>();
    for (const log of row.logs ?? []) {
      if (!["error", "fatal", "warning", "warn"].includes(log.level ?? "")) continue;
      const { category, recommendation } = classifyRuntime(log.message ?? "");
      const route = safeRoute(row.requestPath);
      const key = `vercel:${route}:${category}`;
      if (perRequest.has(key)) continue;
      perRequest.add(key);
      const existing = grouped.get(key);
      if (existing) { existing.count++; if (["error", "fatal"].includes(log.level ?? "")) existing.severity = "ERROR"; }
      else grouped.set(key, { key, provider: "vercel", category, severity: log.level === "error" || log.level === "fatal" ? "ERROR" : "WARN", route, count: 1, recommendation, codePaths: [] });
    }
  }
  return [...grouped.values()];
}

export function compareFindings(current: DiagnosticFinding[], previous: DiagnosticFinding[], complete: boolean) {
  const before = new Map(previous.map(item => [item.key, item]));
  const keys = new Set(current.map(item => item.key));
  return {
    new: current.filter(item => !before.has(item.key)).map(item => item.key),
    worsened: current.filter(item => before.has(item.key) && item.count > before.get(item.key)!.count).map(item => item.key),
    resolved: complete ? previous.filter(item => !keys.has(item.key)).map(item => item.key) : [],
  };
}
