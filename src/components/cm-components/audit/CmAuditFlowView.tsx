// =============================================================
// src/components/cm-components/audit/CmAuditFlowView.tsx
// 監査ログの経路フロー表示
//
// セッションカード単位でユーザーの操作経路を横方向のフローで表示する。
// - ページ閲覧（page_view）: スレートカラーのノード
// - 操作（operation）: カテゴリ別に色分けされたノード
// - DB変更: ノード選択時にカード下部に展開
// - セッション間は矢印コネクタで接続
// =============================================================

"use client";

import React, { useState } from "react";
import {
  FileText,
  Pencil,
  Database,
  Bot,
  Activity,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { cmGetDataChangeDetail } from "@/lib/cm/audit/getDataChangeDetail";
import type {
  CmAuditSession,
  CmTimelineEvent,
  CmDataChangeLog,
} from "@/types/cm/operationLog";

// =============================================================
// 型定義
// =============================================================

type Props = {
  sessions: CmAuditSession[];
  loading: boolean;
};

// =============================================================
// 定数: カテゴリ別カラー
// =============================================================

type CatColorSet = {
  bg: string;
  text: string;
  border: string;
  ring: string;
};

const CM_AUDIT_CAT_COLORS: Record<string, CatColorSet> = {
  client: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", ring: "ring-blue-100" },
  contract: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", ring: "ring-purple-100" },
  fax: { bg: "bg-green-50", text: "text-green-700", border: "border-green-200", ring: "ring-green-100" },
  phonebook: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", ring: "ring-emerald-100" },
  "other-office": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", ring: "ring-teal-100" },
  schedule: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", ring: "ring-cyan-100" },
  credential: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", ring: "ring-red-100" },
  "rpa-api": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", ring: "ring-amber-100" },
  "rpa-job": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", ring: "ring-orange-100" },
  "alert-batch": { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", ring: "ring-yellow-100" },
  plaud: { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", ring: "ring-violet-100" },
};

const CM_AUDIT_DEFAULT_CAT_COLOR: CatColorSet = {
  bg: "bg-slate-50",
  text: "text-slate-600",
  border: "border-slate-200",
  ring: "ring-slate-100",
};

function getCatColor(category: string | null): CatColorSet {
  if (!category) return CM_AUDIT_DEFAULT_CAT_COLOR;
  return CM_AUDIT_CAT_COLORS[category] ?? CM_AUDIT_DEFAULT_CAT_COLOR;
}

// =============================================================
// ユーティリティ
// =============================================================

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** アクション名を日本語ラベルに変換する */
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

/** page_view のパスから画面ラベルを推定する */
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

  // パスの最後のセグメントを使用
  const segments = path.split("/").filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : path;
}

/** パスからサブラベル（ID部分等）を抽出する */
function extractPathSub(path: string): string {
  // /clients/CS-10234 → CS-10234
  const clientMatch = path.match(/\/clients\/([^/]+)/);
  if (clientMatch) return clientMatch[1];

  // /fax/1523 → #1523
  const faxMatch = path.match(/\/fax\/(\d+)/);
  if (faxMatch) return `#${faxMatch[1]}`;

  // /rpa-jobs/3 → #3
  const jobMatch = path.match(/\/rpa-jobs\/(\d+)/);
  if (jobMatch) return `#${jobMatch[1]}`;

  return "";
}

/** セッションの表示名を取得する */
function getDisplayName(session: CmAuditSession): string {
  return session.user_name ?? session.user_email ?? session.user_id.substring(0, 8);
}

/** アクセストークンを取得する */
async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

// =============================================================
// サブコンポーネント: アバター
// =============================================================

function CmAuditAvatar({
  name,
  large,
}: {
  name: string;
  large?: boolean;
}) {
  const isSystem = name.toLowerCase().startsWith("system");

  if (isSystem) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-amber-50 border border-amber-200 ${
          large ? "w-10 h-10" : "w-7 h-7"
        }`}
      >
        <Bot size={large ? 18 : 14} className="text-amber-600" />
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
      className={`flex items-center justify-center rounded-full border font-bold ${
        avatarColors[charSum % avatarColors.length]
      } ${large ? "w-10 h-10 text-sm" : "w-7 h-7 text-xs"}`}
    >
      {name.charAt(0)}
    </div>
  );
}

// =============================================================
// サブコンポーネント: ステータスドット（アクティブセッション）
// =============================================================

function CmStatusDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
    </span>
  );
}

// =============================================================
// サブコンポーネント: フロー矢印
// =============================================================

function CmFlowArrow() {
  return (
    <div className="flex items-center flex-shrink-0 mx-0.5">
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        <path d="M0 5H16" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M12 1L16 5L12 9"
          stroke="#cbd5e1"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// =============================================================
// サブコンポーネント: 閲覧ノード（page_view）
// =============================================================

function CmViewNode({
  event,
  active,
  isLast,
  onClick,
}: {
  event: CmTimelineEvent;
  active: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const label = formatPathLabel(event.action);
  const sub = extractPathSub(event.action);
  const time = formatTime(event.timestamp);

  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <button
        onClick={onClick}
        className={`flex flex-col items-center text-center px-3 py-2.5 rounded-xl border transition-all min-w-[96px] max-w-[116px] ${
          active
            ? "border-slate-300 bg-white shadow-lg ring-2 ring-slate-100"
            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-md"
        }`}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-lg mb-1.5 ${
            active ? "bg-slate-100" : "bg-slate-50"
          }`}
        >
          <FileText size={16} className="text-slate-400" />
        </div>
        <span className="text-xs font-medium text-slate-700 leading-tight">
          {label}
        </span>
        {sub && (
          <span className="text-xs font-mono text-slate-400 mt-0.5">
            {sub}
          </span>
        )}
        <span className="text-xs text-slate-400 mt-1 tabular-nums">
          {time}
        </span>
      </button>
      {isLast && (
        <span className="mt-2 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500 font-medium">
          最終操作
        </span>
      )}
    </div>
  );
}

// =============================================================
// サブコンポーネント: 操作ノード（operation）
// =============================================================

function CmActionNode({
  event,
  active,
  isLast,
  onClick,
}: {
  event: CmTimelineEvent;
  active: boolean;
  isLast: boolean;
  onClick: () => void;
}) {
  const c = getCatColor(event.category);
  const label = formatActionLabel(event.action);
  const time = formatTime(event.timestamp);
  const resDisplay = event.resource_id
    ? event.resource_id.length > 16
      ? event.resource_id.substring(0, 16)
      : event.resource_id
    : null;

  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <button
        onClick={onClick}
        className={`flex flex-col items-center text-center px-3 py-2.5 rounded-xl border transition-all min-w-[96px] max-w-[116px] ${
          active
            ? `${c.border} ${c.bg} shadow-lg ring-2 ${c.ring}`
            : `${c.border} ${c.bg} hover:shadow-md`
        }`}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-lg mb-1.5 bg-white border ${c.border}`}
        >
          <Pencil size={14} className={c.text} />
        </div>
        <span className={`text-xs font-semibold leading-tight ${c.text}`}>
          {label}
        </span>
        {resDisplay && (
          <span className={`text-xs font-mono mt-0.5 opacity-70 ${c.text}`}>
            {resDisplay}
          </span>
        )}
        <span className={`text-xs mt-1 tabular-nums opacity-60 ${c.text}`}>
          {time}
        </span>
      </button>
      {isLast && (
        <span className="mt-2 px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-500 font-medium">
          最終操作
        </span>
      )}
    </div>
  );
}

// =============================================================
// サブコンポーネント: 操作バッジ（INSERT / UPDATE / DELETE）
// =============================================================

function CmOpBadge({ op }: { op: string }) {
  const styles: Record<string, string> = {
    INSERT: "bg-emerald-50 text-emerald-700",
    UPDATE: "bg-sky-50 text-sky-700",
    DELETE: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
        styles[op] ?? "bg-slate-50 text-slate-600"
      }`}
    >
      {op}
    </span>
  );
}

// =============================================================
// サブコンポーネント: DB変更詳細パネル
// =============================================================

function CmDbDetailPanel({
  event,
}: {
  event: CmTimelineEvent;
}) {
  if (event.db_changes.length === 0) return null;

  const label = formatActionLabel(event.action);
  const resDisplay = event.resource_id ?? "";

  return (
    <div className="mt-5 rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
        <Database size={14} className="text-slate-400" />
        <span className="text-sm font-semibold text-slate-700">
          DB変更内容
        </span>
        <span className="text-xs text-slate-400">
          {label}
          {resDisplay ? ` (${resDisplay})` : ""}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {event.db_changes.map((dc) => (
          <CmDbChangeCard key={dc.id} change={dc} />
        ))}
      </div>
    </div>
  );
}

/**
 * DB変更カード
 *
 * old_data / new_data が未取得（undefined）の場合は「詳細を表示」ボタンを表示し、
 * クリック時に cmGetDataChangeDetail() で1件取得して展開する。
 */
function CmDbChangeCard({ change }: { change: CmDataChangeLog }) {
  const [loadedChange, setLoadedChange] = useState<CmDataChangeLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 表示に使用するデータ: 遅延読み込み済みならそちらを優先
  const displayChange = loadedChange ?? change;

  // old_data / new_data が未取得かどうか判定
  // undefined = 未取得（遅延読み込み対象）、null = DBに値なし（取得済み）
  const needsLazyLoad =
    change.old_data === undefined && change.new_data === undefined && !loadedChange;

  const handleLoadDetail = async () => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const token = await getAccessToken();
      const result = await cmGetDataChangeDetail(change.id, token);
      if (result.ok && result.data) {
        setLoadedChange(result.data);
      } else {
        setDetailError(result.error ?? "詳細の取得に失敗しました");
      }
    } catch {
      setDetailError("詳細の取得に失敗しました");
    } finally {
      setDetailLoading(false);
    }
  };

  const fields =
    displayChange.changed_fields ??
    (displayChange.new_data ? Object.keys(displayChange.new_data) : []);

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <CmOpBadge op={displayChange.operation} />
        <span className="text-xs font-mono font-semibold text-slate-700">
          {displayChange.table_name}
        </span>
      </div>

      {/* 遅延読み込みが必要な場合: 「詳細を表示」ボタン */}
      {needsLazyLoad && (
        <div className="px-3 py-3">
          {detailError && (
            <p className="text-xs text-rose-600 mb-2">{detailError}</p>
          )}
          <button
            onClick={handleLoadDetail}
            disabled={detailLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:border-slate-300 transition-colors disabled:opacity-50"
          >
            {detailLoading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                読み込み中…
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                詳細を表示
              </>
            )}
          </button>
        </div>
      )}

      {/* 読み込み済み: データ表示 */}
      {!needsLazyLoad && (
        <>
          {/* UPDATE: 差分テーブル */}
          {displayChange.operation === "UPDATE" && displayChange.old_data && displayChange.new_data && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    フィールド
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-rose-400">
                    変更前
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-emerald-500">
                    変更後
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {fields.map((field) => (
                  <tr key={field}>
                    <td className="px-3 py-2 font-mono text-slate-600">
                      {field}
                    </td>
                    <td className="px-3 py-2 text-rose-600 bg-rose-50 break-all">
                      {formatValue(displayChange.old_data?.[field])}
                    </td>
                    <td className="px-3 py-2 text-emerald-700 bg-emerald-50 break-all">
                      {formatValue(displayChange.new_data?.[field])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* INSERT: 新規データJSON */}
          {displayChange.operation === "INSERT" && displayChange.new_data && (
            <pre className="text-xs font-mono text-slate-600 p-3 bg-slate-50 whitespace-pre-wrap break-all">
              {JSON.stringify(displayChange.new_data, null, 2)}
            </pre>
          )}

          {/* DELETE: 削除データJSON */}
          {displayChange.operation === "DELETE" && displayChange.old_data && (
            <pre className="text-xs font-mono text-slate-600 p-3 bg-slate-50 whitespace-pre-wrap break-all">
              {JSON.stringify(displayChange.old_data, null, 2)}
            </pre>
          )}
        </>
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
// サブコンポーネント: セッションカード
// =============================================================

function CmSessionCard({ session }: { session: CmAuditSession }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const displayName = getDisplayName(session);

  const viewCount = session.events.filter(
    (e) => e.event_type === "page_view"
  ).length;
  const actionCount = session.events.filter(
    (e) => e.event_type === "operation"
  ).length;
  let dbCount = 0;
  for (const ev of session.events) {
    dbCount += ev.db_changes.length;
  }

  const firstTime = formatTime(session.first_timestamp);
  const lastTime = formatTime(session.last_timestamp);
  const dateLabel = formatDate(session.first_timestamp);

  const selectedEvent =
    selectedIdx !== null ? session.events[selectedIdx] ?? null : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* セッションヘッダー */}
      <div className="px-6 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CmAuditAvatar name={displayName} large />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">
                  {displayName}
                </span>
                <CmStatusDot active={session.is_active} />
                {session.is_active && (
                  <span className="text-xs text-emerald-600 font-medium">
                    操作中
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                {firstTime} 〜 {lastTime}
                {!session.is_active && (
                  <span className="ml-1 text-slate-300">（最終操作）</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1">
                <FileText size={13} className="text-slate-300" />
                <span className="font-semibold text-slate-600 tabular-nums">
                  {viewCount}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Pencil size={13} className="text-slate-300" />
                <span className="font-semibold text-slate-600 tabular-nums">
                  {actionCount}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Database size={13} className="text-slate-300" />
                <span className="font-semibold text-slate-600 tabular-nums">
                  {dbCount}
                </span>
              </span>
            </div>
            <span className="text-xs text-slate-300 tabular-nums">
              {dateLabel}
            </span>
          </div>
        </div>
      </div>

      {/* フローエリア */}
      <div className="px-6 py-5">
        {/* 横スクロール可能なフロー */}
        <div
          className="flex items-start overflow-x-auto pb-3"
          style={{
            gap: 0,
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 #f1f5f9",
          }}
        >
          {session.events.map((event, idx) => {
            const isLast =
              idx === session.events.length - 1 && !session.is_active;
            const isSelected = selectedIdx === idx;
            const handleClick = () =>
              setSelectedIdx(isSelected ? null : idx);

            return (
              <div key={`${event.timestamp}-${idx}`} className="flex items-center flex-shrink-0">
                {idx > 0 && <CmFlowArrow />}
                {event.event_type === "page_view" ? (
                  <CmViewNode
                    event={event}
                    active={isSelected}
                    isLast={isLast}
                    onClick={handleClick}
                  />
                ) : (
                  <CmActionNode
                    event={event}
                    active={isSelected}
                    isLast={isLast}
                    onClick={handleClick}
                  />
                )}
              </div>
            );
          })}

          {/* アクティブセッション: 操作中アニメーション */}
          {session.is_active && (
            <div className="flex items-center flex-shrink-0">
              <CmFlowArrow />
              <div className="flex flex-col items-center min-w-[80px]">
                <div className="px-4 py-5 rounded-xl border-2 border-dashed border-slate-200">
                  <div className="flex gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"
                      style={{ animationDelay: "0.3s" }}
                    />
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-slate-300 animate-pulse"
                      style={{ animationDelay: "0.6s" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 選択中ノードの詳細 */}
        {selectedEvent && selectedEvent.event_type === "page_view" && (
          <div className="mt-5 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
            <FileText size={14} className="text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-500">ページ閲覧</span>
            <span className="text-sm font-mono text-slate-700">
              {selectedEvent.action}
            </span>
            <span className="text-xs text-slate-400 ml-auto tabular-nums">
              {formatTime(selectedEvent.timestamp)}
            </span>
          </div>
        )}
        {selectedEvent &&
          selectedEvent.event_type === "operation" &&
          selectedEvent.db_changes.length > 0 && (
            <CmDbDetailPanel event={selectedEvent} />
          )}
        {selectedEvent &&
          selectedEvent.event_type === "operation" &&
          selectedEvent.db_changes.length === 0 && (
            <div className="mt-5 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
              <Pencil size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-xs text-slate-500">操作</span>
              <span className="text-sm font-medium text-slate-700">
                {formatActionLabel(selectedEvent.action)}
              </span>
              {selectedEvent.resource_id && (
                <span className="text-xs font-mono text-slate-400">
                  {selectedEvent.resource_id}
                </span>
              )}
              <span className="text-xs text-slate-400 ml-auto tabular-nums">
                {formatTime(selectedEvent.timestamp)}
              </span>
            </div>
          )}
      </div>
    </div>
  );
}

// =============================================================
// メインコンポーネント
// =============================================================

export function CmAuditFlowView({ sessions, loading }: Props) {
  const [sortKey, setSortKey] = useState<"lastTs" | "firstTs">("lastTs");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Activity className="w-5 h-5 animate-spin mr-2" />
        読み込み中…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText className="w-8 h-8 mb-2" />
        <p className="text-sm">該当するセッションがありません</p>
      </div>
    );
  }

  // ソート
  const sorted = [...sessions].sort((a, b) => {
    const tsA =
      sortKey === "firstTs"
        ? new Date(a.first_timestamp).getTime()
        : new Date(a.last_timestamp).getTime();
    const tsB =
      sortKey === "firstTs"
        ? new Date(b.first_timestamp).getTime()
        : new Date(b.last_timestamp).getTime();
    return tsB - tsA;
  });

  return (
    <div className="space-y-4">
      {/* ソート */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">ソート:</span>
        <select
          value={sortKey}
          onChange={(e) =>
            setSortKey(e.target.value as "lastTs" | "firstTs")
          }
          className="w-auto px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 cursor-pointer hover:border-slate-300 transition-colors"
        >
          <option value="lastTs">最終操作（新しい順）</option>
          <option value="firstTs">開始時刻（新しい順）</option>
        </select>
      </div>

      {/* セッションカード一覧 */}
      {sorted.map((session) => (
        <CmSessionCard key={session.session_key} session={session} />
      ))}
    </div>
  );
}