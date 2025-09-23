// app/(portal)/portal/shift-service-code/page.tsx

'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

type Row = {
  id: string
  service_code: string
  require_doc_group: string | null
  // 追加: 管理項目
  kaipoke_servicek: string | null
  kaipoke_servicecode: string | null
  // 既存/表示用
  created_at?: string | null
  updated_at?: string | null
}

type NewRow = {
  service_code: string
  require_doc_group: string | null
  // 追加: 管理項目
  kaipoke_servicek: string | null
  kaipoke_servicecode: string | null
}

type DocOption = { value: string; label: string }

const PAGE_SIZE = 100

export default function ShiftServiceCodePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [docOptions, setDocOptions] = useState<DocOption[]>([])
  const [page, setPage] = useState(1)

  // 追加行（型を明示）
  const [newRow, setNewRow] = useState<NewRow>({
    service_code: '',
    require_doc_group: null,
    kaipoke_servicek: '',
    kaipoke_servicecode: '',
  })

  // ===== fetchers =====
  const fetchRows = async () => {
    const res = await fetch('/api/shift-service-code')
    if (!res.ok) return
    const data = (await res.json()) as Row[]
    setRows(data)
  }

  const fetchDocOptions = async () => {
    const res = await fetch('/api/user-doc-master?category=certificate')
    if (!res.ok) return
    const data = (await res.json()) as DocOption[]
    setDocOptions(data)
  }

  useEffect(() => {
    fetchDocOptions()
    fetchRows()
  }, [])

  // ===== アラート判定（require_doc_group が空欄あり） =====
  const hasEmptyRequire = useMemo(
    () => rows.some((r) => !r.require_doc_group || r.require_doc_group.trim() === ''),
    [rows]
  )

  // ===== ページネーション =====
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const start = (pageClamped - 1) * PAGE_SIZE
  const pageRows = rows.slice(start, start + PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [])

  // ===== 編集操作 =====
  const handleEdit = <K extends keyof Row>(indexInPage: number, key: K, value: Row[K]) => {
    const globalIndex = start + indexInPage
    setRows((prev) => prev.map((r, i) => (i === globalIndex ? { ...r, [key]: value } : r)))
  }

  const handleSave = async (row: Row) => {
    const res = await fetch(`/api/shift-service-code/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    })
    if (res.ok) {
      await fetchRows()
      alert('保存しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '保存に失敗しました' }))
      alert(error || '保存に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return
    const res = await fetch(`/api/shift-service-code/${id}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchRows()
      alert('削除しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '削除に失敗しました' }))
      alert(error || '削除に失敗しました')
    }
  }

  const handleAdd = async () => {
    if (!newRow.service_code || newRow.service_code.trim() === '') {
      alert('service_code は必須です')
      return
    }
    const res = await fetch('/api/shift-service-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRow),
    })
    if (res.ok) {
      setNewRow({
        service_code: '',
        require_doc_group: null,
        kaipoke_servicek: '',
        kaipoke_servicecode: '',
      })
      await fetchRows()
      alert('追加しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '追加に失敗しました' }))
      alert(error || '追加に失敗しました')
    }
  }

  // ===== shift差分追加（shift から service_code 未登録分を INSERT） =====
  const handleSyncFromShift = async () => {
    if (!confirm('shift に存在する未登録 service_code を追加します。よろしいですか？')) return
    const res = await fetch('/api/shift-service-code/sync-from-shift', { method: 'POST' })
    if (res.ok) {
      await fetchRows()
      alert('shift から未登録分を追加しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '追加に失敗しました' }))
      alert(error || '追加に失敗しました')
    }
  }

  const formatDT = (s?: string | null) => {
    if (!s) return '-'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return new Intl.DateTimeFormat('ja-JP', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(d)
  }

  return (
    <div className="w-full overflow-x-hidden px-2 md:px-4 py-2 space-y-3 md:space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base md:text-lg font-bold">shift_service_code 管理</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={fetchRows}>再読込</Button>
          <Button size="sm" onClick={handleSyncFromShift}>shift から追加</Button>
        </div>
      </div>

      {hasEmptyRequire && (
        <div className="text-red-600 text-xs md:text-sm">
          要求される資格（require_doc_group）が空欄の行があります。設定してください。
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '18%' }} /> {/* service_code */}
            <col style={{ width: '22%' }} /> {/* require_doc_group */}
            <col style={{ width: '15%' }} /> {/* kaipoke_servicek */}
            <col style={{ width: '15%' }} /> {/* kaipoke_servicecode */}
            <col style={{ width: '20%' }} /> {/* created/updated */}
            <col style={{ width: '10%' }} /> {/* 操作 */}
          </colgroup>

          <TableHeader>
            <TableRow>
              <TableHead className="px-1 py-1">service_code</TableHead>
              <TableHead className="px-1 py-1">require_doc_group（証明書グループ）</TableHead>
              <TableHead className="px-1 py-1">Kaipoke区分（kaipoke_servicek）</TableHead>
              <TableHead className="px-1 py-1">Kaipokeサービスコード</TableHead>
              <TableHead className="px-1 py-1">作成 / 更新</TableHead>
              <TableHead className="px-1 py-1">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {pageRows.map((r, i) => (
              <TableRow key={r.id}>
                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2"
                    value={r.service_code}
                    onChange={(e) => handleEdit(i, 'service_code', e.target.value)}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Select
                    value={r.require_doc_group ?? ''}
                    onValueChange={(v: string) => handleEdit(i, 'require_doc_group', v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="未設定" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">未設定</SelectItem>
                      {docOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2"
                    placeholder="例：要介護 / 障害 / 移動支援"
                    value={r.kaipoke_servicek ?? ''}
                    onChange={(e) => handleEdit(i, 'kaipoke_servicek', e.target.value || null)}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2"
                    inputMode="numeric"
                    placeholder="例：112451"
                    value={r.kaipoke_servicecode ?? ''}
                    onChange={(e) => handleEdit(i, 'kaipoke_servicecode', e.target.value || null)}
                  />
                </TableCell>

                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <div className="leading-tight">
                    <div className="text-xs text-muted-foreground">作成: {formatDT(r.created_at)}</div>
                    <div className="text-xs text-muted-foreground">更新: {formatDT(r.updated_at)}</div>
                  </div>
                </TableCell>

                <TableCell className="px-1 py-1">
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSave(r)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(r.id)}>×</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* 追加行 */}
            <TableRow>
              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  placeholder="例: 111000"
                  value={newRow.service_code}
                  onChange={(e) => setNewRow({ ...newRow, service_code: e.target.value })}
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Select
                  value={newRow.require_doc_group ?? ''}
                  onValueChange={(v: string) =>
                    setNewRow({ ...newRow, require_doc_group: v || null })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="未設定" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">未設定</SelectItem>
                    {docOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>

              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  placeholder="例：要介護 / 障害 / 移動支援"
                  value={newRow.kaipoke_servicek ?? ''}
                  onChange={(e) => setNewRow({ ...newRow, kaipoke_servicek: e.target.value || null })}
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  inputMode="numeric"
                  placeholder="例：112451"
                  value={newRow.kaipoke_servicecode ?? ''}
                  onChange={(e) => setNewRow({ ...newRow, kaipoke_servicecode: e.target.value || null })}
                />
              </TableCell>

              <TableCell className="px-1 py-1 text-xs text-muted-foreground">
                追加後に自動採番・更新
              </TableCell>

              <TableCell className="px-1 py-1">
                <Button size="sm" onClick={handleAdd}>追加</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ページネーション */}
      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {rows.length} 件中 {rows.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} を表示
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
