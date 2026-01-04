// src/components/AlertBar.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabaseClient";

// ✅ 追加
import {
  AlertRow,
  AlertStatus,
  fetchActiveAlerts,
  renderAlertMessage,
  updateAlertStatus,
  updateAlertComment,
} from "@/lib/alert_log/client";


type OrgRow = { orgunitid: string; orgunitname: string };

type SystemRole = "admin" | "manager" | "member";


export default function AlertBar() {
  // ==== ロール情報 ====
  const [systemRole, setSystemRole] = useState<SystemRole | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  // ==== アラート一覧など ====
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commentTarget, setCommentTarget] = useState<AlertRow | null>(null);
  const [commentText, setCommentText] = useState("");

  // 一覧の表示/非表示（畳む）制御
  const [collapsed, setCollapsed] = useState(false);

  const [orgMap, setOrgMap] = useState<Map<string, string>>(new Map());

  // ---------- ログインユーザーの system_role 取得 ----------
  useEffect(() => {
    const fetchRole = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const authUser = auth.user;
        if (!authUser) {
          setRoleLoaded(true);
          return;
        }

        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select("system_role")
          .eq("auth_user_id", authUser.id)
          .maybeSingle();

        if (userError) {
          console.error("[AlertBar] users/system_role fetch error", userError);
          setRoleLoaded(true);
          return;
        }

        const role = (userRow?.system_role ?? null) as SystemRole | null;
        setSystemRole(role);
      } finally {
        setRoleLoaded(true);
      }
    };

    void fetchRole();
  }, []);

  // ---------- orgs（担当org名）取得 ----------
  useEffect(() => {
    const run = async () => {
      // rows から assigned_org_id(uuid) を文字列で集める
      const ids = Array.from(
        new Set(
          rows
            .map((r) => (r.assigned_org_id ? String(r.assigned_org_id) : null))
            .filter((v): v is string => !!v),
        ),
      );

      if (ids.length === 0) {
        setOrgMap(new Map());
        return;
      }

      const { data, error } = await supabase
        .from("orgs")
        .select("orgunitid, orgunitname")
        .in("orgunitid", ids);

      if (error) {
        console.error("[AlertBar] orgs fetch error", error);
        return; // org名取れなくてもアラート自体は表示
      }

      const map = new Map<string, string>();
      for (const o of (data ?? []) as OrgRow[]) {
        map.set(o.orgunitid, o.orgunitname);
      }
      setOrgMap(map);
    };

    void run();
  }, [rows]);


  // ---------- アラート一覧取得 ----------
  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const active = await fetchActiveAlerts();
      setRows(active);
    } catch (e) {
      console.error("[AlertBar] fetchAlerts error", e);
      const msg =
        e instanceof Error ? e.message : "アラートの取得に失敗しました";
      setError(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // ロールが確定してから一覧取得
  useEffect(() => {
    if (!roleLoaded) return;
    if (!systemRole || systemRole === "member") return; // member / 未設定はそもそも見せない
    void fetchAlerts();
  }, [fetchAlerts, roleLoaded, systemRole]);

  // ---------- ステータス更新 ----------
  const updateStatus = async (id: string, status: AlertStatus) => {
    try {
      await updateAlertStatus(id, status);

      setRows((prev) =>
        prev
          .map((r) => (r.id === id ? { ...r, status } : r))
          .filter(
            (r) => r.status === "open" || r.status === "in_progress",
          ),
      );
    } catch (e) {
      console.error("[AlertBar] updateStatus error", e);
      alert(
        e instanceof Error
          ? `更新に失敗しました: ${e.message}`
          : "更新に失敗しました",
      );
    }
  };


  // ---------- コメント保存 ----------
  const saveComment = async () => {
    if (!commentTarget) return;
    try {
      await updateAlertComment(
        commentTarget.id,
        commentText || null,
      );

      setRows((prev) =>
        prev.map((r) =>
          r.id === commentTarget.id
            ? { ...r, result_comment: commentText || null }
            : r,
        ),
      );
      setCommentTarget(null);
      setCommentText("");
    } catch (e) {
      console.error("[AlertBar] saveComment error", e);
      alert(
        e instanceof Error
          ? `コメント保存に失敗しました: ${e.message}`
          : "コメント保存に失敗しました",
      );
    }
  };



  const openCount = useMemo(
    () =>
      rows.filter(
        (r) => r.status === "open" || r.status === "in_progress",
      ).length,
    [rows],
  );

  // ---------- 最後に表示制御（hooks の後に置く） ----------
  if (!roleLoaded) return null;
  if (!systemRole) return null;
  if (systemRole === "member") return null;

  // ---------- JSX ----------
  return (
    <div className="flex-1">
      {/* ヘッダ＋テーブル部分 */}
      <div className="w-full border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">
              優先対応が必要なもの（放置したら不備計上）
            </span>
            <span className="text-sm rounded-full px-2 py-0.5 border">
              未処理 {openCount} 件
            </span>
            <div className="text-xs text-red-600 font-semibold ml-2">
              ※ 2日ごとに 放置Lv +1。Lv5 到達で不備率に計上されます。
            </div>
            {loading && (
              <span className="text-xs text-gray-400">読込中...</span>
            )}
            {error && (
              <span className="text-xs text-red-500">{error}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* 今はダミー：押したら「未実装」だけ出す */}
            <button
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
              onClick={() => alert("メッセージ追加は、まだ実装されていません。")}
            >
              メッセージ追加
            </button>
            <button
              className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? "一覧を表示▼" : "一覧を畳む▲"}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="mx-auto max-w-6xl px-4 pb-3">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 pr-4">放置Lv</th>
                    <th className="py-2 pr-4">担当org</th>
                    <th className="py-2 pr-4">メッセージ</th>
                    <th className="py-2 pr-4">ステータス</th>
                    <th className="py-2 pr-4">結果コメント</th>
                    <th className="py-2 pr-4 w-32">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-4 text-center text-gray-500"
                      >
                        表示するアラートはありません
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="py-1.5 pr-4">
                          {(() => {
                            const lv = row.severity;

                            let bg = "";
                            let text = "text-gray-800";
                            let border = "border-gray-300";

                            if (lv === 1) {
                              bg = "bg-gray-100";
                            } else if (lv === 2) {
                              bg = "bg-yellow-100";
                              border = "border-yellow-300";
                              text = "text-yellow-800";
                            } else if (lv === 3) {
                              bg = "bg-orange-200";
                              border = "border-orange-400";
                              text =
                                "text-orange-900 font-semibold";
                            } else if (lv === 4) {
                              bg = "bg-red-200";
                              border = "border-red-400";
                              text = "text-red-900 font-bold";
                            } else if (lv >= 5) {
                              bg =
                                "bg-red-600 text-white border-red-700 font-bold";
                            }

                            return (
                              <span
                                className={`inline-flex items-center rounded px-2 py-0.5 text-xs border ${bg} ${text} ${border}`}
                              >
                                Lv.{lv}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 pr-4">
                          {row.assigned_org_id ? (
                            <div className="text-xs leading-tight">
                              <div className="font-medium">
                                {orgMap.get(String(row.assigned_org_id)) ?? "（org未設定）"}
                              </div>
                              <div className="text-gray-400">
                                {String(row.assigned_org_id)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">（未設定）</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 whitespace-pre-wrap">
                          {renderAlertMessage(row.message)}
                        </td>
                        <td className="py-1.5 pr-4">
                          {row.status === "open" && "未対応"}
                          {row.status === "in_progress" && "対応中"}
                          {row.status === "done" && "完了"}
                          {row.status === "muted" && "ミュート"}
                          {row.status === "cancelled" && "取消"}
                        </td>
                        <td className="py-1.5 pr-4">
                          {row.result_comment ? (
                            <div className="text-xs whitespace-pre-wrap">
                              {row.result_comment}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">
                              （未入力）
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4">
                          <div className="flex flex-col gap-1">
                            <button
                              className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50"
                              onClick={() => {
                                setCommentTarget(row);
                                setCommentText(
                                  row.result_comment ?? "",
                                );
                              }}
                            >
                              コメント
                            </button>
                            {row.status !== "done" && (
                              <button
                                className="text-xs px-2 py-0.5 border rounded hover:bg-gray-50"
                                onClick={() =>
                                  void updateStatus(row.id, "done")
                                }
                              >
                                完了にする
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* コメント編集モーダル */}
      {commentTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 w-full max-w-md shadow-lg">
            <div className="font-semibold mb-2 text-sm">
              結果コメント編集
            </div>
            <div className="text-xs mb-2 text-gray-500">
              {commentTarget.message}
            </div>
            <textarea
              className="w-full border rounded p-2 text-sm min-h-[120px]"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setCommentTarget(null)}
                className="px-3 py-1.5 border rounded text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={() => void saveComment()}
                className="px-3 py-1.5 border rounded bg-gray-50 text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
