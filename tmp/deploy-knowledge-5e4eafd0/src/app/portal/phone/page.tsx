'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type PhoneEntry = {
  phone: string
  name: string
}

export default function PhonePage() {
  const [phoneList, setPhoneList] = useState<PhoneEntry[]>([])
  const [editingPhone, setEditingPhone] = useState<string | null>(null)
  const [newEntry, setNewEntry] = useState<PhoneEntry>({ phone: '', name: '' })

  const fetchPhoneList = async () => {
    const res = await fetch('/api/phone')
    const data = await res.json()
    setPhoneList(data)
  }

  useEffect(() => {
    fetchPhoneList()
  }, [])

  const handleAdd = async () => {
    const res = await fetch('/api/phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newEntry),
    })

    if (res.ok) {
      setNewEntry({ phone: '', name: '' })
      fetchPhoneList()
    } else {
      alert('追加に失敗しました')
    }
  }

  const handleSave = async (entry: PhoneEntry) => {
    const res = await fetch('/api/phone', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (res.ok) {
      setEditingPhone(null)
      fetchPhoneList()
    } else {
      alert('保存に失敗しました')
    }
  }

  const handleDelete = async (phone: string) => {
    const res = await fetch('/api/phone', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (res.ok) {
      fetchPhoneList()
    } else {
      alert('削除に失敗しました')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">電話帳</h1>

      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <label className="block text-sm font-medium">電話番号</label>
          <Input
            value={newEntry.phone}
            onChange={e => setNewEntry({ ...newEntry, phone: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">名前</label>
          <Input
            value={newEntry.name}
            onChange={e => setNewEntry({ ...newEntry, name: e.target.value })}
          />
        </div>
        <Button onClick={handleAdd}>追加</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>電話番号</TableHead>
            <TableHead>名前</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {phoneList.map(entry => (
            <TableRow key={entry.phone}>
              <TableCell>{entry.phone}</TableCell>
              <TableCell>
                {editingPhone === entry.phone ? (
                  <Input
                    value={entry.name}
                    onChange={e =>
                      setPhoneList(prev =>
                        prev.map(p => (p.phone === entry.phone ? { ...p, name: e.target.value } : p))
                      )
                    }
                  />
                ) : (
                  entry.name
                )}
              </TableCell>
              <TableCell className="flex gap-2">
                {editingPhone === entry.phone ? (
                  <Button size="sm" onClick={() => handleSave(entry)}>保存</Button>
                ) : (
                  <Button size="sm" onClick={() => setEditingPhone(entry.phone)}>編集</Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.phone)}>削除</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
