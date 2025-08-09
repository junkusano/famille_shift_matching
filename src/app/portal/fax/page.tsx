'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

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

  // 検索フィルタ
  const [qFax, setQFax] = useState('')
  const [qOffice, setQOffice] = useState('')
  const [qEmail, setQEmail] = useState('')
  const [qPostal, setQPostal] = useState('')
  const [qKind, setQKind] = useState<string>('') // service_kind_id

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
    <div className="p-2 md:p-6 space-y-2 md:space-y-4 text-sm">
      <h2 className="text-base md:text-lg font-bold">FAX一覧</h2>

      {/* ===== 検索行 ===== */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <div className="text-[11px] text-muted-foreground">FAX</div>
          <Input
            className="h-8 w-36 px-2"
            value={qFax}
            onChange={(e) => setQFax(e.target.value)}
            placeholder="部分検索"
          />
        </div>
        <div className="grow min-w-[240px]">
          <div className="text-[11px] text-muted-foreground">事業所名</div>
          <Input
            className="h-8 w-full md:w-[90ch] px-2"
            value={qOffice}
            onChange={(e) => setQOffice(e.target.value)}
            placeholder="部分検索"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">Email</div>
          <Input
            className="h-8 w-48 px-2"
            value={qEmail}
            onChange={(e) => setQEmail(e.target.value)}
            placeholder="部分検索"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">郵便番号</div>
          <Input
            className="h-8 w-28 px-2"
            value={qPostal}
            onChange={(e) => setQPostal(e.target.value)}
            placeholder="例: 486"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">サービス種別</div>
          <div className="w-40">
            <Select value={qKind} onValueChange={(v) => setQKind(v)}>
              <SelectTrigger>
                <SelectValue placeholder="すべて" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">すべて</SelectItem>
                {kinds.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="ml-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQFax('')
              setQOffice('')
              setQEmail('')
              setQPostal('')
              setQKind('')
            }}
          >
            クリア
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32 px-1 py-1 whitespace-nowrap">FAX</TableHead>
              <TableHead className="px-1 py-1 whitespace-nowrap md:w-[90ch] w-[280px]">事業所名</TableHead>
              <TableHead className="w-40 px-1 py-1 whitespace-nowrap">Email</TableHead>
              <TableHead className="w-24 px-1 py-1 whitespace-nowrap">郵便番号</TableHead>
              <TableHead className="w-28 px-1 py-1 whitespace-nowrap">サービス種別</TableHead>
              <TableHead className="px-1 py-1 whitespace-nowrap">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input
                    className="h-8 w-32 px-2"
                    value={entry.fax}
                    onChange={(e) => handleEditChange(index + start, 'fax', e.target.value)}
                  />
                </TableCell>
                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 w-[280px] md:w-[90ch] px-2"
                    value={entry.office_name}
                    onChange={(e) => handleEditChange(index + start, 'office_name', e.target.value)}
                  />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input
                    className="h-8 w-40 px-2"
                    value={entry.email}
                    onChange={(e) => handleEditChange(index + start, 'email', e.target.value)}
                  />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input
                    className="h-8 w-24 px-2"
                    value={entry.postal_code ?? ''}
                    onChange={(e) => handleEditChange(index + start, 'postal_code', e.target.value)}
                    placeholder="例: 4860969"
                  />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <div className="w-28 shrink-0">
                    <Select
                      value={entry.service_kind_id ?? ''}
                      onValueChange={(v) => handleEditChange(index + start, 'service_kind_id', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {kinds.map((k) => (
                          <SelectItem key={k.id} value={k.id}>
                            {k.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <div className="space-x-1">
                    <Button size="sm" onClick={() => handleSave(entry)}>
                      保存
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.id)}>
                      ×
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* 追加行 */}
            <TableRow>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input
                  className="h-8 w-32 px-2"
                  value={newEntry.fax}
                  onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })}
                  placeholder="新規FAX"
                />
              </TableCell>
              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 w-[280px] md:w-[90ch] px-2"
                  value={newEntry.office_name}
                  onChange={(e) => setNewEntry({ ...newEntry, office_name: e.target.value })}
                  placeholder="事業所名"
                />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input
                  className="h-8 w-40 px-2"
                  value={newEntry.email}
                  onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })}
                  placeholder="Email"
                />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input
                  className="h-8 w-24 px-2"
                  value={newEntry.postal_code ?? ''}
                  onChange={(e) => setNewEntry({ ...newEntry, postal_code: e.target.value })}
                  placeholder="郵便番号"
                />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <div className="w-28 shrink-0">
                  <Select
                    value={newEntry.service_kind_id ?? ''}
                    onValueChange={(v) => setNewEntry({ ...newEntry, service_kind_id: v || null })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Button size="sm" onClick={handleAdd}>
                  追加
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ===== ページネーション ===== */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {filtered.length} 件中 {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} を表示
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pageClamped <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            前へ
          </Button>
          <div className="text-xs">
            {pageClamped} / {totalPages}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={pageClamped >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            次へ
          </Button>
        </div>
      </div>
    </div>
  )
}