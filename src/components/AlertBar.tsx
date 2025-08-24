"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRoleContext } from "@/context/RoleContext";

// ==== Types ================================================================
export type AlertStatus = "open" | "done" | "muted";
export type AlertSeverity = "info" | "warning" | "error";

export interface AlertRow {
  id: string | number;
  created_at: string;
  message: string;
  status: AlertStatus;
  status_source?: string | null;
  severity: AlertSeverity | string; // サーバ側が拡張しても壊れないように
  visible_roles?: string[] | null;
  result_comment?: string | null;
  // 関連ID（存在しない場合もある）
  user_id?: string | null;
  shift_id?: string | null;
  rpa_request_id?: string | null;
  kaipoke_cs_id?: string | null;
}

// 表示ラベル
const STATUS_LABEL: Record<AlertStatus, string> = {
  open: "未処理",
  done: "完了",
  muted: "ミュート",
};

const SEVERITY_BADGE: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

// ==== Component ============================================================
export default function AlertBar() {
  // 役割
  const { role } = useRoleContext();

  // 画面状態
  const [loading, setLoading] = useState<boolean>(false);
  const [allRows, setAllRows] = useState<AlertRow[]>([]);

  // コメント編集用の状態（フックはトップで宣言）
  const [commentTarget, setCommentTarget] = useState<AlertRow | null>(null);
  const [commentText, setCommentText] = useState<string>("");

  // 権限
  const canEditAll = useMemo(() => role === "admin" || role === "manager", [role]);

  // ロールに応じた可視レコード
  const rows = useMemo(() => {
    const currentRole = role ?? "";
    const filtered = allRows.filter((r) => {
      // visible_roles が無い/空 → 全員
      const vr = r.visible_roles ?? [];
      if (vr.length === 0) return true;
      return vr.includes(currentRole);
    });

    // created_at 降順
    return filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [allRows, role]);

  // 未処理件数
  const openCount = useMemo(() => rows.filter((r) => r.status === "open").length, [rows]);

  // データ取得
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("alert_log")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      // 型合わせ
      setAllRows(data as unknown as AlertRow[]);
    } else if (error) {
      console.error("[AlertBar] fetch error:", error.message);
    }
    setLoading(false);
  }, []);

  // 初期ロード
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Realtime 購読（INSERT / UPDATE / DELETE）
  useEffect(() => {
    const channel = supabase
      .channel("alert_log_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_log" },
        (payload) => {
          const row = payload.new as AlertRow;
          setAllRows((prev) => {
            // 重複防止
            if (prev.some((r) => String(r.id) === String(row.id))) return prev;
            return [row, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "alert_log" },
        (payload) => {
          const row = payload.new as AlertRow;
          setAllRows((prev) => prev.map((r) => (String(r.id) === String(row.id) ? row : r)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "alert_log" },
        (payload) => {
          const row = payload.old as AlertRow;
          setAllRows((prev) => prev.filter((r) => String(r.id) !== String(row.id)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // UI アクション群 -------------------------------------------------------
  const createAlert = useCallback(async () => {
    if (!canEditAll) return;
    const msg = window.prompt("メッセージを入力");
    if (!msg) return;

    const sev = (window.prompt("severity (info|warning|error)", "info") || "info") as AlertSeverity;

    const { error } = await supabase.from("alert_log").insert({
      message: msg,
      severity: sev,
      status: "open",
      visible_roles: ["admin", "manager"],
      status_source: "system",
    });
    if (error) alert("作成に失敗: " + error.message);
  }, [canEditAll]);

  const updateStatus = useCallback(
    async (row: AlertRow, next: AlertStatus) => {
      const { error } = await supabase
        .from("alert_log")
        .update({ status: next })
        .eq("id", row.id);
      if (error) alert("更新に失敗: " + error.message);
    },
    []
  );

  const openComment = useCallback((row: AlertRow) => {
    setCommentTarget(row);
    setCommentText(row.result_comment ?? "");
  }, []);

  const saveComment = useCallback(async () => {
    if (!commentTarget) return;
    const { error } = await supabase
      .from("alert_log")
      .update({ result_comment: commentText })
      .eq("id", commentTarget.id);
    if (error) {
      alert("保存に失敗: " + error.message);
      return;
    }
    setCommentTarget(null);
    setCommentText("");
  }, [commentTarget, commentText]);

  // ==== Render =============================================================
  return (
    <div className="w-full border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">アラート</span>
          <span className="text-sm rounded-full px-2 py-0.5 border alert-count-red">
            未処理 {openCount} 件
          </span>
        </div>

        {canEditAll && (
          <div className="flex items-center gap-2">
            <button onClick={createAlert} className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50">
              メッセージ追加
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-3">
        {/* テーブル */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 pr-4">Severity</th>
                <th className="py-2 pr-4">メッセージ</th>
                <th className="py-2 pr-4">対象Role</th>
                <th className="py-2 pr-4">ステータス</th>
                <th className="py-2 pr-4">関連ID</th>
                <th className="py-2 pr-4">結果コメント</th>
                <th className="py-2 pr-4 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="py-4 text-center">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center">
                    表示するアラートはありません
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-t">
                  <td className="py-2 pr-4">
                    <span className="text-xs rounded px-2 py-1 border">
                      {SEVERITY_BADGE[r.severity] ?? String(r.severity)}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="whitespace-pre-wrap">{r.message}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(r.created_at).toLocaleString()}
                      {r.status_source === "system" && <span className="ml-2">（System）</span>}
                    </div>
                  </td>
                  <td className="py-2 pr-4">{(r.visible_roles ?? []).join(", ")}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={r.status}
                      onChange={(e) => updateStatus(r, e.target.value as AlertStatus)}
                      disabled={!canEditAll && r.status === "done"}
                    >
                      {Object.keys(STATUS_LABEL).map((k) => (
                        <option key={k} value={k}>
                          {STATUS_LABEL[k as AlertStatus]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="text-xs text-gray-600 space-y-0.5">
                      {r.kaipoke_cs_id && <div>利用者: {r.kaipoke_cs_id}</div>}
                      {r.user_id && <div>user_id: {r.user_id}</div>}
                      {r.shift_id && <div>shift: {r.shift_id}</div>}
                      {r.rpa_request_id && <div>rpa: {r.rpa_request_id}</div>}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="text-xs whitespace-pre-wrap">{r.result_comment ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button onClick={() => openComment(r)} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">
                        コメント
                      </button>
                      {canEditAll && (
                        <button
                          onClick={() => updateStatus(r, "done")}
                          className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                        >
                          完了
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ポップアップ（結果コメント反映） */}
      {commentTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-4 w-full max-w-xl">
            <div className="font-semibold mb-2">結果コメント</div>
            <div className="text-xs text-gray-500 mb-3">ID: {String(commentTarget.id)}</div>
            <textarea
              className="w-full border rounded p-2 min-h-32"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="対応結果や経過を記入"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setCommentTarget(null)} className="px-3 py-1.5 border rounded">
                キャンセル
              </button>
              <button onClick={saveComment} className="px-3 py-1.5 border rounded bg-gray-50">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
