// components/AlertBar.tsx
// src/components/AlertBar.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AlertStatus = "open" | "in_progress" | "done" | "muted" | "cancelled";

type AlertRow = {
    id: string;
    message: string;
    visible_roles: string[];
    status: AlertStatus;
    status_source: string;
    severity: number;
    result_comment: string | null;
    result_comment_by: string | null;
    result_comment_at: string | null;
    kaipoke_cs_id: string | null;
    user_id: string | null;
    shift_id: string | null;
    rpa_request_id: string | null;
    created_by: string | null;
    assigned_to: string | null;
    completed_by: string | null;
    created_at: string;
    updated_at: string;
};

type ListResponse = {
    ok: boolean;
    rows?: AlertRow[];
    error?: string;
};

type PatchBody = {
    status?: AlertStatus;
    status_source?: string;
    assigned_to?: string | null;
    result_comment?: string | null;
};

type SystemRole = "admin" | "manager" | "member";

export default function AlertBar() {
    const [systemRole, setSystemRole] = useState<SystemRole | null>(null);
    const [roleLoaded, setRoleLoaded] = useState(false);

    const [rows, setRows] = useState<AlertRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [commentTarget, setCommentTarget] = useState<AlertRow | null>(null);
    const [commentText, setCommentText] = useState("");

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

    // member または ロール未取得中 → 表示制御
    if (!roleLoaded) {
        // ロールロード中は何も出さない（チラつき防止）
        return null;
    }
    if (!systemRole) {
        // ロール取れない人には表示しない
        return null;
    }
    if (systemRole === "member") {
        // メンバーにはアラートバーを非表示
        return null;
    }

    // admin / manager はどちらも「managerロール」として閲覧させる
    const viewRole = "manager";

    // ---------- アラート一覧取得 ----------
    const fetchAlerts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/alert_log?role=${viewRole}`);
            const json = (await res.json()) as ListResponse;

            if (!res.ok || !json.ok) {
                const msg =
                    json.error ?? `HTTP ${res.status} ${res.statusText}`;
                throw new Error(msg);
            }

            // open / in_progress のみ表示
            const active = (json.rows ?? []).filter(
                (r) => r.status === "open" || r.status === "in_progress"
            );
            setRows(active);
        } catch (e) {
            console.error("[AlertBar] fetchAlerts error", e);
            const msg =
                e instanceof Error ? e.message : "アラートの取得に失敗しました";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [viewRole]);

    useEffect(() => {
        void fetchAlerts();
    }, [fetchAlerts]);

    // ---------- ステータス更新 ----------
    const updateStatus = async (id: string, status: AlertStatus) => {
        try {
            const body: PatchBody = {
                status,
                status_source: "manual",
            };

            const res = await fetch(`/api/alert_log/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const json = (await res.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(json?.error ?? `HTTP ${res.status}`);
            }

            // ローカルも更新
            setRows((prev) =>
                prev
                    .map((r) => (r.id === id ? { ...r, status } : r))
                    .filter(
                        (r) => r.status === "open" || r.status === "in_progress"
                    )
            );
        } catch (e) {
            console.error("[AlertBar] updateStatus error", e);
            alert(
                e instanceof Error
                    ? `更新に失敗しました: ${e.message}`
                    : "更新に失敗しました"
            );
        }
    };

    // ---------- コメント保存 ----------
    const saveComment = async () => {
        if (!commentTarget) return;
        try {
            const body: PatchBody = {
                result_comment: commentText || null,
            };

            const res = await fetch(`/api/alert_log/${commentTarget.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const json = (await res.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(json?.error ?? `HTTP ${res.status}`);
            }

            setRows((prev) =>
                prev.map((r) =>
                    r.id === commentTarget.id
                        ? { ...r, result_comment: commentText || null }
                        : r
                )
            );
            setCommentTarget(null);
            setCommentText("");
        } catch (e) {
            console.error("[AlertBar] saveComment error", e);
            alert(
                e instanceof Error
                    ? `コメント保存に失敗しました: ${e.message}`
                    : "コメント保存に失敗しました"
            );
        }
    };

    const openCount = useMemo(
        () =>
            rows.filter(
                (r) => r.status === "open" || r.status === "in_progress"
            ).length,
        [rows]
    );

    return (
        <div className="flex-1">
            {/* ヘッダ＋テーブル部分 */}
            <div className="w-full border-b border-gray-200 bg-white">
                <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold">アラート</span>
                        <span className="text-sm rounded-full px-2 py-0.5 border">
                            未処理 {openCount} 件
                        </span>
                        {loading && (
                            <span className="text-xs text-gray-400">読込中...</span>
                        )}
                        {error && (
                            <span className="text-xs text-red-500">
                                {error}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* いまはダミー。将来: 手動登録モーダル */}
                        <button className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50">
                            メッセージ追加
                        </button>
                    </div>
                </div>

                <div className="mx-auto max-w-6xl px-4 pb-3">
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
                                {rows.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={7}
                                            className="py-4 text-center text-gray-500"
                                        >
                                            表示するアラートはありません
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row) => (
                                        <tr key={row.id} className="border-t">
                                            <td className="py-1.5 pr-4">
                                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs border">
                                                    Lv.{row.severity}
                                                </span>
                                            </td>
                                            <td className="py-1.5 pr-4 whitespace-pre-wrap">
                                                {row.message}
                                            </td>
                                            <td className="py-1.5 pr-4">
                                                {row.visible_roles.join(", ")}
                                            </td>
                                            <td className="py-1.5 pr-4">
                                                {row.status === "open" && "未対応"}
                                                {row.status === "in_progress" && "対応中"}
                                                {row.status === "done" && "完了"}
                                                {row.status === "muted" && "ミュート"}
                                                {row.status === "cancelled" && "取消"}
                                            </td>
                                            <td className="py-1.5 pr-4 text-xs text-gray-500">
                                                {row.kaipoke_cs_id && (
                                                    <div>CS: {row.kaipoke_cs_id}</div>
                                                )}
                                                {row.shift_id && (
                                                    <div>Shift: {row.shift_id}</div>
                                                )}
                                                {row.rpa_request_id && (
                                                    <div>RPA: {row.rpa_request_id}</div>
                                                )}
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
                                                                row.result_comment ?? ""
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
            </div>

            {/* コメント編集用の簡易モーダル（オーバーレイ） */}
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
