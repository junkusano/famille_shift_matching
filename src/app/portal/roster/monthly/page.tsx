// portal/monthly/page.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ShiftRecord from '@/components/shift/ShiftRecord'

// ===== Types =====
type KaipokeCs = {
  id: string
  kaipoke_cs_id: string
  name: string
  end_at: string | null
}

type StaffUser = {
  user_id: string
  last_name_kanji: string | null
  first_name_kanji: string | null
  roster_sort: number | null // 並び順用（なければ null）
}

type ServiceCode = {
  id: string
  service_code: string | null
  require_doc_group: string | null
  kaipoke_servicek: string | null
  kaipoke_servicecode: string | null
  created_at?: string | null
  updated_at?: string | null
}

type ShiftRow = {
  shift_id: string
  kaipoke_cs_id: string
  shift_start_date: string    // YYYY-MM-DD
  shift_start_time: string    // HH:mm
  shift_end_time: string      // HH:mm
  service_code: string        // 編集可（Select）
  required_staff_count: number | null
  two_person_work_flg: boolean | null
  judo_ido: boolean | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean | null
  staff_03_attend_flg: boolean | null
}

// ===== Helpers =====
const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const addMonths = (month: string, diff: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, (m - 1) + diff, 1)
  return yyyymm(d)
}
const humanName = (u: StaffUser) =>
  `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim() || u.user_id

export default function MonthlyRosterPage() {
  // マスタ
  const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([])

  // 選択
  const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>('') // kaipoke_cs_id
  const [selectedMonth, setSelectedMonth] = useState<string>(yyyymm(new Date()))

  // 明細
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [openRecordFor, setOpenRecordFor] = useState<string | null>(null)

  // ---- Fetch masters ----
  useEffect(() => {
    const load = async () => {
      // 利用者（cs_kaipoke_info）
      const csRes = await fetch('/api/kaipoke-info', { cache: 'no-store' })
      const csData = (await csRes.json()) as KaipokeCs[]
      const validCs = csData
        .filter(c => c.kaipoke_cs_id && c.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      setKaipokeCs(validCs)
      if (validCs.length && !selectedKaipokeCS) setSelectedKaipokeCS(validCs[0].kaipoke_cs_id)

      // スタッフ（view: user_entry_united_view_single）
      const stRes = await fetch('/api/users', { cache: 'no-store' })
      const stData = (await stRes.json()) as StaffUser[]
      // roster_sort → nullは末尾、同値は氏名で
      stData.sort((a, b) => {
        const ra = a.roster_sort ?? Number.POSITIVE_INFINITY
        const rb = b.roster_sort ?? Number.POSITIVE_INFINITY
        if (ra !== rb) return ra - rb
        return humanName(a).localeCompare(humanName(b), 'ja')
      })
      setStaffUsers(stData)

      // サービスコード（shift_service_code）
      const scRes = await fetch('/api/service-codes', { cache: 'no-store' })
      if (scRes.ok) {
        const scData = (await scRes.json()) as ServiceCode[]
        // 並び：1) kaipoke_servicek 2) service_code
        scData.sort((a, b) => {
          const k = (a.kaipoke_servicek ?? '').localeCompare(b.kaipoke_servicek ?? '', 'ja')
          if (k !== 0) return k
          return (a.service_code ?? '').localeCompare(b.service_code ?? '', 'ja')
        })
        setServiceCodes(scData)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Fetch shifts when filters change ----
  useEffect(() => {
    const loadShifts = async () => {
      if (!selectedKaipokeCS || !selectedMonth) {
        setShifts([])
        return
      }
      const url = `/api/shifts?kaipoke_cs_id=${encodeURIComponent(selectedKaipokeCS)}&month=${encodeURIComponent(selectedMonth)}`
      const res = await fetch(url, { cache: 'no-store' })
      const raw = await res.json()
      const rows: ShiftRow[] = Array.isArray(raw) ? raw : []

      // 正規化 + 並び替え（開始日 → 開始時刻）
      const normalized = rows.map(r => ({
        ...r,
        required_staff_count: r.required_staff_count ?? 1,
        two_person_work_flg: r.two_person_work_flg ?? false,
        judo_ido: r.judo_ido ?? false,
        staff_01_user_id: r.staff_01_user_id ?? null,
        staff_02_user_id: r.staff_02_user_id ?? null,
        staff_03_user_id: r.staff_03_user_id ?? null,
        staff_02_attend_flg: r.staff_02_attend_flg ?? false,
        staff_03_attend_flg: r.staff_03_attend_flg ?? false,
      }))
      normalized.sort((a, b) => {
        const d = a.shift_start_date.localeCompare(b.shift_start_date)
        if (d !== 0) return d
        return a.shift_start_time.localeCompare(b.shift_start_time)
      })

      setShifts(normalized)
      setOpenRecordFor(null)
    }
    void loadShifts()
  }, [selectedKaipokeCS, selectedMonth])

  // 前後ナビ（利用者）
  const csIndex = useMemo(
    () => kaipokeCs.findIndex(c => c.kaipoke_cs_id === selectedKaipokeCS),
    [kaipokeCs, selectedKaipokeCS]
  )
  const csPrev = csIndex > 0 ? kaipokeCs[csIndex - 1] : null
  const csNext = csIndex >= 0 && csIndex < kaipokeCs.length - 1 ? kaipokeCs[csIndex + 1] : null

  // 保存
  const handleSave = async (row: ShiftRow) => {
    const body = {
      shift_id: row.shift_id,
      service_code: row.service_code,
      required_staff_count: row.required_staff_count,
      two_person_work_flg: row.two_person_work_flg,
      judo_ido: row.judo_ido,
      staff_01_user_id: row.staff_01_user_id,
      staff_02_user_id: row.staff_02_user_id,
      staff_03_user_id: row.staff_03_user_id,
      staff_02_attend_flg: row.staff_02_attend_flg,
      staff_03_attend_flg: row.staff_03_attend_flg,
    }

    const res = await fetch('/api/shifts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const msg = await res.text().catch(() => '')
      alert(`保存に失敗しました\n${msg}`)
      return
    }
    alert('保存しました')
  }

  // ローカル更新
  const updateRow = <K extends keyof ShiftRow>(shiftId: string, field: K, value: ShiftRow[K]) => {
    setShifts(prev => prev.map(r => (r.shift_id === shiftId ? { ...r, [field]: value } : r)))
  }

  // スタッフ option
  const staffOptions = useMemo(
    () =>
      staffUsers.map(u => ({
        value: u.user_id,
        label: humanName(u),
      })),
    [staffUsers]
  )

  // サービス option（null除外）
  const serviceOptions = useMemo(
    () =>
      serviceCodes
        .filter(s => s.service_code)
        .map(s => ({
          value: s.service_code as string,
          label: `${s.kaipoke_servicek ?? ''} / ${s.service_code}`,
        })),
    [serviceCodes]
  )

  // 月リスト（過去5年〜未来12ヶ月）
  const monthOptions = useMemo(() => {
    const now = new Date()
    const base = yyyymm(now)
    const list: string[] = []
    for (let i = 5 * 12; i >= 1; i--) list.push(addMonths(base, -i))
    list.push(base)
    for (let i = 1; i <= 12; i++) list.push(addMonths(base, i))
    return list
  }, [])

  return (
    <div className="p-4 space-y-4">
      {/* フィルターバー */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 月ナビ */}
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <label className="text-sm text-muted-foreground">実施月</label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setSelectedMonth(m => addMonths(m, -1))}>前月</Button>
              <div style={{ width: 160 }}>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="月を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setSelectedMonth(m => addMonths(m, +1))}>次月</Button>
            </div>
          </div>
        </div>

        {/* 利用者ナビ */}
        <div className="flex items-end gap-2">
          <div className="flex flex-col">
            <label className="text-sm text-muted-foreground">利用者</label>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={!csPrev}
                onClick={() => csPrev && setSelectedKaipokeCS(csPrev.kaipoke_cs_id)}
              >
                前へ（{csPrev?.name ?? '-'}）
              </Button>
              <div style={{ width: 260 }}>
                <Select value={selectedKaipokeCS} onValueChange={setSelectedKaipokeCS}>
                  <SelectTrigger>
                    <SelectValue placeholder="利用者を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {kaipokeCs.map(cs => (
                      <SelectItem key={cs.kaipoke_cs_id} value={cs.kaipoke_cs_id}>
                        {cs.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="secondary"
                disabled={!csNext}
                onClick={() => csNext && setSelectedKaipokeCS(csNext.kaipoke_cs_id)}
              >
                次へ（{csNext?.name ?? '-'}）
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* テーブル */}
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shift ID</TableHead>
              <TableHead>サービス</TableHead>
              <TableHead>開始日</TableHead>
              <TableHead>開始時間</TableHead>
              <TableHead>終了時間</TableHead>
              <TableHead>必要人数</TableHead>
              <TableHead>2人作業</TableHead>
              <TableHead>重度移動</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {shifts.map(row => (
              <>
                {/* 1行目：基本情報 */}
                <TableRow key={`${row.shift_id}-meta`}>
                  <TableCell><div className="whitespace-nowrap">{row.shift_id}</div></TableCell>

                  {/* サービス（Select） */}
                  <TableCell>
                    <div style={{ minWidth: 220 }}>
                      <Select
                        value={row.service_code ?? ''}
                        onValueChange={v => updateRow(row.shift_id, 'service_code', v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="サービスを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {serviceOptions.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>

                  <TableCell><div className="whitespace-nowrap">{row.shift_start_date}</div></TableCell>
                  <TableCell><div className="whitespace-nowrap">{row.shift_start_time}</div></TableCell>
                  <TableCell><div className="whitespace-nowrap">{row.shift_end_time}</div></TableCell>

                  {/* 必要人数 */}
                  <TableCell>
                    <div style={{ width: 110 }}>
                      <Input
                        type="number"
                        min={1}
                        value={row.required_staff_count ?? 1}
                        onChange={(e) =>
                          updateRow(row.shift_id, 'required_staff_count', Number(e.target.value || 1))
                        }
                      />
                    </div>
                  </TableCell>

                  {/* 2人作業 */}
                  <TableCell>
                    <Input
                      type="checkbox"
                      checked={!!row.two_person_work_flg}
                      onChange={e => updateRow(row.shift_id, 'two_person_work_flg', e.target.checked)}
                    />
                  </TableCell>

                  {/* 重度移動 */}
                  <TableCell>
                    <Input
                      type="checkbox"
                      checked={!!row.judo_ido}
                      onChange={e => updateRow(row.shift_id, 'judo_ido', e.target.checked)}
                    />
                  </TableCell>
                </TableRow>

                {/* 2行目：スタッフ & 操作 */}
                <TableRow key={`${row.shift_id}-staff`}>
                  <TableCell colSpan={8}>
                    <div className="flex flex-wrap items-center gap-3">
                      {/* スタッフ1 */}
                      <div className="flex items-center gap-2" style={{ minWidth: 260 }}>
                        <span className="text-sm text-muted-foreground">スタッフ1</span>
                        <div style={{ minWidth: 200 }}>
                          <Select
                            value={row.staff_01_user_id ?? ''}
                            onValueChange={v => updateRow(row.shift_id, 'staff_01_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem key="none1" value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* スタッフ2 + 同行 */}
                      <div className="flex items-center gap-2" style={{ minWidth: 360 }}>
                        <span className="text-sm text-muted-foreground">スタッフ2</span>
                        <div style={{ minWidth: 200 }}>
                          <Select
                            value={row.staff_02_user_id ?? ''}
                            onValueChange={v => updateRow(row.shift_id, 'staff_02_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem key="none2" value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="text-sm text-muted-foreground">同行</label>
                        <Input
                          type="checkbox"
                          checked={!!row.staff_02_attend_flg}
                          onChange={e => updateRow(row.shift_id, 'staff_02_attend_flg', e.target.checked)}
                        />
                      </div>

                      {/* スタッフ3 + 同行 */}
                      <div className="flex items-center gap-2" style={{ minWidth: 360 }}>
                        <span className="text-sm text-muted-foreground">スタッフ3</span>
                        <div style={{ minWidth: 200 }}>
                          <Select
                            value={row.staff_03_user_id ?? ''}
                            onValueChange={v => updateRow(row.shift_id, 'staff_03_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem key="none3" value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="text-sm text-muted-foreground">同行</label>
                        <Input
                          type="checkbox"
                          checked={!!row.staff_03_attend_flg}
                          onChange={e => updateRow(row.shift_id, 'staff_03_attend_flg', e.target.checked)}
                        />
                      </div>

                      {/* 操作 */}
                      <div className="ml-auto flex gap-2">
                        <Button variant="default" onClick={() => handleSave(row)}>保存</Button>
                        <Button
                          variant="outline"
                          onClick={() => setOpenRecordFor(prev => (prev === row.shift_id ? null : row.shift_id))}
                        >
                          訪問記録
                        </Button>
                      </div>
                    </div>

                    {/* インライン訪問記録 */}
                    {openRecordFor === row.shift_id && (
                      <div className="border rounded-md p-3 mt-3">
                        <ShiftRecord shiftId={row.shift_id} />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              </>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
