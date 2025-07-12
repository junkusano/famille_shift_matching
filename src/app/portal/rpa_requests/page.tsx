'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext'

type RpaRequestView = {
  id: string;
  requester_id: string;
  requester_name: string | null;
  approver_name: string | null;
  kind_name: string | null;
  status_label: string | null;
  request_details: object | null;
  result_details: object | null;
  result_summary: string | null;
  created_at: string;
};

export default function RpaRequestListPage() {
  const [requests, setRequests] = useState<RpaRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const role = useUserRole();

  useEffect(() => {
    const fetchData = async () => {
      const { data, error } = await supabase
        .from('rpa_command_requests_view')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('データ取得エラー:', error.message);
        setRequests([]);
      } else {
        setRequests(data as RpaRequestView[]);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">RPAリクエスト一覧</h1>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <table className="table-auto w-full border border-gray-300 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-1 border">申請者</th>
              <th className="px-2 py-1 border">承認者</th>
              <th className="px-2 py-1 border">種別</th>
              <th className="px-2 py-1 border">ステータス</th>
              <th className="px-2 py-1 border">概要</th>
              <th className="px-2 py-1 border">登録日</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id}>
                <td className="border px-2 py-1">{r.requester_name ?? '-'}</td>
                <td className="border px-2 py-1">{r.approver_name ?? '-'}</td>
                <td className="border px-2 py-1">{r.kind_name ?? '-'}</td>
                <td className="border px-2 py-1">{r.status_label ?? '-'}</td>
                <td className="border px-2 py-1">{r.result_summary ?? '-'}</td>
                <td className="border px-2 py-1">
                  {new Date(r.created_at).toLocaleString('ja-JP')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
