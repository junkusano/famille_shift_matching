// =============================
// app/portal/taimee-emp/page.tsx（改修版 / 依存最小化）
//  - ブラック/メモ/送信しない のインライン編集（保存ボタン付き）
//  - メモ列と操作列の幅を従来比2倍に調整
//  - 最終送信文面の編集、プレビュー、一斉送信
//  - 最終送信日（last_sent_at）表示
//  - 通知は 'sonner' 依存を外し、軽量 notify に置換
// =============================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

// ---- 軽量通知（sonner無し版） ----
const notify = {
  success: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
  error: (msg: string) => (typeof window !== 'undefined' ? window.alert(`エラー: ${msg}`) : void 0),
  message: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
}

// ===== Types =====
type Status = 'all' | 'in' | 'not'
type BlackFilter = 'all' | 'only' | 'exclude'

interface TaimeeEmployeeWithEntry {
  period_month: string
  taimee_user_id: string
  normalized_phone: string | null
  entry_id: string | null
  in_entry: boolean | null
  black_list?: boolean | null
  send_disabled?: boolean | null
  memo?: string | null
  last_sent_at?: string | null
  姓?: string | null
  名?: string | null
  住所?: string | null
  性別?: string | null
  電話番号?: string | null
}

interface RowEditState {
  black_list?: boolean
  send_disabled?: boolean
  memo?: string
}

export default function Page() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<TaimeeEmployeeWithEntry[]>([])
  const [message, setMessage] = useState<string | null>(null)

  // --- 既存列フィルター
  const [fPeriod, setFPeriod] = useState('')
  const [fLast, setFLast] = useState('')
  const [fFirst, setFFirst] = useState('')
  const [fPhone, setFPhone] = useState('')

  // --- 追加フィルター
  const [fEntry, setFEntry] = useState<Status>('all')
  const [fBlack, setFBlack] = useState<BlackFilter>('all')
  const [fMemo, setFMemo] = useState('')

  // --- インライン編集の一時バッファ（変更分のみ保持）
  const [drafts, setDrafts] = useState<Record<string, RowEditState>>({})

  // --- SMS 送信関連
  const [smsBody, setSmsBody] = useState('いつもありがとうございます。ファミーユ（施恩）です。新しいお仕事のご案内です。ご都合合えばご返信ください。')
  const [includeBlack, setIncludeBlack] = useState(false)

  async function fetchList() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        status: fEntry,
        black: fBlack,
        memo: fMemo,
      })
      const r = await fetch(`/api/taimee-emp/list?${params}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Failed to load')
      setItems(j.items as TaimeeEmployeeWithEntry[])
    } catch (e) {
      const msg = e instanceof Error ? e.message : '読み込みに失敗しました'
      setMessage(msg)
      notify.error(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchList() }, [fEntry, fBlack, fMemo])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setMessage('CSVファイルを選択してください'); return }
    setLoading(true); setMessage(null)
    try {
      const fd = new FormData()
      fd.append('period', '') // period 月箱は廃止（サーバ側で自動判定でも可）
      fd.append('file', file)
      const r = await fetch('/api/taimee-emp/upload', { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'アップロード失敗')
      notify.success(`取り込み完了：${j.count}件`)
      await fetchList()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'アップロードに失敗しました')
    } finally { setLoading(false) }
  }

  // --- 行の編集値を更新
  function updateDraft(key: string, patch: RowEditState) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  // --- 保存（変更分のみ一括）
  async function onSaveEdits() {
    const payload = Object.entries(drafts).map(([key, v]) => ({ key, ...v }))
    if (payload.length === 0) { notify.message('変更はありません'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/taimee-emp/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: payload }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || '保存に失敗しました')
      notify.success(`保存しました（${j.updated}件）`)
      setDrafts({})
      await fetchList()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '保存に失敗しました')
    } finally { setLoading(false) }
  }

  // --- 送信対象の抽出
  const filtered = useMemo(() => {
    const p = fPeriod.trim().toLowerCase()
    const ln = fLast.trim().toLowerCase()
    const fn = fFirst.trim().toLowerCase()
    const ph = fPhone.trim().toLowerCase()
    const memo = fMemo.trim().toLowerCase()

    return items.filter((it) => {
      if (fEntry === 'in' && !it.in_entry) return false
      if (fEntry === 'not' && it.in_entry) return false

      const isBlack = !!it.black_list
      if (fBlack === 'only' && !isBlack) return false
      if (fBlack === 'exclude' && isBlack) return false

      if (memo && !String(it.memo ?? '').toLowerCase().includes(memo)) return false
      if (p && !String(it.period_month ?? '').slice(0, 7).toLowerCase().includes(p)) return false
      if (ln && !String(it['姓'] ?? '').toLowerCase().includes(ln)) return false
      if (fn && !String(it['名'] ?? '').toLowerCase().includes(fn)) return false
      if (ph && !String(it['電話番号'] ?? '').toLowerCase().includes(ph)) return false
      return true
    })
  }, [items, fEntry, fBlack, fMemo, fPeriod, fLast, fFirst, fPhone])

  const recipientsForSend = useMemo(() => {
    return filtered.filter((it) => {
      const draft = drafts[rowKey(it)]
      const sendDisabled = draft?.send_disabled ?? it.send_disabled
      const black = draft?.black_list ?? it.black_list
      if (sendDisabled) return false
      if (!includeBlack && black) return false
      const phone = it.normalized_phone || it.電話番号
      return !!phone
    })
  }, [filtered, drafts, includeBlack])

  function rowKey(it: TaimeeEmployeeWithEntry) {
    // 主キー：period + taimee_user_id（CSVの粒度が月別のため）
    return `${it.period_month}__${it.taimee_user_id}`
  }

  function renderPreview(count: number) {
    const sample = recipientsForSend[0]
    if (!sample) return '（プレビューなし）'
    const title = `${sample['姓'] ?? ''}${sample['名'] ?? ''}様\n${smsBody}`
    return `宛先数：${count}件\n---\n${title}`
  }

  async function onBulkSend() {
    if (recipientsForSend.length === 0) { notify.message('送信対象がありません'); return }
    if (!confirm(`本当に ${recipientsForSend.length} 件へ送信しますか？`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/taimee-emp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: smsBody,
          recipients: recipientsForSend.map((it) => ({
            key: rowKey(it),
            phone: it.normalized_phone || it.電話番号,
            last: it['姓'] ?? '',
            first: it['名'] ?? '',
            period_month: it.period_month,
            taimee_user_id: it.taimee_user_id,
          })),
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || '送信に失敗しました')
      notify.success(`送信完了：成功 ${j.success} / 失敗 ${j.failed}`)
      await fetchList()
    } catch (e) {
      notify.error(e instanceof Error ? e.message : '送信に失敗しました')
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">タイミー従業員（全期間）アップロード＆一覧／一斉SMS</h1>

      {/* アップロード */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={onUpload} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
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

      {/* 最終文面編集＆送信 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">フィルタ後：{filtered.length} 件 ／ 送信対象：{recipientsForSend.length} 件</div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeBlack} onCheckedChange={(v) => setIncludeBlack(!!v)} />ブラックも含める</label>
              <Button onClick={onBulkSend} disabled={loading || recipientsForSend.length === 0}>一斉送信</Button>
            </div>
          </div>
          <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className="min-h-[120px]" placeholder="本文（敬称は自動で付与：『姓名様』\nの後に本文が続きます）" />
          <pre className="p-3 bg-muted rounded text-xs whitespace-pre-wrap">{renderPreview(recipientsForSend.length)}</pre>
        </CardContent>
      </Card>

      {/* 一覧（インライン編集可） */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-[1280px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">period_month</th>
                  <th className="text-left p-2">姓</th>
                  <th className="text-left p-2">名</th>
                  <th className="text-left p-2">電話</th>
                  <th className="text-left p-2">在籍</th>
                  <th className="text-left p-2">ブラック</th>
                  <th className="text-left p-2 w-[520px]">メモ（従来×2幅）</th>
                  <th className="text-left p-2">送信しない</th>
                  <th className="text-left p-2">最終送信日</th>
                  <th className="text-left p-2 w-[220px]">操作（従来×2幅）</th>
                </tr>
                <tr className="border-t">
                  <th className="p-2"><Input placeholder="YYYY-MM" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} /></th>
                  <th className="p-2"><Input placeholder="姓" value={fLast} onChange={(e) => setFLast(e.target.value)} /></th>
                  <th className="p-2"><Input placeholder="名" value={fFirst} onChange={(e) => setFFirst(e.target.value)} /></th>
                  <th className="p-2"><Input placeholder="電話" value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></th>
                  <th className="p-2">
                    <div className="w-[150px]">
                      <Select value={fEntry} onValueChange={(v: Status) => setFEntry(v)}>
                        <SelectTrigger><SelectValue placeholder="すべて" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">すべて</SelectItem>
                          <SelectItem value="in">Entryあり</SelectItem>
                          <SelectItem value="not">Entryなし</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                  <th className="p-2">
                    <div className="w-[150px]">
                      <Select value={fBlack} onValueChange={(v: BlackFilter) => setFBlack(v)}>
                        <SelectTrigger><SelectValue placeholder="ブラック" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">すべて</SelectItem>
                          <SelectItem value="only">ブラックのみ</SelectItem>
                          <SelectItem value="exclude">ブラック除外</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                  <th className="p-2"><Input placeholder="メモ（部分一致）" value={fMemo} onChange={(e) => setFMemo(e.target.value)} /></th>
                  <th className="p-2"><span className="text-xs text-muted-foreground">（列内で編集）</span></th>
                  <th className="p-2"></th>
                  <th className="p-2">
                    <Button variant="outline" size="sm" onClick={() => { setFPeriod(''); setFLast(''); setFFirst(''); setFPhone(''); setFEntry('all'); setFBlack('all'); setFMemo(''); }}>クリア</Button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => {
                  const key = rowKey(it)
                  const draft = drafts[key]
                  const inEntry = !!it.in_entry
                  const black = draft?.black_list ?? !!it.black_list
                  const sendDisabled = draft?.send_disabled ?? !!it.send_disabled
                  return (
                    <tr key={key} className="border-t align-top">
                      <td className="p-2">{String(it.period_month).slice(0, 10)}</td>
                      <td className="p-2">{it['姓']}</td>
                      <td className="p-2">{it['名']}</td>
                      <td className="p-2">{it['電話番号']}</td>
                      <td className="p-2">{inEntry ? <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">Entryあり</span> : <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">Entryなし</span>}</td>
                      <td className="p-2"><Checkbox checked={black} onCheckedChange={(v) => updateDraft(key, { black_list: !!v })} /></td>
                      <td className="p-2">
                        <Textarea
                          className="min-h-[44px]"
                          value={draft?.memo ?? (it.memo ?? '')}
                          onChange={(e) => updateDraft(key, { memo: e.target.value })}
                          placeholder="メモ"
                        />
                      </td>
                      <td className="p-2"><Checkbox checked={sendDisabled} onCheckedChange={(v) => updateDraft(key, { send_disabled: !!v })} /></td>
                      <td className="p-2 text-xs text-muted-foreground">{it.last_sent_at ? new Date(it.last_sent_at).toLocaleString() : ''}</td>
                      <td className="p-2 space-x-2">
                        {inEntry && it.entry_id
                          ? <Button variant="secondary" size="sm" onClick={() => router.push(`/portal/entry-detail/${it.entry_id}`)}>entry-detail</Button>
                          : <Button variant="outline" size="sm" disabled>entry-detail</Button>}
                        <Button variant="outline" size="sm" onClick={onSaveEdits}>保存</Button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">データがありません</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">※ 在籍判定は form_entries.phone と正規化済み電話番号で突合。ブラックはCSV/DBの black_list を尊重します。</p>
        </CardContent>
      </Card>
    </div>
  )
}