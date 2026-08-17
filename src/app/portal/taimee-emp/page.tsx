'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { getAppBaseUrl } from '@/lib/env/getAppBaseUrl'
import { supabase } from '@/lib/supabaseClient'

const notify = {
  success: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
  error: (msg: string) => (typeof window !== 'undefined' ? window.alert(`エラー: ${msg}`) : void 0),
  message: (msg: string) => (typeof window !== 'undefined' ? window.alert(msg) : void 0),
}

const GSM7 = /^[\x0A\x0D\x20-\x7E¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?@A-ZÄÖÑÜ§¿a-zäöñüà]*$/

function smsSegmentCount(text: string): number {
  const gsm = GSM7.test(text)
  const units = gsm
    ? [...text].reduce((total, char) => total + ('^{}\\[~]|€'.includes(char) ? 2 : 1), 0)
    : [...text].reduce((total, char) => total + (char.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  const singleSegmentLength = gsm ? 160 : 70
  const joinedSegmentLength = gsm ? 153 : 67
  return units <= singleSegmentLength ? 1 : Math.ceil(units / joinedSegmentLength)
}

// ===== Types =====
type Status =
  | 'all'
  | 'linked'
  | 'candidate'
  | 'unlinked'
type BlackFilter = 'all' | 'only' | 'exclude'
type ExcludeFilter = 'all' | 'only' | 'exclude'

type LinkStatus =
  | 'unlinked'
  | 'candidate'
  | 'linked'
  | 'auto_linked'
  | 'manual_linked'

interface TaimeeEmployeeWithEntry {
  applicant_id: string
  taimee_user_id: string

  period_month: string | null

  normalized_phone: string | null
  entry_id: string | null
  link_status: LinkStatus

  black_list?: boolean | null
  send_disabled?: boolean | null
  memo?: string | null
  last_sent_at?: string | null

  姓?: string | null
  名?: string | null
  住所?: string | null
  性別?: string | null
  電話番号?: string | null

  latest_job_id?: string | null
  latest_job_name?: string | null
  latest_work_date?: string | null
  applicant_control_url?: string | null

  employment_contract_count: number
  qualification_certificate_count: number

  last_fetched_at?: string | null
  fetch_status?: 'pending' | 'success' | 'partial' | 'error'
}

interface RowEditState {
  black_list?: boolean
  send_disabled?: boolean
  memo?: string
}

export default function Page() {
  const router = useRouter()
  const appBaseUrl = typeof window === 'undefined' ? getAppBaseUrl() : window.location.origin
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
${appBaseUrl}/entry

★ 詳しい情報を知りたいという方は↓
https://www.shi-on.net/recruit

★ 正社員でファミーユに応募したいという方は以下は↓
https://www.shi-on.net/column?page=17

採用担当者　新川： 090-9140-2642`
  )
  const [includeBlack, setIncludeBlack] = useState(false)
  const [savingSmsBody, setSavingSmsBody] = useState(false)
  const [smsUnitPriceUsd, setSmsUnitPriceUsd] = useState(0.089)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [sendRunning, setSendRunning] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, success: 0, failed: 0 })
  const [sendError, setSendError] = useState<string | null>(null)
  const [checkingDelivery, setCheckingDelivery] = useState(false)
  const sendStopRequestedRef = useRef(false)

  async function fetchList() {
  setLoading(true)
  setMessage(null)

  try {
    const params = new URLSearchParams({
      status: fEntry,
      black: fBlack,
      memo: fMemo,
    })

    const response = await fetch(
      `/api/taimee-emp/list?${params.toString()}`,
      {
        cache: 'no-store',
      }
    )

    const responseText =
      await response.text()

    if (!responseText.trim()) {
      throw new Error(
        `一覧APIから空のレスポンスが返されました。HTTP ${response.status}`
      )
    }

    let result: {
      ok?: boolean
      items?: TaimeeEmployeeWithEntry[]
      error?: string
    }

    try {
      result = JSON.parse(responseText)
    } catch {
      throw new Error(
        `一覧APIがJSON以外を返しました。HTTP ${response.status}: ${responseText.slice(0, 300)}`
      )
    }

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
          `一覧の取得に失敗しました。HTTP ${response.status}`
      )
    }

    setItems(
      Array.isArray(result.items)
        ? result.items
        : []
    )
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : '読み込みに失敗しました'

    console.error(
      '[taimee-emp] fetchList failed',
      error
    )

    setMessage(message)
    notify.error(message)
  } finally {
    setLoading(false)
  }
}

  useEffect(() => { fetchList() }, [fEntry, fBlack, fMemo])

  useEffect(() => {
    let active = true

    async function loadSavedSmsBody() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const response = await fetch('/api/taimee-emp/settings', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        })
        const result = await response.json() as {
          ok?: boolean
          smsBody?: unknown
          smsUnitPriceUsd?: unknown
        }

        if (response.ok && result.ok && typeof result.smsBody === 'string' && active) {
          setSmsBody(result.smsBody)
        }
        if (
          response.ok &&
          result.ok &&
          typeof result.smsUnitPriceUsd === 'number' &&
          Number.isFinite(result.smsUnitPriceUsd) &&
          result.smsUnitPriceUsd >= 0 &&
          active
        ) {
          setSmsUnitPriceUsd(result.smsUnitPriceUsd)
        }
      } catch (error) {
        console.error('[taimee-emp] SMS body settings load failed', error)
      }
    }

    void loadSavedSmsBody()
    return () => { active = false }
  }, [])

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setMessage('CSVファイルを選択してください'); return }
    setLoading(true); setMessage(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('ログイン情報を確認できません。再ログインしてください。')

      const r = await fetch('/api/taimee-emp/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      const responseText = await r.text()
      let j: {
        ok?: boolean
        parsed?: number
        inserted?: number
        updated?: number
        applicantsSynced?: number
        skipped?: number
        failed?: number
        error?: unknown
      }
      try {
        j = JSON.parse(responseText)
      } catch {
        throw new Error(`CSV登録APIがJSON以外を返しました。HTTP ${r.status}: ${responseText.slice(0, 300)}`)
      }
      if (!r.ok || !j.ok) {
        const error = typeof j.error === 'string' ? j.error : 'CSVの登録に失敗しました'
        throw new Error(error)
      }
      const summary = `CSV読込 ${j.parsed ?? 0}件 / 追加 ${j.inserted ?? 0}件 / 更新 ${j.updated ?? 0}件 / 一覧同期 ${j.applicantsSynced ?? 0}件 / スキップ ${j.skipped ?? 0}件 / 失敗 ${j.failed ?? 0}件`
      setMessage(summary)
      notify.success(`取り込み完了：${summary}`)
      await fetchList()
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : 'CSVの登録に失敗しました'
      console.error('[taimee-emp] upload failed', e)
      setMessage(`CSVの登録に失敗しました。\n${error}`)
      notify.error(error)
    } finally { setLoading(false) }
  }

  async function onSaveSmsBody() {
    setSavingSmsBody(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('ログイン情報を確認できません。再ログインしてください。')

      const response = await fetch('/api/taimee-emp/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ smsBody, smsUnitPriceUsd }),
      })
      const result = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `本文の保存に失敗しました。HTTP ${response.status}`)
      }

      notify.success('メッセージ本文を保存しました')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '本文の保存に失敗しました'
      console.error('[taimee-emp] SMS body settings save failed', error)
      notify.error(message)
    } finally {
      setSavingSmsBody(false)
    }
  }

  function updateDraft(key: string, patch: RowEditState) {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  async function bulkToggleExclude(exclude: boolean) {
    const updates = filtered.map((it) => ({
      key: rowKey(it),
      send_disabled: exclude,
    }))

    if (updates.length === 0) {
      notify.message('対象者がいません')
      return
    }

    // 画面表示は直ちに反映しつつ、DBにも即時保存する。
    setDrafts((prev) => {
      const next = { ...prev }
      for (const update of updates) {
        next[update.key] = {
          ...(next[update.key] ?? {}),
          send_disabled: exclude,
        }
      }
      return next
    })

    setLoading(true)
    try {
      const response = await fetch('/api/taimee-emp/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const responseText = await response.text()
      const result = JSON.parse(responseText) as {
        ok?: boolean
        updated?: number
        error?: string
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.error || `一括保存に失敗しました。HTTP ${response.status}`)
      }

      // DBの最新値に戻す。ほかの未保存編集は保持する。
      setDrafts((prev) => {
        const next = { ...prev }
        for (const update of updates) {
          const draft = next[update.key]
          if (!draft) continue
          const { send_disabled: _sendDisabled, ...rest } = draft
          if (Object.keys(rest).length === 0) delete next[update.key]
          else next[update.key] = rest
        }
        return next
      })
      await fetchList()
      notify.success(
        exclude
          ? `全件を除外に保存しました（${result.updated ?? 0}件）`
          : `全件の除外を解除しました（${result.updated ?? 0}件）`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '一括保存に失敗しました'
      console.error('[taimee-emp] bulk exclude failed', error)
      notify.error(message)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const p = fPeriod.trim()
    const ln = fLast.trim().toLowerCase()
    const fn = fFirst.trim().toLowerCase()
    const ph = fPhone.trim().toLowerCase()
    const memo = fMemo.trim().toLowerCase()

    return items.filter((it) => {
      if (
  fEntry !== 'all' &&
  it.link_status !== fEntry
) {
  return false
}

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
      // エントリー済み、または既存エントリーと電話番号一致する候補者には
      // リエントリー案内を重ねて送らない。
      if (it.link_status === 'linked' || it.link_status === 'candidate' || it.link_status === 'auto_linked' || it.link_status === 'manual_linked') return false
      const draft = drafts[rowKey(it)]
      const sendDisabled = draft?.send_disabled ?? it.send_disabled
      const black = draft?.black_list ?? it.black_list
      if (sendDisabled) return false
      if (!includeBlack && black) return false
      const phone = it.normalized_phone || it.電話番号
      return !!phone
    })
  }, [filtered, drafts, includeBlack])

  const bodySegments = smsSegmentCount(smsBody)
  const totalSegments = recipientsForSend.reduce((total, recipient) => {
    const namedBody = `${recipient['姓'] ?? ''}${recipient['名'] ?? ''}様\n${smsBody}`
    return total + smsSegmentCount(namedBody)
  }, 0)
  const estimatedTotalUsd = totalSegments * smsUnitPriceUsd

function rowKey(it: TaimeeEmployeeWithEntry) {
  return it.applicant_id
}

  function renderPreview(count: number) {
    const sample = recipientsForSend[0]
    if (!sample) return '（プレビューなし）'
    const title = `${sample['姓'] ?? ''}${sample['名'] ?? ''}様\n${smsBody}`
    return `宛先数：${count}件\n---\n${title}`
  }

  async function onSaveEdits() {
  const payload = Object.entries(
    drafts
  ).map(([key, value]) => ({
    key,
    ...value,
  }))

  if (payload.length === 0) {
    notify.message('変更はありません')
    return
  }

  setLoading(true)

  try {
    console.log(
      '[taimee-emp] save payload',
      payload
    )

    const response = await fetch(
      '/api/taimee-emp/save',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          updates: payload,
        }),
      }
    )

    const responseText =
      await response.text()

    if (!responseText.trim()) {
      throw new Error(
        `保存APIから空のレスポンスが返されました。HTTP ${response.status}`
      )
    }

    let result: {
      ok?: boolean
      updated?: number
      error?: string
    }

    try {
      result = JSON.parse(responseText)
    } catch {
      throw new Error(
        `保存APIがJSON以外を返しました。HTTP ${response.status}: ${responseText.slice(0, 300)}`
      )
    }

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error ||
          `保存に失敗しました。HTTP ${response.status}`
      )
    }

    notify.success(
      `保存しました（${result.updated ?? 0}件）`
    )

    setDrafts({})
    await fetchList()
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : '保存に失敗しました'

    console.error(
      '[taimee-emp] save failed',
      error
    )

    notify.error(message)
  } finally {
    setLoading(false)
  }
}
  function onBulkSend() {
    if (recipientsForSend.length === 0 || sendRunning) return
    setSendProgress({ sent: 0, total: recipientsForSend.length, success: 0, failed: 0 })
    setSendError(null)
    setSendDialogOpen(true)
  }

  async function startBulkSend() {
    if (sendRunning || recipientsForSend.length === 0) return
    sendStopRequestedRef.current = false
    setSendRunning(true)
    setSendError(null)

    let sent = 0
    let success = 0
    let failed = 0

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('ログイン情報を確認できません。再ログインしてください。')

      // 小分けに送信し、各バッチの完了ごとに画面へ進捗を反映する。
      for (let offset = 0; offset < recipientsForSend.length; offset += 10) {
        if (sendStopRequestedRef.current) break
        const batch = recipientsForSend.slice(offset, offset + 10).map((item) => ({
          key: rowKey(item),
          phone: item.normalized_phone || item.電話番号 || '',
          last: item['姓'] || '',
          first: item['名'] || '',
          period_month: item.period_month || '',
          taimee_user_id: item.taimee_user_id,
        }))

        const response = await fetch('/api/taimee-emp/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ message: smsBody, recipients: batch }),
        })
        const result = await response.json() as {
          ok?: boolean
          success?: number
          failed?: number
          error?: string
        }
        if (!response.ok || !result.ok) {
          throw new Error(result.error || `送信に失敗しました。HTTP ${response.status}`)
        }

        const batchSuccess = result.success ?? 0
        const batchFailed = result.failed ?? 0
        sent += batch.length
        success += batchSuccess
        failed += batchFailed
        setSendProgress({ sent, total: recipientsForSend.length, success, failed })
      }

      if (sendStopRequestedRef.current) {
        setSendError('送信を停止しました。未送信分は送っていません。')
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '送信に失敗しました'
      setSendError(`${message}（${sent}件処理済み）`)
      console.error('[taimee-emp] bulk send failed', error)
    } finally {
      setSendRunning(false)
      await fetchList()
    }
  }

  async function onCheckDeliveryStatus() {
    if (checkingDelivery) return
    setCheckingDelivery(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('ログイン情報を確認できません。再ログインしてください。')

      const response = await fetch('/api/taimee-emp/delivery-status', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json() as {
        ok?: boolean
        checked?: number
        delivered?: number
        excluded?: number
        pending?: number
        lookupFailed?: number
        error?: string
      }
      if (!response.ok || !result.ok) {
        throw new Error(result.error || `送信結果の確認に失敗しました。HTTP ${response.status}`)
      }

      await fetchList()
      notify.success(
        `Twilio結果：確認 ${result.checked ?? 0}件 / 配信済み ${result.delivered ?? 0}件 / 除外 ${result.excluded ?? 0}件 / 保留 ${result.pending ?? 0}件 / 照会失敗 ${result.lookupFailed ?? 0}件`
      )
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '送信結果の確認に失敗しました'
      console.error('[taimee-emp] delivery status check failed', error)
      notify.error(message)
    } finally {
      setCheckingDelivery(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">
  タイミー応募者・就業者管理
</h1>

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
              <Button variant="outline" size="sm" onClick={onCheckDeliveryStatus} disabled={checkingDelivery}>
                {checkingDelivery ? '結果確認中…' : 'Twilio結果確認'}
              </Button>
              <Button onClick={onBulkSend} disabled={loading || recipientsForSend.length === 0}>一斉送信</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Textarea value={smsBody} onChange={(e) => setSmsBody(e.target.value)} className="min-h-[180px]" placeholder="本文（敬称は自動付与：『姓名様』の後に本文）" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
              <div>
                <label className="text-xs text-muted-foreground">予想単価（USD / 1セグメント）</label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  step="0.001"
                  value={smsUnitPriceUsd}
                  onChange={(e) => setSmsUnitPriceUsd(Number(e.target.value))}
                />
              </div>
              <div className="text-sm text-muted-foreground">
                本文セグメント：{bodySegments} ／ 送信時合計：{totalSegments}
              </div>
              <div className="text-sm font-medium">
                予想総額：${estimatedTotalUsd.toFixed(3)} USD
              </div>
            </div>
            <Button variant="outline" onClick={onSaveSmsBody} disabled={savingSmsBody}>
              {savingSmsBody ? '保存中…' : '本文を保存'}
            </Button>
          </div>
          <pre className="p-3 bg-muted rounded text-xs whitespace-pre-wrap">{renderPreview(recipientsForSend.length)}</pre>
        </CardContent>
      </Card>

      {/* 一覧（インライン編集可） */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="overflow-auto border rounded-xl">
            <table className="min-w-[1750px] text-sm">
              <thead className="bg-muted">
                <tr>
  <th className="text-left p-2">最新就業月</th>
  <th className="text-left p-2 w-[100px]">姓</th>
  <th className="text-left p-2 w-[100px]">名</th>
  <th className="text-left p-2">電話</th>

  <th className="text-left p-2">
    エントリー連携
  </th>

  <th className="text-left p-2">
    最新応募案件
  </th>

  <th className="text-left p-2">
    雇用契約書
  </th>

  <th className="text-left p-2">
    資格証
  </th>

  <th className="text-left p-2">
    RPA取得
  </th>

  <th className="text-left p-2 w-[72px]">
    ブラック
  </th>

  <th className="text-left p-2 w-[360px]">
    メモ
  </th>

  <th className="text-left p-2 w-[72px]">
    除外
  </th>

  <th className="text-left p-2">
    前回SMS
  </th>

  <th className="text-left p-2 w-[260px]">
    操作
  </th>
</tr>
                <tr className="border-t">
                  <th className="p-2 w-[110px]"><Input placeholder="YYYYMM" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} /></th>
                  <th className="p-2 w-[100px]"><Input placeholder="姓" value={fLast} onChange={(e) => setFLast(e.target.value)} /></th>
                  <th className="p-2 w-[100px]"><Input placeholder="名" value={fFirst} onChange={(e) => setFFirst(e.target.value)} /></th>
                  <th className="p-2 w-[140px]"><Input placeholder="電話" value={fPhone} onChange={(e) => setFPhone(e.target.value)} /></th>
                  <th className="p-2">
                    <div className="w-[72px]">
                      <Select value={fEntry} onValueChange={(v: Status) => setFEntry(v)}>
                        <SelectTrigger>
  <SelectValue placeholder="連携状態" />
</SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
  全て
</SelectItem>

<SelectItem value="linked">
  連携済み
</SelectItem>

<SelectItem value="candidate">
  候補あり
</SelectItem>

<SelectItem value="unlinked">
  未連携
</SelectItem>
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
                    <div className="w-[72px]">
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
                  const isLinked =
  ['linked', 'auto_linked', 'manual_linked'].includes(it.link_status) &&
  !!it.entry_id

const isCandidate =
  it.link_status === 'candidate'
                  const black = draft?.black_list ?? !!it.black_list
                  const sendDisabled = draft?.send_disabled ?? !!it.send_disabled
                  const ym = String(it.period_month).slice(0, 7).replace('-', '')
                  return (
                    <tr key={key} className="border-t align-top">
                      <td className="p-2">{ym}</td>
                      <td className="p-2">{it['姓']}</td>
                      <td className="p-2">{it['名']}</td>
                      <td className="p-2">{it['電話番号']}</td>
                      <td className="p-2">
  {isLinked ? (
    <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">
      連携済み
    </span>
  ) : isCandidate ? (
    <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs">
      候補あり
    </span>
  ) : (
    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">
      未連携
    </span>
  )}
</td>
<td className="p-2">
  <div className="max-w-[240px]">
    <div className="font-medium">
      {it.latest_job_name || '—'}
    </div>

    {it.latest_work_date && (
      <div className="text-xs text-muted-foreground">
        {new Date(
          `${it.latest_work_date}T00:00:00`
        ).toLocaleDateString('ja-JP')}
      </div>
    )}
  </div>
</td>
<td className="p-2">
  {it.employment_contract_count > 0 ? (
    <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs">
      取得済み
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">
      未取得
    </span>
  )}
</td>

<td className="p-2">
  {it.qualification_certificate_count > 0 ? (
    <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-800 text-xs">
      {it.qualification_certificate_count}件
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">
      なし
    </span>
  )}
</td>
<td className="p-2 text-xs">
  <div>
    {it.fetch_status === 'success'
      ? '取得済み'
      : it.fetch_status === 'partial'
        ? '一部取得'
        : it.fetch_status === 'error'
          ? 'エラー'
          : '未取得'}
  </div>

  {it.last_fetched_at && (
    <div className="text-muted-foreground">
      {new Date(
        it.last_fetched_at
      ).toLocaleString('ja-JP')}
    </div>
  )}
</td>
                      <td className="p-2"><Checkbox checked={black} onCheckedChange={(v) => updateDraft(key, { black_list: !!v })} /></td>
                      <td className="p-2 w-[360px]"><Input value={draft?.memo ?? (it.memo ?? '')} onChange={(e) => updateDraft(key, { memo: e.target.value })} placeholder="メモ" /></td>
                      <td className="p-2"><Checkbox checked={sendDisabled} onCheckedChange={(v) => updateDraft(key, { send_disabled: !!v })} /></td>
                      <td className="p-2 text-xs text-muted-foreground">{it.last_sent_at ? new Date(it.last_sent_at).toLocaleString() : ''}</td>
                      <td className="p-2">
  <div className="flex flex-wrap gap-2">
    <Button
  variant="outline"
  size="sm"
  disabled
  title="準備中"
>
  詳細
</Button>

    {isLinked && it.entry_id ? (
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          router.push(
            `/portal/entry-detail/${it.entry_id}`
          )
        }
      >
        エントリー
      </Button>
    ) : (
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          router.push(
            `/portal/taimee-applicants/${it.applicant_id}?tab=link`
          )
        }
      >
        {isCandidate ? '候補確認' : '連携'}
      </Button>
    )}

    {it.applicant_control_url && (
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          window.open(
            it.applicant_control_url!,
            '_blank',
            'noopener,noreferrer'
          )
        }
      >
        タイミー
      </Button>
    )}

    <Button
      variant="outline"
      size="sm"
      onClick={onSaveEdits}
    >
      保存
    </Button>
  </div>
</td>   
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                 <tr>
  <td
    colSpan={14}
    className="p-6 text-center text-muted-foreground"
  >
    データがありません
  </td>
</tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
  ※ 電話番号一致は「候補あり」として表示します。
  管理者が確認して連携した場合のみ「連携済み」になります。
</p>
        </CardContent>
      </Card>

      {sendDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-background p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-semibold">SMS一斉送信</h2>
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div>送信対象：{sendProgress.total}件</div>
              <div>合計セグメント：{totalSegments}</div>
              <div>予想総額：${estimatedTotalUsd.toFixed(3)} USD</div>
            </div>
            {sendRunning || sendProgress.sent > 0 ? (
              <div className="space-y-2 text-sm">
                <div>進捗：{sendProgress.sent} / {sendProgress.total}件</div>
                <div className="h-2 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${sendProgress.total ? Math.round(sendProgress.sent / sendProgress.total * 100) : 0}%` }}
                  />
                </div>
                <div>成功：{sendProgress.success}件 ／ 失敗：{sendProgress.failed}件</div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                送信開始後はこのページに留まったまま、10件ずつ処理します。開始後の費用は実際のTwilio結果に従います。
              </p>
            )}
            {sendError && <p className="text-sm text-destructive">{sendError}</p>}
            <div className="flex justify-end gap-2">
              {!sendRunning && sendProgress.sent === 0 && !sendError && (
                <Button variant="outline" onClick={() => setSendDialogOpen(false)}>キャンセル</Button>
              )}
              {!sendRunning && sendProgress.sent === 0 && !sendError && (
                <Button onClick={startBulkSend}>送信開始</Button>
              )}
              {sendRunning && (
                <Button variant="destructive" onClick={() => { sendStopRequestedRef.current = true }}>現在の処理後に停止</Button>
              )}
              {!sendRunning && (sendProgress.sent > 0 || !!sendError) && (
                <Button onClick={() => setSendDialogOpen(false)}>閉じる</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
