'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUserRole } from '@/context/RoleContext'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient';

// 型定義
type FaxEntry = {
  fax: string
  office_name: string
  service_kind: string
}

export default function FaxSendingPage() {
  const role = useUserRole()
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [selectedFaxes, setSelectedFaxes] = useState<FaxEntry[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
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
    if (!e.target.files) return
    setFiles(prev => [...prev, ...Array.from(e.target.files)])
  }

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleUploadAndSend = async () => {
    if (files.length === 0 || selectedFaxes.length === 0) {
      alert('ファイルとFAX送信先を選んでください');
      return;
    }

    try {
      setUploading(true);
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', `fax_${Date.now()}_${file.name}`);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await res.json();
        if (result.url) uploadedUrls.push(result.url);
        else console.error('アップロード失敗:', result);
      }

      if (uploadedUrls.length === 0) {
        alert('アップロードに失敗しました');
        return;
      }

      const session = await supabase.auth.getSession();
      const authUserId = session.data?.session?.user?.id;
      if (!authUserId) throw new Error('ログインユーザー未取得');



      const { data: userData, error: userError } = await supabase
        .from('user_entry_united_view')
        .select('manager_auth_user_id, manager_user_id,user_id')
        .eq('auth_user_id', authUserId)
        .eq("group_type", "人事労務サポートルーム")
        .limit(1)
        .single(); // 最初の1件を取得（2行あってもOK）

      if (userError || !userData?.manager_user_id) {
        throw new Error('マネージャー情報取得エラー');
      }

      const { error: insertError } = await supabase.from('rpa_command_requests').insert({
        template_id: templateId,
        requester_id: authUserId,
        approver_id: userData.manager_auth_user_id,
        status: 'approved',
        request_details: {
          file_urls: uploadedUrls,
          fax_targets: selectedFaxes,
          requester_user_id: userData.user_id,
        },
      });

      if (insertError) {
        throw new Error(`送信に失敗しました: ${insertError.message}`);
      }

      alert('FAX送信リクエストを送信しました');
      setFiles([]);
      setSelectedFaxes([]);
    } catch (e) {
      console.error('送信エラー:', e);
      alert('送信中にエラーが発生しました');
    } finally {
      setUploading(false);
    }
  };


  if (!['admin', 'manager'].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">FAX送信リクエスト</h1>

      {/* ファイルアップロードUI */}
      <Input
        type="file"
        multiple onChange={handleFileChange}
        className="bg-yellow-50
    border-yellow-200
    focus-visible:ring-yellow-300
    file:bg-yellow-100 file:text-yellow-800 file:font-medium file:px-3 file:py-1 file:rounded-md
  "/>
      <div className="space-y-1">
        {files.map((file, idx) => (
          <div key={idx} className="flex justify-between items-center border px-2 py-1 rounded">
            <span className="text-sm truncate max-w-sm">{file.name}</span>
            <Button variant="ghost" onClick={() => handleRemoveFile(idx)}>削除</Button>
          </div>
        ))}
      </div>

      {/* FAX送信先一覧 */}
      <div>
        <Input
          type="text"
          placeholder="事業所名で検索"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-2
    bg-yellow-50
    border-yellow-200
    placeholder:text-yellow-900/60
    focus-visible:ring-yellow-300
  "
        />

        <div className="border rounded overflow-y-auto" style={{ maxHeight: 300 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>FAX</TableHead>
                <TableHead>事業所名</TableHead>
                <TableHead>サービス種別</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faxList.filter(entry =>
                entry.office_name.includes(searchTerm)
              ).map(entry => {
                const selected = selectedFaxes.some(f => f.fax === entry.fax)
                return (
                  <TableRow
                    key={entry.fax}
                    onClick={() => toggleFax(entry)}
                    className={`cursor-pointer ${selected ? 'bg-blue-100' : ''}`}
                  >
                    <TableCell>{entry.fax}</TableCell>
                    <TableCell>{entry.office_name}</TableCell>
                    <TableCell>{entry.service_kind}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Button onClick={handleUploadAndSend} disabled={uploading}>
        {uploading ? '送信中...' : 'FAX送信リクエストを送る'}
      </Button>
    </div>
  )
}
