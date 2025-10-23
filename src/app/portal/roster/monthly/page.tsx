//portal/roster/monthly/page.tsx
'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import ShiftRecordLinkButton from '@/components/shift/ShiftRecordLinkButton'
import { useCallback } from 'react';
import { useRoleContext } from "@/context/RoleContext";
import { useRouter, usePathname, useSearchParams } from "next/navigation";


// ========= Types =========
type KaipokeCs = {
    id: string
    kaipoke_cs_id: string
    name: string
    end_at: string | null
    // 追加：標準経路・手段・目的（APIが返す場合に拾う）
    standard_route?: string | null
    standard_trans_ways?: string | null
    standard_purpose?: string | null
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
    dup_role: '-' | '01'; // 2人同時作業なら '01'

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

type RecordStatus = 'draft' | 'submitted' | 'approved' | 'archived';

function LockIf({
    locked,
    children,
}: {
    locked: boolean;
    children: React.ReactNode;
}) {
    if (!locked) return <>{children}</>;
    return (
        <div
            className="pointer-events-none opacity-60 select-none"
            aria-disabled="true"
        >
            {children}
        </div>
    );
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
void normalizeDateInput
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
        dispatch_size: '01',
        dup_role: '-',
        judo_ido: '0000',
        staff_01_user_id: null,
        staff_02_user_id: null,
        staff_03_user_id: null,
        staff_02_attend_flg: false,
        staff_03_attend_flg: false,
    };
};

// 日付文字列から曜日の数値 (0=日〜6=土) を取得
const getWeekdayNumber = (dateStr: string): number | null => {
    if (!isValidDateStr(dateStr)) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    // Date.getDay() はローカルタイムゾーンに基づいて 0 (日曜) 〜 6 (土曜) を返す
    return dt.getDay();
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

// どこか上のヘルパ群の末尾あたりに追加
//const hasValue = (v?: string | null) => typeof v === 'string' && v.trim().length > 0;

type CheckResult = { ok: boolean; confirmMessage?: string; errorMessage?: string };

// ご指定の業務ルール:
// - two_person_work_flg = true のとき
//   A) required_staff_count が 1 or 2 の場合：
//      (staff_02 && s02_attend=true) か (staff_03 && s03_attend=true) ならOK
//      かつ「staff_02 も staff_03 も未設定（どちらも空）」もOK
//   B) required_staff_count = 0 の場合：
//      (staff_02 && s02_attend=false) または (staff_03 && s03_attend=false) が **必須**
//      さらに確認ダイアログを出す
// ご指定の業務ルール + 追加分を統合
// 置き換え版：two_person_work_flg=false の場合は確認ダイアログなし
const checkTwoPersonRules = (
    twoPerson: boolean,
    requiredCount: number,
    s2id?: string | null, s2attend?: boolean | null,
    s3id?: string | null, s3attend?: boolean | null
): CheckResult => {
    const hasValue = (v?: string | null) => typeof v === 'string' && v.trim().length > 0;
    const s2Set = hasValue(s2id);
    const s3Set = hasValue(s3id);
    const s2Attend = !!s2attend;
    const s3Attend = !!s3attend;

    // ▼ two_person_work_flg = false
    if (!twoPerson) {
        // 必須: required_staff_count は 1 または 2
        if (requiredCount !== 1 && requiredCount !== 2) {
            return {
                ok: false,
                errorMessage:
                    '二人同時介助[重複:-]の場合、派遣人数は「1人目」または「2人目」を選択してください（派遣人数=0は不可）。'
            };
        }
        // required=1 のとき、スタッフ2/3 を設定するなら同行✅が必須
        if (requiredCount === 1) {
            if ((s2Set && !s2Attend) || (s3Set && !s3Attend)) {
                return {
                    ok: false,
                    errorMessage:
                        '一人介助の場合、スタッフ2人目・3人目を設定する時は「同行」に✅を入れる必要があります。'
                };
            }
        }
        // 確認メッセージは出さない
        return { ok: true };
    }

    // ▼ two_person_work_flg = true（既存ルール）
    if (requiredCount === 1 || requiredCount === 2) {
        const okWhenHelperPresent = (s2Set && s2Attend) || (s3Set && s3Attend);
        const okWhenNoHelperYet = !s2Set && !s3Set;
        if (okWhenHelperPresent || okWhenNoHelperYet) return { ok: true };

        return {
            ok: false,
            errorMessage:
                '二人同時作業です。派遣人数が1または2のときは、\n' +
                '・スタッフ2 同行✅ もしくは スタッフ3 同行✅ のいずれかを設定する\n' +
                '  あるいは、スタッフ2/3 を両方とも未設定にしてください。'
        };
    }

    if (requiredCount === 0) {
        const needNonAttend = (s2Set && !s2Attend) || (s3Set && !s3Attend);
        if (!needNonAttend) {
            return {
                ok: false,
                errorMessage:
                    '二人同時作業かつ 派遣人数=0 の場合、\n' +
                    'スタッフ2 か スタッフ3 のどちらか一方は「同行✅なし（未チェック）」で登録してください。'
            };
        }
        return {
            ok: true,
            confirmMessage:
                '2人介助請求対象ですか？\n' +
                '単なるサービス同行の場合には 2人目・3人目のスタッフは「同行✅」する必要があります。\n\n' +
                'OKで続行 / いいえで中止'
        };
    }

    return { ok: true };
};


// ========= Main =========
export default function MonthlyRosterPage() {
    const { role } = useRoleContext(); // Layoutと同じ判定に統一
    const readOnly = !["manager", "admin"].includes((role ?? "").toLowerCase());
    // マスタ
    const [kaipokeCs, setKaipokeCs] = useState<KaipokeCs[]>([])
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
    const [serviceCodes, setServiceCodes] = useState<ServiceCode[]>([])

    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string>(''); // kaipoke_cs_id
    const [selectedMonth, setSelectedMonth] = useState<string>(yyyymm(new Date()));

    // 初期注入は既存の useEffect のままでOK（URL → state）
    useEffect(() => {
        const qCs = searchParams.get('kaipoke_cs_id') ?? '';
        const qMonth = searchParams.get('month') ?? '';
        if (qCs) setSelectedKaipokeCS(qCs);
        if (qMonth) setSelectedMonth(qMonth);
        // 初回のみ
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ★ 追加：state → URL（双方向同期）
    useEffect(() => {
        // state が決まっていない初期は何もしない
        if (!selectedMonth) return;
        const q = new URLSearchParams();
        if (selectedKaipokeCS) q.set("kaipoke_cs_id", selectedKaipokeCS);
        if (selectedMonth) q.set("month", selectedMonth);

        const nextUrl = q.toString() ? `${pathname}?${q.toString()}` : pathname;
        router.replace(nextUrl, { scroll: false });
    }, [selectedKaipokeCS, selectedMonth, pathname, router]);

    // 既存の state 群の近くに追加
    const [recordStatus, setRecordStatus] = useState<Record<string, RecordStatus | undefined>>({});

    // required_staff_count:number → dispatch_size:'-'|'01'|'02'
    const toDispatchSize = (n?: number): '-' | '01' | '02' => {
        const v = n ?? 0;
        return v === 1 ? '01' : v === 2 ? '02' : '-';
    };
    // どんな型でも "真の true" だけ true にし、それ以外は false
    const asBool = (v: unknown): boolean => {
        if (typeof v === 'boolean') return v;
        if (v == null) return false;
        const s = String(v).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 't' || s === 'yes' || s === 'on';
    };
    // two_person_work_flg:boolean → dup_role:'-'|'01'
    const toDupRole = (b: unknown): '-' | '01' => (asBool(b) ? '01' : '-');

    // 初期反映：URLクエリ（ShiftCardの「月間」ボタンから渡す値を拾う）
    useEffect(() => {
        const qCs = searchParams.get('kaipoke_cs_id') ?? '';
        const qMonth = searchParams.get('month') ?? '';
        if (qCs) setSelectedKaipokeCS(qCs);
        if (qMonth) setSelectedMonth(qMonth);
        // 初回のみでOK
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ★ 追加: 利用者検索キーワードの State
    const [clientSearchKeyword, setClientSearchKeyword] = useState<string>('')

    // 明細
    const [shifts, setShifts] = useState<ShiftRow[]>([])
    const [openRecordFor, setOpenRecordFor] = useState<string | null>(null)
    void openRecordFor

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
    const handleAddOne = useCallback(async (dateStr: string) => {
        const startHM = normalizeTimeLoose(draft.shift_start_time);
        const endHM = normalizeTimeLoose(draft.shift_end_time);
        // ▼ ここを正しいマッピングに
        const required_staff_count =
            draft.dispatch_size === '01' ? 1 :
                draft.dispatch_size === '02' ? 2 : 0;
        const two_person_work_flg = draft.dup_role === '01';

        // 重複チェック（同利用者・同日・同開始）
        const exists = shifts.some(r =>
            r.kaipoke_cs_id === selectedKaipokeCS &&
            r.shift_start_date === dateStr &&
            normalizeTimeLoose(r.shift_start_time ?? '') === startHM
        );
        if (exists) return { skipped: true };

        // handleAddOne の body 作成直前あたりに
        // two_person_work_flg, required_staff_count は 2) で直した変数を使う
        const vr = checkTwoPersonRules(
            two_person_work_flg,
            required_staff_count,
            draft.staff_02_user_id, draft.staff_02_attend_flg,
            draft.staff_03_user_id, draft.staff_03_attend_flg
        );

        if (!vr.ok) {
            alert(vr.errorMessage ?? '入力内容を確認してください');
            return { skipped: true };
        }
        if (vr.confirmMessage) {
            const yes = confirm(vr.confirmMessage);
            if (!yes) return { skipped: true };
        }


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
        if (readOnly) return;
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


    const loadRecordStatuses = async (ids: string[]) => {
        if (!ids.length) return;
        try {
            const q = new URLSearchParams({
                ids: ids.join(","),
                format: "db", // ★ DBの生ステータスを返す
            });
            const res = await fetch(`/api/shift-records?${q.toString()}`, { method: "GET" });
            if (!res.ok) return;

            // 期待値: [{ shift_id: number, status: 'draft'|'submitted'|'approved'|'archived' }, ...]
            const rows: Array<{ shift_id: number; status: 'draft' | 'submitted' | 'approved' | 'archived' }> = await res.json();
            const map = Object.fromEntries(rows.map(r => [String(r.shift_id), r.status]));
            setRecordStatus(map);
        } catch {
            /* no-op */
        }
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
            // ⭕ URLクエリ等で既に選択済みなら維持、未選択のときだけ先頭を入れる
            setSelectedKaipokeCS(prev => prev || (validCs[0]?.kaipoke_cs_id ?? ''))

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
            /*
            try {
                // 元レスポンスの先頭3件だけ覗く（any禁止なので Record<string, unknown> を使う）
                const arr = Array.isArray(raw) ? raw as ReadonlyArray<Record<string, unknown>> : [];
                const probe = arr.slice(0, 3).map((obj) => ({
                    shift_id: String(obj['shift_id'] ?? ''),
                    s02: obj['staff_02_attend_flg'],
                    s02_type: typeof obj['staff_02_attend_flg'],
                    s03: obj['staff_03_attend_flg'],
                    s03_type: typeof obj['staff_03_attend_flg'],
                }));
                alert('API生データ (先頭3件):\n' + JSON.stringify(probe, null, 2));
            } catch {
               
            } 
            */
            const rows: ShiftRow[] = Array.isArray(raw) ? raw : [];
            const normalized: ShiftRow[] = rows.map((r) => {
                const rawRequired = r.required_staff_count ?? 1;
                const required = Math.max(0, Math.min(2, rawRequired));

                const dispatch_size = toDispatchSize(required);

                // ← ここでまず厳密に boolean 化
                const twoPerson = asBool(r.two_person_work_flg);

                const dup_role = toDupRole(twoPerson);

                /*
                // ▼▼▼ 一時デバッグ：最初の1件だけ正規化前後を比較 ▼▼▼
                if (idx === 0) {
                    alert(
                        '正規化前後チェック(1件目):\n' +
                        JSON.stringify(
                            {
                                s02_raw: r.staff_02_attend_flg,
                                s02_after_asBool: asBool(r.staff_02_attend_flg),
                                s03_raw: r.staff_03_attend_flg,
                                s03_after_asBool: asBool(r.staff_03_attend_flg),
                                two_raw: r.two_person_work_flg,
                                two_after_asBool: asBool(r.two_person_work_flg),
                            },
                            null,
                            2
                        )
                    );
                }
                // ▲▲▲ 一時デバッグ ここまで ▲▲▲
                */

                return {
                    ...r,
                    shift_id: String(r.shift_id),
                    required_staff_count: required,
                    // ← boolean に正規化して保持
                    two_person_work_flg: twoPerson,
                    shift_start_time: toHM(r.shift_start_time),
                    shift_end_time: toHM(r.shift_end_time),
                    judo_ido: r.judo_ido ?? '',
                    staff_01_user_id: r.staff_01_user_id ?? null,
                    staff_02_user_id: r.staff_02_user_id ?? null,
                    staff_03_user_id: r.staff_03_user_id ?? null,
                    // ついでに attend 系も文字列の "true"/"false" にされがちなら正規化推奨
                    staff_02_attend_flg: asBool(r.staff_02_attend_flg),
                    staff_03_attend_flg: asBool(r.staff_03_attend_flg),
                    dispatch_size,
                    dup_role,
                };
            });
            // 並べ替え：開始日 → 開始時間
            normalized.sort((a, b) => {
                const d = a.shift_start_date.localeCompare(b.shift_start_date)
                if (d !== 0) return d
                return a.shift_start_time.localeCompare(b.shift_start_time)
            })

            setShifts(normalized);
            setOpenRecordFor(null);
            setSelectedIds(new Set());

            // ★ 追加: 訪問記録ステータスの一括取得
            void loadRecordStatuses(normalized.map(r => r.shift_id));
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
        if (readOnly) return;

        // ★ ここを修正
        const required_staff_count =
            row.dispatch_size === '01' ? 1 :
                row.dispatch_size === '02' ? 2 : 0;

        const two_person_work_flg = row.dup_role === '01';

        // バリデーション（保存前）
        const dateOk = isValidDateStr(row.shift_start_date);
        const stOk = isValidTimeStr(row.shift_start_time);
        const etOk = isValidTimeStr(row.shift_end_time);
        if (!dateOk || !stOk || !etOk) {
            alert('入力に不備があります（開始日/開始時間/終了時間/重度移動）');
            return;
        }

        // handleSave 内、body を組み立てる前に:
        const vr = checkTwoPersonRules(
            two_person_work_flg,
            required_staff_count,
            row.staff_02_user_id, asBool(row.staff_02_attend_flg),
            row.staff_03_user_id, asBool(row.staff_03_attend_flg)
        );

        if (!vr.ok) {
            alert(vr.errorMessage ?? '入力内容を確認してください');
            return;
        }
        if (vr.confirmMessage) {
            const yes = confirm(vr.confirmMessage);
            if (!yes) return;
        }

        const body = {
            shift_id: row.shift_id,
            service_code: row.service_code,
            required_staff_count,          // ★ 修正後の値を送る
            two_person_work_flg,           // ★ 修正後の値を送る
            judo_ido: row.judo_ido ?? null,
            staff_01_user_id: row.staff_01_user_id,
            staff_02_user_id: row.staff_02_user_id,
            staff_03_user_id: row.staff_03_user_id,
            staff_02_attend_flg: asBool(row.staff_02_attend_flg),
            staff_03_attend_flg: asBool(row.staff_03_attend_flg),
            shift_start_time: hmToHMS(toHM(row.shift_start_time)),
            shift_end_time: hmToHMS(toHM(row.shift_end_time)),
        };

        const res = await fetch('/api/shifts', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const msg = await res.text().catch(() => '');
            alert(`保存に失敗しました\n${msg}`);
            return;
        }
        alert('保存しました');
    };

    // ローカル更新
    const updateRow = <K extends keyof ShiftRow>(shiftId: string, field: K, value: ShiftRow[K]) => {
        if (readOnly) return;
        setShifts((prev) => prev.map((r) => (r.shift_id === shiftId ? { ...r, [field]: value } : r)))
    }

    // 削除選択トグル
    const toggleSelect = (shiftId: string, checked: boolean) => {
        if (readOnly) return;
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (checked) next.add(shiftId)
            else next.delete(shiftId)
            return next
        })
    }

    // shift_weekly_template スキーマに合わせた変換と upsert API コール
    const handleCopySelectedToWeeklyTemplate = async () => {
        if (readOnly) return;
        if (selectedIds.size === 0) {
            alert('コピーするシフトを選択してください。');
            return;
        }

        const confirmMsg =
            '選択したシフトを週間シフトへ追加します。重なるデータが既にある場合には、追加されない場合があります。\n' +
            'シフト追加後、週間シフトへページ移動します。よろしいですか？';

        if (!confirm(confirmMsg)) {
            return;
        }

        const selectedShifts = shifts.filter(r => selectedIds.has(r.shift_id));

        if (selectedShifts.length === 0) {
            alert('選択されたシフトレコードが見つかりませんでした。');
            return;
        }

        const weeklyTemplateRecords = selectedShifts
            .map(r => {
                const weekday = getWeekdayNumber(r.shift_start_date);
                if (weekday === null) {
                    console.warn(`Skipping shift_id ${r.shift_id}: Invalid date ${r.shift_start_date}`);
                    return null; // 無効な日付はスキップ
                }

                // 週シフトのコラムに合わせて変換
                // HH:mm → HH:mm:ss 形式に変換
                const start_time_hms = hmToHMS(r.shift_start_time);
                const end_time_hms = hmToHMS(r.shift_end_time);

                // shift_weekly_template スキーマに合わせたデータを作成
                return {
                    kaipoke_cs_id: r.kaipoke_cs_id,
                    weekday: weekday, // 0-6
                    start_time: start_time_hms,
                    end_time: end_time_hms,
                    service_code: r.service_code || null,
                    required_staff_count: r.required_staff_count ?? 1,
                    two_person_work_flg: !!r.two_person_work_flg,
                    judo_ido: r.judo_ido || null,
                    staff_01_user_id: r.staff_01_user_id,
                    staff_02_user_id: r.staff_02_user_id,
                    staff_03_user_id: r.staff_03_user_id,
                    staff_02_attend_flg: !!r.staff_02_attend_flg,
                    staff_03_attend_flg: !!r.staff_03_attend_flg,
                    active: true,
                    is_biweekly: false,
                    // role_code, effective_from/to, nth_weeks は月間シフトに存在しないためデフォルト値または null
                    staff_01_role_code: null,
                    staff_02_role_code: null,
                    staff_03_role_code: null,
                    effective_from: null,
                    effective_to: null,
                    nth_weeks: null,
                };
            })
            .filter(r => r !== null);

        if (weeklyTemplateRecords.length === 0) {
            alert('有効なデータを持つシフトが選択されていません。');
            return;
        }

        try {
            // API呼び出しパスとペイロードのキーを、既存の週間シフトのAPIに合わせる
            const res = await fetch('/api/roster/weekly/templates/bulk_upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // ▼ 修正: ペイロードのキーを 'records' から 'rows' に変更
                body: JSON.stringify({ rows: weeklyTemplateRecords }),
            });

            const result = await res.json().catch(() => ({}));

            if (!res.ok) {
                const msg = result.error?.message || result.message || 'サーバーエラーが発生しました。';
                // result.error.messageが詳細なエラーメッセージを保持していることを期待
                alert(`週間シフトへの追加に失敗しました。\nエラー: ${msg}`);
                return;
            }

            // 週間シフトのAPIが { ok: true } のみを返す（挿入件数を返さない）場合に対応
            alert(
                `週間シフトへの追加・更新が完了しました。\n` +
                `成功: ${weeklyTemplateRecords.length}件が追加または更新された可能性があります。\n\n` +
                '週間シフトページへ移動します。'
            );

            // 週間シフトのページに遷移
            router.push('/roster/weekly');
            // 選択状態を解除
            setSelectedIds(new Set());


        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(`週間シフトへの追加処理中に予期せぬエラーが発生しました: ${msg}`);
        }
    };

    // 一括削除
    const handleDeleteSelected = async () => {
        if (readOnly) return;
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
        if (readOnly) return;
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
        if (readOnly) return;
        if (!checked) {
            setSelectedIds(new Set())
            return
        }
        setSelectedIds(new Set(shifts.map((s) => s.shift_id)))
    }

    const getString = (obj: unknown, key: string): string | undefined => {
        if (obj && typeof obj === "object" && key in (obj as Record<string, unknown>)) {
            const v = (obj as Record<string, unknown>)[key];
            return typeof v === "string" && v.trim() ? v : undefined;
        }
        return undefined;
    };
    const pickNonEmpty = (...vals: Array<string | undefined | null>) =>
        vals.find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? "";

    // 3) ★cs_id → Kaipoke標準情報 の Map（kaipokeCs を一次ソースに）
    const kaipokeByCsId = useMemo(() => {
        const m = new Map<string, { standard_route?: string; standard_trans_ways?: string; standard_purpose?: string }>();

        // まず /api/kaipoke-info の結果から埋める
        for (const cs of kaipokeCs ?? []) {
            const v = {
                standard_route: getString(cs, "standard_route"),
                standard_trans_ways: getString(cs, "standard_trans_ways"),
                standard_purpose: getString(cs, "standard_purpose"),
            };
            if (v.standard_route || v.standard_trans_ways || v.standard_purpose) {
                m.set(cs.kaipoke_cs_id, v);
            }
            // もし API が { cs_kaipoke_info: { ... } } で返す場合のフォールバック
            const nested = (cs as unknown as Record<string, unknown>)?.cs_kaipoke_info as Record<string, unknown> | undefined;
            if (nested) {
                const nv = {
                    standard_route: getString(nested, "standard_route"),
                    standard_trans_ways: getString(nested, "standard_trans_ways"),
                    standard_purpose: getString(nested, "standard_purpose"),
                };
                if (nv.standard_route || nv.standard_trans_ways || nv.standard_purpose) {
                    m.set(cs.kaipoke_cs_id, { ...m.get(cs.kaipoke_cs_id), ...nv });
                }
            }
        }

        // 行データ(shifts)側に標準系があれば上書き
        for (const r of shifts ?? []) {
            const csId = r.kaipoke_cs_id;
            if (!csId) continue;
            const rv = {
                standard_route: getString(r, "standard_route"),
                standard_trans_ways: getString(r, "standard_trans_ways"),
                standard_purpose: getString(r, "standard_purpose"),
            };
            if (rv.standard_route || rv.standard_trans_ways || rv.standard_purpose) {
                m.set(csId, { ...m.get(csId), ...rv });
            }
        }
        return m;
    }, [kaipokeCs, shifts]);

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
                {selectedIds.size > 0 && !readOnly && (
                    <Fragment>
                        {/* ▼ 追加: 週間シフトにコピー ボタン ▼ */}
                        <Button
                            variant="default" // primaryカラー
                            onClick={handleCopySelectedToWeeklyTemplate}
                        >
                            {selectedIds.size} 件を週間シフトへコピー
                        </Button>
                        {/* ▲ 追加 ここまで ▲ */}
                        <Button variant="destructive" onClick={handleDeleteSelected}>
                            {selectedIds.size} 件を 削除
                        </Button>
                    </Fragment>
                )}

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={() => {
                            const q = new URLSearchParams({
                                kaipoke_cs_id: selectedKaipokeCS,
                                month: selectedMonth,
                            })
                            router.push(`/portal/roster/monthly/print-view?${q.toString()}`)
                        }}
                    >
                        印刷ビュー（PDF）
                    </Button>

                    {/* 追加：週間シフトへ */}
                    <Button
                        variant="secondary"
                        onClick={() => {
                            if (!selectedKaipokeCS) return;
                            router.push(`/portal/roster/weekly?cs=${encodeURIComponent(selectedKaipokeCS)}&month=${encodeURIComponent(selectedMonth)}`)
                        }}
                    >
                        週間シフトへ
                    </Button>
                </div>

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
                                    <TableRow className={`border-y border-gray-300 w-[15px] ${bgColorClass}`}>
                                        {/* 選択 */}
                                        <TableCell>
                                            <input
                                                type="checkbox"
                                                className="h-3.5 w-3.5"
                                                checked={selectedIds.has(row.shift_id)}
                                                onChange={(ev) => toggleSelect(row.shift_id, ev.target.checked)}
                                                disabled={readOnly}
                                            />
                                        </TableCell>

                                        {/* 開始日（テキスト + 曜日） */}
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-[140px]">
                                                    <Input
                                                        type="date"
                                                        value={row.shift_start_date}
                                                        onChange={(ev) => updateRow(row.shift_id, 'shift_start_date', ev.target.value)}
                                                        className={dateInvalid ? 'border-red-500' : ''}
                                                        disabled={readOnly}
                                                    />
                                                </div>
                                                <span className="text-xs text-muted-foreground w-[15px]">（{weekdayJa(row.shift_start_date)}）</span>
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
                                                    disabled={readOnly}
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
                                                    disabled={readOnly}
                                                />
                                            </div>
                                        </TableCell>
                                        {/* サービス */}
                                        <TableCell>
                                            <div className="w-56">

                                                <Select value={row.service_code ?? ''} onValueChange={(v) => updateRow(row.shift_id, 'service_code', v)} >
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

                                                {/* 派遣人数（二人同時作業 ← dup_role） */}
                                                <Select
                                                    value={row.dup_role}
                                                    onValueChange={(v: '-' | '01') => {
                                                        updateRow(row.shift_id, 'dup_role', v);
                                                        updateRow(row.shift_id, 'two_person_work_flg', v === '01');
                                                    }}
                                                >
                                                    <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="-">-</SelectItem>
                                                        <SelectItem value="01">二人同時作業</SelectItem>
                                                    </SelectContent>
                                                </Select>

                                            </div>
                                        </TableCell>

                                        {/* 重複（Select：幅 1/2相当） */}
                                        <TableCell>
                                            <div className="w-[80px]">

                                                {/* 重複（required_staff_count ← dispatch_size） */}
                                                <Select
                                                    value={row.dispatch_size}
                                                    onValueChange={(v: '-' | '01' | '02') => {
                                                        updateRow(row.shift_id, 'dispatch_size', v);
                                                        updateRow(row.shift_id, 'required_staff_count',
                                                            v === '01' ? 1 : v === '02' ? 2 : 0
                                                        );
                                                    }}
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
                                                    disabled={readOnly}
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
                                                        checked={asBool(row.staff_02_attend_flg)}
                                                        onChange={(ev) => updateRow(row.shift_id, 'staff_02_attend_flg', ev.target.checked)}
                                                        disabled={readOnly}
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
                                                        checked={asBool(row.staff_03_attend_flg)}
                                                        onChange={(ev) => updateRow(row.shift_id, 'staff_03_attend_flg', ev.target.checked)}
                                                        disabled={readOnly}
                                                    />
                                                </div>

                                                {/* 操作（右寄せ）：訪問記録・保存・× */}
                                                <div className="ml-auto flex gap-2">
                                                    {(() => {
                                                        const s = recordStatus[row.shift_id] as RecordStatus | undefined;

                                                        // === シフト開始が現在より前かどうか ===
                                                        const startIso = `${row.shift_start_date}T${(row.shift_start_time || '00:00')}:00`;
                                                        const shiftStart = new Date(startIso);
                                                        const now = new Date();
                                                        const isPastStart = shiftStart.getTime() < now.getTime();

                                                        // === ボタン色 ===
                                                        const isSubmitted = s === 'submitted';
                                                        const isGreen = isSubmitted || s === 'approved' || s === 'archived';
                                                        const isRed = !isSubmitted && isPastStart;
                                                        const colorCls =
                                                            isRed
                                                                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                                                                : isGreen
                                                                    ? 'bg-green-600 hover:bg-green-700 text-white border-green-600'
                                                                    : '';

                                                        // === 標準系の引き渡し値 ===
                                                        const csId = row.kaipoke_cs_id;
                                                        const k = csId ? kaipokeByCsId.get(csId) ?? {} : {};

                                                        const sr = pickNonEmpty(getString(row, "standard_route"), k.standard_route);
                                                        const stw = pickNonEmpty(getString(row, "standard_trans_ways"), k.standard_trans_ways);
                                                        const sp = pickNonEmpty(getString(row, "standard_purpose"), k.standard_purpose);

                                                        return (
                                                            <ShiftRecordLinkButton
                                                                shiftId={String(row.shift_id)}
                                                                clientName={getString(row, "name") ?? getString(row, "client_name") ?? ""}
                                                                tokuteiComment={getString(row, "biko") ?? ""}
                                                                standardRoute={sr}
                                                                standardTransWays={stw}
                                                                standardPurpose={sp}
                                                                staff01UserId={row.staff_01_user_id ?? ""}
                                                                staff02UserId={row.staff_02_user_id ?? ""}
                                                                staff03UserId={row.staff_03_user_id ?? ""}
                                                                staff02AttendFlg={String(asBool(row.staff_02_attend_flg))}
                                                                staff03AttendFlg={String(asBool(row.staff_03_attend_flg))}
                                                                judoIdo={row.judo_ido != null ? String(row.judo_ido) : ""}
                                                                className={`w-full ${colorCls}`}
                                                                variant="secondary"
                                                            />
                                                        );
                                                    })()}

                                                    <LockIf locked={readOnly}>
                                                        <Button variant="default" onClick={() => handleSave(row)} disabled={saveDisabled}
                                                            title={saveDisabled ? '開始日/開始時間/終了時間/重度移動 の入力を確認してください' : ''}>
                                                            保存
                                                        </Button>
                                                        <Button variant="destructive" onClick={() => handleDeleteOne(row.shift_id)}>×</Button>
                                                    </LockIf>
                                                </div>
                                            </div>

                                        </TableCell>
                                    </TableRow>
                                </Fragment>
                            )
                        })}
                        {/* ====== 新規追加行（テーブルの一番下） ====== */}
                        {/* 既存の “新規追加行” を丸ごと NewAddRow に置き換え */}
                        <LockIf locked={readOnly}>
                            <NewAddRow
                                onAddClick={handleAddClick}
                                repeatWeekdays={repeatWeekdays}
                                toggleWeekday={toggleWeekday}
                                draft={draft}
                                updateDraft={updateDraft}
                                serviceOptions={serviceOptions}
                                staffOptions={staffOptions}
                            />
                        </LockIf>
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
                <TableCell className="w-[15px]">{/* チェックボックス列は空欄 */}</TableCell>

                {/* 開始日 */}
                <TableCell>
                    <div className="flex items-center gap-2">
                        <div className="w-[140px]">
                            <Input
                                type="date"
                                value={draft.shift_start_date}
                                onChange={(e) => updateDraft('shift_start_date', e.target.value)}
                                className={!isValidDateStr(draft.shift_start_date) ? 'border-red-500' : ''}
                            />
                        </div>
                        <span className="text-xs text-muted-foreground  w-[15px]">（{weekdayJa(draft.shift_start_date)}）</span>
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
                        {/* 派遣人数（draft） */}
                        <Select
                            value={draft.dup_role}
                            onValueChange={(v: '-' | '01') => updateDraft('dup_role', v)}
                        >
                            <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="-">-</SelectItem>
                                <SelectItem value="01">二人同時作業</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </TableCell>

                {/* 重複 */}
                <TableCell>
                    <div className="w-[80px]">
                        {/* 重複（draft） */}
                        <Select
                            value={draft.dispatch_size}
                            onValueChange={(v: '-' | '01' | '02') => updateDraft('dispatch_size', v)}
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
