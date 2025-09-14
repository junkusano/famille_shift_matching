// app/portal/taimee-emp/page.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// 型定義
type Status = 'all' | 'in' | 'not'

interface TaimeeEmployeeWithEntry {
  period_month: string
  taimee_user_id: string
  normalized_phone: string
  entry_id: string | null
  in_entry: boolean | null
  // 表示に使う列（必要なら追加）
  姓?: string | null
  名?: string | null
  住所?: string | null
  性別?: string | null
  電話番号?: string | null
}

export default function TaimeeEmployeesPage() {
  const router = useRouter()
  const [period, setPeriod] = useState<string>(defaultPeriod())
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('all')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TaimeeEmployeeWithEntry[]>([])
  const [q, setQ] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function defaultPeriod() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${y}-${m}`
  }

  async function fetchList() {
    if (!period) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ period, status })
      const r = await fetch(`/api/taimee-emp/list?${params.toString()}`, { cache: 'no-store' })
      const j: { ok: boolean; items: TaimeeEmployeeWithEntry[]; error?: string } = await r.json()
      if (!j.ok) throw new Error(j.error || 'Failed')
      setItems(j.items)
    } catch (e) {
      console.error(e)
      setMessage(e instanceof Error ? e.message : '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, status])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setMessage('CSVファイルを選択してください'); return }
    setLoading(true)
    setMessage(null)
    try {
      const fd = new FormData()
      fd.append('period', period)
      fd.append('file', file)
      const r = await fetch('/api/taimee-emp/upload', { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'アップロード失敗')
      setMessage(`取り込み完了：${j.count}件 / 月=${j.period_month}`)
      await fetchList()
    } catch (e) {
      console.error(e)
      setMessage(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    return items.filter((it) => {
      const cols = [it['姓'], it['名'], it['住所'], it['性別'], it['電話番号']]
      return cols.some((v) => String(v || '').toLowerCase().includes(s))
    })
  }, [items, q])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">タイミー従業員（月次）アップロード</h1>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={onUpload} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <label className="text-sm">対象月</label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
            </div>
            <div className="md:col-span-2 space-y-1">
              <label className="text-sm">CSVファイル</label>
              <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            </div>
            <div>
              <Button type="submit" disabled={loading}>{loading ? '処理中…' : 'アップロード'}</Button>
            </div>
          </form>
          {message && <p className="text-sm text-muted-foreground mt-2">{message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <div className="flex gap-2 items-center">
              <span className="text-sm">表示：</span>
              <div className="w-[160px]">
                <Select value={status} onValueChange={(v: Status) => setStatus(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="すべて" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">すべて</SelectItem>
                    <SelectItem value="in">Entryあり</SelectItem>
                    <SelectItem value="not">Entryなし</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="w-full md:w-80">
              <Input placeholder="氏名・住所・電話など検索" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          <div className="overflow-auto border rounded-xl">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">姓</th>
                  <th className="text-left p-2">名</th>
                  <th className="text-left p-2">電話</th>
                  <th className="text-left p-2">在籍</th>
                  <th className="text-left p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const inEntry = !!it.in_entry
                  const entryId = it.entry_id
                  return (
                    <tr key={`${it.period_month}-${it.taimee_user_id}`} className="border-t">
                      <td className="p-2">{it['姓']}</td>
                      <td className="p-2">{it['名']}</td>
                      <td className="p-2">{it['電話番号']}</td>
                      <td className="p-2">
                        {inEntry ? (
                          <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">Entryあり</span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">Entryなし</span>
                        )}
                      </td>
                      <td className="p-2">
                        {inEntry && entryId ? (
                          <Button variant="secondary" size="sm" onClick={() => router.push(`/portal/entry-detail/${entryId}`)}>
                            entry-detail へ
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" disabled>
                            entry-detail へ
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">データがありません</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">※ 在籍判定は form_entries.phone とアップロードデータの正規化済み電話番号（数字のみ）で突合しています。</p>
        </CardContent>
      </Card>
    </div>
  )
}
