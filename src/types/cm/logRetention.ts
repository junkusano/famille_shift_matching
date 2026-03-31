// =============================================================
// src/types/cm/logRetention.ts
// ログリテンション（保持期間管理）の型定義
// =============================================================

// -------------------------------------------------------------
// リテンションポリシー
// -------------------------------------------------------------

/** 単一テーブルのリテンションポリシー */
export type CmLogRetentionPolicy = {
  /** Supabase スキーマ名（"public" or "audit"） */
  schema: "public" | "audit";
  /** テーブル名 */
  table: string;
  /** 保持日数（この日数より古いレコードを削除） */
  retentionDays: number;
  /** タイムスタンプカラム名 */
  timestampColumn: string;
  /** 削除時の追加条件（例: 処理済みログのみ削除） */
  additionalFilter?: CmLogRetentionFilter;
  /** 管理画面での表示ラベル */
  label: string;
};

/** 追加フィルター条件 */
export type CmLogRetentionFilter = {
  column: string;
  operator: "eq" | "neq" | "in" | "gte" | "lte";
  value: string | number | string[];
};

// -------------------------------------------------------------
// 実行結果
// -------------------------------------------------------------

/** 単一テーブルのクリーンアップ結果 */
export type CmLogRetentionTableResult = {
  schema: string;
  table: string;
  label: string;
  retentionDays: number;
  cutoffDate: string;
  deletedCount: number;
  durationMs: number;
  error?: string;
};

/** クリーンアップ全体の結果 */
export type CmLogRetentionResult = {
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tables: CmLogRetentionTableResult[];
  totalDeleted: number;
  errors: string[];
};

// -------------------------------------------------------------
// 実行オプション
// -------------------------------------------------------------

export type CmLogRetentionOptions = {
  /** ドライラン（削除せずにカウントのみ） */
  dryRun: boolean;
  /** 特定テーブルのみ実行（省略時は全テーブル） */
  targetTables?: string[];
};
