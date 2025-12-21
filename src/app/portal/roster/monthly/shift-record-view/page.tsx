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

/** 「ご様子・変化」カテゴリS（shift_record_category_s.id） */
const NOTE_S_ID = 'a451ae95-da09-4323-8a58-7416bb373b5d'

/* =========================
   item_defs 型（必要分だけ）
========================= */
type ItemDefRow = {
  id: string
  s_id: string | null
  code: string
  label: string
  input_type: string
  unit: string | null
  sort_order: number
  active: boolean
  options: unknown
  meta_json: unknown
}

/* =========================
   users API 型（必要分だけ）
   /api/users は user_entry_united_view_single を返す
========================= */
type UserUnitedRow = {
  user_id: string
  last_name_kanji: string | null
  first_name_kanji: string | null
}

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
  const [yStr, mStr] = yyyyMM.split('-')
  const y = Number(yStr)
  const m = Number(mStr)
  const from = `${yStr}-${mStr}-01`
  const last = new Date(y, m, 0).getDate()
  const to = `${yStr}-${mStr}-${pad2(last)}`
  return { from, to }
}

function statusLabel(recordStatus: string | null) {
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

function isCheckedValue(v: string | null): boolean {
  const s = (v ?? '').trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

function safeObj(u: unknown): Record<string, unknown> | null {
  if (typeof u !== 'object' || u === null) return null
  return u as Record<string, unknown>
}

function mapValueToLabel(def: ItemDefRow, raw: string): string {
  const rawStr = raw.trim()

  // meta_json 優先で value_map / map
  const meta = safeObj(def.meta_json)
  const metaMap =
    (meta?.value_map as Record<string, unknown> | undefined) ??
    (meta?.map as Record<string, unknown> | undefined)

  if (metaMap && typeof metaMap === 'object') {
    const hit = metaMap[rawStr]
    if (typeof hit === 'string') return hit
    if (hit != null) return String(hit)
  }

  // options.map
  const opt = safeObj(def.options)
  const optMap = opt?.map as Record<string, unknown> | undefined
  if (optMap && typeof optMap === 'object') {
    const hit = optMap[rawStr]
    if (typeof hit === 'string') return hit
    if (hit != null) return String(hit)
  }

  // options.items / choices / options
  const arr =
    (opt?.items as unknown[] | undefined) ??
    (opt?.choices as unknown[] | undefined) ??
    (opt?.options as unknown[] | undefined)

  if (Array.isArray(arr)) {
    for (const it of arr) {
      const o = safeObj(it)
      const v = o?.value
      const l = o?.label
      if (v != null && String(v) === rawStr && l != null) return String(l)
    }
  }

  return rawStr
}

function formatItem(def: ItemDefRow, valueText: string | null): string | null {
  const v = (valueText ?? '').trim()

  if (def.input_type === 'checkbox') {
    return isCheckedValue(v) ? def.label : null
  }
  if (!v) return null

  if (def.input_type === 'select') {
    const mapped = mapValueToLabel(def, v)
    return `${def.label}: ${mapped}${def.unit ? ` ${def.unit}` : ''}`
  }

  if (def.input_type === 'number') {
    return `${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''}`
  }

  // text / textarea / display など
  return `${def.label}: ${v}${def.unit ? ` ${def.unit}` : ''}`
}

function buildContentAndNote(
  items: ItemRow[],
  defMap: Map<string, ItemDefRow>,
): { content: string; note: string } {
  const contentParts: Array<{ sort: number; text: string }> = []
  const noteParts: Array<{ sort: number; text: string }> = []

  for (const it of items) {
    const def = defMap.get(it.item_def_id)
    if (!def) continue

    const text = formatItem(def, it.value_text)
    if (!text) continue

    const bucket = def.s_id === NOTE_S_ID ? noteParts : contentParts
    bucket.push({ sort: def.sort_order ?? 1000, text })
  }

  contentParts.sort((a, b) => a.sort - b.sort || a.text.localeCompare(b.text))
  noteParts.sort((a, b) => a.sort - b.sort || a.text.localeCompare(b.text))

  return {
    content: contentParts.map((x) => x.text).join(' / '),
    note: noteParts.map((x) => x.text).join('\n'),
  }
}

function buildUserName(u: UserUnitedRow): string {
  const name = `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim()
  return name || u.user_id
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
  const [defMap, setDefMap] = useState<Map<string, ItemDefRow>>(new Map())
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map())

  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  const title = useMemo(() => {
    const first = rows[0]
    const clientName = first?.client_name ?? '（利用者）'
    if (!month) return `${clientName} 様　サービスご提供実績`
    const [y, m] = month.split('-')
    return `${clientName} 様　${y}年${Number(m)}月分　サービスご提供実績`
  }, [rows, month])

  // ① item_defs 読み込み（1回）
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const { data, error } = await supabase
          .from('shift_record_item_defs')
          .select('id,s_id,code,label,input_type,unit,sort_order,active,options,meta_json')
          .eq('active', true)

        if (error) throw error

        const m = new Map<string, ItemDefRow>()
        ;(data ?? []).forEach((r: ItemDefRow) => m.set(r.id, r))
        if (mounted) setDefMap(m)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'item defs の取得に失敗しました'
        if (mounted) setErrMsg(msg)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [])

  // ② users（氏名）読み込み（1回）
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const res = await fetch('/api/users', { cache: 'no-store' })
        if (!res.ok) throw new Error(`users api failed: ${res.status}`)
        const raw: unknown = await res.json()

        const arr: UserUnitedRow[] = Array.isArray(raw)
          ? raw
              .map((x) => {
                if (typeof x !== 'object' || x === null) return null
                const o = x as Record<string, unknown>
                const user_id = typeof o.user_id === 'string' ? o.user_id : ''
                if (!user_id) return null
                return {
                  user_id,
                  last_name_kanji: typeof o.last_name_kanji === 'string' ? o.last_name_kanji : null,
                  first_name_kanji: typeof o.first_name_kanji === 'string' ? o.first_name_kanji : null,
                }
              })
              .filter((x): x is UserUnitedRow => x !== null)
          : []

        const m = new Map<string, string>()
        arr.forEach((u) => m.set(u.user_id, buildUserName(u)))
        if (mounted) setUserMap(m)
      } catch (e) {
        // users は必須ではないので、落とさずにログだけ
        console.error('[shift-record-view] users load failed', e)
      }
    }
    run()
    return () => {
      mounted = false
    }
  }, [])

  // ③ 一覧＋詳細（defMap が揃ってから）
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

        // View 一発取得（利用者×月）
        const list = await fetchShiftShiftRecords(supabase, {
          kaipokeCsId: kaipoke_cs_id,
          fromDate: from,
          toDate: to,
        })

        if (!mounted) return
        setRows(list)

        // items（shift_idごと）
        const entries = await Promise.all(
          list.map(async (r) => {
            try {
              await fetchShiftRecord(r.shift_id)
              const itemsRes = await fetchRecordItemsByShiftId(r.shift_id)
              const built = buildContentAndNote(itemsRes.items ?? [], defMap)
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

    if (defMap.size > 0) run()

    return () => {
      mounted = false
    }
  }, [kaipoke_cs_id, month, defMap])

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
              {/* 幅調整：実施内容と特記事項を同幅＆広め。他は必要最小限 */}
              <th className="border p-2 w-[110px]">日付</th>
              <th className="border p-2 w-[130px]">サービス提供時間</th>
              <th className="border p-2 w-[50px]">分</th>
              <th className="border p-2 w-[140px]">担当ヘルパー名</th>
              <th className="border p-2 w-[80px]">サービス内容</th>
              <th className="border p-2 w-[260px]">実施内容</th>
              <th className="border p-2 w-[260px]">特記事項</th>
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

                // ★ここが修正：user_id → 氏名
                const staffId = r.staff_01_user_id ?? ''
                const staffName = staffId ? userMap.get(staffId) ?? staffId : '（未設定）'

                return (
                  <tr key={r.shift_id}>
                    <td className="border p-2 align-top">{formatDateJP(r.shift_start_date)}</td>

                    <td className="border p-2 align-top">
                      {start} ～ {end}
                    </td>

                    <td className="border p-2 align-top text-center">{mins}</td>

                    <td className="border p-2 align-top">
                      <div className="leading-snug">
                        <div>{staffName}</div>
                        <div className="text-[11px] text-muted-foreground mt-1">{status}</div>
                      </div>
                    </td>

                    {/* ここは現状どおり（viewが身体/家事を返してる想定） */}
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
