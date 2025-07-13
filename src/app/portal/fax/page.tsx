'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

  const [isEditingIndex, setIsEditingIndex] = useState<number | null>(null)
  const [editEntry, setEditEntry] = useState<FaxEntry>({
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

  const handleAdd = async () => {
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

  const handleEdit = (index: number) => {
    setIsEditingIndex(index)
    setEditEntry({ ...faxList[index] })
  }

  const handleCancelEdit = () => {
    setIsEditingIndex(null)
  }

  const handleSaveEdit = async () => {
    const res = await fetch(`/api/fax`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editEntry),
    })
    if (res.ok) {
      setIsEditingIndex(null)
      fetchFaxList()
    } else {
      alert('更新に失敗しました')
    }
  }

  const handleDelete = async (fax: string) => {
    if (!confirm('削除してよろしいですか？')) return
    const res = await fetch(`/api/fax?fax=${fax}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      fetchFaxList()
    } else {
      alert('削除に失敗しました')
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">FAX電話帳</h1>
        <Dialog>
          <DialogTrigger asChild>
            <Button>新規追加</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>FAX先を追加</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>FAX番号</Label>
              <Input
                value={newEntry.fax}
                onChange={(e) => setNewEntry({ ...newEntry, fax: e.target.value })}
              />
              <Label>事業所名</Label>
              <Input
                value={newEntry.office_name}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, office_name: e.target.value })
                }
              />
              <Label>メール</Label>
              <Input
                value={newEntry.email}
                onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })}
              />
              <Label>サービス種別</Label>
              <Input
                value={newEntry.service_kind}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, service_kind: e.target.value })
                }
              />
              <Button className="mt-2 w-full" onClick={handleAdd}>
                追加
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table className="w-full text-sm">
        <TableHeader>
          <TableRow>
            <TableHead>FAX</TableHead>
            <TableHead>事業所名</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>サービス種別</TableHead>
            <TableHead className="w-28 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faxList.map((entry, index) => (
            <TableRow key={entry.fax}>
              {isEditingIndex === index ? (
                <>
                  <TableCell>
                    <Input
                      value={editEntry.fax}
                      onChange={(e) =>
                        setEditEntry({ ...editEntry, fax: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editEntry.office_name}
                      onChange={(e) =>
                        setEditEntry({ ...editEntry, office_name: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editEntry.email}
                      onChange={(e) =>
                        setEditEntry({ ...editEntry, email: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editEntry.service_kind}
                      onChange={(e) =>
                        setEditEntry({ ...editEntry, service_kind: e.target.value })
                      }
                    />
                  </TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={handleSaveEdit}>
                      💾
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                      ×
                    </Button>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{entry.fax}</TableCell>
                  <TableCell>{entry.office_name}</TableCell>
                  <TableCell>{entry.email}</TableCell>
                  <TableCell>{entry.service_kind}</TableCell>
                  <TableCell className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(index)}
                    >
                      編集
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(entry.fax)}
                    >
                      🗑️
                    </Button>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
