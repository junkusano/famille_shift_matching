'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserRole } from '@/context/RoleContext'
import { supabase } from '@/lib/supabaseClient'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

type FaxEntry = {
  fax: string
  office_name: string
  service_kind: string
}

export default function FaxSendingPage() {
  const role = useUserRole()
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [selectedFaxes, setSelectedFaxes] = useState<FaxEntry[]>([])
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)

  const templateId = '2ca8aa86-e907-444c-9cf2-aec69563f9f0'

  useEffect(() => {
    fetchFaxList()
  }, [])

  const fetchFaxList = async () => {
    const res = await fetch('/api/fax')
    const data = await res.json()
    setFaxList(data)
  }

  const toggleFax = (entry: FaxEntry) => {
    setSelectedFaxes(prev => {
      const exists = prev.some(f => f.fax === entry.fax)
      return exists ? prev.filter(f => f.fax !== entry.fax) : [...prev, entry]
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(e.target.files)
  }

  const handleUploadAndSend = async () => {
    if (!files || selectedFaxes.length === 0) {
      alert('ファイルとFAX送信先を選んでください')
      return
    }

    setUploading(true)
    const uploadedUrls: string[] = []

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('filename', `fax_${Date.now()}_${file.name}`)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await res.json()
      if (result.url) {
        uploadedUrls.push(result.url)
      }
    }

    if (uploadedUrls.length === 0) {
      alert('アップロードに失敗しました')
      setUploading(false)
      return
    }

    const requestDetails = {
      file_urls: uploadedUrls,
      fax_targets: selectedFaxes,
    }

    const res = await fetch('/api/rpa_request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_id: templateId,
        request_details: requestDetails,
      }),
    })

    if (res.ok) {
      alert('FAX送信リクエストを送信しました')
      setFiles(null)
      setSelectedFaxes([])
    } else {
      alert('送信に失敗しました')
    }

    setUploading(false)
  }

  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">FAX送信リクエスト</h1>

      <div>
        <Input type="file" multiple onChange={handleFileChange} />
      </div>

      <div>
        <h2 className="font-semibold mb-2">送信先FAX一覧（複数選択可）</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>FAX</TableHead>
              <TableHead>事業所名</TableHead>
              <TableHead>サービス種別</TableHead>
              <TableHead>選択</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {faxList.map(entry => (
              <TableRow key={entry.fax}>
                <TableCell>{entry.fax}</TableCell>
                <TableCell>{entry.office_name}</TableCell>
                <TableCell>{entry.service_kind}</TableCell>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedFaxes.some(f => f.fax === entry.fax)}
                    onChange={() => toggleFax(entry)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Button onClick={handleUploadAndSend} disabled={uploading}>
        {uploading ? '送信中...' : 'FAX送信リクエストを送る'}
      </Button>
    </div>
  )
}
