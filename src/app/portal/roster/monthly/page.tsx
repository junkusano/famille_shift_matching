//portal/monthly/page.tsx
'use client'

import { useEffect, useMemo, useState, Fragment } from 'react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
//import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ShiftRecord from '@/components/shift/ShiftRecord'

// ========= Types =========
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
  roster_sort: number | null
}

type ServiceCode = {
  id: string
  service_code: string | null
  require_doc_group: string | null
  kaipoke_servicek: string | null
  kaipoke_servicecode: string | null
}

type ShiftRow = {
  shift_id: string
  kaipoke_cs_id: string
  shift_start_date: string    // YYYY-MM-DD
  shift_start_time: string    // HH:mm
  shift_end_time: string      // HH:mm
  service_code: string        // 編集可(Select)
  required_staff_count: number | null
  two_person_work_flg: boolean | null
  judo_ido: boolean | null
  staff_01_user_id: string | null
  staff_02_user_id: string | null
  staff_03_user_id: string | null
  staff_02_attend_flg: boolean | null
  staff_03_attend_flg: boolean | null

  // --- UIローカル項目（保存時に既存カラムへマッピング）---
  // 派遣人数：'-' | '01'（'01' は「2人同時作業」を意味し required_staff_count=2 として保存）
  dispatch_size?: '-' | '01'
  // 重複：'-' | '01' | '02'（'-' は重複なし、'01'/'02'は「1人目/2人目」→ two_person_work_flg=true として保存）
  dup_role?: '-' | '01' | '02'
}

// ========= Helpers =========
const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const addMonths = (month: string, diff: number) => {
  const [y, m] = month.split('-').map(Number)
  const dt = new Date(y, (m - 1) + diff, 1)
  return yyyymm(dt)
}
const humanName = (u: StaffUser) =>
  `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim() || u.user_id

export default function MonthlyRosterPage() {
  // マスタ
  const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([])
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
  const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([])

  // フィルタ
  const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>('') // kaipoke_cs_id
  const [selectedMonth, setSelectedMonth] = useState<string>(yyyymm(new Date()))

  // 明細
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [openRecordFor, setOpenRecordFor] = useState<string | null>(null)

  // --- masters ---
  useEffect(() => {
    const loadMasters = async () => {
      // 利用者
      const csRes = await fetch('/api/kaipoke-info', { cache: 'no-store' })
      const csJson = (await csRes.json()) as KaipokeCs[] | { error?: string }
      const csArr: KaipokeCs[] = Array.isArray(csJson) ? csJson : []
      const validCs = csArr
        .filter(c => c.kaipoke_cs_id && c.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      setKaipokeCs(validCs)
      if (validCs.length && !selectedKaipokeCS) setSelectedKaipokeCS(validCs[0].kaipoke_cs_id)

      // スタッフ（roster_sort → 氏名）
      const stRes = await fetch('/api/users', { cache: 'no-store' })
      const stJson = (await stRes.json()) as StaffUser[] | { error?: string }
      const stArr: StaffUser[] = Array.isArray(stJson) ? stJson : []
      stArr.sort((a, b) => {
        const ra = a.roster_sort ?? Number.POSITIVE_INFINITY
        const rb = b.roster_sort ?? Number.POSITIVE_INFINITY
        if (ra !== rb) return ra - rb
        return humanName(a).localeCompare(humanName(b), 'ja')
      })
      setStaffUsers(stArr)

      // サービスコード
      let scArr: ServiceCode[] = []
      try {
        const scRes = await fetch('/api/service-codes', { cache: 'no-store' })
        if (scRes.ok) {
          const scJson = (await scRes.json()) as ServiceCode[] | { error?: string }
          if (Array.isArray(scJson)) scArr = scJson
        }
        // フォールバック（環境によってエンドポイント名が違うケースの救済）
        if (scArr.length === 0) {
          const fb = await fetch('/api/shift-service-code', { cache: 'no-store' })
          if (fb.ok) {
            const scJson = (await fb.json()) as ServiceCode[] | { error?: string }
            if (Array.isArray(scJson)) scArr = scJson
          }
        }
      } catch (e) {
        // noop
      }
      scArr = scArr.filter(s => s.service_code) // null除外
      scArr.sort((a, b) => {
        const k = (a.kaipoke_servicek ?? '').localeCompare(b.kaipoke_servicek ?? '', 'ja')
        if (k !== 0) return k
        return (a.service_code ?? '').localeCompare(b.service_code ?? '', 'ja')
      })
      setServiceCodes(scArr)
    }
    void loadMasters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- shifts ---
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

      // UIローカル項目の初期化 + 並び替え
      const normalized: ShiftRow[] = rows.map(r => {
        const required = r.required_staff_count ?? 1
        const dispatch_size: ShiftRow['dispatch_size'] = required >= 2 ? '01' : '-'
        const dup_role: ShiftRow['dup_role'] = r.two_person_work_flg ? '01' : '-' // 情報がなければ '01' で既定
        return {
          ...r,
          required_staff_count: required,
          two_person_work_flg: r.two_person_work_flg ?? false,
          judo_ido: r.judo_ido ?? false,
          staff_01_user_id: r.staff_01_user_id ?? null,
          staff_02_user_id: r.staff_02_user_id ?? null,
          staff_03_user_id: r.staff_03_user_id ?? null,
          staff_02_attend_flg: r.staff_02_attend_flg ?? false,
          staff_03_attend_flg: r.staff_03_attend_flg ?? false,
          dispatch_size,
          dup_role,
        }
      })
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
    // UI項目→保存項目へマッピング
    const required_staff_count = row.dispatch_size === '01' ? 2 : 1
    const two_person_work_flg = row.dup_role !== '-'

    const body = {
      shift_id: row.shift_id,
      service_code: row.service_code,
      required_staff_count,
      two_person_work_flg,
      judo_ido: !!row.judo_ido,
      staff_01_user_id: row.staff_01_user_id,
      staff_02_user_id: row.staff_02_user_id,
      staff_03_user_id: row.staff_03_user_id,
      staff_02_attend_flg: !!row.staff_02_attend_flg,
      staff_03_attend_flg: !!row.staff_03_attend_flg,
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

  // options
  const staffOptions = useMemo(
    () => staffUsers.map(u => ({ value: u.user_id, label: humanName(u) })),
    [staffUsers]
  )
  const serviceOptions = useMemo(
    () => serviceCodes.map(s => ({
      value: s.service_code as string,
      label: `${s.kaipoke_servicek ?? ''} / ${s.service_code ?? ''}`.trim(),
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
        {/* 実施月 */}
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

        {/* 利用者 */}
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
              <TableHead>派遣人数</TableHead>
              <TableHead>重複</TableHead>
              <TableHead>重度移動</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {shifts.map((row) => (
              <Fragment key={row.shift_id}>
                {/* 1行目：基本情報 */}
                <TableRow>
                  <TableCell><div className="whitespace-nowrap">{row.shift_id}</div></TableCell>

                  {/* サービス */}
                  <TableCell>
                    <div style={{ width: 220 }}>
                      <Select
                        value={row.service_code ?? ''}
                        onValueChange={(v) => updateRow(row.shift_id, 'service_code', v)}
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

                  {/* 派遣人数（Select） */}
                  <TableCell>
                    <div style={{ width: 160 }}>
                      <Select
                        value={row.dispatch_size ?? '-'}
                        onValueChange={(v: '-' | '01') => {
                          updateRow(row.shift_id, 'dispatch_size', v)
                          // required_staff_count へ即時反映
                          updateRow(row.shift_id, 'required_staff_count', v === '01' ? 2 : 1)
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-">-</SelectItem>
                          <SelectItem value="01">2人同時作業</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>

                  {/* 重複（Select） */}
                  <TableCell>
                    <div style={{ width: 140 }}>
                      <Select
                        value={row.dup_role ?? '-'}
                        onValueChange={(v: '-' | '01' | '02') => {
                          updateRow(row.shift_id, 'dup_role', v)
                          updateRow(row.shift_id, 'two_person_work_flg', v !== '-')
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-">-</SelectItem>
                          <SelectItem value="01">1人目</SelectItem>
                          <SelectItem value="02">2人目</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>

                  {/* 重度移動（小さめチェック） */}
                  <TableCell>
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={!!row.judo_ido}
                      onChange={(e) => updateRow(row.shift_id, 'judo_ido', e.target.checked)}
                    />
                  </TableCell>
                </TableRow>

                {/* 2行目：スタッフ＆操作（横並び・省スペース） */}
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="flex flex-row flex-wrap items-center gap-3">
                      {/* スタッフ1 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">スタッフ1</span>
                        <div style={{ width: 180 }}>
                          <Select
                            value={row.staff_01_user_id ?? ''}
                            onValueChange={(v) => updateRow(row.shift_id, 'staff_01_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* スタッフ2 + 同 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">スタッフ2</span>
                        <div style={{ width: 180 }}>
                          <Select
                            value={row.staff_02_user_id ?? ''}
                            onValueChange={(v) => updateRow(row.shift_id, 'staff_02_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-sm text-muted-foreground">同</span>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!row.staff_02_attend_flg}
                          onChange={(e) => updateRow(row.shift_id, 'staff_02_attend_flg', e.target.checked)}
                        />
                      </div>

                      {/* スタッフ3 + 同 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">スタッフ3</span>
                        <div style={{ width: 180 }}>
                          <Select
                            value={row.staff_03_user_id ?? ''}
                            onValueChange={(v) => updateRow(row.shift_id, 'staff_03_user_id', v || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="選択" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">-</SelectItem>
                              {staffOptions.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-sm text-muted-foreground">同</span>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={!!row.staff_03_attend_flg}
                          onChange={(e) => updateRow(row.shift_id, 'staff_03_attend_flg', e.target.checked)}
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

                {/* ディバイダ（行の境界をはっきり） */}
                <TableRow>
                  <TableCell colSpan={8}>
                    <div className="h-px bg-muted" />
                  </TableCell>
                </TableRow>
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
