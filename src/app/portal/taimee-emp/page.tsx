'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

const notify = {
  success: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
  error: (msg: string) => (typeof window !== 'undefined' ? window.alert(`エラー: ${msg}`) : void 0),
  message: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
}

// ===== Types =====
type Status = 'all' | 'in' | 'not'
type BlackFilter = 'all' | 'only' | 'exclude'
type ExcludeFilter = 'all' | 'only' | 'exclude'

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

  // --- 列フィルター
  const [fPeriod, setFPeriod] = useState('') // YYYYMM
  const [fLast, setFLast] = useState('')
  const [fFirst, setFFirst] = useState('')
  const [fPhone, setFPhone] = useState('')

  // --- 追加フィルター
  const [fEntry, setFEntry] = useState<Status>('all')
  const [fBlack, setFBlack] = useState<BlackFilter>('all')
  const [fMemo, setFMemo] = useState('')
  const [fExclude, setFExclude] = useState<ExcludeFilter>('all')

  // --- インライン編集ドラフト
  const [drafts, setDrafts] = useState<Record<string, RowEditState>>({})

  // --- SMS 送信関連（初期本文を指定文へ）
  const [smsBody, setSmsBody] = useState(
    `ファミーユヘルパーサービス愛知タイミーでお仕事してくれてありがとうございました。★実は…タイミー掲載案件は、ほんの一部です！ ファミーユでは独自アプリ 「シフ子」 を使って、1日100件近いサービス の中から ⏰ 好きな時間・📍好きな場所のお仕事を自分で選べます。

✅ 身体/同行援護/行動援護:時給 2,330円~ ＋交通費
✅ 有給取得率100％ 休み希望もアプリで簡単！ （わずらわしいやり取り不要）
✅ 給与先払い制度あり 急な出費にも安心！
✅ 資格取得補助充実 受講料＋研修時間も時給あり

★ エントリーしたい！方は↓
https://myfamille.shi-on.net/entry

★ 詳しい情報を知りたいという方は↓
https://www.shi-on.net/recruit

★ 正社員でファミーユに応募したいという方は以下は↓
https://www.shi-on.net/column?page=17

採用担当者　新川： 090-9140-2642`
  )
  const [includeBlack, setIncludeBlack] = useState(false)

  async function fetchList() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: fEntry, black: fBlack, memo: fMemo })
      const r = await fetch(`/api/taimee-emp/list?${params}`, { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Failed to load')
      setItems(j.items as TaimeeEmployeeWithEntry[])
    } catch (e) {
      const msg = e instanceof Error ? e.message : '読み込みに失敗しました'
      setMessage(msg)
      notify.error(msg)
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchList() }, [fEntry, fBlack, fMemo])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setMessage('CSVファイルを選択してください'); return }
    setLoading(true); setMessage(null)
    try {
      const fd = new FormData()
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

  function updateDraft(key: string, patch: RowEditState) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  function bulkToggleExclude(exclude: boolean) {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const it of filtered) {
        const key = rowKey(it)
        next[key] = { ...(next[key] ?? {}), send_disabled: exclude }
      }
      return next
    })
    notify.message(exclude ? '全件を除外に設定しました' : '全件を選択（除外解除）しました')
  }

  const filtered = useMemo(() => {
    const p = fPeriod.trim()
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

      const sendDisabled = !!(drafts[rowKey(it)]?.send_disabled ?? it.send_disabled)
      if (fExclude === 'only' && !sendDisabled) return false
      if (fExclude === 'exclude' && sendDisabled) return false

      if (memo && !String(it.memo ?? '').toLowerCase().includes(memo)) return false

      const ym = String(it.period_month).slice(0, 7).replace('-', '')
      if (p && !ym.includes(p.replace('-', ''))) return false

      if (ln && !String(it['姓'] ?? '').toLowerCase().includes(ln)) return false
      if (fn && !String(it['名'] ?? '').toLowerCase().includes(fn)) return false
      if (ph && !String(it['電話番号'] ?? '').toLowerCase().includes(ph)) return false
      return true
    })
  }, [items, drafts, fEntry, fBlack, fMemo, fExclude, fPeriod, fLast, fFirst, fPhone])

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

  function rowKey(it: TaimeeEmployeeWithEntry) { return `${it.period_month}__${it.taimee_user_id}` }

  function renderPreview(count: number) {
    const sample = recipientsForSend[0]
    if (!sample) return '（プレビューなし）'
    const title = `${sample['姓'] ?? ''}${sample['名'] ?? ''}様\n${smsBody}`
    return `宛先数：${count}件\n---\n${title}`
  }

  async function onSaveEdits() {
    const payload = Object.entries(drafts).map(([key, v]) => ({ key, ...v }))
    if (payload.length === 0) { notify.message('変更はありません'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/taimee-emp/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updates: payload }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || '保存に失敗しました')
      notify.success(`保存しました（${j.updated}件）`)
      setDrafts({})
      await fetchList()
    } catch (e) { notify.error(e instanceof Error ? e.message : '保存に失敗しました') }
    finally { setLoading(false) }
  }

  async function onBulkSend() {
    if (recipientsForSend.length === 0) { notify.message('送信対象がありません'); return }
    if (!confirm(`本当に ${recipientsForSend.length} 件へ送信しますか？`)) return
    setLoading(true)
    try {
      const res = await fetch('/api/taimee-emp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: smsBody,
          recipients: recipientsForSend.map((it) => ({
            key: rowKey(it),
            phone: it.normalized_phone || it.電話番号,
            last: it['姓'] ?? '', first: it['名'] ?? '',
            period_month: it.period_month, taimee_user_id: it.taimee_user_id,
          })),
        }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error || '送信に失敗しました')
      notify.success(`送信完了：成功 ${j.success} / 失敗 ${j.failed}`)
      await fetchList()
    } catch (e) { notify.error(e instanceof Error ? e.message : '送信に失敗しました') }
    finally { setLoading(false) }
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
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={includeBlack} onCheckedChange={(v) => setIncludeBlack(!!v)} />ブラックも含める</label>
              <Button variant="outline" size="sm" onClick={() => bulkToggleExclude(false)}>全選択</Button>
              <Button variant="outline" size="sm" onClick={() => bulkToggleExclude(true)}>全除外</Button>
              <Button onClick={onBulkSend} disabled={loading || recipientsForSend.length === 0}>一斉送信</Button>
            </div>
          </div>
          <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className="min-h-[180px]" placeholder="本文（敬称は自動付与：『姓名様』の後に本文）" />
          <pre className="p-3 bg-muted rounded text-xs whitespace-pre-wrap">{renderPreview(recipientsForSend.length)}</pre>
        </CardContent>
      </Card>

      {/* 一覧（インライン編集可） */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-[1180px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">就業月</th>
                  <th className="text-left p-2 w-[140px]">姓</th>
                  <th className="text-left p-2 w-[140px]">名</th>
                  <th className="text-left p-2">電話</th>
                  <th className="text-left p-2">在籍</th>
                  <th className="text-left p-2 w-[72px]">ブラック</th>
                  <th className="text-left p-2 w-[360px]">メモ</th>
                  <th className="text-left p-2 w-[72px]">除外</th>
                  <th className="text-left p-2">前回</th>
                  <th className="text-left p-2 w-[160px]">操作</th>
                </tr>
                <tr className="border-t">
                  <th className="p-2 w-[110px]"><Input placeholder="YYYYMM" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} /></th>
                  <th className="p-2 w-[140px]"><Input placeholder="姓" value={fLast} onChange={(e) => setFLast(e.target.value)} /></th>
                  <th className="p-2 w-[140px]"><Input placeholder="名" value={fFirst} onChange={(e) => setFFirst(e.target.value)} /></th>
                  <th className="p-2 w-[140px]"><Input placeholder="電話" value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></th>
                  <th className="p-2">
                    <div className="w-[72px]">
                      <Select value={fEntry} onValueChange={(v: Status) => setFEntry(v)}>
                        <SelectTrigger><SelectValue placeholder="在籍" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全て</SelectItem>
                          <SelectItem value="in">該当</SelectItem>
                          <SelectItem value="not">非該当</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                  <th className="p-2">
                    <div className="w-[72px]">
                      <Select value={fBlack} onValueChange={(v: BlackFilter) => setFBlack(v)}>
                        <SelectTrigger><SelectValue placeholder="ブラック" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全て</SelectItem>
                          <SelectItem value="only">該当</SelectItem>
                          <SelectItem value="exclude">非該当</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                  <th className="p-2 w-[360px]"><Input placeholder="メモ（部分一致）" value={fMemo} onChange={(e) => setFMemo(e.target.value)} /></th>
                  <th className="p-2">
                    <div className="w-[96px]">
                      <Select value={fExclude} onValueChange={(v: ExcludeFilter) => setFExclude(v)}>
                        <SelectTrigger><SelectValue placeholder="除外" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">全て</SelectItem>
                          <SelectItem value="only">該当</SelectItem>
                          <SelectItem value="exclude">非該当</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                  <th className="p-2"><span className="text-xs text-muted-foreground">（—）</span></th>
                  <th className="p-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setFPeriod(''); setFLast(''); setFFirst(''); setFPhone('');
                      setFEntry('all'); setFBlack('all'); setFMemo(''); setFExclude('all')
                    }}>クリア</Button>
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
                  const ym = String(it.period_month).slice(0, 7).replace('-', '')
                  return (
                    <tr key={key} className="border-t align-top">
                      <td className="p-2">{ym}</td>
                      <td className="p-2">{it['姓']}</td>
                      <td className="p-2">{it['名']}</td>
                      <td className="p-2">{it['電話番号']}</td>
                      <td className="p-2">{inEntry ? <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">該当</span> : <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">非該当</span>}</td>
                      <td className="p-2"><Checkbox checked={black} onCheckedChange={(v) => updateDraft(key, { black_list: !!v })} /></td>
                      <td className="p-2 w-[360px]"><Input value={draft?.memo ?? (it.memo ?? '')} onChange={(e) => updateDraft(key, { memo: e.target.value })} placeholder="メモ" /></td>
                      <td className="p-2"><Checkbox checked={sendDisabled} onCheckedChange={(v) => updateDraft(key, { send_disabled: !!v })} /></td>
                      <td className="p-2 text-xs text-muted-foreground">{it.last_sent_at ? new Date(it.last_sent_at).toLocaleString() : ''}</td>
                      <td className="p-2 space-x-2">
                        {inEntry && it.entry_id
                          ? <Button variant="secondary" size="sm" onClick={() => router.push(`/portal/entry-detail/${it.entry_id}`)}>entry</Button>
                          : <Button variant="outline" size="sm" disabled>entry</Button>}
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
