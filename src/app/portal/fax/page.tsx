'use client'

import { useEffect, useState } from 'react'
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

type ServiceKind = {
  id: string
  label: string
  sort_order: number
}

export default function FaxPage() {
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [kinds, setKinds] = useState<ServiceKind[]>([])
  const [newEntry, setNewEntry] = useState<Omit<FaxEntry, 'id'>>({
    fax: '',
    office_name: '',
    email: '',
    postal_code: '',
    service_kind_id: null,
  })

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

  // any を使わないで安全に更新
  const handleEditChange = <K extends keyof FaxEntry>(index: number, key: K, value: FaxEntry[K]) => {
    setFaxList(prev =>
      prev.map((row, i) => (i === index ? ({ ...row, [key]: value } as FaxEntry) : row))
    )
  }

  const handleSave = async (entry: FaxEntry) => {
    const res = await fetch(`/api/fax/${entry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (res.ok) {
      fetchFaxList()
      alert('保存にしました')
    } else {
      const { error } = await res.json().catch(() => ({ error: '保存に失敗しました' }))
      alert(error || '保存に失敗しました')
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/fax/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchFaxList()
      alert('保存にしました')
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
    } else {
      const { error } = await res.json().catch(() => ({ error: '追加に失敗しました' }))
      alert(error || '追加に失敗しました')
    }
  }

  return (

    <div className="p-6 space-y-4">
      <h2 className="text-lg font-bold">FAX一覧</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>FAX</TableHead>
            <TableHead>事業所名</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>郵便番号</TableHead>
            <TableHead>サービス種別</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faxList.map((entry, index) => (
            <TableRow key={entry.id}>
              <TableCell>
                <Input className="h-8" value={entry.fax} onChange={(e) => handleEditChange(index, 'fax', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8" value={entry.office_name} onChange={(e) => handleEditChange(index, 'office_name', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8" value={entry.email} onChange={(e) => handleEditChange(index, 'email', e.target.value)} />
              </TableCell>
              <TableCell>
                <Input className="h-8" value={entry.postal_code ?? ''} onChange={(e) => handleEditChange(index, 'postal_code', e.target.value)} placeholder="例: 486-0969" />
              </TableCell>
              <TableCell>
                <div className="min-w-[220px]">
                  <Select value={entry.service_kind_id ?? ''} onValueChange={(v) => handleEditChange(index, 'service_kind_id', v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      {kinds.map((k) => (
                        <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TableCell>
              <TableCell>
                <div className="space-x-1">
                  <Button size="sm" onClick={() => handleSave(entry)}>保存</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.id)}>×</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input className="h-8" value={newEntry.fax} onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })} placeholder="新規FAX" />
            </TableCell>
            <TableCell>
              <Input className="h-8" value={newEntry.office_name} onChange={(e) => setNewEntry({ ...newEntry, office_name: e.target.value })} placeholder="事業所名" />
            </TableCell>
            <TableCell>
              <Input className="h-8" value={newEntry.email} onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })} placeholder="Email" />
            </TableCell>
            <TableCell>
              <Input className="h-8" value={newEntry.postal_code ?? ''} onChange={(e) => setNewEntry({ ...newEntry, postal_code: e.target.value })} placeholder="郵便番号" />
            </TableCell>
            <TableCell>
              <div className="min-w-[220px]">
                <Select value={newEntry.service_kind_id ?? ''} onValueChange={(v) => setNewEntry({ ...newEntry, service_kind_id: v || null })}>
                  <SelectTrigger>
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TableCell>
            <TableCell>
              <Button size="sm" onClick={handleAdd}>追加</Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <style jsx global>{`
        /* ====== FaxPage compact styles (mobile-first) ====== */
        .fax-compact table th,
        .fax-compact table td {
          padding-top: 0.25rem;   /* py-1 */
          padding-bottom: 0.25rem;
          padding-left: 0.25rem;  /* px-1 */
          padding-right: 0.25rem;
        }
        .fax-compact table { font-size: 0.875rem; } /* text-sm */
        .fax-compact input { height: 2rem; } /* h-8 相当の保険 */

        /* shadcnのSelectTriggerがclassName不可 → role=comboboxをターゲット */
        .fax-compact [role='combobox'] {
          min-height: 2rem; /* h-8 */
          height: 2rem;
          padding-top: 0;
          padding-bottom: 0;
        }

        /* 狭幅で横溢れする場合のスクロール */
        .fax-compact .table-wrapper { overflow-x: auto; }

        /* セル内ボタンの間隔最小化 */
        .fax-compact .space-x-1 > * + * { margin-left: 0.25rem; }
      `}</style>
    </div>
  )
}