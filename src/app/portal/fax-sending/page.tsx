"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { useUserRole } from "@/context/RoleContext"
import { supabase } from "@/lib/supabaseClient"

type FaxEntry = {
  id: string
  fax: string
  office_name: string
  email: string
  postal_code: string | null
  postal_district?: string | null // APIが返す場合の表示用
  service_kind_id: string | null
  service_kind_label?: string | null
}

type ServiceKind = { id: string; label: string; sort_order: number }
type PostalDistrict = { postal_code_3: string; district: string }

export default function FaxSendingPage() {
  const role = useUserRole()
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [kinds, setKinds] = useState<ServiceKind[]>([])
  const [districts, setDistricts] = useState<PostalDistrict[]>([])
  const [selectedFaxes, setSelectedFaxes] = useState<FaxEntry[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  // ===== フィルター（順番厳守: FAX → 事業所名 → エリア → 種別 → クリア） =====
  const [qFax, setQFax] = useState("")
  const [qOffice, setQOffice] = useState("")
  const [qDistrict3, setQDistrict3] = useState("") // valueは常に郵便3桁
  const [qKind, setQKind] = useState<string>("")

  useEffect(() => {
    fetchKinds()
    fetchDistricts()
    fetchFaxList()
  }, [])

  const fetchFaxList = async () => {
    const res = await fetch("/api/fax")
    if (!res.ok) return
    const data = (await res.json()) as FaxEntry[]
    setFaxList(data)
  }

  const fetchKinds = async () => {
    const res = await fetch("/api/service-kinds")
    if (!res.ok) return
    const data = (await res.json()) as ServiceKind[]
    setKinds(data)
  }

  const fetchDistricts = async () => {
    const res = await fetch("/api/postal-districts")
    if (!res.ok) return
    const data = (await res.json()) as PostalDistrict[]
    setDistricts(data)
  }

  // 郵便3桁→district名 逆引きマップ
  const districtMap = useMemo(() => new Map(districts.map(d => [d.postal_code_3, d.district])), [districts])

  // 一覧にdistrict名を付与（APIが返していない場合のフォールバック）
  const listWithDistrict = useMemo(() => {
    return faxList.map(row => {
      const code3 = (row.postal_code ?? '').replace(/\D/g, '').slice(0, 3)
      const display = row.postal_district ?? (code3 ? districtMap.get(code3) ?? null : null)
      return { ...row, postal_district: display }
    })
  }, [faxList, districtMap])

  // フィルター適用（郵便は3桁完全一致）
  const filtered = useMemo(() => {
    const fax = qFax.trim().toLowerCase()
    const office = qOffice.trim().toLowerCase()
    const kind = qKind
    const district3 = qDistrict3

    return listWithDistrict.filter((row) => {
      if (fax && !row.fax.toLowerCase().includes(fax)) return false
      if (office && !row.office_name.toLowerCase().includes(office)) return false
      if (district3) {
        const code3 = (row.postal_code ?? '').replace(/\D/g, '').slice(0, 3)
        if (code3 !== district3) return false
      }
      if (kind && row.service_kind_id !== kind) return false
      return true
    })
  }, [listWithDistrict, qFax, qOffice, qDistrict3, qKind])

  const toggleFax = (entry: FaxEntry) => {
    setSelectedFaxes((prev) => {
      const exists = prev.some((f) => f.id === entry.id)
      return exists ? prev.filter((f) => f.id !== entry.id) : [...prev, entry]
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return
    setFiles((prev) => [...prev, ...Array.from(e.target.files)])
  }

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUploadAndSend = async () => {
    if (files.length === 0 || selectedFaxes.length === 0) {
      alert("ファイルとFAX送信先を選んでください")
      return
    }
    try {
      setUploading(true)
      const uploadedUrls: string[] = []

      for (const file of files) {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("filename", `fax_${Date.now()}_${file.name}`)
        const res = await fetch("/api/upload", { method: "POST", body: formData })
        const result = await res.json()
        if (result.url) uploadedUrls.push(result.url)
      }

      const session = await supabase.auth.getSession()
      const authUserId = session.data?.session?.user?.id
      if (!authUserId) throw new Error("ログインユーザー未取得")

      const { data: userData, error: userError } = await supabase
        .from("user_entry_united_view")
        .select("manager_auth_user_id, manager_user_id, user_id")
        .eq("auth_user_id", authUserId)
        .eq("group_type", "人事労務サポートルーム")
        .limit(1)
        .single()

      if (userError || !userData?.manager_user_id) throw new Error("マネージャー情報取得エラー")

      const templateId = "2ca8aa86-e907-444c-9cf2-aec69563f9f0"

      const { error: insertError } = await supabase.from("rpa_command_requests").insert({
        template_id: templateId,
        requester_id: authUserId,
        approver_id: userData.manager_auth_user_id,
        status: "approved",
        request_details: {
          file_urls: uploadedUrls,
          fax_targets: selectedFaxes,
          requester_user_id: userData.user_id,
          filter_snapshot: { qFax, qOffice, qDistrict3, qKind },
        },
      })

      if (insertError) throw new Error(`送信に失敗しました: ${insertError.message}`)

      alert("FAX送信リクエストを送信しました")
      setFiles([])
      setSelectedFaxes([])
    } finally {
      setUploading(false)
    }
  }

  if (!["admin", "manager"].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">FAX送信リクエスト</h1>

      {/* ===== アップロードUI & ファイル一覧 ===== */}
      <Input type="file" multiple onChange={handleFileChange} className="bg-yellow-50 focus-visible:ring-yellow-300 file:bg-yellow-100 file:text-yellow-800 file:font-medium file:px-3 file:py-1 file:rounded-md" />
      <div className="space-y-1">
        {files.map((file, idx) => (
          <div key={idx} className="flex justify-between items-center border px-2 py-1 rounded">
            <span className="text-sm truncate max-w-sm">{file.name}</span>
            <Button variant="ghost" onClick={() => handleRemoveFile(idx)}>削除</Button>
          </div>
        ))}
      </div>

      {/* ===== フィルター行: FAX / 事業所名 / エリア(Select: district表示, value=3桁) / 種別 / クリア ===== */}
      <div className="grid items-end gap-2 grid-cols-1 md:grid-cols-5 md:[grid-template-columns:15%_30%_20%_20%_auto]">
        <div>
          <div className="text-[11px] text-muted-foreground">FAX</div>
          <Input className="h-8" value={qFax} onChange={(e) => setQFax(e.target.value)} placeholder="部分検索" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">事業所名</div>
          <Input className="h-8" value={qOffice} onChange={(e) => setQOffice(e.target.value)} placeholder="部分検索" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">エリア</div>
          <Select value={qDistrict3} onValueChange={(v) => setQDistrict3(v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {districts.map((d) => (
                <SelectItem key={d.postal_code_3} value={d.postal_code_3}>
                  {d.district}（{d.postal_code_3}xx）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">サービス種別</div>
          <Select value={qKind} onValueChange={(v) => setQKind(v)}>
            <SelectTrigger className="h-8">
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">すべて</SelectItem>
              {kinds.map((k) => (
                <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:justify-self-end">
          <Button size="sm" variant="secondary" onClick={() => { setQFax(""); setQOffice(""); setQDistrict3(""); setQKind("") }}>クリア</Button>
        </div>
      </div>

      {/* ===== 一覧（district表示、emailはツールチップ） ===== */}
      <div className="border rounded overflow-y-auto" style={{ maxHeight: 360 }}>
        <Table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "20%" }} />
            <col style={{ width: "40%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>FAX</TableHead>
              <TableHead>事業所名</TableHead>
              <TableHead>郵便（エリア）</TableHead>
              <TableHead>サービス種別</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => {
              const selected = selectedFaxes.some((f) => f.id === entry.id)
              return (
                <TableRow
                  key={entry.id}
                  onClick={() => toggleFax(entry)}
                  className={`cursor-pointer ${selected ? 'bg-blue-100' : ''}`}
                  title={`${entry.office_name} / ${entry.email ?? ''}`}
                >
                  <TableCell className="truncate">{entry.fax}</TableCell>
                  <TableCell className="truncate">{entry.office_name}</TableCell>
                  <TableCell className="truncate">{entry.postal_district ?? ''}</TableCell>
                  <TableCell className="truncate">{entry.service_kind_label ?? ''}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleUploadAndSend} disabled={uploading || files.length === 0 || selectedFaxes.length === 0}>
          {uploading ? "送信中..." : "FAX送信リクエストを送る"}
        </Button>
        <div className="text-xs text-muted-foreground">送信先: {selectedFaxes.length} 件 / 添付: {files.length} 件</div>
      </div>
    </div>
  )
}
