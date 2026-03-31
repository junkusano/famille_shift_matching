// =============================================================
// src/constants/cm/logRetentionPolicy.ts
// ログリテンションポリシー定数
//
// CM領域のログテーブルの保持期間を定義する。
// 新しいCMログテーブルを追加した場合、ここにポリシーを追加する。
// 保持期間変更時はこのファイルの retentionDays を修正するだけでOK。
//
// audit スキーマも現状はCM領域のデータのみのため対象に含める。
// =============================================================

import type { CmLogRetentionPolicy } from "@/types/cm/logRetention";

/**
 * CM領域ログリテンションポリシー一覧
 *
 * 保持期間: 全テーブル統一で 90日
 * ログはあくまで「システムの足跡」であり法定保存対象ではない。
 * 業務データ本体（cm_kaipoke_info, cm_alerts, cm_jobs 等）は対象外。
 */
export const CM_LOG_RETENTION_POLICIES: CmLogRetentionPolicy[] = [
  // ---- audit スキーマ（現状CM専用） ----
  {
    schema: "audit",
    table: "system_logs",
    retentionDays: 90,
    timestampColumn: "timestamp",
    label: "システムログ（warn/error）",
  },
  {
    schema: "audit",
    table: "operation_logs",
    retentionDays: 90,
    timestampColumn: "timestamp",
    label: "操作ログ",
  },
  {
    schema: "audit",
    table: "page_views",
    retentionDays: 90,
    timestampColumn: "timestamp",
    label: "ページ閲覧記録",
  },
  {
    schema: "audit",
    table: "data_change_logs",
    retentionDays: 90,
    timestampColumn: "timestamp",
    label: "DB変更履歴",
  },

  // ---- public スキーマ（cm_ プレフィックス） ----
  {
    schema: "public",
    table: "cm_alert_batch_runs",
    retentionDays: 90,
    timestampColumn: "started_at",
    label: "アラートバッチ実行履歴",
  },
  {
    schema: "public",
    table: "cm_rpa_logs",
    retentionDays: 90,
    timestampColumn: "timestamp",
    label: "RPAログ",
  },
  {
    schema: "public",
    table: "cm_contract_webhook_logs",
    retentionDays: 90,
    timestampColumn: "created_at",
    label: "DigiSigner Webhookログ（処理済み）",
    additionalFilter: {
      column: "processing_status",
      operator: "in",
      value: ["processed", "failed", "rejected"],
    },
  },
];

/**
 * 1回のDELETEで処理する最大行数
 *
 * 対象が残っている限りバッチを繰り返して全件削除する。
 * 毎日実行の場合、cm_rpa_logs の日別最大 22,814件に対して
 * 5,000件 × 約5バッチで完了する想定。
 */
export const CM_LOG_RETENTION_BATCH_SIZE = 5000;

/** バッチ間の待機時間（ミリ秒）— DB負荷軽減 */
export const CM_LOG_RETENTION_BATCH_DELAY_MS = 100;