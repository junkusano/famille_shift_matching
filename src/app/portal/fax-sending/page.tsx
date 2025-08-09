'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

// 左メニューは layout.tsx 側で 250px 固定（.left-menu）なので、
// ここではメイン領域内で横オーバーしないことを最優先に設計
// - 外枠は w-full / overflow-hidden
// - フィルタ行の内在幅を各カラムで明示的に min-w-0
// - テーブルは table-fixed + 各セル min-w-0 + 入力 truncate
// - 事業所名カラムをさらに短縮（22%）

// --- Types ---
type FaxEntry = {
  id: string
  fax: string
  office_name: string
  email: string
  postal_code: string | null
  service_kind_id: string | null
}

type ServiceKind = { id: string; label: string; sort_order: number }

const PAGE_SIZE = 50

export default function FaxPage() {
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [kinds, setKinds] = useState<ServiceKind[]>([])

  // 新規行
  const [newEntry, setNewEntry] = useState<Omit<FaxEntry, 'id'>>({
    fax: '',
    office_name: '',
    email: '',
    postal_code: '',
    service_kind_id: null,
  })

  // フィルタ
  const [qFax, setQFax] = useState('')
  const [qOffice, setQOffice] = useState('')
  const [qEmail, setQEmail] = useState('')
  const [qPostal, setQPostal] = useState('')
  const [qKind, setQKind] = useState<string>('')

  // ページング
  const [page, setPage] = useState(1)

  const fetchFaxList = async () => {
    const res = await fetch('/api/fax')
    if (!res.ok) return
    const data = (await res.json()) as FaxEntry[]
    setFaxList(data)
  }

  const fetchKinds = async () => {
    const res = await fetch('/api/service-kinds')
    if (!res.ok) return
    const data = (await res.json()) as ServiceKind[]
    setKinds(data)
  }

  useEffect(() => {
    fetchKinds()
    fetchFaxList()
  }, [])

  // フィルタ済みデータ
  const filtered = useMemo(() => {
    const fax = qFax.trim().toLowerCase()
    const off = qOffice.trim().toLowerCase()
    const eml = qEmail.trim().toLowerCase()
    const pst = qPostal.trim().toLowerCase()
    const kind = qKind

    return faxList.filter((row) => {
      if (fax && !row.fax.toLowerCase().includes(fax)) return false
      if (off && !row.office_name.toLowerCase().includes(off)) return false
      if (eml && !row.email.toLowerCase().includes(eml)) return false
      if (pst && !(row.postal_code ?? '').toLowerCase().includes(pst)) return false
      if (kind && row.service_kind_id !== kind) return false
      return true
    })
  }, [faxList, qFax, qOffice, qEmail, qPostal, qKind])

  // ページング計算
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const start = (pageClamped - 1) * PAGE_SIZE
  const pageRows = filtered.slice(start, start + PAGE_SIZE)

  // フィルタ変更時は1ページ目へ
  useEffect(() => {
    setPage(1)
  }, [qFax, qOffice, qEmail, qPostal, qKind])

  // 編集系
  const handleEditChange = <K extends keyof FaxEntry>(index: number, key: K, value: FaxEntry[K]) => {
    setFaxList((prev) => prev.map((row, i) => (i === index ? ({ ...row, [key]: value } as FaxEntry) : row)))
  }

  const handleSave = async (entry: FaxEntry) => {
    const res = await fetch(`/api/fax/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (res.ok) {
      fetchFaxList()
      alert('保存しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '保存に失敗しました' }))
      alert(error || '保存に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/fax/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchFaxList()
      alert('削除しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '削除に失敗しました' }))
      alert(error || '削除に失敗しました')
    }
  }

  const handleAdd = async () => {
    if (!newEntry.fax) {
      alert('FAX番号は必須です')
      return
    }
    const res = await fetch('/api/fax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    })
    if (res.ok) {
      setNewEntry({ fax: '', office_name: '', email: '', postal_code: '', service_kind_id: null })
      fetchFaxList()
      alert('追加しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '追加に失敗しました' }))
      alert(error || '追加に失敗しました')
    }
  }

  return (
    <div className="w-full overflow-hidden px-2 md:px-4 py-2 space-y-3 md:space-y-4 text-sm">
      <h2 className="text-base md:text-lg font-bold">FAX一覧</h2>

      {/* ===== 検索行（2段構成：各カラムで min-w-0 を明示） ===== */}
      <div className="grid grid-cols-12 gap-2 items-end">
        {/* 1段目: 2 / 4 / 6 = 12 */}
        <div className="col-span-12 md:col-span-2 min-w-0">
          <div className="text-[11px] text-muted-foreground">FAX</div>
          <Input className="h-8 w-full px-2" value={qFax} onChange={(e) => setQFax(e.target.value)} placeholder="部分検索" />
        </div>
        <div className="col-span-12 md:col-span-4 min-w-0">
          <div className="text-[11px] text-muted-foreground">事業所名</div>
          <Input className="h-8 w-full px-2" value={qOffice} onChange={(e) => setQOffice(e.target.value)} placeholder="部分検索" />
        </div>
        <div className="col-span-12 md:col-span-6 min-w-0">
          <div className="text-[11px] text-muted-foreground">Email</div>
          <Input className="h-8 w-full px-2" value={qEmail} onChange={(e) => setQEmail(e.target.value)} placeholder="部分検索" />
        </div>

        {/* 2段目: 2 / 6 / 4 = 12 */}
        <div className="col-span-12 md:col-span-2 min-w-0">
          <div className="text-[11px] text-muted-foreground">郵便番号</div>
          <Input className="h-8 w-full px-2" value={qPostal} onChange={(e) => setQPostal(e.target.value)} placeholder="例: 486" />
        </div>
        <div className="col-span-12 md:col-span-6 min-w-0">
          <div className="text-[11px] text-muted-foreground">サービス種別</div>
          <div className="w-full min-w-0">
            <Select value={qKind} onValueChange={(v) => setQKind(v)}>
              {/* SelectTrigger は className を渡さずに幅はラッパーで管理 */}
              <SelectTrigger>
                <SelectValue placeholder="すべて" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">すべて</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="col-span-12 md:col-span-4 min-w-0 md:justify-self-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { setQFax(''); setQOffice(''); setQEmail(''); setQPostal(''); setQKind(''); }}
          >
            クリア
          </Button>
        </div>
      </div>

      {/* ===== テーブル（横オーバー対策：固定幅 + 各セル min-w-0） ===== */}
      <div className="overflow-x-auto">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow>
              {/* 合計100%  事業所名をさらに短縮 */}
              <TableHead className="px-1 py-1 w-[14%]">FAX</TableHead>
              <TableHead className="px-1 py-1 w-[22%]">事業所名</TableHead>
              <TableHead className="px-1 py-1 w-[28%]">Email</TableHead>
              <TableHead className="px-1 py-1 w-[12%]">郵便番号</TableHead>
              <TableHead className="px-1 py-1 w-[14%]">サービス種別</TableHead>
              <TableHead className="px-1 py-1 w-[10%]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell className="px-1 py-1 min-w-0">
                  <Input className="h-8 w-full px-2 truncate" value={entry.fax} onChange={(e) => handleEditChange(index + start, 'fax', e.target.value)} />
                </TableCell>
                <TableCell className="px-1 py-1 min-w-0">
                  <Input
                    className="h-8 w-full px-2 truncate"
                    value={entry.office_name}
                    onChange={(e) => handleEditChange(index + start, 'office_name', e.target.value)}
                    title={entry.office_name}
                  />
                </TableCell>
                <TableCell className="px-1 py-1 min-w-0">
                  <Input
                    className="h-8 w-full px-2 truncate"
                    value={entry.email}
                    onChange={(e) => handleEditChange(index + start, 'email', e.target.value)}
                    title={entry.email}
                  />
                </TableCell>
                <TableCell className="px-1 py-1 min-w-0">
                  <Input
                    className="h-8 w-full px-2 truncate"
                    value={entry.postal_code ?? ''}
                    onChange={(e) => handleEditChange(index + start, 'postal_code', e.target.value)}
                    placeholder="例: 4860969"
                  />
                </TableCell>
                <TableCell className="px-1 py-1 min-w-0">
                  <div className="w-full min-w-0">
                    <Select value={entry.service_kind_id ?? ''} onValueChange={(v) => handleEditChange(index + start, 'service_kind_id', v || null)}>
                      <SelectTrigger>
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {kinds.map((k) => (
                          <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="px-1 py-1 min-w-0">
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSave(entry)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.id)}>×</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* 追加行 */}
            <TableRow>
              <TableCell className="px-1 py-1 min-w-0">
                <Input className="h-8 w-full px-2" value={newEntry.fax} onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })} placeholder="新規FAX" />
              </TableCell>
              <TableCell className="px-1 py-1 min-w-0">
                <Input className="h-8 w-full px-2" value={newEntry.office_name} onChange={(e) => setNewEntry({ ...newEntry, office_name: e.target.value })} placeholder="事業所名" />
              </TableCell>
              <TableCell className="px-1 py-1 min-w-0">
                <Input className="h-8 w-full px-2" value={newEntry.email} onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })} placeholder="Email" />
              </TableCell>
              <TableCell className="px-1 py-1 min-w-0">
                <Input className="h-8 w-full px-2" value={newEntry.postal_code ?? ''} onChange={(e) => setNewEntry({ ...newEntry, postal_code: e.target.value })} placeholder="郵便番号" />
              </TableCell>
              <TableCell className="px-1 py-1 min-w-0">
                <div className="w-full min-w-0">
                  <Select value={newEntry.service_kind_id ?? ''} onValueChange={(v) => setNewEntry({ ...newEntry, service_kind_id: v || null })}>
                    <SelectTrigger>
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((k) => (
                        <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell className="px-1 py-1 min-w-0">
                <Button size="sm" onClick={handleAdd}>追加</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ===== ページネーション ===== */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length} 件中 {filtered.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} を表示
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={pageClamped <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>前へ</Button>
          <div className="text-xs">{pageClamped} / {totalPages}</div>
          <Button size="sm" variant="outline" disabled={pageClamped >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>次へ</Button>
        </div>
      </div>
    </div>
  )
}
