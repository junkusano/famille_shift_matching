//portal/monthly/page.tsx
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
  certifications: string[] | null
}

type ServiceCode = {
  id: string
  service_code: string | null
  kaipoke_servicek: string | null
  kaipoke_servicecode: string | null
}

type ShiftRow = {
  shift_id: string
  kaipoke_cs_id: string
  name: string
  shift_start_date: string
  shift_start_time: string
  shift_end_time: string
  service_code: string
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  required_staff_count: number | null
  two_person_work_flg: boolean | null
  judo_ido: boolean | null
  staff_02_attend_flg: boolean | null
  staff_03_attend_flg: boolean | null
}

// ===== Helpers =====
const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const addMonths = (month: string, diff: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + diff, 1)
  return yyyymm(d)
}
const humanName = (u: StaffUser) =>
  `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim() || u.user_id

// ===== Component =====
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
      // 利用者
      const csRes = await fetch('/api/kaipoke-info', { cache: 'no-store' })
      const csData: KaipokeCs[] = await csRes.json()
      const valid = csData.filter((c) => c.name && c.kaipoke_cs_id)
      valid.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      setKaipokeCs(valid)
      if (valid.length && !selectedKaipokeCS) setSelectedKaipokeCS(valid[0].kaipoke_cs_id)

      // スタッフ
      const stRes = await fetch('/api/users', { cache: 'no-store' })
      const stData: StaffUser[] = await stRes.json()
      setStaffUsers(stData)

      // サービスコード
      const scRes = await fetch('/api/service-codes', { cache: 'no-store' })
      if (scRes.ok) {
        const scData: ServiceCode[] = await scRes.json()
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
      const url = `/api/shifts?kaipoke_cs_id=${encodeURIComponent(selectedKaipokeCS)}&month=${encodeURIComponent(
        selectedMonth
      )}`
      const res = await fetch(url, { cache: 'no-store' })
      const data: ShiftRow[] = await res.json()

      const normalized = (Array.isArray(data) ? data : []).map((r) => ({
        ...r,
        staff_01_user_id: r.staff_01_user_id ?? null,
        staff_02_user_id: r.staff_02_user_id ?? null,
        staff_03_user_id: r.staff_03_user_id ?? null,
        required_staff_count: r.required_staff_count ?? 1,
        two_person_work_flg: r.two_person_work_flg ?? false,
        judo_ido: r.judo_ido ?? false,
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
    () => kaipokeCs.findIndex((c) => c.kaipoke_cs_id === selectedKaipokeCS),
    [kaipokeCs, selectedKaipokeCS]
  )
  const csPrev = csIndex > 0 ? kaipokeCs[csIndex - 1] : null
  const csNext = csIndex >= 0 && csIndex < kaipokeCs.length - 1 ? kaipokeCs[csIndex + 1] : null

  // 保存
  const handleSave = async (row: ShiftRow) => {
    const body = {
      shift_id: row.shift_id,
      service_code: row.service_code,
      staff_01_user_id: row.staff_01_user_id,
      staff_02_user_id: row.staff_02_user_id,
      staff_03_user_id: row.staff_03_user_id,
      staff_02_attend_flg: row.staff_02_attend_flg,
      staff_03_attend_flg: row.staff_03_attend_flg,
      required_staff_count: row.required_staff_count,
      two_person_work_flg: row.two_person_work_flg,
      judo_ido: row.judo_ido,
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

  // 編集（ローカル状態更新）
  const updateRow = <K extends keyof ShiftRow>(shiftId: string, field: K, value: ShiftRow[K]) => {
    setShifts((prev) => prev.map((r) => (r.shift_id === shiftId ? { ...r, [field]: value } : r)))
  }

  // スタッフオプション
  const staffOptions = useMemo(
    () => staffUsers.map((u) => ({ value: u.user_id, label: humanName(u) })),
    [staffUsers]
  )

  // サービスコード
  const serviceOptions = useMemo(
    () =>
      serviceCodes
        .filter((s) => s.service_code)
        .map((s) => ({
          value: s.service_code as string,
          label: `${s.kaipoke_servicek ?? ''} / ${s.service_code}`,
        })),
    [serviceCodes]
  )

  const currentCsName = useMemo(() => {
    const cs = kaipokeCs.find((c) => c.kaipoke_cs_id === selectedKaipokeCS)
    return cs?.name ?? ''
  }, [kaipokeCs, selectedKaipokeCS])

  // 月の選択肢（過去5年〜未来12ヶ月）
  const monthOptions = useMemo(() => {
    const now = new Date()
    const list: string[] = []
    for (let i = 5 * 12; i >= 1; i--) list.push(addMonths(yyyymm(now), -i))
    list.push(yyyymm(now))
    for (let i = 1; i <= 12; i++) list.push(addMonths(yyyymm(now), i))
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
              <Button variant="secondary" onClick={() => setSelectedMonth((m) => addMonths(m, -1))}>
                前月
              </Button>
              <div style={{ width: 160 }}>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="月を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="secondary" onClick={() => setSelectedMonth((m) => addMonths(m, +1))}>
                次月
              </Button>
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
                    {kaipokeCs.map((cs) => (
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

        {/* 現在のフィルター表示 */}
        <div className="text-sm text-muted-foreground ml-auto">
          {currentCsName && (
            <span>
              対象：{currentCsName}／{selectedMonth}
            </span>
          )}
        </div>
      </div>

      {/* テーブル */}
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>利用者</TableHead>
              <TableHead>Shift ID</TableHead>
              <TableHead>開始日</TableHead>
              <TableHead>開始時間</TableHead>
              <TableHead>サービス</TableHead>
              <TableHead>必要人数</TableHead>
              <TableHead>2人作業</TableHead>
              <TableHead>重度移動</TableHead>
              <TableHead>スタッフ1</TableHead>
              <TableHead>スタッフ2</TableHead>
              <TableHead>同行2</TableHead>
              <TableHead>スタッフ3</TableHead>
              <TableHead>同行3</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.map((row) => (
              <TableRow key={row.shift_id}>
                <TableCell><div className="whitespace-nowrap">{row.name}</div></TableCell>
                <TableCell><div className="whitespace-nowrap">{row.shift_id}</div></TableCell>
                <TableCell><div className="whitespace-nowrap">{row.shift_start_date}</div></TableCell>
                <TableCell><div className="whitespace-nowrap">{row.shift_start_time}</div></TableCell>

                {/* サービス（セレクト） */}
                <TableCell>
                  <div style={{ minWidth: 220 }}>
                    <Select
                      value={row.service_code}
                      onValueChange={(v) => updateRow(row.shift_id, 'service_code', v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="サービスを選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {serviceOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>

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
                    onChange={(e) => updateRow(row.shift_id, 'two_person_work_flg', e.target.checked)}
                  />
                </TableCell>

                {/* 重度移動 */}
                <TableCell>
                  <Input
                    type="checkbox"
                    checked={!!row.judo_ido}
                    onChange={(e) => updateRow(row.shift_id, 'judo_ido', e.target.checked)}
                  />
                </TableCell>

                {/* スタッフ1 */}
                <TableCell>
                  <div style={{ minWidth: 200 }}>
                    <Select
                      value={row.staff_01_user_id ?? ''}
                      onValueChange={(v) => updateRow(row.shift_id, 'staff_01_user_id', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="none" value="">
                          -
                        </SelectItem>
                        {staffOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>

                {/* スタッフ2 */}
                <TableCell>
                  <div style={{ minWidth: 200 }}>
                    <Select
                      value={row.staff_02_user_id ?? ''}
                      onValueChange={(v) => updateRow(row.shift_id, 'staff_02_user_id', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="none" value="">
                          -
                        </SelectItem>
                        {staffOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>

                {/* 同行2 */}
                <TableCell>
                  <Input
                    type="checkbox"
                    checked={!!row.staff_02_attend_flg}
                    onChange={(e) => updateRow(row.shift_id, 'staff_02_attend_flg', e.target.checked)}
                  />
                </TableCell>

                {/* スタッフ3 */}
                <TableCell>
                  <div style={{ minWidth: 200 }}>
                    <Select
                      value={row.staff_03_user_id ?? ''}
                      onValueChange={(v) => updateRow(row.shift_id, 'staff_03_user_id', v || null)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="none" value="">
                          -
                        </SelectItem>
                        {staffOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>

                {/* 同行3 */}
                <TableCell>
                  <Input
                    type="checkbox"
                    checked={!!row.staff_03_attend_flg}
                    onChange={(e) => updateRow(row.shift_id, 'staff_03_attend_flg', e.target.checked)}
                  />
                </TableCell>

                {/* 操作 */}
                <TableCell>
                  <div className="flex gap-2">
                    <Button variant="default" onClick={() => handleSave(row)}>
                      保存
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setOpenRecordFor((prev) => (prev === row.shift_id ? null : row.shift_id))}
                    >
                      訪問記録
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* インライン訪問記録 */}
        {openRecordFor && (
          <div className="border rounded-md p-3 mt-3">
            <ShiftRecord shiftId={openRecordFor} />
          </div>
        )}
      </div>
    </div>
  )
}
