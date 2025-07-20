// ...（省略可能なimport）
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabaseClient';
import { useUserRole } from '@/context/RoleContext';

// 型定義
interface RpaRequestView {
  id: string;
  requester_name: string | null;
  approver_name: string | null;
  kind_name: string | null;
  template_name: string | null;
  status: string | null;
  request_details: object | null;
  result_details: object | null;
  result_summary: string | null;
  created_at: string;
  template_id?: string;
  requester_id?: string;
  approver_id?: string;
}

interface TemplateOption {
  id: string;
  name: string;
}

interface UserOption {
  user_id: string;
  last_name_kanji: string;
  first_name_kanji: string;
}

interface StatusOption {
  value: string;
  label: string;
}

export default function RpaRequestListPage() {
  const [requests, setRequests] = useState<RpaRequestView[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState<Partial<RpaRequestView>>({});
  const role = useUserRole();

  useEffect(() => {
    fetchTemplates();
    fetchUsers();
    fetchStatuses();
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    const { data } = await supabase.from('rpa_command_requests_view').select('*').order('created_at', { ascending: false });
    setRequests(data || []);
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase.from('rpa_command_templates').select('id, name');
    setTemplates(data || []);
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('user_entry_united_view').select('user_id, last_name_kanji, first_name_kanji');
    setUsers(data || []);
  };

  const fetchStatuses = async () => {
    const { data } = await supabase.from('rpa_command_request_status').select('id, label');
    const mapped = (data || []).map((s: any) => ({ value: s.id, label: s.label }));
    setStatuses(mapped);
  };

  const handleAdd = async () => {
    const { error } = await supabase.from('rpa_command_requests').insert([newEntry]);
    if (!error) {
      setNewEntry({});
      fetchRequests();
    } else {
      alert('追加失敗');
    }
  };

  const handleUpdate = async (id: string, update: Partial<RpaRequestView>) => {
    const { error } = await supabase.from('rpa_command_requests').update(update).eq('id', id);
    if (!error) fetchRequests();
    else alert('更新失敗');
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rpa_command_requests').delete().eq('id', id);
    if (!error) fetchRequests();
    else alert('削除失敗');
  };

  if (!['admin', 'manager'].includes(role)) return <div>閲覧権限がありません</div>;

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">RPAリクエスト一覧</h1>

      {/* 新規追加 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        <select value={newEntry.requester_id || ''} onChange={e => setNewEntry({ ...newEntry, requester_id: e.target.value })}>
          <option value=''>申請者を選択</option>
          {users.map(u => (
            <option key={u.user_id} value={u.user_id}>{u.last_name_kanji}{u.first_name_kanji}</option>
          ))}
        </select>
        <select value={newEntry.approver_id || ''} onChange={e => setNewEntry({ ...newEntry, approver_id: e.target.value })}>
          <option value=''>承認者を選択</option>
          {users.map(u => (
            <option key={u.user_id} value={u.user_id}>{u.last_name_kanji}{u.first_name_kanji}</option>
          ))}
        </select>
        <select value={newEntry.template_id || ''} onChange={e => setNewEntry({ ...newEntry, template_id: e.target.value })}>
          <option value=''>テンプレート選択</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <select value={newEntry.status || ''} onChange={e => setNewEntry({ ...newEntry, status: e.target.value })}>
          <option value=''>ステータス選択</option>
          {statuses.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <Input placeholder='実行結果' value={newEntry.result_summary || ''} onChange={e => setNewEntry({ ...newEntry, result_summary: e.target.value })} />
        <Textarea placeholder='リクエスト詳細（JSON）' value={JSON.stringify(newEntry.request_details || {}, null, 2)} onChange={e => { try { setNewEntry({ ...newEntry, request_details: JSON.parse(e.target.value) }) } catch {} }} />
        <Textarea placeholder='結果詳細（JSON）' value={JSON.stringify(newEntry.result_details || {}, null, 2)} onChange={e => { try { setNewEntry({ ...newEntry, result_details: JSON.parse(e.target.value) }) } catch {} }} />
        <div className="col-span-full"><Button onClick={handleAdd}>追加</Button></div>
      </div>

      {/* 一覧と行内編集 */}
      <table className="table-auto w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th>申請者</th><th>承認者</th><th>種別</th><th>テンプレート</th>
            <th>ステータス</th><th>リクエスト詳細</th><th>結果詳細</th>
            <th>実行結果</th><th>登録日</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.id}>
              <td>
                <select value={r.requester_id || ''} onChange={e => handleUpdate(r.id, { requester_id: e.target.value })}>
                  {users.map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.last_name_kanji}{u.first_name_kanji}</option>
                  ))}
                </select>
              </td>
              <td>
                <select value={r.approver_id || ''} onChange={e => handleUpdate(r.id, { approver_id: e.target.value })}>
                  {users.map(u => (
                    <option key={u.user_id} value={u.user_id}>{u.last_name_kanji}{u.first_name_kanji}</option>
                  ))}
                </select>
              </td>
              <td>{r.kind_name}</td>
              <td>
                <select value={r.template_id || ''} onChange={e => handleUpdate(r.id, { template_id: e.target.value })}>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </td>
              <td>
                <select value={r.status || ''} onChange={e => handleUpdate(r.id, { status: e.target.value })}>
                  {statuses.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </td>
              <td>
                <Textarea rows={3} value={JSON.stringify(r.request_details || {}, null, 2)} onChange={e => { try { handleUpdate(r.id, { request_details: JSON.parse(e.target.value) }) } catch {} }} />
              </td>
              <td>
                <Textarea rows={3} value={JSON.stringify(r.result_details || {}, null, 2)} onChange={e => { try { handleUpdate(r.id, { result_details: JSON.parse(e.target.value) }) } catch {} }} />
              </td>
              <td>
                <Input value={r.result_summary || ''} onChange={e => handleUpdate(r.id, { result_summary: e.target.value })} />
              </td>
              <td>{new Date(r.created_at).toLocaleString('ja-JP')}</td>
              <td><Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>削除</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
