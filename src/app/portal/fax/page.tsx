'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'

type FaxEntry = {
  fax: string
  office_name: string
  email: string
  service_kind: string
}

export default function FaxPage() {
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [newEntry, setNewEntry] = useState<FaxEntry>({
    fax: '',
    office_name: '',
    email: '',
    service_kind: '',
  })

  const fetchFaxList = async () => {
    const res = await fetch('/api/fax')
    const data = await res.json()
    setFaxList(data)
  }

  useEffect(() => {
    fetchFaxList()
  }, [])

  const handleEditChange = (index: number, key: keyof FaxEntry, value: string) => {
    const updated = [...faxList]
    updated[index][key] = value
    setFaxList(updated)
  }

  const handleSave = async (entry: FaxEntry) => {
    const res = await fetch(`/api/fax/${entry.fax}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (res.ok) {
      fetchFaxList()
    } else {
      alert('保存に失敗しました')
    }
  }

  const handleDelete = async (fax: string) => {
    const res = await fetch(`/api/fax/${fax}`, { method: 'DELETE' })
    if (res.ok) {
      fetchFaxList()
    } else {
      alert('削除に失敗しました')
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
      setNewEntry({ fax: '', office_name: '', email: '', service_kind: '' })
      fetchFaxList()
    } else {
      alert('追加に失敗しました')
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
            <TableHead>サービス種別</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faxList.map((entry, index) => (
            <TableRow key={entry.fax}>
              <TableCell>
                <Input
                  className="h-8"
                  value={entry.fax}
                  onChange={(e) => handleEditChange(index, 'fax', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  value={entry.office_name}
                  onChange={(e) => handleEditChange(index, 'office_name', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  value={entry.email}
                  onChange={(e) => handleEditChange(index, 'email', e.target.value)}
                />
              </TableCell>
              <TableCell>
                <Input
                  className="h-8"
                  value={entry.service_kind}
                  onChange={(e) => handleEditChange(index, 'service_kind', e.target.value)}
                />
              </TableCell>
              <TableCell className="space-x-1">
                <Button size="sm" onClick={() => handleSave(entry)}>保存</Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.fax)}>×</Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input
                className="h-8"
                value={newEntry.fax}
                onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })}
                placeholder="新規FAX"
              />
            </TableCell>
            <TableCell>
              <Input
                className="h-8"
                value={newEntry.office_name}
                onChange={(e) => setNewEntry({ ...newEntry, office_name: e.target.value })}
                placeholder="事業所名"
              />
            </TableCell>
            <TableCell>
              <Input
                className="h-8"
                value={newEntry.email}
                onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })}
                placeholder="Email"
              />
            </TableCell>
            <TableCell>
              <Input
                className="h-8"
                value={newEntry.service_kind}
                onChange={(e) => setNewEntry({ ...newEntry, service_kind: e.target.value })}
                placeholder="サービス種別"
              />
            </TableCell>
            <TableCell>
              <Button size="sm" onClick={handleAdd}>追加</Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
