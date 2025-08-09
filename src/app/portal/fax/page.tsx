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

  const handleEditChange = <K extends keyof FaxEntry>(index: number, key: K, value: FaxEntry[K]) => {
    setFaxList(prev => prev.map((row, i) => (i === index ? ({ ...row, [key]: value } as FaxEntry) : row)))
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

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24 px-1 py-1 whitespace-nowrap">FAX</TableHead>
              {/* 事業所名：90ch 目標（大きく） */}
              <TableHead className="px-1 py-1 whitespace-nowrap md:w-[90ch] w-[280px]">事業所名</TableHead>
              <TableHead className="w-32 px-1 py-1 whitespace-nowrap">Email</TableHead>
              <TableHead className="w-24 px-1 py-1 whitespace-nowrap">郵便番号</TableHead>
              {/* 種別は半分くらい（固定幅） */}
              <TableHead className="w-28 px-1 py-1 whitespace-nowrap">サービス種別</TableHead>
              <TableHead className="px-1 py-1 whitespace-nowrap">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faxList.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input className="h-8 w-24 px-2" value={entry.fax} onChange={(e) => handleEditChange(index, 'fax', e.target.value)} />
                </TableCell>
                <TableCell className="px-1 py-1">
                  {/* 事業所名広め（モバイルは最小幅、md以上で90ch） */}
                  <Input className="h-8 w-[280px] md:w-[90ch] px-2" value={entry.office_name} onChange={(e) => handleEditChange(index, 'office_name', e.target.value)} />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input className="h-8 w-32 px-2" value={entry.email} onChange={(e) => handleEditChange(index, 'email', e.target.value)} />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <Input className="h-8 w-24 px-2" value={entry.postal_code ?? ''} onChange={(e) => handleEditChange(index, 'postal_code', e.target.value)} placeholder="例: 4860969" />
                </TableCell>
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  {/* 種別は固定幅＋縮まない */}
                  <div className="w-28 shrink-0">
                    <Select value={entry.service_kind_id ?? ''} onValueChange={(v) => handleEditChange(index, 'service_kind_id', v || null)}>
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
                <TableCell className="px-1 py-1 whitespace-nowrap">
                  <div className="space-x-1">
                    <Button size="sm" onClick={() => handleSave(entry)}>保存</Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.id)}>×</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* 追加行 */}
            <TableRow>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input className="h-8 w-24 px-2" value={newEntry.fax} onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })} placeholder="新規FAX" />
              </TableCell>
              <TableCell className="px-1 py-1">
                <Input className="h-8 w-[280px] md:w-[90ch] px-2" value={newEntry.office_name} onChange={(e) => setNewEntry({ ...newEntry, office_name: e.target.value })} placeholder="事業所名" />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input className="h-8 w-32 px-2" value={newEntry.email} onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })} placeholder="Email" />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Input className="h-8 w-24 px-2" value={newEntry.postal_code ?? ''} onChange={(e) => setNewEntry({ ...newEntry, postal_code: e.target.value })} placeholder="郵便番号" />
              </TableCell>
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <div className="w-28 shrink-0">
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
              <TableCell className="px-1 py-1 whitespace-nowrap">
                <Button size="sm" onClick={handleAdd}>追加</Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}