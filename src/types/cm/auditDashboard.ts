// =============================================================
// src/types/cm/auditDashboard.ts
// 監査ダッシュボード固有の型定義
//
// DB行やフィルターなどの共通型は types/cm/operationLog.ts に定義済み。
// ここにはダッシュボードUI専用の型のみ配置する。
// =============================================================

/** カラーセット（パレット用） */
export type CmAuditColorSet = {
  main: string;
  light: string;
  muted: string;
};

/** 操作の重要度 */
export type CmAuditSeverity = 'high' | 'medium' | 'low';

/** ダッシュボードの期間選択 */
export type CmAuditPeriod = 'today' | '7d' | '30d';

/** ユーザー別アクティビティ集計 */
export type CmAuditUserStat = {
  name: string;
  userId: string;
  operations: number;
  pageViews: number;
  lastAccess: string;
  changes: number;
};

/** 注目操作1件 */
export type CmAuditImportantOp = {
  time: string;
  user: string;
  action: string;
  target: string;
  severity: CmAuditSeverity;
};

/** ヒートマップのセル */
export type CmAuditHeatmapCell = {
  day: string;
  dayIndex: number;
  hour: number;
  count: number;
};

/** ナビカード定義 */
export type CmAuditNavCardDef = {
  id: string;
  label: string;
  description: string;
  href: string;
  Icon: React.ElementType;
  color: CmAuditColorSet;
  statLabel: string;
};
