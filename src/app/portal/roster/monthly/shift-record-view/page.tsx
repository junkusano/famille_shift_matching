'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

import { supabase } from '@/lib/supabaseClient'
import {
  fetchShiftShiftRecords,
  type ShiftShiftRecordRow,
} from '@/lib/shift/shift_shift_records'

import {
  fetchShiftRecord,
  fetchRecordItemsByShiftId,
  type ItemRow,
} from '@/lib/shiftRecordClient'

/* =========================
   Utils
========================= */
const weekday = ['日', '月', '火', '水', '木', '金', '土']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function formatDateJP(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`)
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const w = weekday[d.getDay()]
  return `${m}月${day}日(${w})`
}

function toHM(v: string | null): string {
  if (!v) return ''
  // "HH:mm:ss" → "HH:mm"
  return v.length >= 5 ? v.slice(0, 5) : v
}

function diffMinutes(startHM: string, endHM: string) {
  const s = /^(\d{2}):(\d{2})$/.exec(startHM)
  const e = /^(\d{2}):(\d{2})$/.exec(endHM)
  if (!s || !e) return 0
  const sm = Number(s[1]) * 60 + Number(s[2])
  const em = Number(e[1]) * 60 + Number(e[2])
  const d = em - sm
  return d >= 0 ? d : d + 24 * 60
}

function monthToRange(yyyyMM: string): { from: string; to: string } {
  // yyyyMM = "2025-09"
  const [yStr, mStr] = yyyyMM.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const from = `${yStr}-${mStr}-01`

  // last day
  const last = new Date(y, m, 0).getDate() // month is 1-based here due to Date(y,m,0)
  const to = `${yStr}-${mStr}-${pad2(last)}`
  return { from, to }
}

function statusLabel(recordStatus: string | null) {
  // view の record_status (draft/submitted/approved/null)
  switch (recordStatus) {
    case 'approved':
      return '完了'
    case 'submitted':
    case 'draft':
      return '入力中'
    default:
      return '未作成'
  }
}

function buildContentNote(items: ItemRow[]): { content: string; note: string } {
  // item_defs を見ない簡易版：value_text は「/」結合、noteは改行結合
  const content = items
    .map((x) => (x.value_text ?? '').trim())
    .filter(Boolean)
    .join(' / ')

  const note = items
    .map((x) => (x.note ?? '').trim())
    .filter(Boolean)
    .join('\n')

  return { content, note }
}

/* =========================
   Page
========================= */
export default function ShiftRecordMonthlyViewPage() {
  const search = useSearchParams()
  const router = useRouter()

  const kaipoke_cs_id = search.get('kaipoke_cs_id') ?? ''
  const month = search.get('month') ?? '' // YYYY-MM

  const [rows, setRows] = useState<ShiftShiftRecordRow[]>([])
  const [detailMap, setDetailMap] = useState<Map<number, { content: string; note: string }>>(new Map())
  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const title = useMemo(() => {
    const first = rows[0]
    const clientName = first?.client_name ?? '（利用者）'
    if (!month) return `${clientName} 様　サービスご提供実績`
    const [y, m] = month.split('-')
    return `${clientName} 様　${y}年${Number(m)}月分　サービスご提供実績`
  }, [rows, month])

  useEffect(() => {
    let mounted = true

    const run = async () => {
      setErrMsg(null)

      if (!kaipoke_cs_id || !month) {
        setRows([])
        setDetailMap(new Map())
        return
      }

      setLoading(true)

      try {
        const { from, to } = monthToRange(month)

        // ① View 一発取得（利用者×月）
        const list = await fetchShiftShiftRecords(supabase, {
          kaipokeCsId: kaipoke_cs_id,
          fromDate: from,
          toDate: to,
        })

        if (!mounted) return
        setRows(list)

        // ② 実施内容/特記事項（shift_id 単位で既存APIを叩く）
        //    ※件数が多いと重いので、将来的にはAPIでまとめ取りに最適化推奨
        const entries = await Promise.all(
          list.map(async (r) => {
            try {
              // record は作成済かどうか・ステータス確認用（必要なら）
              // ここでは「items取得だけ」でも良いが、既存の運用に合わせて呼んでおく
              await fetchShiftRecord(r.shift_id)

              const itemsRes = await fetchRecordItemsByShiftId(r.shift_id)
              const built = buildContentNote(itemsRes.items ?? [])
              return [r.shift_id, built] as const
            } catch {
              return [r.shift_id, { content: '', note: '' }] as const
            }
          }),
        )

        if (!mounted) return
        const m = new Map<number, { content: string; note: string }>()
        entries.forEach(([shiftId, v]) => m.set(shiftId, v))
        setDetailMap(m)
      } catch (e) {
        const msg = e instanceof Error ? e.message : '読み込みに失敗しました'
        if (mounted) setErrMsg(msg)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()
    return () => {
      mounted = false
    }
  }, [kaipoke_cs_id, month])

  return (
    <div className="p-4 print:p-0">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <div className="text-sm text-muted-foreground mt-1">
            事業所名：ﾌｧﾐｰﾕﾍﾙﾊﾟｰｻｰﾋﾞｽ愛知事業所
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            表示URL: ?kaipoke_cs_id=XXXX&amp;month=YYYY-MM
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" onClick={() => router.back()}>
            戻る
          </Button>
          <Button onClick={() => window.print()}>印刷 / PDF</Button>
        </div>
      </div>

      {errMsg && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      {/* Table */}
      <div className="border rounded bg-white overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-muted">
              <th className="border p-2 w-[130px]">日付</th>
              <th className="border p-2 w-[150px]">サービス提供時間</th>
              <th className="border p-2 w-[60px]">分</th>
              <th className="border p-2 w-[220px]">担当ヘルパー名</th>
              <th className="border p-2 w-[160px]">サービス内容</th>
              <th className="border p-2">実施内容</th>
              <th className="border p-2 w-[240px]">特記事項</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td className="border p-3 text-sm text-muted-foreground" colSpan={7}>
                  読み込み中…
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td className="border p-3 text-sm text-muted-foreground" colSpan={7}>
                  データがありません（kaipoke_cs_id / month を確認してください）
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => {
                const start = toHM(r.shift_start_time)
                const end = toHM(r.shift_end_time)
                const mins = start && end ? diffMinutes(start, end) : ''

                const detail = detailMap.get(r.shift_id)
                const status = statusLabel(r.record_status)

                return (
                  <tr key={r.shift_id}>
                    <td className="border p-2 align-top">{formatDateJP(r.shift_start_date)}</td>

                    <td className="border p-2 align-top">
                      {start} ～ {end}
                    </td>

                    <td className="border p-2 align-top text-center">{mins}</td>

                    <td className="border p-2 align-top">
                      <div className="leading-snug">
                        <div>{r.staff_01_user_id ?? '（未設定）'}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{status}</div>
                      </div>
                    </td>

                    <td className="border p-2 align-top">{r.service_code ?? ''}</td>

                    <td className="border p-2 align-top whitespace-pre-wrap">{detail?.content ?? ''}</td>

                    <td className="border p-2 align-top whitespace-pre-wrap">{detail?.note ?? ''}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
        }
      `}</style>
    </div>
  )
}
