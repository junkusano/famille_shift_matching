//app/portal/fax-sending/page.tsx
"use client"

import React, { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { useUserRole } from "@/context/RoleContext"

// =========================
// 定数
// =========================
const MAX_TOTAL_FILE_SIZE = 28 * 1024 * 1024

// =========================
// 型定義
// =========================
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

type Option = { value: string; label: string }

type FaximoSendResponse = {
  ok: boolean
  error?: string
  faximoResultCode?: string
  processKey?: string
  acceptedAt?: string
  faximoRequestId?: string
}

// =========================
// 汎用マルチセレクト（ネイティブ <select multiple> 版）
// =========================
function MultiSelect({
  placeholder,
  options,
  selected,
  onChange,
  emptyText = "データなし",
  size = 8,
}: {
  placeholder: string
  options: Option[]
  selected: string[]
  onChange: (values: string[]) => void
  emptyText?: string
  size?: number
}) {
  const allValues = options.map((o) => o.value)
  const handleChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
    const values = Array.from(e.target.selectedOptions).map((o) => o.value)
    onChange(values)
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground truncate" title={selected.join(", ") || placeholder}>
          {selected.length === 0 ? placeholder : `${placeholder}（${selected.length}）`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onChange(allValues)} disabled={options.length === 0}>
            全選択
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            クリア
          </Button>
        </div>
      </div>
      {options.length === 0 ? (
        <div className="text-xs text-muted-foreground px-1 py-2">{emptyText}</div>
      ) : (
        <select
          multiple
          size={size}
          value={selected}
          onChange={handleChange}
          className="w-full border rounded-md px-2 py-1 text-sm bg-background"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} title={opt.label}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export default function FaxSendingPage() {
  const role = useUserRole()

  // =========================
  // 状態
  // =========================
  const [faxList, setFaxList] = useState<FaxEntry[]>([])
  const [kinds, setKinds] = useState<ServiceKind[]>([])
  const [districts, setDistricts] = useState<PostalDistrict[]>([])

  const [selectedFaxes, setSelectedFaxes] = useState<FaxEntry[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)

  // 直近のバリデーション結果表示用
  const [fileWarning, setFileWarning] = useState<string>("")

  // =========================
  // フィルター（順番厳守: FAX → 事業所名 → エリア(複数) → 種別(複数) → クリア）
  // =========================
  const [qFax, setQFax] = useState("")
  const [qOffice, setQOffice] = useState("")
  const [qDistrict3, setQDistrict3] = useState<string[]>([]) // 複数（valueは郵便3桁）
  const [qKind, setQKind] = useState<string[]>([]) // 複数（valueはservice_kind_id）

  // =========================
  // 初期フェッチ
  // =========================
  useEffect(() => {
    void (async () => {
      await Promise.all([fetchKinds(), fetchDistricts(), fetchFaxList()])
    })()
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

  // =========================
  // 表示補完
  // =========================
  const districtMap = useMemo(() => new Map(districts.map(d => [d.postal_code_3, d.district])), [districts])
  const kindMap = useMemo(() => new Map(kinds.map(k => [k.id, k.label])), [kinds])

  const listWithLabels = useMemo(() => {
    return faxList.map(row => {
      const code3 = (row.postal_code ?? '').replace(/\D/g, '').slice(0, 3)
      const districtDisplay = row.postal_district ?? (code3 ? districtMap.get(code3) ?? null : null)
      const kindDisplay = row.service_kind_label ?? (row.service_kind_id ? kindMap.get(row.service_kind_id) ?? null : null)
      return { ...row, postal_district: districtDisplay, service_kind_label: kindDisplay }
    })
  }, [faxList, districtMap, kindMap])

  // =========================
  // フィルター適用
  // =========================
  const filtered = useMemo(() => {
    const fax = qFax.trim().toLowerCase()
    const office = qOffice.trim().toLowerCase()

    return listWithLabels.filter((row) => {
      if (fax && !row.fax.toLowerCase().includes(fax)) return false
      if (office && !row.office_name.toLowerCase().includes(office)) return false

      if (qDistrict3.length) {
        const code3 = (row.postal_code ?? '').replace(/\D/g, '').slice(0, 3)
        if (!qDistrict3.includes(code3)) return false
      }
      if (qKind.length) {
        if (!row.service_kind_id || !qKind.includes(row.service_kind_id)) return false
      }
      return true
    })
  }, [listWithLabels, qFax, qOffice, qDistrict3, qKind])

  // =========================
  // 選択系
  // =========================
  const toggleFax = (entry: FaxEntry) => {
    setSelectedFaxes((prev) => {
      const exists = prev.some((f) => f.id === entry.id)
      return exists ? prev.filter((f) => f.id !== entry.id) : [...prev, entry]
    })
  }

  const selectAllFiltered = () => {
    setSelectedFaxes((prev) => {
      const byId = new Map(prev.map(p => [p.id, p]))
      filtered.forEach(item => byId.set(item.id, item))
      return Array.from(byId.values())
    })
  }

  const clearSelected = () => setSelectedFaxes([])

  // =========================
  // ユーティリティ
  // =========================
  const formatBytes = (n: number) => {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(2)} MB`
  }

  // =========================
  // ファイル系（1MB超は除外して警告）
  // =========================
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files) return

    const picked = Array.from(e.target.files)

    const currentTotal = files.reduce(
      (sum, file) => sum + file.size,
      0
    )

    const pickedTotal = picked.reduce(
      (sum, file) => sum + file.size,
      0
    )

    if (currentTotal + pickedTotal > MAX_TOTAL_FILE_SIZE) {
      const message = [
        "添付ファイルの合計サイズが上限を超えています。",
        `上限: ${formatBytes(MAX_TOTAL_FILE_SIZE)}`,
        `現在: ${formatBytes(currentTotal)}`,
        `追加分: ${formatBytes(pickedTotal)}`,
      ].join("\n")

      setFileWarning(message)
      alert(message)
      e.currentTarget.value = ""
      return
    }

    setFiles((prev) => [...prev, ...picked])
    setFileWarning("")
    e.currentTarget.value = ""
  }

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  // =========================
  // 送信（30件超はOK/キャンセル確認、ファイルは念のため再チェック）
  // =========================
  const handleUploadAndSend = async () => {
    if (files.length === 0) {
      alert("送信するファイルを選んでください")
      return
    }

    if (selectedFaxes.length === 0) {
      alert("FAX送信先を選んでください")
      return
    }

    // faximoSilverは1回につき最大50件
    if (selectedFaxes.length > 50) {
      alert(
        `FAX送信先は1回につき最大50件です。\n現在 ${selectedFaxes.length} 件選択されています。`
      )
      return
    }

    // 念のためファイルサイズを再確認
    const totalFileSize = files.reduce(
      (sum, file) => sum + file.size,
      0
    )

    if (totalFileSize > MAX_TOTAL_FILE_SIZE) {
      alert(
        `添付ファイルの合計サイズが上限を超えています。\n` +
        `上限: ${formatBytes(MAX_TOTAL_FILE_SIZE)}\n` +
        `現在: ${formatBytes(totalFileSize)}`
      )
      return
    }


    // 同じFAX番号が複数事業所に登録されている場合の確認
    const normalizedFaxNumbers = selectedFaxes.map((entry) =>
      entry.fax.replace(/[\s()-]/g, "")
    )

    const duplicateFaxNumbers = normalizedFaxNumbers.filter(
      (faxNumber, index, array) => array.indexOf(faxNumber) !== index
    )

    if (duplicateFaxNumbers.length > 0) {
      const uniqueDuplicates = Array.from(new Set(duplicateFaxNumbers))

      alert(
        [
          "同じFAX番号が複数選択されています。",
          "重複したFAX番号は選択解除してから送信してください。",
          "",
          ...uniqueDuplicates.map((faxNumber) => `・${faxNumber}`),
        ].join("\n")
      )
      return
    }

    // 30件超の場合は従来どおり確認
    if (selectedFaxes.length > 30) {
      const confirmed = window.confirm(
        [
          `送信先が ${selectedFaxes.length} 件あります。`,
          "",
          "30件以上を一度に送る場合は、チャージが必要です。",
          "管理者まで連絡をお願いします。",
          "",
          "OKで送信 / キャンセルで中止",
        ].join("\n")
      )

      if (!confirmed) {
        return
      }
    }

    try {
      setUploading(true)

      const formData = new FormData()

      selectedFaxes.forEach((entry) => {
        const normalizedFaxNumber = entry.fax.replace(/[\s()-]/g, "")
        formData.append("faxNumbers", normalizedFaxNumber)
      })

      formData.append(
        "faxTargets",
        JSON.stringify(
          selectedFaxes.map((entry) => ({
            id: entry.id,
            fax: entry.fax.replace(/[\s()-]/g, ""),
            office_name: entry.office_name,
          }))
        )
      )

      // 添付ファイル
      files.forEach((file) => {
        formData.append("files", file, file.name)
      })

      // faximoSilver側の送信設定
      formData.append("subject", "FAX送信")
      formData.append("retryCount", "3")

      const response = await fetch("/api/faximo/send", {
        method: "POST",
        body: formData,
      })

      const result = (await response.json()) as FaximoSendResponse

      if (!response.ok || !result.ok) {
        const errorDetails = [
          result.error ?? "FAX送信処理に失敗しました",
          result.faximoResultCode
            ? `faximo結果コード: ${result.faximoResultCode}`
            : null,
        ]
          .filter(Boolean)
          .join("\n")

        throw new Error(errorDetails)
      }

      const successMessage = [
        "FAX送信を受け付けました。",
        "",
        `送信先: ${selectedFaxes.length}件`,
        `添付ファイル: ${files.length}件`,
        result.acceptedAt ? `受付日時: ${result.acceptedAt}` : null,
        result.faximoRequestId
          ? `受付ID: ${result.faximoRequestId}`
          : null,
        result.processKey
          ? `処理キー: ${result.processKey}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")

      alert(successMessage)

      setFiles([])
      setSelectedFaxes([])
      setFileWarning("")
    } catch (error) {
      console.error("[fax-sending] faximo send failed", error)

      alert(
        error instanceof Error
          ? error.message
          : "FAX送信処理に失敗しました"
      )
    } finally {
      setUploading(false)
    }
  }
  // =========================
  // オプション配列（HOOKは早期returnより前に定義）
  // =========================
  const districtOptions: Option[] = useMemo(() => districts.map(d => ({
    value: d.postal_code_3,
    label: `${d.district}（${d.postal_code_3}xx）`,
  })), [districts])

  const kindOptions: Option[] = useMemo(() => kinds.map(k => ({
    value: k.id,
    label: k.label,
  })), [kinds])

  // 早期returnはHOOK定義後に行う（HOOKの順序を崩さない）
  if (!["admin", "manager"].includes(role)) {
    return <div className="p-4 text-red-600">このページは管理者およびマネジャーのみがアクセスできます。</div>
  }

  // =========================
  // UI
  // =========================
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-bold">FAX送信</h1>

      {/* アップロードUI & ファイル一覧 */}
      <div className="space-y-2">
        <Input
          type="file"
          multiple
          onChange={handleFileChange}
          className="bg-yellow-50 focus-visible:ring-yellow-300 file:bg-yellow-100 file:text-yellow-800 file:font-medium file:px-3 file:py-1 file:rounded-md"
        />
        <div className="text-[11px] text-muted-foreground">
          ※ 添付ファイルの合計サイズ上限は28MBです。
        </div>
        {fileWarning && (
          <div className="text-xs text-red-600 whitespace-pre-wrap">{fileWarning}</div>
        )}
        <div className="space-y-1">
          {files.map((file, idx) => (
            <div key={idx} className="flex justify-between items-center border px-2 py-1 rounded">
              <span className="text-sm truncate max-w-sm" title={`${file.name}（${formatBytes(file.size)}）`}>
                {file.name}（{formatBytes(file.size)}）
              </span>
              <Button variant="ghost" onClick={() => handleRemoveFile(idx)}>削除</Button>
            </div>
          ))}
        </div>
      </div>

      {/* フィルター行: FAX / 事業所名 / エリア(複数) / 種別(複数) / クリア / 全選択 */}
      <div className="grid items-end gap-2 grid-cols-1 md:grid-cols-6 md:[grid-template-columns:15%_25%_18%_18%_auto_auto]">
        <div>
          <div className="text-[11px] text-muted-foreground">FAX</div>
          <Input className="h-8" value={qFax} onChange={(e) => setQFax(e.target.value)} placeholder="部分検索" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">事業所名</div>
          <Input className="h-8" value={qOffice} onChange={(e) => setQOffice(e.target.value)} placeholder="部分検索" />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">エリア（複数選択）</div>
          <MultiSelect
            placeholder="すべて"
            options={districtOptions}
            selected={qDistrict3}
            onChange={setQDistrict3}
            emptyText="エリアデータがありません"
          />
        </div>
        <div>
          <div className="text-[11px] text-muted-foreground">サービス種別（複数選択）</div>
          <MultiSelect
            placeholder="すべて"
            options={kindOptions}
            selected={qKind}
            onChange={setQKind}
            emptyText="種別がありません"
          />
        </div>
        <div className="md:justify-self-end">
          <Button size="sm" variant="secondary" onClick={() => { setQFax(""); setQOffice(""); setQDistrict3([]); setQKind([]) }}>クリア</Button>
        </div>
        <div className="md:justify-self-end">
          <Button size="sm" variant="outline" onClick={selectAllFiltered} disabled={filtered.length === 0}>全選択（絞り込み）</Button>
        </div>
      </div>

      {/* 一覧（district表示、emailはツールチップ） */}
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
        <Button
          onClick={handleUploadAndSend}
          disabled={
            uploading ||
            files.length === 0 ||
            selectedFaxes.length === 0 ||
            selectedFaxes.length > 50
          }
        >
          {uploading
            ? "FAX送信中..."
            : "FAXを送信する"}
        </Button>
        <div className="text-xs text-muted-foreground">
          送信先: {selectedFaxes.length} 件 / 添付: {files.length} 件

          {selectedFaxes.length > 50 ? (
            <span className="ml-2 text-red-600 font-medium">
              ※faximoSilverの上限は1回50件です。50件以下にしてください。
            </span>
          ) : selectedFaxes.length > 30 ? (
            <span className="ml-2 text-red-600">
              ※30件以上はチャージが必要です。管理者へ連絡してから送信してください。
            </span>
          ) : null}
        </div>
        {selectedFaxes.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearSelected}>選択解除</Button>
        )}
      </div>
    </div>
  )
}
