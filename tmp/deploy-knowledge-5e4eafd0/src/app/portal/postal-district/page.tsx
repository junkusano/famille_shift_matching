//app/portal/postal-district/route.ts
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

type Row = {
  postal_code_3: string
  district: string | null
  dsp_short: string | null
  transport_fee_per_service: number
}

const PAGE_SIZE = 100

export default function PostalDistrictPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(1)
  const [newRow, setNewRow] = useState<Row>({
    postal_code_3: '',
    district: '',
    dsp_short: '',
    transport_fee_per_service: 0,
  })

  const fetchRows = async () => {
    const res = await fetch('/api/postal-district')
    if (!res.ok) return
    const data = (await res.json()) as Row[]
    setRows(data)
  }

  useEffect(() => {
    fetchRows()
  }, [])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const start = (pageClamped - 1) * PAGE_SIZE
  const pageRows = useMemo(
    () => rows.slice(start, start + PAGE_SIZE),
    [rows, start]
  )

  const handleEdit = <K extends keyof Row>(indexInPage: number, key: K, value: Row[K]) => {
    const globalIndex = start + indexInPage
    setRows((prev) => prev.map((r, i) => (i === globalIndex ? { ...r, [key]: value } : r)))
  }

  const handleSave = async (row: Row) => {
    const res = await fetch(`/api/postal-district/${row.postal_code_3}`, {
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

  const handleDelete = async (postal_code_3: string) => {
    if (!confirm(`${postal_code_3} を削除しますか？`)) return

    const res = await fetch(`/api/postal-district/${postal_code_3}`, {
      method: 'DELETE',
    })

    if (res.ok) {
      await fetchRows()
      alert('削除しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '削除に失敗しました' }))
      alert(error || '削除に失敗しました')
    }
  }

  const handleAdd = async () => {
    if (!/^\d{3}$/.test(newRow.postal_code_3.trim())) {
      alert('郵便番号3桁は 123 のように3桁で入力してください')
      return
    }

    const res = await fetch('/api/postal-district', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRow),
    })

    if (res.ok) {
      setNewRow({
        postal_code_3: '',
        district: '',
        dsp_short: '',
        transport_fee_per_service: 0,
      })
      await fetchRows()
      alert('追加しました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '追加に失敗しました' }))
      alert(error || '追加に失敗しました')
    }
  }

  return (
    <div className="w-full overflow-x-hidden px-2 md:px-4 py-2 space-y-3 md:space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base md:text-lg font-bold">postal_district 管理</h2>
        <Button size="sm" variant="secondary" onClick={fetchRows}>
          再読込
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '34%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>

          <TableHeader>
            <TableRow>
              <TableHead className="px-1 py-1">郵便番号3桁</TableHead>
              <TableHead className="px-1 py-1">地区名</TableHead>
              <TableHead className="px-1 py-1">短縮表示</TableHead>
              <TableHead className="px-1 py-1 text-right">通勤費（1回）</TableHead>
              <TableHead className="px-1 py-1">操作</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {pageRows.map((r, i) => (
              <TableRow key={r.postal_code_3}>
                <TableCell className="px-1 py-1">
                  <Input className="h-8 px-2" value={r.postal_code_3} readOnly />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2"
                    value={r.district ?? ''}
                    onChange={(e) => handleEdit(i, 'district', e.target.value || null)}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2"
                    value={r.dsp_short ?? ''}
                    onChange={(e) => handleEdit(i, 'dsp_short', e.target.value || null)}
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <Input
                    className="h-8 px-2 text-right"
                    type="number"
                    inputMode="numeric"
                    value={r.transport_fee_per_service ?? 0}
                    onChange={(e) =>
                      handleEdit(i, 'transport_fee_per_service', Number(e.target.value || 0))
                    }
                  />
                </TableCell>

                <TableCell className="px-1 py-1">
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => handleSave(r)}>
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(r.postal_code_3)}
                    >
                      ×
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            <TableRow>
              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  placeholder="例：453"
                  maxLength={3}
                  value={newRow.postal_code_3}
                  onChange={(e) =>
                    setNewRow({
                      ...newRow,
                      postal_code_3: e.target.value.replace(/\D/g, '').slice(0, 3),
                    })
                  }
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  placeholder="例：中村区"
                  value={newRow.district ?? ''}
                  onChange={(e) => setNewRow({ ...newRow, district: e.target.value || null })}
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2"
                  placeholder="例：中村"
                  value={newRow.dsp_short ?? ''}
                  onChange={(e) => setNewRow({ ...newRow, dsp_short: e.target.value || null })}
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Input
                  className="h-8 px-2 text-right"
                  type="number"
                  inputMode="numeric"
                  value={newRow.transport_fee_per_service}
                  onChange={(e) =>
                    setNewRow({
                      ...newRow,
                      transport_fee_per_service: Number(e.target.value || 0),
                    })
                  }
                />
              </TableCell>

              <TableCell className="px-1 py-1">
                <Button size="sm" onClick={handleAdd}>
                  追加
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-muted-foreground">
          {rows.length} 件中 {rows.length === 0 ? 0 : start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} を表示
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