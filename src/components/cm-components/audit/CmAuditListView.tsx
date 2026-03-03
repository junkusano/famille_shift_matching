// =============================================================
// src/components/cm-components/audit/CmAuditListView.tsx
// 監査ログ閲覧画面の一覧テーブル表示
//
// page_views + operation_logs を時系列で統合した単一テーブル。
// - 「ページ遷移を表示」チェックボックスで page_view の表示を切替
// - 各行クリック/「詳細」ボタンでモーダル詳細を表示
// - ページネーション（クライアント側）
// =============================================================

"use client";

import React, { useState, useCallback, useMemo } from "react";
import {
  X,
  Eye,
  Activity,
  Pencil,
  Bot,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  CmTimelineEvent,
  CmDataChangeLog,
} from "@/types/cm/operationLog";

// =============================================================
// 型定義
// =============================================================

type Props = {
  events: CmTimelineEvent[];
  loading: boolean;
  perPage?: number;
};

// =============================================================
// 定数: カテゴリ
// =============================================================

const CM_AUDIT_CATEGORY_LABELS: Record<string, string> = {
  client: "利用者",
  contract: "契約書",
  fax: "FAX",
  phonebook: "FAX電話帳",
  "other-office": "他事業所",
  schedule: "スケジュール",
  credential: "認証情報",
  "rpa-api": "RPA API",
  "rpa-job": "RPAジョブ",
  "alert-batch": "アラートバッチ",
  plaud: "Plaud",
};

const CM_AUDIT_CAT_BADGE_STYLES: Record<string, string> = {
  client: "bg-blue-50 text-blue-700",
  contract: "bg-purple-50 text-purple-700",
  fax: "bg-green-50 text-green-700",
  phonebook: "bg-emerald-50 text-emerald-700",
  "other-office": "bg-teal-50 text-teal-700",
  schedule: "bg-cyan-50 text-cyan-700",
  credential: "bg-red-50 text-red-700",
  "rpa-api": "bg-amber-50 text-amber-700",
  "rpa-job": "bg-orange-50 text-orange-700",
  "alert-batch": "bg-yellow-50 text-yellow-700",
  plaud: "bg-violet-50 text-violet-700",
};

// =============================================================
// ユーティリティ
// =============================================================

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "client.search": "利用者検索",
    "client.update": "基本情報を更新",
    "contract.create-consent": "同意書作成",
    "contract.update": "契約更新",
    "contract.create": "契約書を新規作成",
    "phonebook.create": "FAX電話帳追加",
    "phonebook.update": "FAX電話帳更新",
    "phonebook.delete": "FAX電話帳削除",
    "phonebook.sync": "FAX電話帳同期",
    "other-office.update-fax-proxy": "他事業所FAX更新",
    "alert-batch.run": "アラートバッチ実行",
    "rpa-job.create": "RPAジョブ作成",
    "rpa-job.update": "RPAジョブ更新",
    "schedule.add": "スケジュール追加",
    "schedule.update": "スケジュール更新",
    "schedule.remove": "スケジュール削除",
    "schedule.reorder": "スケジュール並替",
    "schedule.toggle": "スケジュール有効/無効",
    "schedule.execute-all": "スケジュール全実行",
    "schedule.execute-single": "スケジュール個別実行",
    "credential.create": "認証情報作成",
    "credential.update": "認証情報更新",
    "credential.delete": "認証情報削除",
    "plaud.generate": "要約生成",
    "plaud.update-client": "Plaudクライアント更新",
    "plaud.template-create": "テンプレート作成",
    "plaud.template-update": "テンプレート更新",
    "plaud.template-delete": "テンプレート削除",
    "rpa-api.client-info": "利用者情報を一括更新",
    "rpa-api.other-office": "RPA他事業所取込",
    "rpa-api.service-usage": "RPAサービス利用取込",
    "rpa-api.staff-info": "RPAスタッフ情報取込",
    "fax.list": "FAX一覧取得",
    "fax.documents": "FAX文書操作",
    "fax.document-pages": "FAX文書ページ操作",
    "fax.assign-office": "事業所に振り分け",
  };
  return labels[action] ?? action;
}

function formatPathLabel(path: string): string {
  const patterns: [RegExp, string][] = [
    [/^\/$/, "ダッシュボード"],
    [/\/clients\/[^/]+\/contracts\/create/, "契約書作成"],
    [/\/clients\/[^/]+\/contracts/, "契約一覧"],
    [/\/clients\/[^/]+/, "利用者詳細"],
    [/\/clients$/, "利用者一覧"],
    [/\/fax\/\d+/, "FAX詳細"],
    [/\/fax$/, "FAX一覧"],
    [/\/rpa-jobs\/\d+/, "ジョブ詳細"],
    [/\/rpa-jobs$/, "RPAジョブ一覧"],
    [/\/settings\/credentials/, "認証情報管理"],
    [/\/admin\/alert-batch/, "アラートバッチ"],
    [/\/service-credentials/, "認証情報管理"],
    [/\/audit/, "監査ログ"],
  ];
  for (const [regex, label] of patterns) {
    if (regex.test(path)) return label;
  }
  return path;
}

// =============================================================
// サブコンポーネント: アバター
// =============================================================

function CmListAvatar({ name }: { name: string }) {
  const isSystem = name.toLowerCase().startsWith("system");

  if (isSystem) {
    return (
      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 border border-amber-200">
        <Bot size={14} className="text-amber-600" />
      </div>
    );
  }

  const avatarColors = [
    "bg-blue-50 border-blue-200 text-blue-700",
    "bg-violet-50 border-violet-200 text-violet-700",
    "bg-teal-50 border-teal-200 text-teal-700",
    "bg-rose-50 border-rose-200 text-rose-700",
  ];

  let charSum = 0;
  for (let i = 0; i < name.length; i++) {
    charSum += name.charCodeAt(i);
  }

  return (
    <div
      className={`flex items-center justify-center w-7 h-7 rounded-full border font-bold text-xs ${
        avatarColors[charSum % avatarColors.length]
      }`}
    >
      {name.charAt(0)}
    </div>
  );
}

// =============================================================
// サブコンポーネント: カテゴリバッジ
// =============================================================

function CmCatBadge({ category }: { category: string }) {
  const label = CM_AUDIT_CATEGORY_LABELS[category] ?? category;
  const style = CM_AUDIT_CAT_BADGE_STYLES[category] ?? "bg-slate-50 text-slate-600";
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}

// =============================================================
// サブコンポーネント: 操作バッジ
// =============================================================

function CmOpBadge({ op }: { op: string }) {
  const styles: Record<string, string> = {
    INSERT: "bg-emerald-50 text-emerald-700",
    UPDATE: "bg-sky-50 text-sky-700",
    DELETE: "bg-rose-50 text-rose-700",
  };
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${styles[op] ?? "bg-slate-50 text-slate-600"}`}>
      {op}
    </span>
  );
}

// =============================================================
// サブコンポーネント: ページネーション
// =============================================================

function CmListPagination({
  total,
  page,
  perPage,
  onPageChange,
}: {
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = Math.min((page - 1) * perPage + 1, total);
  const to = Math.min(page * perPage, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white rounded-xl border border-slate-200 shadow-sm">
      <span className="text-sm text-slate-500">
        全 {total} 件中 {from} - {to} 件
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center justify-center w-8 h-8 border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft size={14} className="text-slate-600" />
        </button>
        <span className="text-sm text-slate-600 tabular-nums min-w-[60px] text-center">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center justify-center w-8 h-8 border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors"
        >
          <ChevronRight size={14} className="text-slate-600" />
        </button>
      </div>
    </div>
  );
}

// =============================================================
// サブコンポーネント: 詳細モーダル
// =============================================================

function CmEventDetailModal({
  event,
  onClose,
}: {
  event: CmTimelineEvent;
  onClose: () => void;
}) {
  const displayName =
    event.user_name ?? event.user_email ?? event.user_id.substring(0, 8);
  const isPageView = event.event_type === "page_view";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(15,23,42,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4"
        style={{ maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">
            {isPageView ? "ページ閲覧" : "操作ログ"}詳細
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">操作者</p>
              <p className="text-sm font-medium text-slate-800">
                {displayName}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">日時</p>
              <p className="text-sm text-slate-700 tabular-nums">
                {formatTimestamp(event.timestamp)}
              </p>
            </div>
          </div>

          {/* ページ閲覧の場合 */}
          {isPageView && (
            <div>
              <p className="text-xs text-slate-400 mb-1">パス</p>
              <p className="text-sm font-mono text-slate-700">
                {event.action}
              </p>
            </div>
          )}

          {/* 操作の場合 */}
          {!isPageView && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">アクション</p>
                  <p className="text-sm font-mono text-slate-700">
                    {event.action}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">カテゴリ</p>
                  {event.category ? (
                    <CmCatBadge category={event.category} />
                  ) : (
                    <span className="text-sm text-slate-400">—</span>
                  )}
                </div>
              </div>

              {event.resource_id && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">リソースID</p>
                  <p className="text-sm font-mono text-slate-700">
                    {event.resource_id}
                  </p>
                </div>
              )}

              {/* DB変更詳細 */}
              {event.db_changes.length > 0 &&
                event.db_changes.map((dc) => (
                  <CmModalDbChange key={dc.id} change={dc} />
                ))}
            </div>
          )}

          {/* トレースID */}
          {event.trace_id && (
            <div>
              <p className="text-xs text-slate-400 mb-1">トレースID</p>
              <p className="text-sm font-mono text-slate-500">
                {event.trace_id}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CmModalDbChange({ change }: { change: CmDataChangeLog }) {
  const fields =
    change.changed_fields ??
    (change.new_data ? Object.keys(change.new_data) : []);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <CmOpBadge op={change.operation} />
        <span className="text-xs font-mono font-semibold text-slate-700">
          {change.table_name}
        </span>
      </div>

      {change.operation === "UPDATE" && change.old_data && change.new_data && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-3 py-1.5 text-left text-slate-500">
                フィールド
              </th>
              <th className="px-3 py-1.5 text-left text-rose-400">変更前</th>
              <th className="px-3 py-1.5 text-left text-emerald-500">
                変更後
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f}>
                <td className="px-3 py-1.5 font-mono text-slate-600">{f}</td>
                <td className="px-3 py-1.5 text-rose-600 bg-rose-50 break-all">
                  {formatValue(change.old_data?.[f])}
                </td>
                <td className="px-3 py-1.5 text-emerald-700 bg-emerald-50 break-all">
                  {formatValue(change.new_data?.[f])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {change.operation === "INSERT" && change.new_data && (
        <pre className="text-xs font-mono text-slate-600 p-3 whitespace-pre-wrap break-all">
          {JSON.stringify(change.new_data, null, 2)}
        </pre>
      )}

      {change.operation === "DELETE" && change.old_data && (
        <pre className="text-xs font-mono text-slate-600 p-3 whitespace-pre-wrap break-all">
          {JSON.stringify(change.old_data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "null";
  if (typeof val === "string") return val || '""';
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

// =============================================================
// メインコンポーネント
// =============================================================

export function CmAuditListView({ events, loading, perPage = 20 }: Props) {
  const [showPageViews, setShowPageViews] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CmTimelineEvent | null>(
    null
  );
  const [page, setPage] = useState(1);

  const handleClose = useCallback(() => setSelectedEvent(null), []);

  // フィルタリング
  const filtered = useMemo(() => {
    if (showPageViews) return events;
    return events.filter((ev) => ev.event_type !== "page_view");
  }, [events, showPageViews]);

  // ページネーション（クライアント側）
  const total = filtered.length;
  const paged = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage]);

  // ページ変更
  const handlePageChange = useCallback(
    (newPage: number) => {
      const totalPages = Math.max(1, Math.ceil(total / perPage));
      if (newPage >= 1 && newPage <= totalPages) {
        setPage(newPage);
      }
    },
    [total, perPage]
  );

  // showPageViews 変更時にページをリセット
  const handleTogglePageViews = useCallback(() => {
    setShowPageViews((prev) => !prev);
    setPage(1);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Activity className="w-5 h-5 animate-spin mr-2" />
        読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ページ遷移表示トグル */}
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showPageViews}
          onChange={handleTogglePageViews}
          className="rounded border-slate-300 text-slate-800"
        />
        <span className="text-sm text-slate-600">ページ遷移を表示</span>
      </label>

      {/* テーブル */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  日時
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  操作者
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  種別
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  内容
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide w-16">
                  詳細
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.map((ev, idx) => {
                const displayName =
                  ev.user_name ??
                  ev.user_email ??
                  ev.user_id.substring(0, 8);
                const isPageView = ev.event_type === "page_view";

                return (
                  <tr
                    key={`${ev.timestamp}-${ev.action}-${idx}`}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    {/* 日時 */}
                    <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap font-mono tabular-nums">
                      {formatTimestamp(ev.timestamp)}
                    </td>

                    {/* 操作者 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <CmListAvatar name={displayName} />
                        <span className="text-sm text-slate-800">
                          {displayName}
                        </span>
                      </div>
                    </td>

                    {/* 種別 */}
                    <td className="px-4 py-3">
                      {isPageView ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                          <Eye size={11} />
                          閲覧
                        </span>
                      ) : ev.category ? (
                        <CmCatBadge category={ev.category} />
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                          <Pencil size={11} />
                          操作
                        </span>
                      )}
                    </td>

                    {/* 内容 */}
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                      <div className="truncate">
                        {isPageView
                          ? formatPathLabel(ev.action)
                          : formatActionLabel(ev.action)}
                      </div>
                      {!isPageView && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {ev.action}
                        </div>
                      )}
                      {isPageView && (
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {ev.action}
                        </div>
                      )}
                    </td>

                    {/* 詳細ボタン */}
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    該当するイベントがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ページネーション */}
      {total > perPage && (
        <CmListPagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={handlePageChange}
        />
      )}

      {/* 詳細モーダル */}
      {selectedEvent && (
        <CmEventDetailModal event={selectedEvent} onClose={handleClose} />
      )}
    </div>
  );
}