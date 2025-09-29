//portal/roster/monthly/page.tsx
'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ShiftRecord from '@/components/shift/ShiftRecord'
import { useCallback } from 'react';


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

    // ★★★ 修正箇所 (1): dup_role に '02' を追加 ★★★
    dup_role: '-' | '01' | '02' | null
    
    // ★★★ 修正箇所 (2): dispatch_size に '02' を追加 ★★★
    // エラーメッセージが示唆している通り、dispatch_size の型も更新が必要です。
    dispatch_size: '-' | '01' | '02'
}

type NewShiftDraft = {
    shift_start_date: string;
    shift_start_time: string;
    shift_end_time: string;
    service_code: string;
    dup_role: '-' | '01'; // 2人同時作業なら '01'
    dispatch_size: '-' | '01' | '02';
    judo_ido: string; // "HHMM" or ""
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    staff_02_attend_flg: boolean;
    staff_03_attend_flg: boolean;
};


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

const newDraftInitial = (month: string): NewShiftDraft => {
    // その月の1日に初期化（運用に合わせてお好みで）
    return {
        shift_start_date: `${month}-01`,
        shift_start_time: '09:00',
        shift_end_time: '10:00',
        service_code: '',
        dispatch_size: '-',
        dup_role: '-',
        judo_ido: '',
        staff_01_user_id: null,
        staff_02_user_id: null,
        staff_03_user_id: null,
        staff_02_attend_flg: false,
        staff_03_attend_flg: false,
    };
};

// --- time input helpers (loose) ---
// "1030" → "10:30", "930" → "09:30", "7" → "07:00", "24" → "23:00"(上限丸め), "1261" → "12:59"(分上限丸め)
// === ゆるい時刻整形（既にあれば流用） ===
const normalizeTimeLoose = (input: string): string => {
    const digits = String(input ?? '').replace(/[^\d]/g, '');
    if (digits.length >= 3) {
        let hh = parseInt(digits.slice(0, -2), 10);
        let mm = parseInt(digits.slice(-2), 10);
        if (Number.isNaN(hh)) hh = 0;
        if (Number.isNaN(mm)) mm = 0;
        if (hh < 0) hh = 0; if (hh > 23) hh = 23;
        if (mm < 0) mm = 0; if (mm > 59) mm = 59;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    if (digits.length === 2) {
        let hh = parseInt(digits, 10);
        if (Number.isNaN(hh)) hh = 0;
        if (hh < 0) hh = 0; if (hh > 23) hh = 23;
        return `${String(hh).padStart(2, '0')}:00`;
    }
    if (digits.length === 1) return `0${digits}:00`;
    return '';
};

const isValidHM = (v: string) => /^\d{2}:\d{2}$/.test(v);

// === 週の曜日（0=日〜6=土） ===
const JP_WEEK = ['日', '月', '火', '水', '木', '金', '土'];


// 月内で該当曜日の日付（YYYY-MM-DD配列）を返す。基準は draft.shift_start_date の属する月
const datesForSelectedWeekdaysInMonth = (baseDateStr: string, selected: Set<number>): string[] => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) return [];
    const [y, m] = baseDateStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate(); // m=数値(9)->9月の日数
    const results: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(Date.UTC(y, m - 1, d));       // UTC基準なら getUTCDay が安定
        const dow = date.getUTCDay();                       // 0=日〜6=土
        if (selected.has(dow)) {
            results.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        }
    }
    return results;
};


// ========= Main =========
export default function MonthlyRosterPage() {
    // マスタ
    const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([])
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
    const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([])

    // フィルタ
    const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>('') // kaipoke_cs_id
    const [selectedMonth, setSelectedMonth] = useState<string>(yyyymm(new Date()))

    // ★ 追加: 利用者検索キーワードの State
    const [clientSearchKeyword, setClientSearchKeyword] = useState<string>('')

    // 明細
    const [shifts, setShifts] = useState<ShiftRow[]>([])
    const [openRecordFor, setOpenRecordFor] = useState<string | null>(null)

    // 削除選択
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())


    // ▼ 新規行ドラフト
    const [draft, setDraft] = useState<NewShiftDraft>(() => newDraftInitial(yyyymm(new Date())));

    // ▼ 新規行の入力更新
    const updateDraft = <K extends keyof NewShiftDraft>(field: K, value: NewShiftDraft[K]) =>
        setDraft((prev) => ({ ...prev, [field]: value }));

    // ヘッダーの「全選択」checkboxの indeterminate 制御
    const selectAllRef = useRef<HTMLInputElement>(null)
    const allSelected = shifts.length > 0 && selectedIds.size === shifts.length
    const someSelected = selectedIds.size > 0 && selectedIds.size < shifts.length
    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = someSelected
        }
    }, [someSelected])

    // “繰り返し追加”で選ばれた曜日
    const [repeatWeekdays, setRepeatWeekdays] = useState<Set<number>>(new Set());
    const toggleWeekday = (idx: number) => {
        setRepeatWeekdays((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) {
                next.delete(idx);
            } else {
                next.add(idx);
            }
            return next;
        });
    };


    // 1日分を追加（同日・同時刻があればスキップ）
    // 1日分を追加（同日・同時刻があればスキップ）
    const handleAddOne = useCallback(async (dateStr: string) => {
        const startHM = normalizeTimeLoose(draft.shift_start_time);
        const endHM = normalizeTimeLoose(draft.shift_end_time);
        const required_staff_count = draft.dispatch_size === '01' ? 2 : 1;
        const two_person_work_flg = draft.dup_role !== '-';

        // 重複チェック（同利用者・同日・同開始）
        const exists = shifts.some(r =>
            r.kaipoke_cs_id === selectedKaipokeCS &&
            r.shift_start_date === dateStr &&
            normalizeTimeLoose(r.shift_start_time ?? '') === startHM
        );
        if (exists) return { skipped: true };

        const body = {
            kaipoke_cs_id: selectedKaipokeCS,
            shift_start_date: dateStr,
            shift_start_time: hmToHMS(startHM),
            shift_end_time: hmToHMS(endHM),
            service_code: draft.service_code || null,
            required_staff_count,
            two_person_work_flg,
            judo_ido: draft.judo_ido || null,
            staff_01_user_id: draft.staff_01_user_id,
            staff_02_user_id: draft.staff_02_user_id,
            staff_03_user_id: draft.staff_03_user_id,
            staff_02_attend_flg: !!draft.staff_02_attend_flg,
            staff_03_attend_flg: !!draft.staff_03_attend_flg,
        };

        const res = await fetch('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const created = await res.json();
        if (!res.ok) throw new Error(created?.error?.message ?? 'failed to create');

        setShifts((prev) => {
            const next = [...prev, {
                shift_id: String(created.shift_id ?? created.id),
                kaipoke_cs_id: selectedKaipokeCS,
                shift_start_date: dateStr,
                shift_start_time: startHM,
                shift_end_time: endHM,
                service_code: draft.service_code || '',
                required_staff_count,
                two_person_work_flg,
                judo_ido: draft.judo_ido || '',
                staff_01_user_id: draft.staff_01_user_id,
                staff_02_user_id: draft.staff_02_user_id,
                staff_03_user_id: draft.staff_03_user_id,
                staff_02_attend_flg: !!draft.staff_02_attend_flg,
                staff_03_attend_flg: !!draft.staff_03_attend_flg,
                dispatch_size: draft.dispatch_size,
                dup_role: draft.dup_role,
            }];
            next.sort((a, b) =>
                a.shift_start_date.localeCompare(b.shift_start_date) ||
                a.shift_start_time.localeCompare(b.shift_start_time)
            );
            return next;
        });
        return { created: true };
    }, [draft, shifts, selectedKaipokeCS]);

    // handleAddClick を追加（そのまま）
    const handleAddClick = async () => {
        if (!selectedKaipokeCS) return alert('利用者IDが未選択です');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.shift_start_date)) return alert('日付を入力してください');
        const startHM = normalizeTimeLoose(draft.shift_start_time);
        const endHM = normalizeTimeLoose(draft.shift_end_time);
        if (!isValidHM(startHM) || !isValidHM(endHM)) return alert('開始/終了の時刻を正しく入力してください（例: 1030 → 10:30）');

        if (repeatWeekdays.size === 0) {
            try { await handleAddOne(draft.shift_start_date); }
            catch (e: unknown) { const msg = e instanceof Error ? e.message : String(e); alert(`追加に失敗: ${msg}`); }
            return;
        }

        const dates = datesForSelectedWeekdaysInMonth(draft.shift_start_date, repeatWeekdays);
        if (dates.length === 0) return alert('同月内に該当する曜日がありません');

        const results = await Promise.allSettled(dates.map(d => handleAddOne(d)));
        const ok = results.filter(r => r.status === 'fulfilled').length;
        const ng = results.filter(r => r.status === 'rejected').length;
        alert(`追加完了: ${ok}件${ng ? `（失敗 ${ng} 件）` : ''}`);
    };


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
                    shift_id: String(r.shift_id),
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

    // ★ 追加: 検索キーワードで絞り込んだ利用者リスト
    const filteredKaipokeCs = useMemo(() => {
        const keyword = clientSearchKeyword.trim().toLowerCase();
        if (!keyword) {
            return kaipokeCs;
        }
        return kaipokeCs.filter(cs =>
            cs.name.toLowerCase().includes(keyword) 
        );
    }, [kaipokeCs, clientSearchKeyword]);

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

    // serviceOptions と staffOptions の useMemo 追加
    const serviceOptions = useMemo(
        () =>
            serviceCodes.map((s) => ({
                value: s.service_code as string,
                label: `${s.kaipoke_servicek ?? ''} / ${s.service_code ?? ''}`.trim(),
            })),
        [serviceCodes]
    );

    const staffOptions = useMemo(() =>
        staffUsers.map((u) => ({ value: u.user_id, label: humanName(u) })),
        [staffUsers]
    );

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

                        {/* ★ 追加: 検索用テキストボックス */}
                        <div style={{ width: 100 }}>
                            <Input
                                type="text"
                                placeholder="利用者名検索 (冒頭一致)"
                                value={clientSearchKeyword}
                                onChange={(e) => setClientSearchKeyword(e.target.value)}
                            />
                        </div>

                        <div style={{ width: 180 }}>
                            <Select value={selectedKaipokeCS} onValueChange={setSelectedKaipokeCS}>
                                <SelectTrigger>
                                    <SelectValue placeholder="利用者を選択" />
                                </SelectTrigger>
                                <SelectContent>
                                    {/* 絞り込まれた利用者リストを表示 */}
                                    {filteredKaipokeCs.map((cs) => (
                                        <SelectItem key={cs.kaipoke_cs_id} value={cs.kaipoke_cs_id}>
                                            {cs.name}
                                        </SelectItem>
                                    ))}
                                    {/* 検索結果が0件の場合のメッセージ表示を削除します。
                                       {filteredKaipokeCs.length === 0 && (
                                            <SelectItem value="" disabled>検索結果なし</SelectItem> 
                                       )}
                                    */}
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
                        {shifts.map((row, i) => { // ★ 修正: インデックス i を取得

                            // 奇数・偶数による色分けを計算
                            const isOddRow = i % 2 !== 0; // 奇数行 (1, 3, 5, ...) は薄い青色
                            const bgColorClass = isOddRow ? 'bg-blue-50' : 'bg-white'; // Tailwind CSS の色クラスを適用
                            const dateInvalid = !isValidDateStr(row.shift_start_date)
                            const stInvalid = !isValidTimeStr(row.shift_start_time)
                            const etInvalid = !isValidTimeStr(row.shift_end_time)
                            const jiInvalid = row.judo_ido ? !isValidJudoIdo(row.judo_ido) : false
                            const saveDisabled = dateInvalid || stInvalid || etInvalid || jiInvalid

                            return (
                                <Fragment key={row.shift_id}>
                                    {/* 1行目：基本情報 - 色クラスを適用 */}
                                    <TableRow className={`border-y border-gray-300 ${bgColorClass}`}>
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
                                        {/* 開始時間（既存行） */}
                                        <TableCell>
                                            <div className="w-[80px]">
                                                <Input
                                                    value={row.shift_start_time ?? ''}
                                                    onChange={(e) => updateRow(row.shift_id, 'shift_start_time', e.currentTarget.value)}
                                                    onBlur={(e) => updateRow(row.shift_id, 'shift_start_time', normalizeTimeLoose(e.currentTarget.value))}
                                                    placeholder="例) 1030 → 10:30"
                                                    className={row.shift_start_time && !isValidHM(normalizeTimeLoose(row.shift_start_time)) ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
                                                />
                                            </div>
                                        </TableCell>

                                        {/* 終了時間（既存行） */}
                                        <TableCell>
                                            <div className="w-[80px]">
                                                <Input
                                                    value={row.shift_end_time ?? ''}
                                                    onChange={(e) => updateRow(row.shift_id, 'shift_end_time', e.currentTarget.value)}
                                                    onBlur={(e) => updateRow(row.shift_id, 'shift_end_time', normalizeTimeLoose(e.currentTarget.value))}
                                                    placeholder="例) 1730 → 17:30"
                                                    className={row.shift_end_time && !isValidHM(normalizeTimeLoose(row.shift_end_time)) ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
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
                                                        updateRow(row.shift_id, 'dup_role', v)
                                                        updateRow(row.shift_id, 'two_person_work_flg', v !== '-')
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
                                                        updateRow(row.shift_id, 'dispatch_size', v)
                                                        updateRow(row.shift_id, 'required_staff_count', v === '01' ? 2 : 1)
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
                                    <TableRow className={`border-b-2 border-gray-300 ${bgColorClass}`}>
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
                        {/* ====== 新規追加行（テーブルの一番下） ====== */}
                        {/* 既存の “新規追加行” を丸ごと NewAddRow に置き換え */}
                        <NewAddRow
                            onAddClick={handleAddClick}
                            repeatWeekdays={repeatWeekdays}
                            toggleWeekday={toggleWeekday}
                            draft={draft}
                            updateDraft={updateDraft}
                            serviceOptions={serviceOptions}
                            staffOptions={staffOptions}
                        />
                        {/* ====== /新規追加行 ====== */}
                    </TableBody>
                </Table>
            </div>
        </div>

    )
}

type Option = { value: string; label: string };

type NewAddRowProps = {
    onAddClick: () => void
    repeatWeekdays: Set<number>
    toggleWeekday: (idx: number) => void
    draft: NewShiftDraft
    updateDraft: (k: keyof NewShiftDraft, v: NewShiftDraft[keyof NewShiftDraft]) => void // ★booleanも通る
    serviceOptions: Option[]  // ★追加
    staffOptions: Option[]    // ★追加
};

function NewAddRow(props: NewAddRowProps) {
    const { onAddClick, repeatWeekdays, toggleWeekday, draft, updateDraft, serviceOptions, staffOptions } = props;
    return (
        <>
            <TableRow className="bg-muted/30">
                <TableCell>{/* チェックボックス列は空欄 */}</TableCell>

                {/* 開始日 */}
                <TableCell>
                    <div className="flex items-center gap-2">
                        <div className="w-[100px]">
                            <Input
                                value={draft.shift_start_date}
                                onChange={(e) => updateDraft('shift_start_date', e.target.value)}
                                onBlur={(e) => updateDraft('shift_start_date', normalizeDateInput(e.target.value))}
                                placeholder="YYYY-MM-DD"
                                className={!isValidDateStr(draft.shift_start_date) ? 'border-red-500' : ''}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground">（{weekdayJa(draft.shift_start_date)}）</span>
                    </div>
                </TableCell>

                {/* 開始時間（新規） */}
                <TableCell>
                    <div className="w-[80px]">
                        <Input
                            value={draft.shift_start_time}
                            onChange={(e) => updateDraft('shift_start_time', e.currentTarget.value)}
                            onBlur={(e) => updateDraft('shift_start_time', normalizeTimeLoose(e.currentTarget.value))}
                            placeholder="例) 1030 → 10:30"
                            className={draft.shift_start_time && !isValidHM(normalizeTimeLoose(draft.shift_start_time)) ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
                        />
                    </div>
                </TableCell>

                {/* 終了時間（新規） */}
                <TableCell>
                    <div className="w-[80px]">
                        <Input
                            value={draft.shift_end_time}
                            onChange={(e) => updateDraft('shift_end_time', e.currentTarget.value)}
                            onBlur={(e) => updateDraft('shift_end_time', normalizeTimeLoose(e.currentTarget.value))}
                            placeholder="例) 1730 → 17:30"
                            className={draft.shift_end_time && !isValidHM(normalizeTimeLoose(draft.shift_end_time)) ? 'border-red-500 h-8 text-sm' : 'h-8 text-sm'}
                        />
                    </div>
                </TableCell>


                {/* サービス */}
                <TableCell>
                    <div className="w-56">
                        <Select value={draft.service_code} onValueChange={(v) => updateDraft('service_code', v)}>
                            <SelectTrigger><SelectValue placeholder="サービスを選択" /></SelectTrigger>
                            <SelectContent>
                                {serviceOptions.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </TableCell>

                {/* 派遣人数 */}
                <TableCell>
                    <div className="w-[112px]">
                        <Select
                            value={draft.dup_role}
                            onValueChange={(v: '-' | '01') => updateDraft('dispatch_size', v)}
                        >
                            <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="-">-</SelectItem>
                                <SelectItem value="01">2人同時作業</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </TableCell>

                {/* 重複 */}
                <TableCell>
                    <div className="w-[80px]">
                        <Select
                            value={draft.dispatch_size}
                            onValueChange={(v: '-' | '01' | '02') => updateDraft('dup_role', v)}
                        >
                            <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="-">-</SelectItem>
                                <SelectItem value="01">1人目</SelectItem>
                                <SelectItem value="02">2人目</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </TableCell>

                {/* 重度移動 */}
                <TableCell>
                    <div className="w-[100px]">
                        <Input
                            value={draft.judo_ido}
                            onChange={(e) => updateDraft('judo_ido', e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
                            placeholder="HHMM"
                            className={draft.judo_ido && !isValidJudoIdo(draft.judo_ido) ? 'border-red-500' : ''}
                        />
                    </div>
                </TableCell>
                <TableCell>
                    <Button onClick={onAddClick} className="h-8">＋ 追加</Button>
                </TableCell>
            </TableRow>
            {/* 曜日チェックの2行目（colSpan は列数に合わせて調整） */}
            <TableRow className="bg-muted/20">
                <TableCell colSpan={9}>
                    <div className="flex flex-wrap items-center gap-3">
                        {/* スタッフ1 */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">スタッフ1</span>
                            <div className="w-44">
                                <Select
                                    value={draft.staff_01_user_id ?? ''}
                                    onValueChange={(v) => updateDraft('staff_01_user_id', v || null)}
                                >
                                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">-</SelectItem>
                                        {staffOptions.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                                    value={draft.staff_02_user_id ?? ''}
                                    onValueChange={(v) => updateDraft('staff_02_user_id', v || null)}
                                >
                                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">-</SelectItem>
                                        {staffOptions.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <span className="text-sm text-muted-foreground">同</span>
                            <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={!!draft.staff_02_attend_flg}
                                onChange={(e) => updateDraft('staff_02_attend_flg', e.target.checked)}
                            />
                        </div>

                        {/* スタッフ3 + 同 */}
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">スタッフ3</span>
                            <div className="w-44">
                                <Select
                                    value={draft.staff_03_user_id ?? ''}
                                    onValueChange={(v) => updateDraft('staff_03_user_id', v || null)}
                                >
                                    <SelectTrigger><SelectValue placeholder="選択" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">-</SelectItem>
                                        {staffOptions.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <span className="text-sm text-muted-foreground">同</span>
                            <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                checked={!!draft.staff_03_attend_flg}
                                onChange={(e) => updateDraft('staff_03_attend_flg', e.target.checked)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4 py-2">
                        <span className="text-sm text-muted-foreground">同月内で繰り返し追加：</span>
                        {JP_WEEK.map((label, idx) => (
                            <label key={idx} className="inline-flex items-center gap-1 mr-3">
                                <input
                                    type="checkbox"
                                    checked={repeatWeekdays.has(idx)}
                                    onChange={() => {
                                        toggleWeekday(idx);
                                    }}
                                />
                                <span className="text-sm">{label}</span>
                            </label>
                        ))}
                        <span className="text-xs text-muted-foreground">
                            例）月・木にチェック → {`その月の毎週「${normalizeTimeLoose(draft.shift_start_time || '')}」開始`}で追加
                        </span>
                    </div>
                </TableCell>
            </TableRow>
        </>
    );
}
