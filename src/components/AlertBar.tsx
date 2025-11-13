//components/AlertBar

'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabaseAdmin } from '@/lib/supabase/service';
import { useRoleContext } from '@/context/RoleContext';

type AlertStatus = 'open' | 'in_progress' | 'done' | 'muted' | 'cancelled';

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

const STATUS_LABEL: Record<AlertStatus, string> = {
    open: '未対応',
    in_progress: '対応中',
    done: '完了',
    muted: 'ミュート',
    cancelled: '取消',
};

const SEVERITY_BADGE: Record<number, string> = {
    1: 'Low',
    2: 'Normal',
    3: 'High',
};

export default function AlertBar() {
    const { role } = useRoleContext(); // 'admin' | 'manager' | 'staff' など
    const [rows, setRows] = useState<AlertRow[]>([]);
    const [loading, setLoading] = useState(true);

    // ポップアップ用状態
    const [commentTarget, setCommentTarget] = useState<AlertRow | null>(null);
    const [commentText, setCommentText] = useState('');

    const canEditAll = role === 'admin' || role === 'manager';

    const fetchAlerts = async () => {
        setLoading(true);
        // RLSでroleフィルタされる前提（アプリ側フィルタも保険で実施）
        const { data, error } = await supabaseAdmin
            .from('alert_log')
            .select('*')
            .order('severity', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error(error);
            setLoading(false);
            return;
        }
        // components/AlertBar.tsx 内 fetchAlerts の末尾フィルタだけ差し替え
        const myRole = (role && typeof role === 'string' && role.trim() !== '') ? role : 'staff';

        // 可視ロール未設定(=null/[])は可、設定されていれば myRole を含むものだけ
        const filtered = (data as AlertRow[])
            .filter((r) => !Array.isArray(r.visible_roles) || r.visible_roles.length === 0 || r.visible_roles.includes(myRole))
            .filter((r) => r.status !== 'done');
        setRows(filtered);
        setLoading(false);
    };

    useEffect(() => {
        fetchAlerts();
        // Realtime購読（任意）
        const ch = supabaseAdmin
            .channel('alert_log_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_log' }, fetchAlerts)
            .subscribe();
        return () => { supabaseAdmin.removeChannel(ch); };
    }, [role]);

    const openCount = useMemo(
        () => rows.filter((r) => r.status === 'open' || r.status === 'in_progress').length,
        [rows]
    );

    const createAlert = async () => {
        const message = prompt('メッセージを入力');
        if (!message) return;

        const { data: userData } = await supabaseAdmin.auth.getUser();
        const visible_roles = role === 'admin' ? ['admin', 'manager', 'staff'] :
            role === 'manager' ? ['manager', 'staff'] :
                ['staff'];

        const { error } = await supabaseAdmin.from('alert_log').insert({
            message,
            visible_roles,
            severity: 2,
            created_by: userData?.user?.id ?? null,
            status: 'open',
        });
        if (error) alert(error.message);
    };

    const updateStatus = async (row: AlertRow, next: AlertStatus) => {
        const { error } = await supabaseAdmin
            .from('alert_log')
            .update({
                status: next,
                status_source: canEditAll ? 'manual' : row.status_source,
                completed_by: next === 'done' ? row.user_id ?? null : row.completed_by,
            })
            .eq('id', row.id);
        if (error) alert(error.message);
    };

    const openComment = (row: AlertRow) => {
        setCommentTarget(row);
        setCommentText(row.result_comment ?? '');
    };

    const saveComment = async () => {
        if (!commentTarget) return;
        const { data: auth } = await supabaseAdmin.auth.getUser();
        const { error } = await supabaseAdmin
            .from('alert_log')
            .update({
                result_comment: commentText,
                result_comment_by: auth?.user?.id ?? null,
                result_comment_at: new Date().toISOString(),
            })
            .eq('id', commentTarget.id);
        if (error) alert(error.message);
        setCommentTarget(null);
    };

    if (openCount === 0) {
        return null; // 0件ならコンポーネントごと非表示
    }

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
                        <button
                            onClick={createAlert}
                            className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
                        >
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
                                <tr><td colSpan={7} className="py-4 text-center">Loading...</td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={7} className="py-4 text-center">表示するアラートはありません</td></tr>
                            )}
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t">
                                    <td className="py-2 pr-4">
                                        <span className="text-xs rounded px-2 py-1 border">
                                            {SEVERITY_BADGE[r.severity] ?? r.severity}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-4">
                                        <div className="whitespace-pre-wrap">{r.message}</div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {new Date(r.created_at).toLocaleString()}
                                            {r.status_source === 'system' && <span className="ml-2">（System）</span>}
                                        </div>
                                    </td>
                                    <td className="py-2 pr-4">{r.visible_roles?.join(', ')}</td>
                                    <td className="py-2 pr-4">
                                        <select
                                            className="border rounded px-2 py-1 text-sm"
                                            value={r.status}
                                            onChange={(e) => updateStatus(r, e.target.value as AlertStatus)}
                                            disabled={!canEditAll && r.status === 'done'}
                                        >
                                            {Object.keys(STATUS_LABEL).map((k) => (
                                                <option key={k} value={k}>{STATUS_LABEL[k as AlertStatus]}</option>
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
                                        <div className="text-xs whitespace-pre-wrap">
                                            {r.result_comment ?? '—'}
                                        </div>
                                    </td>
                                    <td className="py-2 pr-4">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => openComment(r)}
                                                className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                                            >
                                                コメント
                                            </button>
                                            {canEditAll && (
                                                <button
                                                    onClick={() => updateStatus(r, 'done')}
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
                        <div className="text-xs text-gray-500 mb-3">ID: {commentTarget.id}</div>
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
