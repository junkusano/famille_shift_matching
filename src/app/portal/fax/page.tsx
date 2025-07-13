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
  const [editFax, setEditFax] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState<FaxEntry | null>(null)

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

  const handleEdit = (fax: string) => {
    const target = faxList.find((e) => e.fax === fax)
    if (target) {
      setEditFax(fax)
      setEditEntry({ ...target })
    }
  }

  const handleUpdate = async () => {
    if (!editEntry) return
    const res = await fetch('/api/fax', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editEntry),
    })
    if (res.ok) {
      setEditFax(null)
      fetchFaxList()
    } else {
      alert('更新に失敗しました')
    }
  }

  const handleDelete = async (fax: string) => {
    if (!confirm('本当に削除しますか？')) return
    const res = await fetch('/api/fax', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fax }),
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
                onChange={(e) =>
                  setNewEntry({ ...newEntry, fax: e.target.value })
                }
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
                onChange={(e) =>
                  setNewEntry({ ...newEntry, email: e.target.value })
                }
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

      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead>FAX</TableHead>
            <TableHead>事業所名</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>サービス種別</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faxList.map((entry) => (
            <TableRow key={entry.fax}>
              {editFax === entry.fax && editEntry ? (
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
                        setEditEntry({
                          ...editEntry,
                          office_name: e.target.value,
                        })
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
                        setEditEntry({
                          ...editEntry,
                          service_kind: e.target.value,
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={handleUpdate}>
                      ✓
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditFax(null)}
                    >
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
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(entry.fax)}
                    >
                      編集
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(entry.fax)}
                    >
                      削除
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
