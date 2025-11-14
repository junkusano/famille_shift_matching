// components/AlertBar.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRoleContext } from '@/context/RoleContext';
import { supabase } from '@/lib/supabaseClient'; // auth用（auth_user_id を取るだけ）

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
const SEVERITY_BADGE: Record<number, string> = { 1: 'Low', 2: 'Normal', 3: 'High' };

export default function AlertBar() {
  const { role } = useRoleContext(); // 'admin' | 'manager' | 'staff'
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ポップアップ
  const [commentTarget, setCommentTarget] = useState<AlertRow | null>(null);
  const [commentText, setCommentText] = useState('');

  const canEditAll = role === 'admin' || role === 'manager';
  const myRole = (role && typeof role === 'string' && role.trim() !== '') ? role : 'staff';

  const fetchAlerts = async () => {
    setLoading(true);
    const res = await fetch(`/api/alert_log?role=${encodeURIComponent(myRole)}&includeDone=false`, { cache: 'no-store' });
    if (!res.ok) {
      console.error('[alert_log GET]', await res.text());
      setRows([]);
      setLoading(false);
      return;
    }
    const data = (await res.json()) as AlertRow[];
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAlerts();
  }, [myRole]);

  const openCount = useMemo(
    () => rows.filter((r) => r.status === 'open' || r.status === 'in_progress').length,
    [rows]
  );

  const createAlert = async () => {
    const message = prompt('メッセージを入力');
    if (!message) return;

    const { data: auth } = await supabase.auth.getUser();
    const visible_roles =
      myRole === 'admin' ? ['admin', 'manager', 'staff'] :
      myRole === 'manager' ? ['manager', 'staff'] : ['staff'];

    const res = await fetch('/api/alert_log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        severity: 2,
        visible_roles,
        auth_user_id: auth?.user?.id ?? null,
        status: 'open',
        status_source: 'manual',
      }),
    });
    if (!res.ok) alert(await res.text());
    await fetchAlerts();
  };

  const updateStatus = async (row: AlertRow, next: AlertStatus) => {
    const { data: auth } = await supabase.auth.getUser();
    const res = await fetch(`/api/alert_log/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: next,
        status_source: canEditAll ? 'manual' : row.status_source,
        auth_user_id: auth?.user?.id ?? null,
      }),
    });
    if (!res.ok) alert(await res.text());
    await fetchAlerts();
  };

  const openComment = (row: AlertRow) => {
    setCommentTarget(row);
    setCommentText(row.result_comment ?? '');
  };

  const saveComment = async () => {
    if (!commentTarget) return;
    const { data: auth } = await supabase.auth.getUser();
    const res = await fetch(`/api/alert_log/${commentTarget.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result_comment: commentText,
        auth_user_id: auth?.user?.id ?? null,
      }),
    });
    if (!res.ok) alert(await res.text());
    setCommentTarget(null);
    await fetchAlerts();
  };

  if (openCount === 0) return null;

  return (
    <div className="w-full border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">アラート</span>
          <span className="text-sm rounded-full px-2 py-0.5 border alert-count-red">未処理 {openCount} 件</span>
        </div>
        {(myRole === 'admin' || myRole === 'manager') && (
          <div className="flex items-center gap-2">
            <button onClick={createAlert} className="text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50">
              メッセージ追加
            </button>
          </div>
        )}
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
              {loading && <tr><td colSpan={7} className="py-4 text-center">Loading...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="py-4 text-center">表示するアラートはありません</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-4"><span className="text-xs rounded px-2 py-1 border">{SEVERITY_BADGE[r.severity] ?? r.severity}</span></td>
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
                  <td className="py-2 pr-4"><div className="text-xs whitespace-pre-wrap">{r.result_comment ?? '—'}</div></td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-2">
                      <button onClick={() => openComment(r)} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">コメント</button>
                      {canEditAll && (
                        <button onClick={() => updateStatus(r, 'done')} className="px-2 py-1 border rounded text-xs hover:bg-gray-50">完了</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
              <button onClick={() => setCommentTarget(null)} className="px-3 py-1.5 border rounded">キャンセル</button>
              <button onClick={saveComment} className="px-3 py-1.5 border rounded bg-gray-50">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
