//app/portal/roster/monthly/print-view/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ===== Types (合わせて最低限) =====
type KaipokeCs = { kaipoke_cs_id: string; name: string }
type StaffUser = { user_id: string; last_name_kanji: string | null; first_name_kanji: string | null }
type ServiceCode = { service_code: string | null; kaipoke_servicek: string | null }

type ShiftRow = {
  shift_id: string
  kaipoke_cs_id: string
  shift_start_date: string // YYYY-MM-DD
  shift_start_time: string // HH:mm | HH:mm:ss
  shift_end_time: string // HH:mm | HH:mm:ss
  service_code: string | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean | null
  staff_03_attend_flg: boolean | null
}

// ===== Type Guards / Safe Parsers =====
function isKaipokeCsArray(u: unknown): u is KaipokeCs[] {
  return Array.isArray(u) && u.every(v => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return typeof o.kaipoke_cs_id === 'string' && typeof o.name === 'string'
  })
}
function isStaffUserArray(u: unknown): u is StaffUser[] {
  return Array.isArray(u) && u.every(v => {
    if (typeof v !== 'object' || v === null) return false
    const o = v as Record<string, unknown>
    return typeof o.user_id === 'string'
  })
}
function isServiceCodeArray(u: unknown): u is ServiceCode[] {
  return Array.isArray(u)
}
const toBoolOrNull = (v: unknown): boolean | null => (v == null ? null : v === true || v === 'true' || v === 1)
function toShiftRow(u: unknown): ShiftRow | null {
  if (!u || typeof u !== 'object') return null
  const o = u as Record<string, unknown>
  const getStr = (k: string): string => (o[k] == null ? '' : String(o[k]))
  const getOptStr = (k: string): string | null => (o[k] == null ? null : String(o[k]))
  return {
    shift_id: getStr('shift_id') || getStr('id'),
    kaipoke_cs_id: getStr('kaipoke_cs_id'),
    shift_start_date: getStr('shift_start_date'),
    shift_start_time: toHM(getStr('shift_start_time')),
    shift_end_time: toHM(getStr('shift_end_time')),
    service_code: getOptStr('service_code'),
    staff_01_user_id: getOptStr('staff_01_user_id'),
    staff_02_user_id: getOptStr('staff_02_user_id'),
    staff_03_user_id: getOptStr('staff_03_user_id'),
    staff_02_attend_flg: toBoolOrNull(o['staff_02_attend_flg']),
    staff_03_attend_flg: toBoolOrNull(o['staff_03_attend_flg']),
  }
}

// ===== Helpers =====
const toHM = (val?: string | null): string => {
  if (!val) return ''
  const m = /^(\d{1,2})(?::?)(\d{2})(?::\d{2})?$/.exec(val) || /^(\d{1,2}):(\d{1,2})$/.exec(val)
  if (m) {
    const hh = String(Math.max(0, Math.min(23, parseInt(m[1], 10)))).padStart(2, '0')
    const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0')
    return `${hh}:${mm}`
  }
  return String(val).slice(0, 5)
}

const weekdayJa = ['日','月','火','水','木','金','土']

// 月の週配列（ヘッダーは 月〜日 に合わせて Monday-first）
function buildMonthWeeks(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0).getDate()

  // 月曜日=0 ... 日曜日=6 に並び替えるためのインデックス変換
  const jsDowToMonFirst = (dow: number) => (dow + 6) % 7

  const weeks: { date: string; inMonth: boolean; js: Date }[][] = []
  let currentWeek: { date: string; inMonth: boolean; js: Date }[] = []

  // 先行の前月分ブランク
  const leadingBlanks = jsDowToMonFirst(first.getDay())
  for (let i = 0; i < leadingBlanks; i++) {
    const d = new Date(y, m - 1, 1 - (leadingBlanks - i))
    currentWeek.push({ date: toISO(d), inMonth: false, js: d })
  }
  // 当月分
  for (let d = 1; d <= lastDay; d++) {
    const dt = new Date(y, m - 1, d)
    currentWeek.push({ date: toISO(dt), inMonth: true, js: dt })
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = [] }
  }
  // 末尾の次月分ブランク
  if (currentWeek.length) {
    const need = 7 - currentWeek.length
    for (let i = 1; i <= need; i++) {
      const d = new Date(y, m - 1, lastDay + i)
      currentWeek.push({ date: toISO(d), inMonth: false, js: d })
    }
    weeks.push(currentWeek)
  }
  return weeks
}

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

// 令和表記（簡易）
function toReiwa(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-').map(Number)
  // 令和元年=2019年
  const eraY = Math.max(1, y - 2018)
  return `令和${eraY}年${m}月`
}

function humanName(u: StaffUser) {
  return `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim() || u.user_id
}

export default function PrintViewMonthlyRoster() {
  const search = useSearchParams()
  const router = useRouter()
  const kaipoke_cs_id = search.get('kaipoke_cs_id') ?? ''
  const month = search.get('month') ?? '' // YYYY-MM

  const [loading, setLoading] = useState(true)
  const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([])
  const [shifts, setShifts] = useState<ShiftRow[]>([])

  // masters & shifts 読み込み
  useEffect(() => {
    let mounted = true
    const run = async () => {
      try {
        const [csRes, stRes, scRes] = await Promise.all([
          fetch('/api/kaipoke-info', { cache: 'no-store' }),
          fetch('/api/users', { cache: 'no-store' }),
          (async () => {
            try {
              const r = await fetch('/api/service-codes', { cache: 'no-store' })
              if (r.ok) return r
            } catch {}
            return fetch('/api/shift-service-code', { cache: 'no-store' })
          })(),
        ])
        const csRaw: unknown = await csRes.json()
        const stRaw: unknown = await stRes.json()
        const scRaw: unknown = await scRes.json()
        
        const cs = isKaipokeCsArray(csRaw) ? csRaw.filter(c => c.kaipoke_cs_id && c.name) : []
        const st = isStaffUserArray(stRaw) ? stRaw : []
        const sc = isServiceCodeArray(scRaw) ? scRaw.filter(s => (s as ServiceCode).service_code) as ServiceCode[] : []
        
        setKaipokeCs(cs)
        setStaffUsers(st)
        setServiceCodes(sc)

        if (kaipoke_cs_id && month) {
          const url = `/api/shifts?kaipoke_cs_id=${encodeURIComponent(kaipoke_cs_id)}&month=${encodeURIComponent(month)}`
          const r = await fetch(url, { cache: 'no-store' })
          const rowsRaw: unknown = await r.json()
          const normalized: ShiftRow[] = (Array.isArray(rowsRaw) ? rowsRaw : [])
            .map(toShiftRow)
            .filter((x): x is ShiftRow => x !== null)
          normalized.sort((a,b) => a.shift_start_date.localeCompare(b.shift_start_date) || a.shift_start_time.localeCompare(b.shift_start_time))
          setShifts(normalized)
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    run()
    return () => { mounted = false }
  }, [kaipoke_cs_id, month])

  const csMap = useMemo(() => new Map(kaipokeCs.map(c => [c.kaipoke_cs_id, c.name])), [kaipokeCs])
  const staffMap = useMemo(() => new Map(staffUsers.map(u => [u.user_id, humanName(u)])), [staffUsers])
  const svcMap = useMemo(() => new Map(serviceCodes.map(s => [s.service_code ?? '', s.kaipoke_servicek ?? s.service_code ?? ''])), [serviceCodes])

  const targetName = csMap.get(kaipoke_cs_id) ?? '（利用者未指定）'
  const titleText = month ? `${targetName} ${toReiwa(month)} サービス予定` : `${targetName} サービス予定`

  const weeks = useMemo(() => (month ? buildMonthWeeks(month) : []), [month])

  // 日毎のシフト
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftRow[]>()
    for (const r of shifts) {
      const list = map.get(r.shift_start_date) ?? []
      list.push(r)
      map.set(r.shift_start_date, list)
    }
    // 時刻順に揃える
    for (const [k, arr] of map) {
      arr.sort((a,b) => a.shift_start_time.localeCompare(b.shift_start_time))
      map.set(k, arr)
    }
    return map
  }, [shifts])

  const handlePrint = () => window.print()

  return (
    <div className="w-full flex justify-center">
      <div className="w-[970px] p-4 print:p-0">
        {/* Header */}
        <div className="text-center text-xl font-medium mb-2 print:mb-1">{titleText}</div>

        {/* 操作行（印刷ボタン） */}
        <div className="flex items-center justify-between mb-3 print:hidden">
          <div className="text-sm text-muted-foreground">/portal/roster/monthly のフィルター（利用者・月）を引き継いで表示します。</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.back()}>戻る</Button>
            <Button onClick={handlePrint}>印刷 / PDF 保存</Button>
          </div>
        </div>

        {/* Legend */}
        <div className="text-right text-sm text-muted-foreground mb-2">★は同行を表します</div>

        {/* Month Grid */}
        <div className="border rounded-md overflow-hidden">
          {/* ヘッダー：月〜日 */}
          <div className="grid grid-cols-7 text-center text-sm font-medium bg-muted">
            {['月','火','水','木','金','土','日'].map((h) => (
              <div key={h} className="py-2 border-r last:border-r-0">{h}</div>
            ))}
          </div>

          {/* 週ごとの行 */}
          <div className="divide-y">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((cell, di) => {
                  const dayShifts = shiftsByDay.get(cell.date) ?? []
                  const isWeekend = di >= 5 // 土日列
                  return (
                    <div
                      key={cell.date}
                      className={cn(
                        'min-h-[110px] px-2 py-1 border-r last:border-r-0 break-inside-avoid-page',
                        cell.inMonth ? 'bg-white' : 'bg-muted/30',
                        isWeekend && 'print:[-webkit-print-color-adjust:exact]'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs text-muted-foreground">{cell.inMonth ? new Date(cell.date).getDate() : ''}</div>
                        <div className="text-[10px] text-muted-foreground">{cell.inMonth ? `（${weekdayJa[new Date(cell.date).getDay()]}）` : ''}</div>
                      </div>
                      {/* イベント一覧 */}
                      <div className="space-y-1">
                        {dayShifts.map((r) => {
                          const s1 = r.staff_01_user_id ? staffMap.get(r.staff_01_user_id) : ''
                          const s2 = r.staff_02_user_id ? staffMap.get(r.staff_02_user_id) : ''
                          const k = svcMap.get(r.service_code ?? '') ?? (r.service_code ?? '')
                          const stars = `${r.staff_02_attend_flg ? '★' : ''}${r.staff_03_attend_flg ? '★' : ''}`
                          return (
                            <div key={r.shift_id} className="text-[11px] leading-tight">
                              <div className="font-medium">{toHM(r.shift_start_time)}–{toHM(r.shift_end_time)}</div>
                              <div>{k} {stars && <span>{stars}</span>}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {s1}{s1 && s2 ? '・' : ''}{s2}
                              </div>
                            </div>
                          )
                        })}
                        {cell.inMonth && dayShifts.length === 0 && (
                          <div className="text-[11px] text-muted-foreground">&nbsp;</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Print footnote */}
        <div className="mt-2 text-center text-xs text-muted-foreground print:hidden">
          ブラウザの印刷ダイアログから「PDFに保存」を選ぶとPDF化できます。
        </div>
      </div>

      {/* 印刷最適化 */}
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          .break-inside-avoid-page { break-inside: avoid-page; }
        }
      `}</style>
    </div>
  )
}
