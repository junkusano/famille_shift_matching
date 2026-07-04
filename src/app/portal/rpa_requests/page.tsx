// app/portal/rpa-request/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { supabase } from '@/lib/supabaseClient'
import { useUserRole } from '@/context/RoleContext'

interface RpaRequestView {
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

interface TemplateOption { id: string; name: string }
interface UserOption { auth_uid: string; last_name_kanji: string; first_name_kanji: string }
interface StatusOption { status_code: string; label: string }

const PAGE_SIZE = 50

export default function RpaRequestListPage() {
  const role = useUserRole()
  const [requests, setRequests] = useState<RpaRequestView[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [newEntry, setNewEntry] = useState<Partial<RpaRequestView>>({})
  const [editedRows, setEditedRows] = useState<Record<string, Partial<RpaRequestView>>>({})
  const [isLoading, setIsLoading] = useState(false)

  // ====== フィルター ======
  const [qRequester, setQRequester] = useState<string>('')   // auth_uid
  const [qApprover, setQApprover] = useState<string>('')     // auth_uid
  const [qTemplate, setQTemplate] = useState<string>('')     // template_id
  const [qStatus, setQStatus] = useState<string>('')         // status_code
  const [qKind, setQKind] = useState<string>('')             // kind_name（部分一致）
  const [qKeyword, setQKeyword] = useState<string>('')       // result_summary / JSON 検索用簡易キーワード

  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchMastersAndData()
  }, [])

  const fetchMastersAndData = async () => {
    await Promise.all([fetchTemplates(), fetchUsers(), fetchStatuses(), fetchRequests()])
  }

  const fetchRequests = async () => {
    const { data } = await supabase
      .from('rpa_command_requests_view')
      .select('*')
      .order('created_at', { ascending: false })
    setRequests(data || [])
  }

  const fetchTemplates = async () => {
    const { data } = await supabase.from('rpa_command_templates').select('id, name')
    setTemplates(data || [])
  }

  const fetchUsers = async () => {
    const { data } = await supabase.from('form_entries').select('auth_uid, last_name_kanji, first_name_kanji')
    setUsers(
      data?.map(u => ({ auth_uid: u.auth_uid, last_name_kanji: u.last_name_kanji, first_name_kanji: u.first_name_kanji })) || []
    )
  }

  const fetchStatuses = async () => {
    const { data } = await supabase.from('rpa_command_request_status').select('status_code, label')
    setStatuses(data || [])
  }

  // ====== 追加 ======
  const handleAdd = async () => {
    setIsLoading(true)
    const payload = {
      requester_id: newEntry.requester_id ?? null,
      approver_id: newEntry.approver_id ?? null,
      template_id: newEntry.template_id ?? null,
      status: newEntry.status ?? null,
      request_details: newEntry.request_details ?? {},
      result_details: newEntry.result_details ?? {},
      result_summary: newEntry.result_summary ?? '',
    }
    const { error } = await supabase.from('rpa_command_requests').insert([payload])
    setIsLoading(false)
    if (error) {
      alert('追加失敗')
      return
    }
    setNewEntry({})
    await fetchRequests()
  }

  // ====== 編集 ======
  const handleFieldChange = <K extends keyof RpaRequestView>(id: string, field: K, value: RpaRequestView[K]) => {
    setEditedRows(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }))
  }

  const handleSave = async (id: string) => {
    const update = editedRows[id]
    if (!update) return
    const { error } = await supabase.from('rpa_command_requests').update(update).eq('id', id)
    if (error) {
      alert('更新失敗')
      return
    }
    setEditedRows(prev => {
      const cp = { ...prev }
      delete cp[id]
      return cp
    })
    await fetchRequests()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この行を削除します。よろしいですか？')) return
    const { error } = await supabase.from('rpa_command_requests').delete().eq('id', id)
    if (error) {
      alert('削除失敗')
      return
    }
    await fetchRequests()
  }

  // ====== フィルタリング & ページング ======
  const filtered = useMemo(() => {
    const kw = qKeyword.trim().toLowerCase()
    const kind = qKind.trim().toLowerCase()
    return requests.filter(r => {
      if (qRequester && r.requester_id !== qRequester) return false
      if (qApprover && r.approver_id !== qApprover) return false
      if (qTemplate && r.template_id !== qTemplate) return false
      if (qStatus && (r.status ?? '') !== qStatus) return false
      if (kind && !(r.kind_name ?? '').toLowerCase().includes(kind)) return false
      if (kw) {
        const hay =
          JSON.stringify(r.request_details ?? {}) +
          ' ' +
          JSON.stringify(r.result_details ?? {}) +
          ' ' +
          (r.result_summary ?? '')
        if (!hay.toLowerCase().includes(kw)) return false
      }
      return true
    })
  }, [requests, qRequester, qApprover, qTemplate, qStatus, qKind, qKeyword])

  useEffect(() => {
    setPage(1)
  }, [qRequester, qApprover, qTemplate, qStatus, qKind, qKeyword])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const start = (pageClamped - 1) * PAGE_SIZE
  const pageRows = filtered.slice(start, start + PAGE_SIZE)

  if (!['admin', 'manager'].includes(role)) return <div className="p-4">閲覧権限がありません</div>

  return (
    <div className="w-full overflow-x-hidden px-2 md:px-4 py-2 space-y-3 md:space-y-4 text-sm">
      <h1 className="text-base md:text-lg font-bold">RPAリクエスト一覧</h1>

      {/* ===== 上部フィルター（Fax相当のレイアウト） ===== */}
      <div
        className="
          grid items-end gap-y-2 md:gap-y-2 md:gap-x-2
          grid-cols-1 md:grid-cols-7
          md:[grid-template-columns:15%_15%_15%_15%_15%_auto_10%]
        "
      >
        {/* 申請者 */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">申請者</div>
          <Select value={qRequester} onValueChange={setQRequester}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {users.map(u => (
                <SelectItem key={u.auth_uid} value={u.auth_uid}>
                  {u.last_name_kanji}{u.first_name_kanji}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 承認者 */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">承認者</div>
          <Select value={qApprover} onValueChange={setQApprover}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {users.map(u => (
                <SelectItem key={u.auth_uid} value={u.auth_uid}>
                  {u.last_name_kanji}{u.first_name_kanji}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* テンプレート */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">テンプレート</div>
          <Select value={qTemplate} onValueChange={setQTemplate}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {templates.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ステータス */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">ステータス</div>
          <Select value={qStatus} onValueChange={setQStatus}>
            <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {statuses.map(s => (
                <SelectItem key={s.status_code} value={s.status_code}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 種別（部分一致） */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">種別（部分一致）</div>
          <Input className="h-8 w-full px-2 min-w-0" value={qKind} onChange={(e) => setQKind(e.target.value)} placeholder="例: 申請/登録 など" />
        </div>

        {/* キーワード */}
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">キーワード</div>
          <Input className="h-8 w-full px-2 min-w-0" value={qKeyword} onChange={(e) => setQKeyword(e.target.value)} placeholder="result や JSON に含まれる語" />
        </div>

        <div className="min-w-0 md:justify-self-end md:pr-2 max-w-max">
          <Button size="sm" variant="secondary" onClick={() => {
            setQRequester(''); setQApprover(''); setQTemplate(''); setQStatus('');
            setQKind(''); setQKeyword('');
          }}>クリア</Button>
        </div>
      </div>

      {/* ===== テーブル（先頭に“追加行”を配置） ===== */}
      <div className="overflow-x-auto rounded-md border">
        <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '12%' }} /> {/* 申請者 */}
            <col style={{ width: '12%' }} /> {/* 承認者 */}
            <col style={{ width: '12%' }} /> {/* 種別 */}
            <col style={{ width: '14%' }} /> {/* テンプレート */}
            <col style={{ width: '10%' }} /> {/* ステータス */}
            <col style={{ width: '15%' }} /> {/* リクエスト詳細 */}
            <col style={{ width: '15%' }} /> {/* 結果詳細 */}
            <col style={{ width: '10%' }} /> {/* 実行結果 */}
            <col style={{ width: '12%' }} /> {/* 登録日 */}
            <col style={{ width: '8%' }} />  {/* 操作 */}
          </colgroup>

          <TableHeader className="[&_tr]:border-b">
            <TableRow>
              <TableHead className="px-1 py-1">申請者</TableHead>
              <TableHead className="px-1 py-1">承認者</TableHead>
              <TableHead className="px-1 py-1">種別</TableHead>
              <TableHead className="px-1 py-1">テンプレート</TableHead>
              <TableHead className="px-1 py-1">ステータス</TableHead>
              <TableHead className="px-1 py-1">リクエスト詳細</TableHead>
              <TableHead className="px-1 py-1">結果詳細</TableHead>
              <TableHead className="px-1 py-1">実行結果</TableHead>
              <TableHead className="px-1 py-1">登録日</TableHead>
              <TableHead className="px-1 py-1">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody className="[&_tr]:border-b">
            {/* 追加行（テーブル先頭） */}
            <TableRow>
              <TableCell className="px-1 py-1">
                <Select value={newEntry.requester_id ?? ''} onValueChange={(v) => setNewEntry(prev => ({ ...prev, requester_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.auth_uid} value={u.auth_uid}>
                        {u.last_name_kanji}{u.first_name_kanji}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="px-1 py-1">
                <Select value={newEntry.approver_id ?? ''} onValueChange={(v) => setNewEntry(prev => ({ ...prev, approver_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.auth_uid} value={u.auth_uid}>
                        {u.last_name_kanji}{u.first_name_kanji}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="px-1 py-1">{/* kind はテンプレ依存なら表示のみでもOK */}
                <Input className="h-8 w-full px-2" value={newEntry.kind_name as string ?? ''} onChange={(e) => setNewEntry(p => ({ ...p, kind_name: e.target.value }))} placeholder="任意" />
              </TableCell>
              <TableCell className="px-1 py-1">
                <Select value={newEntry.template_id ?? ''} onValueChange={(v) => setNewEntry(prev => ({ ...prev, template_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="px-1 py-1">
                <Select value={newEntry.status ?? ''} onValueChange={(v) => setNewEntry(prev => ({ ...prev, status: v }))}>
                  <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                  <SelectContent>
                    {statuses.map(s => (<SelectItem key={s.status_code} value={s.status_code}>{s.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="px-1 py-1">
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={JSON.stringify(newEntry.request_details ?? {}, null, 2)}
                  onChange={(e) => { try { setNewEntry(p => ({ ...p, request_details: JSON.parse(e.target.value) })) } catch { } }}
                  placeholder='{"arg":"value"}'
                />
              </TableCell>
              <TableCell className="px-1 py-1">
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={JSON.stringify(newEntry.result_details ?? {}, null, 2)}
                  onChange={(e) => { try { setNewEntry(p => ({ ...p, result_details: JSON.parse(e.target.value) })) } catch { } }}
                />
              </TableCell>
              <TableCell className="px-1 py-1">
                <Textarea
                  rows={3}
                  className="resize-none"
                  value={newEntry.result_summary ?? ''}
                  onChange={(e) => setNewEntry(p => ({ ...p, result_summary: e.target.value }))}
                  placeholder="実行結果の要約"
                />
              </TableCell>
              <TableCell className="px-1 py-1 text-muted-foreground">—</TableCell>
              <TableCell className="px-1 py-1">
                <Button size="sm" onClick={handleAdd} disabled={isLoading}>{isLoading ? '追加中…' : '追加'}</Button>
              </TableCell>
            </TableRow>

            {/* データ行 */}
            {pageRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="px-1 py-1">
                  <Select
                    value={editedRows[r.id]?.requester_id ?? r.requester_id ?? ''}
                    onValueChange={(v) => handleFieldChange(r.id, 'requester_id', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.auth_uid} value={u.auth_uid}>
                          {u.last_name_kanji}{u.first_name_kanji}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Select
                    value={editedRows[r.id]?.approver_id ?? r.approver_id ?? ''}
                    onValueChange={(v) => handleFieldChange(r.id, 'approver_id', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.auth_uid} value={u.auth_uid}>
                          {u.last_name_kanji}{u.first_name_kanji}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="px-1 py-1">{r.kind_name ?? ''}</TableCell>

                <TableCell className="px-1 py-1">
                  <Select
                    value={editedRows[r.id]?.template_id ?? r.template_id ?? ''}
                    onValueChange={(v) => handleFieldChange(r.id, 'template_id', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Select
                    value={editedRows[r.id]?.status ?? r.status ?? ''}
                    onValueChange={(v) => handleFieldChange(r.id, 'status', v)}
                  >
                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                    <SelectContent>
                      {statuses.map(s => (<SelectItem key={s.status_code} value={s.status_code}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Textarea
                    rows={3}
                    className="resize-none"
                    value={JSON.stringify(editedRows[r.id]?.request_details ?? r.request_details ?? {}, null, 2)}
                    onChange={(e) => { try { handleFieldChange(r.id, 'request_details', JSON.parse(e.target.value)) } catch { } }}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Textarea
                    rows={3}
                    className="resize-none"
                    value={JSON.stringify(editedRows[r.id]?.result_details ?? r.result_details ?? {}, null, 2)}
                    onChange={(e) => { try { handleFieldChange(r.id, 'result_details', JSON.parse(e.target.value)) } catch { } }}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <TableCell className="px-1 py-1">
                    <Textarea
                      rows={3}
                      className="resize-none"
                      value={editedRows[r.id]?.result_summary ?? r.result_summary ?? ''}
                      onChange={(e) => handleFieldChange(r.id, 'result_summary', e.target.value)}
                    />
                  </TableCell>
                </TableCell>

                <TableCell className="px-1 py-1">{new Date(r.created_at).toLocaleString('ja-JP')}</TableCell>

                <TableCell className="px-1 py-1">
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSave(r.id)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>×</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ===== ページネーション ===== */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length} 件中 {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} を表示
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>前へ</Button>
          <div className="text-xs">{pageClamped} / {totalPages}</div>
          <Button size="sm" variant="outline" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>次へ</Button>
        </div>
      </div>
    </div>
  )
}
