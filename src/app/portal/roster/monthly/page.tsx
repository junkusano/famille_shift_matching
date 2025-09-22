//portal/roster/monthly/page.tsx
'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
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
    shift_start_date: string // YYYY-MM-DD
    shift_start_time: string // HH:mm
    shift_end_time: string // HH:mm
    service_code: string // Select編集可
    required_staff_count: number | null
    two_person_work_flg: boolean | null
    judo_ido: string | null // 4桁(HHMM) 例: "0200"
    staff_01_user_id: string | null
    staff_02_user_id: string | null
    staff_03_user_id: string | null
    staff_02_attend_flg: boolean | null
    staff_03_attend_flg: boolean | null

    // --- UIローカル項目 ---
    dispatch_size?: '-' | '01' // '-' | '01(=2人同時作業)'
    dup_role?: '-' | '01' | '02' // 重複: '-' | '1人目' | '2人目'
}

// ========= Helpers =========
const yyyymm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const addMonths = (month: string, diff: number) => {
    const [y, m] = month.split('-').map(Number)
    const dt = new Date(y, (m - 1) + diff, 1)
    return yyyymm(dt)
}
const humanName = (u: StaffUser) => `${u.last_name_kanji ?? ''}${u.first_name_kanji ?? ''}`.trim() || u.user_id

// 日付/時刻/重度移動 入力検証 & 整形
const isValidDateStr = (s: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
    const [y, m, d] = s.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}
const normalizeDateInput = (raw: string): string => {
    const s = raw.trim()
    if (/^\d{8}$/.test(s)) {
        // YYYYMMDD → YYYY-MM-DD
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    }
    return s
}
// 入力から必ず HH:mm を返す（寛容に受けて矯正）
const toHM = (val?: string | null): string => {
    if (!val) return ''
    // 例: "09:30:00" / "9:3" / "0930" などを許容
    const m = /^(\d{1,2})(?::?)(\d{2})(?::\d{2})?$/.exec(val) || /^(\d{1,2}):(\d{1,2})$/.exec(val)
    if (m) {
        const hh = String(Math.max(0, Math.min(23, parseInt(m[1], 10)))).padStart(2, '0')
        const mm = String(Math.max(0, Math.min(59, parseInt(m[2], 10)))).padStart(2, '0')
        return `${hh}:${mm}`
    }
    // 最低限のフォールバック（"HH:MM:SS" → 先頭5文字）
    return val.slice(0, 5)
}
const hmToHMS = (hm: string): string => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
    if (!m) return hm
    const hh = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${hh}:${mm}:00`
}
const isValidTimeStr = (s: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
const isValidJudoIdo = (s: string): boolean => {
    if (!/^\d{4}$/.test(s)) return false
    const hh = Number(s.slice(0, 2))
    const mm = Number(s.slice(2, 4))
    return hh >= 0 && hh < 24 && mm >= 0 && mm < 60
}
const weekdayJa = (dateStr: string): string => {
    if (!isValidDateStr(dateStr)) return '-'
    const [y, m, d] = dateStr.split('-').map(Number)
    const wd = new Date(y, m - 1, d).getDay()
    return ['日', '月', '火', '水', '木', '金', '土'][wd]
}

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

    // 削除選択
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    // ヘッダーの「全選択」checkboxの indeterminate 制御
    const selectAllRef = useRef<HTMLInputElement>(null)
    const allSelected = shifts.length > 0 && selectedIds.size === shifts.length
    const someSelected = selectedIds.size > 0 && selectedIds.size < shifts.length
    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someSelected
        }
    }, [someSelected])

    // --- masters ---
    useEffect(() => {
        const loadMasters = async () => {
            // 利用者
            const csRes = await fetch('/api/kaipoke-info', { cache: 'no-store' })
            const csJson = await csRes.json()
            const csArr: KaipokeCs[] = Array.isArray(csJson) ? csJson : []
            const validCs = csArr
                .filter((c) => c.kaipoke_cs_id && c.name)
                .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            setKaipokeCs(validCs)
            if (validCs.length && !selectedKaipokeCS) setSelectedKaipokeCS(validCs[0].kaipoke_cs_id)

            // スタッフ（roster_sort → 氏名）
            const stRes = await fetch('/api/users', { cache: 'no-store' })
            const stJson = await stRes.json()
            const stArr: StaffUser[] = Array.isArray(stJson) ? stJson : []
            stArr.sort((a, b) => {
                const ra = a.roster_sort ?? Number.POSITIVE_INFINITY
                const rb = b.roster_sort ?? Number.POSITIVE_INFINITY
                if (ra !== rb) return ra - rb
                return humanName(a).localeCompare(humanName(b), 'ja')
            })
            setStaffUsers(stArr)

            // サービスコード（/api/service-codes → Fallback /api/shift-service-code）
            let scArr: ServiceCode[] = []
            try {
                const scRes = await fetch('/api/service-codes', { cache: 'no-store' })
                if (scRes.ok) {
                    const scJson = await scRes.json()
                    if (Array.isArray(scJson)) scArr = scJson
                }
                if (scArr.length === 0) {
                    const fb = await fetch('/api/shift-service-code', { cache: 'no-store' })
                    if (fb.ok) {
                        const scJson = await fb.json()
                        if (Array.isArray(scJson)) scArr = scJson
                    }
                }
            } catch {
                // noop
            }
            scArr = scArr.filter((s) => s.service_code)
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
            const normalized: ShiftRow[] = rows.map((r) => {
                const required = r.required_staff_count ?? 1
                const dispatch_size: ShiftRow['dispatch_size'] = required >= 2 ? '01' : '-'
                const dup_role: ShiftRow['dup_role'] = r.two_person_work_flg ? '01' : '-'
                return {
                    ...r,
                    required_staff_count: required,
                    two_person_work_flg: r.two_person_work_flg ?? false,
                    shift_start_time: toHM(r.shift_start_time),
                    shift_end_time: toHM(r.shift_end_time),
                    judo_ido: r.judo_ido ?? '',
                    staff_01_user_id: r.staff_01_user_id ?? null,
                    staff_02_user_id: r.staff_02_user_id ?? null,
                    staff_03_user_id: r.staff_03_user_id ?? null,
                    staff_02_attend_flg: r.staff_02_attend_flg ?? false,
                    staff_03_attend_flg: r.staff_03_attend_flg ?? false,
                    dispatch_size,
                    dup_role,
                }
            })
            // 並べ替え：開始日 → 開始時間
            normalized.sort((a, b) => {
                const d = a.shift_start_date.localeCompare(b.shift_start_date)
                if (d !== 0) return d
                return a.shift_start_time.localeCompare(b.shift_start_time)
            })
            setShifts(normalized)
            setOpenRecordFor(null)
            setSelectedIds(new Set())
        }
        void loadShifts()
    }, [selectedKaipokeCS, selectedMonth])

    // 前後ナビ（利用者）
    const csIndex = useMemo(() => kaipokeCs.findIndex((c) => c.kaipoke_cs_id === selectedKaipokeCS), [kaipokeCs, selectedKaipokeCS])
    const csPrev = csIndex > 0 ? kaipokeCs[csIndex - 1] : null
    const csNext = csIndex >= 0 && csIndex < kaipokeCs.length - 1 ? kaipokeCs[csIndex + 1] : null

    // 保存
    const handleSave = async (row: ShiftRow) => {
        const required_staff_count = row.dispatch_size === '01' ? 2 : 1
        const two_person_work_flg = row.dup_role !== '-'

        // バリデーション（保存前）
        const dateOk = isValidDateStr(row.shift_start_date)
        const stOk = isValidTimeStr(row.shift_start_time)
        const etOk = isValidTimeStr(row.shift_end_time)
        const jiOk = row.judo_ido ? isValidJudoIdo(row.judo_ido) : true
        if (!dateOk || !stOk || !etOk || !jiOk) {
            alert('入力に不備があります（開始日/開始時間/終了時間/重度移動）')
            return
        }

        const body = {
            shift_id: row.shift_id,
            service_code: row.service_code,
            required_staff_count,
            two_person_work_flg,
            judo_ido: row.judo_ido ?? null,
            staff_01_user_id: row.staff_01_user_id,
            staff_02_user_id: row.staff_02_user_id,
            staff_03_user_id: row.staff_03_user_id,
            staff_02_attend_flg: !!row.staff_02_attend_flg,
            staff_03_attend_flg: !!row.staff_03_attend_flg,
            shift_start_time: hmToHMS(toHM(row.shift_start_time)),
            shift_end_time: hmToHMS(toHM(row.shift_end_time)),
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
        setShifts((prev) => prev.map((r) => (r.shift_id === shiftId ? { ...r, [field]: value } : r)))
    }

    // 削除選択トグル
    const toggleSelect = (shiftId: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(shiftId)
            else next.delete(shiftId)
            return next
        })
    }

    // 一括削除
    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0) return
        if (!confirm(`${selectedIds.size} 件を削除します。よろしいですか？`)) return
        const ids = Array.from(selectedIds)
        const res = await fetch('/api/shifts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        })
        if (!res.ok) {
            const msg = await res.text().catch(() => '')
            alert(`削除に失敗しました\n${msg}`)
            return
        }
        setShifts((prev) => prev.filter((r) => !selectedIds.has(r.shift_id)))
        setSelectedIds(new Set())
    }

    // 個別削除
    const handleDeleteOne = async (id: string) => {
        if (!confirm('この行を削除します。よろしいですか？')) return
        const res = await fetch('/api/shifts', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [id] }),
        })
        if (!res.ok) {
            const msg = await res.text().catch(() => '')
            alert(`削除に失敗しました\n${msg}`)
            return
        }
        setShifts((prev) => prev.filter((r) => r.shift_id !== id))
        setSelectedIds((prev) => {
            const next = new Set(prev)
            next.delete(id)
            return next
        })
    }

    // options
    const staffOptions = useMemo(() => staffUsers.map((u) => ({ value: u.user_id, label: humanName(u) })), [staffUsers])
    const serviceOptions = useMemo(
        () =>
            serviceCodes.map((s) => ({
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

    // 全選択ON/OFF
    const onToggleSelectAll = (checked: boolean) => {
        if (!checked) {
            setSelectedIds(new Set())
            return
        }
        setSelectedIds(new Set(shifts.map((s) => s.shift_id)))
    }

    return (
        <div className="p-4 space-y-4">
            {/* フィルターバー */}
            <div className="flex flex-wrap items-end gap-3">
                {/* 実施月 */}
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

                {/* 利用者 */}
                <div className="flex flex-col">
                    <label className="text-sm text-muted-foreground">利用者</label>
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" disabled={!csPrev} onClick={() => csPrev && setSelectedKaipokeCS(csPrev.kaipoke_cs_id)}>
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
                        <Button variant="secondary" disabled={!csNext} onClick={() => csNext && setSelectedKaipokeCS(csNext.kaipoke_cs_id)}>
                            次へ（{csNext?.name ?? '-'}）
                        </Button>
                    </div>
                </div>

                {/* 一括削除（必要時のみ表示） */}
                {selectedIds.size > 0 && (
                    <div className="ml-auto">
                        <Button variant="destructive" onClick={handleDeleteSelected}>
                            選択行を削除（{selectedIds.size}）
                        </Button>
                    </div>
                )}
            </div>

            {/* テーブル（ヘッダー固定・行境界くっきり） */}
            <div className="w-full overflow-x-auto overflow-y-auto max-h-[99999vh] rounded-md border border-gray-300">
                <Table>
                    <TableHeader
                        className="sticky top-0 z-10 bg-white shadow-sm [&_tr]:min-h-[50px] [&_th]:py-6 [&_th]:text-base"
                    >
                        <TableRow className="border-b">
                            <TableHead className="w-[44px]">
                                {/* 全選択 */}
                                <input
                                    ref={selectAllRef}
                                    aria-label="全選択"
                                    type="checkbox"
                                    className="h-3.5 w-3.5"
                                    checked={allSelected}
                                    onChange={(ev) => onToggleSelectAll(ev.target.checked)}
                                />
                            </TableHead>
                            <TableHead>開始日</TableHead>
                            <TableHead>開始時間</TableHead>
                            <TableHead>終了時間</TableHead>
                            <TableHead>サービス</TableHead>
                            <TableHead>派遣人数</TableHead>
                            <TableHead>重複</TableHead>
                            <TableHead>重度移動</TableHead>
                            <TableHead>Shift ID</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {shifts.map((row) => {
                            const dateInvalid = !isValidDateStr(row.shift_start_date)
                            const stInvalid = !isValidTimeStr(row.shift_start_time)
                            const etInvalid = !isValidTimeStr(row.shift_end_time)
                            const jiInvalid = row.judo_ido ? !isValidJudoIdo(row.judo_ido) : false
                            const saveDisabled = dateInvalid || stInvalid || etInvalid || jiInvalid

                            return (
                                <Fragment key={row.shift_id}>
                                    {/* 1行目：基本情報 */}
                                    <TableRow className="border-y border-gray-300">
                                        {/* 選択 */}
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                className="h-3.5 w-3.5"
                                                checked={selectedIds.has(row.shift_id)}
                                                onChange={(ev) => toggleSelect(row.shift_id, ev.target.checked)}
                                            />
                                        </TableCell>

                                        {/* 開始日（テキスト + 曜日） */}
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-[100px]">
                                                    <Input
                                                        value={row.shift_start_date}
                                                        onChange={(ev) => updateRow(row.shift_id, 'shift_start_date', ev.target.value)}
                                                        onBlur={(ev) => {
                                                            const v = normalizeDateInput(ev.target.value)
                                                            updateRow(row.shift_id, 'shift_start_date', v)
                                                        }}
                                                        placeholder="YYYY-MM-DD"
                                                        className={dateInvalid ? 'border-red-500' : ''}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground">（{weekdayJa(row.shift_start_date)}）</span>
                                            </div>
                                        </TableCell>

                                        {/* 開始時間 */}
                                        <TableCell>
                                            <div className="w-[70px]">
                                                <Input
                                                    aria-label="開始時間"
                                                    value={toHM(row.shift_start_time)}
                                                    onChange={(ev) => updateRow(row.shift_id, 'shift_start_time', toHM(ev.currentTarget.value))}
                                                    onBlur={(ev) => updateRow(row.shift_id, 'shift_start_time', toHM(ev.currentTarget.value))}
                                                    placeholder="HH:MM"
                                                    inputMode="numeric"
                                                    pattern="^\n{2}:\n{2}$"
                                                    className={stInvalid ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
                                                />
                                            </div>
                                        </TableCell>

                                        {/* 終了時間 */}
                                        <TableCell>
                                            <div className="w-[70px]">
                                                <Input
                                                    aria-label="終了時間"
                                                    value={toHM(row.shift_end_time)}
                                                    onChange={(ev) => updateRow(row.shift_id, 'shift_end_time', toHM(ev.currentTarget.value))}
                                                    onBlur={(ev) => updateRow(row.shift_id, 'shift_end_time', toHM(ev.currentTarget.value))}
                                                    placeholder="HH:MM"
                                                    inputMode="numeric"
                                                    pattern="^\n{2}:\n{2}$"
                                                    className={etInvalid ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
                                                />
                                            </div>
                                        </TableCell>

                                        {/* サービス */}
                                        <TableCell>
                                            <div className="w-56">
                                                <Select value={row.service_code ?? ''} onValueChange={(v) => updateRow(row.shift_id, 'service_code', v)}>
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

                                        {/* 派遣人数（Select：幅 2/3相当） */}
                                        <TableCell>
                                            <div className="w-[112px]">
                                                <Select
                                                    value={row.dispatch_size ?? '-'}
                                                    onValueChange={(v: '-' | '01') => {
                                                        updateRow(row.shift_id, 'dispatch_size', v)
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

                                        {/* 重複（Select：幅 1/2相当） */}
                                        <TableCell>
                                            <div className="w-[80px]">
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

                                        {/* 重度移動（テキスト 4桁：幅 2/3相当） */}
                                        <TableCell>
                                            <div className="w-[100px]">
                                                <Input
                                                    value={row.judo_ido ?? ''}
                                                    onChange={(ev) => {
                                                        const v = ev.target.value.replace(/[^\d]/g, '').slice(0, 4)
                                                        updateRow(row.shift_id, 'judo_ido', v)
                                                    }}
                                                    placeholder="HHMM"
                                                    className={jiInvalid ? 'border-red-500' : ''}
                                                />
                                            </div>
                                        </TableCell>
                                        {/* Shift ID */}
                                        <TableCell>
                                            <div className="whitespace-nowrap">{row.shift_id}</div>
                                        </TableCell>
                                    </TableRow>
                                    {/* 2行目：スタッフ＆操作（横並び、区切り太め） */}
                                    <TableRow className="border-b-2 border-gray-300">
                                        <TableCell colSpan={9}>
                                            <div className="flex flex-row flex-wrap items-center gap-3">
                                                {/* スタッフ1 */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground">スタッフ1</span>
                                                    <div className="w-44">
                                                        <Select
                                                            value={row.staff_01_user_id ?? ''}
                                                            onValueChange={(v) => updateRow(row.shift_id, 'staff_01_user_id', v || null)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="選択" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="">-</SelectItem>
                                                                {staffOptions.map((o) => (
                                                                    <SelectItem key={o.value} value={o.value}>
                                                                        {o.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* スタッフ2 + 同 */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground">スタッフ2</span>
                                                    <div className="w-44">
                                                        <Select
                                                            value={row.staff_02_user_id ?? ''}
                                                            onValueChange={(v) => updateRow(row.shift_id, 'staff_02_user_id', v || null)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="選択" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="">-</SelectItem>
                                                                {staffOptions.map((o) => (
                                                                    <SelectItem key={o.value} value={o.value}>
                                                                        {o.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">同</span>
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5"
                                                        checked={!!row.staff_02_attend_flg}
                                                        onChange={(ev) => updateRow(row.shift_id, 'staff_02_attend_flg', ev.target.checked)}
                                                    />
                                                </div>

                                                {/* スタッフ3 + 同 */}
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm text-muted-foreground">スタッフ3</span>
                                                    <div className="w-44">
                                                        <Select
                                                            value={row.staff_03_user_id ?? ''}
                                                            onValueChange={(v) => updateRow(row.shift_id, 'staff_03_user_id', v || null)}
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue placeholder="選択" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="">-</SelectItem>
                                                                {staffOptions.map((o) => (
                                                                    <SelectItem key={o.value} value={o.value}>
                                                                        {o.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">同</span>
                                                    <input
                                                        type="checkbox"
                                                        className="h-3.5 w-3.5"
                                                        checked={!!row.staff_03_attend_flg}
                                                        onChange={(ev) => updateRow(row.shift_id, 'staff_03_attend_flg', ev.target.checked)}
                                                    />
                                                </div>

                                                {/* 操作（右寄せ）：訪問記録・保存・× */}
                                                <div className="ml-auto flex gap-2">
                                                    <Button
                                                        variant="outline"
                                                        onClick={() => setOpenRecordFor((prev) => (prev === row.shift_id ? null : row.shift_id))}
                                                    >
                                                        訪問記録
                                                    </Button>
                                                    <Button
                                                        variant="default"
                                                        onClick={() => handleSave(row)}
                                                        disabled={saveDisabled}
                                                        title={saveDisabled ? '開始日/開始時間/終了時間/重度移動 の入力を確認してください' : ''}
                                                    >
                                                        保存
                                                    </Button>
                                                    <Button variant="destructive" onClick={() => handleDeleteOne(row.shift_id)}>
                                                        ×
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
                                </Fragment>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>
        </div>
    )
}
