'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabaseClient'
import { useUserRole } from '@/context/RoleContext'

// 型定義
type RpaRequestView = {
  id: string
  requester_name: string | null
  approver_name: string | null
  kind_name: string | null
  template_name: string | null
  status: string | null
  request_details: object | null
  result_details: object | null
  result_summary: string | null
  created_at: string
  template_id?: string
  requester_id?: string
  approver_id?: string
}

type TemplateOption = {
  id: string
  name: string
}

export default function RpaRequestListPage() {
  const [requests, setRequests] = useState<RpaRequestView[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [newEntry, setNewEntry] = useState<Partial<RpaRequestView>>({
    requester_id: '',
    approver_id: '',
    status: '',
    result_summary: '',
    request_details: {},
    result_details: {},
    template_id: '',
  })
  const role = useUserRole()

  const fetchRequests = async () => {
    const { data, error } = await supabase
      .from('rpa_command_requests_view')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setRequests(data as RpaRequestView[])
    setLoading(false)
  }

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('rpa_command_templates')
      .select('id, name')
      .order('name')

    if (!error) setTemplates(data as TemplateOption[])
  }

  useEffect(() => {
    fetchTemplates()
    fetchRequests()
  }, [])

  const handleAdd = async () => {
    try {
      const { error } = await supabase.from('rpa_command_requests').insert([
        {
          requester_id: newEntry.requester_id,
          approver_id: newEntry.approver_id,
          template_id: newEntry.template_id,
          status: newEntry.status,
          request_details: newEntry.request_details,
          result_details: newEntry.result_details,
          result_summary: newEntry.result_summary,
        },
      ])
      if (error) throw error
      setNewEntry({
        requester_id: '',
        approver_id: '',
        status: '',
        result_summary: '',
        request_details: {},
        result_details: {},
        template_id: '',
      })
      fetchRequests()
    } catch (err) {
      alert('追加に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('rpa_command_requests').delete().eq('id', id)
    if (!error) fetchRequests()
    else alert('削除に失敗しました')
  }

  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold">RPAリクエスト一覧（実テーブル対応）</h1>

      {/* 追加フォーム */}
      <div className="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Input placeholder="申請者ID" value={newEntry.requester_id || ''} onChange={e => setNewEntry({ ...newEntry, requester_id: e.target.value })} />
        <Input placeholder="承認者ID" value={newEntry.approver_id || ''} onChange={e => setNewEntry({ ...newEntry, approver_id: e.target.value })} />
        <select className="border rounded px-2 py-1" value={newEntry.template_id} onChange={e => setNewEntry({ ...newEntry, template_id: e.target.value })}>
          <option value="">テンプレートを選択</option>
          {templates.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
        </select>
        <Input placeholder="ステータス" value={newEntry.status || ''} onChange={e => setNewEntry({ ...newEntry, status: e.target.value })} />
        <Input placeholder="実行結果" value={newEntry.result_summary || ''} onChange={e => setNewEntry({ ...newEntry, result_summary: e.target.value })} />
        <Textarea placeholder="リクエスト詳細（JSON）" className="col-span-full" rows={4} value={JSON.stringify(newEntry.request_details || {}, null, 2)} onChange={e => { try { setNewEntry({ ...newEntry, request_details: JSON.parse(e.target.value) }) } catch {} }} />
        <Textarea placeholder="結果詳細（JSON）" className="col-span-full" rows={4} value={JSON.stringify(newEntry.result_details || {}, null, 2)} onChange={e => { try { setNewEntry({ ...newEntry, result_details: JSON.parse(e.target.value) }) } catch {} }} />
        <div className="col-span-full"><Button onClick={handleAdd}>追加</Button></div>
      </div>

      {/* ローディング表示 */}
      {loading && <p className="text-gray-500">読み込み中...</p>}

      {/* 表示テーブル（10列） */}
      <table className="table-auto w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">申請者</th>
            <th className="border px-2 py-1">承認者</th>
            <th className="border px-2 py-1">種別</th>
            <th className="border px-2 py-1">テンプレート</th>
            <th className="border px-2 py-1">ステータス</th>
            <th className="border px-2 py-1">リクエスト詳細</th>
            <th className="border px-2 py-1">結果詳細</th>
            <th className="border px-2 py-1">実行結果</th>
            <th className="border px-2 py-1">登録日</th>
            <th className="border px-2 py-1">操作</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id}>
              <td className="border px-2 py-1">{r.requester_name ?? '-'}</td>
              <td className="border px-2 py-1">{r.approver_name ?? '-'}</td>
              <td className="border px-2 py-1">{r.kind_name ?? '-'}</td>
              <td className="border px-2 py-1">{r.template_name ?? '-'}</td>
              <td className="border px-2 py-1">{r.status ?? '-'}</td>
              <td className="border px-2 py-1 whitespace-pre-wrap break-all max-w-xs">{r.request_details ? JSON.stringify(r.request_details, null, 2) : '-'}</td>
              <td className="border px-2 py-1 whitespace-pre-wrap break-all max-w-xs">{r.result_details ? JSON.stringify(r.result_details, null, 2) : '-'}</td>
              <td className="border px-2 py-1">{r.result_summary ?? '-'}</td>
              <td className="border px-2 py-1">{new Date(r.created_at).toLocaleString('ja-JP')}</td>
              <td className="border px-2 py-1"><Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>削除</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
