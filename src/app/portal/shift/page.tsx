// /portal/shift
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import type { ShiftData } from "@/types/shift";
import {
    format,
    addDays,
    subDays,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
} from "date-fns";
import { ja } from "date-fns/locale";
import ShiftCard from "@/components/shift/ShiftCard";
import GroupAddButton from "@/components/shift/GroupAddButton";
//import { constants } from "node:buffer";

const PAGE_SIZE = 50;

type ShiftViewRow = {
    id: string;
    shift_id: string;
    shift_start_date: string;      // YYYY-MM-DD
    shift_start_time: string;      // HH:MM:SS
    shift_end_time: string;        // HH:MM:SS
    service_code: string | null;
    kaipoke_cs_id: string;
    staff_01_user_id: string | null;
    staff_02_user_id: string | null;
    staff_03_user_id: string | null;
    name: string | null;
    gender_request_name: string | null;
    male_flg: boolean | null;
    female_flg: boolean | null;
    postal_code: string | null;
    postal_code_3: string | null;
    district: string | null;
    commuting_flg: boolean | null;
    standard_route: string | null;
    standard_trans_ways: string | null;
    standard_purpose: string | null;
    biko: string | null;
    level_sort_order?: number | null;
    require_doc_group: string | null; // ★追加
};

type PostalDistrictRow = {
    postal_code_3: string;
    district: string;
};

type AdjustSpec = { label?: string; advance?: number; back?: number; biko?: string };

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function isMyAssignment(
    s: ShiftData,
    myId?: string | null,
    myKaipokeId?: string | null
) {
    const mine = new Set(
        [myId, myKaipokeId].map(norm).filter((x) => x.length > 0)
    );
    const assignees = [
        s.staff_01_user_id,
        s.staff_02_user_id,
        s.staff_03_user_id,
    ].map(norm);

    return assignees.some((a) => mine.has(a));
}


function canFitWindow(
    shift: ShiftData,
    window: { start: Date | null; end: Date | null },
    spec?: AdjustSpec
): boolean {
    const st = toJstDate(shift.shift_start_date, shift.shift_start_time);
    const ed = toJstDate(shift.shift_start_date, shift.shift_end_time);

    // そのまま収まる
    const fits = (!window.start || st >= window.start) && (!window.end || ed <= window.end);
    if (fits) return true;

    if (!spec) return false; // 調整情報なければ不可

    // どれだけ動かせばよいか（h）
    const needLater = window.start && st < window.start ? Math.abs(st.getTime() - window.start.getTime()) / 36e5 : 0;
    const needEarlier = window.end && ed > window.end ? Math.abs(ed.getTime() - window.end.getTime()) / 36e5 : 0;

    const allowBack = Number(spec.back ?? 0); // 開始を遅らせる（後ろ倒し）
    const allowAdvance = Number(spec.advance ?? 0); // 開始を早める（前倒し）

    return (needLater <= allowBack) && (needEarlier <= allowAdvance);
}


// 当日自分シフトから空き窓を計算（前/間/後） — いまは未使用
function computeFreeWindowsForSelectedDate(
    shifts: ShiftData[],
    base: Date
): Array<{ start: Date | null; end: Date | null }> {
    const yyyyMMdd = format(base, "yyyy-MM-dd");
    const sameDay = shifts
        .filter(s => s.shift_start_date === yyyyMMdd)
        .sort((a, b) =>
            (a.shift_start_date + a.shift_start_time).localeCompare(b.shift_start_date + b.shift_start_time)
        );

    if (sameDay.length === 0) {
        // 画面側でボタン1個出す実装にしているので、ここは空配列でOK
        return [];
    }

    const windows: Array<{ start: Date | null; end: Date | null }> = [];
    // 前
    const firstStart = toJstDate(sameDay[0].shift_start_date, sameDay[0].shift_start_time);
    windows.push({ start: null, end: firstStart });
    // 間
    for (let i = 0; i < sameDay.length - 1; i++) {
        const endCurr = toJstDate(sameDay[i].shift_start_date, sameDay[i].shift_end_time);
        const startNext = toJstDate(sameDay[i + 1].shift_start_date, sameDay[i + 1].shift_start_time);
        windows.push({ start: endCurr, end: startNext });
    }
    // 後
    const lastEnd = toJstDate(sameDay[sameDay.length - 1].shift_start_date, sameDay[sameDay.length - 1].shift_end_time);
    windows.push({ start: lastEnd, end: null });

    return windows;
}

// 指定日の候補（未アサイン中心）を取得して ShiftData に整形
async function fetchCandidatesForDay(baseDate: Date): Promise<ShiftData[]> {
    const day = new Date(baseDate);
    day.setHours(0, 0, 0, 0);
    const yyyy = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, "0");
    const dd = String(day.getDate()).padStart(2, "0");
    const dayStr = `${yyyy}-${mm}-${dd}`;

    const all: ShiftViewRow[] = [];
    for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase
            .from("shift_csinfo_postalname_view")
            .select("*")
            .eq("shift_start_date", dayStr)
            .order("shift_start_time", { ascending: true })
            .range(i * 1000, (i + 1) * 1000 - 1);
        if (error || !data?.length) break;
        all.push(...(data as ShiftViewRow[]));
    }

    const filtered = all.filter(
        (s) => s.staff_01_user_id === "-" || (
            (s.level_sort_order ?? 9999999) < 5_000_000 && (s.level_sort_order ?? 0) !== 1_250_000
        )
    );

    const { data: postalDistricts } = await supabase
        .from("postal_district")
        .select("postal_code_3, district")
        .order("postal_code_3");

    const districtMap = new Map<string, string>(
        (postalDistricts as PostalDistrictRow[] | null)?.map((p) => [p.postal_code_3, p.district]) ?? []
    );

    const mapped: ShiftData[] = filtered.map((s) => ({
        id: String(s.id ?? s.shift_id),
        shift_id: s.shift_id,
        shift_start_date: s.shift_start_date,
        shift_start_time: s.shift_start_time,
        shift_end_time: s.shift_end_time,
        service_code: s.service_code ?? "",
        kaipoke_cs_id: s.kaipoke_cs_id,
        staff_01_user_id: s.staff_01_user_id ?? "",
        staff_02_user_id: s.staff_02_user_id ?? "",
        staff_03_user_id: s.staff_03_user_id ?? "",
        address: s.postal_code ?? "",
        client_name: s.name ?? "",
        gender_request_name: s.gender_request_name ?? "",
        male_flg: Boolean(s.male_flg),
        female_flg: Boolean(s.female_flg),
        postal_code_3: s.postal_code_3 ?? "",
        district: s.district ?? districtMap.get(s.postal_code_3 ?? "") ?? "",
        commuting_flg: Boolean(s.commuting_flg),
        standard_route: s.standard_route ?? "",
        standard_trans_ways: s.standard_trans_ways ?? "",
        standard_purpose: s.standard_purpose ?? "",
        biko: s.biko ?? "",
        level_sort_order: typeof s.level_sort_order === "number" ? s.level_sort_order : null,
        require_doc_group: s.require_doc_group ?? null, // ★追加
    }));

    return mapped;
}

// cs_kaipoke_info の「時間調整」情報をマージ
// 置き換え: mergeCsAdjustability
async function mergeCsAdjustability(list: ShiftData[]): Promise<{
    map: Record<string, AdjustSpec>;
    merged: ShiftData[];
}> {
    const csIds = Array.from(new Set(list.map(s => s.kaipoke_cs_id))).filter(Boolean);
    if (!csIds.length) return { map: {}, merged: list };

    // cs_kaipoke_info から biko と time_adjustability_id を取得
    const { data: csRows } = await supabase
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id, biko, time_adjustability_id")
        .in("kaipoke_cs_id", csIds);

    const byCs: Record<
        string,
        { biko?: string; time_adjustability_id?: string | null }
    > = {};
    (csRows ?? []).forEach(r => {
        byCs[r.kaipoke_cs_id] = {
            biko: r.biko ?? "",
            time_adjustability_id: r.time_adjustability_id ?? null,
        };

    });

    // 参照されている adjustability をまとめて取得
    const adjustIds = Array.from(
        new Set((csRows ?? []).map(r => r.time_adjustability_id).filter(Boolean))
    ) as string[];

    const adjustById: Record<string, { label: string; advance: number; back: number }> = {};
    if (adjustIds.length) {
        const { data: adjRows } = await supabase
            .from("cs_kaipoke_time_adjustability")
            .select("id, label, Advance_adjustability, Backwoard_adjustability")
            .in("id", adjustIds);                     // ← ここを 'id' に

        (adjRows ?? []).forEach((r: {
            id: string;
            label: string | null;
            Advance_adjustability: number | string | null;
            Backwoard_adjustability: number | string | null;
        }) => {
            adjustById[r.id] = {
                label: r.label ?? "",
                advance: Number(r.Advance_adjustability ?? 0),
                back: Number(r.Backwoard_adjustability ?? 0),
            };
        });
    }

    // cs_id -> { adjust可否, biko } の集約
    const map: Record<string, { label?: string; advance?: number; back?: number; biko?: string }> = {};
    csIds.forEach(csId => {
        const cs = byCs[csId] ?? {};
        const adj = cs.time_adjustability_id ? adjustById[cs.time_adjustability_id] : undefined;
        map[csId] = {
            label: adj?.label,
            advance: adj?.advance ?? 0,
            back: adj?.back ?? 0,
            biko: cs.biko ?? "",
        };
    });

    // 候補 shift に biko を補完
    const merged = list.map(s => ({
        ...s,
        biko: s.biko && s.biko.trim() ? s.biko : (map[s.kaipoke_cs_id]?.biko ?? ""),
    }));

    return { map, merged };
}

// ===================== UI部品 =====================

function DateNavigator({
    date,
    onPrev,
    onNext,
    onToggleMonth,
}: {
    date: Date;
    onPrev: () => void;
    onNext: () => void;
    onToggleMonth: () => void;
}) {
    return (
        <div className="grid grid-cols-3 items-center w-full mb-4">
            <div className="justify-self-start">
                <Button size="sm" onClick={onPrev} aria-label="前の日へ" className="px-2 py-1">
                    <span className="md:hidden">&laquo;</span>
                    <span className="hidden md:inline">前の日</span>
                </Button>
            </div>
            <div className="justify-self-center">
                <button
                    onClick={onToggleMonth}
                    className="text-xl font-bold whitespace-nowrap underline decoration-dotted"
                    aria-label="月カレンダーを開く"
                >
                    {format(date, "yyyy/M/d", { locale: ja })}
                </button>
            </div>
            <div className="justify-self-end">
                <Button size="sm" onClick={onNext} aria-label="次の日へ" className="px-2 py-1">
                    <span className="md:hidden">&raquo;</span>
                    <span className="hidden md:inline">次の日</span>
                </Button>
            </div>
        </div>
    );
}

function MonthCalendar({
    month,
    counts,
    onDayPick,
    onPrevMonth,
    onNextMonth,
    onClose,
}: {
    month: Date;
    counts: Record<string, number>;
    onDayPick: (d: Date) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
    onClose: () => void;
}) {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });

    return (
        <div className="fixed inset-0 z-[200] bg-black/30 flex items-start justify-center p-4 md:pl-[250px] md:pr-8">
            <div className="w-full max-w-md rounded-2xl bg-white p-3 shadow-xl">
                <div className="flex items-center justify-between mb-2">
                    <Button size="sm" variant="outline" onClick={onPrevMonth} aria-label="前の月">
                        <span className="md:hidden">&laquo;</span>
                        <span className="hidden md:inline">前の月</span>
                    </Button>
                    <div className="font-bold">{format(month, "yyyy年MM月", { locale: ja })}</div>
                    <Button size="sm" variant="outline" onClick={onNextMonth} aria-label="次の月">
                        <span className="md:hidden">&raquo;</span>
                        <span className="hidden md:inline">次の月</span>
                    </Button>
                </div>

                <div className="grid grid-cols-7 text-center text-xs text-gray-500">
                    {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
                        <div key={w} className="py-1">{w}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                    {days.map((d) => {
                        const key = format(d, "yyyy-MM-dd");
                        const n = counts[key] ?? 0;
                        const dim = !isSameMonth(d, month);
                        return (
                            <div key={key} className={`rounded-lg p-1 ${dim ? "opacity-40" : ""}`}>
                                <div className="text-right text-[11px] text-gray-600">{format(d, "d")}</div>
                                {n > 0 ? (
                                    <button
                                        className="w-full mt-1 rounded-md border text-sm py-1 hover:bg-gray-50 active:scale-[0.99]"
                                        onClick={() => onDayPick(d)}
                                        aria-label={`${format(d, "M/d")} のサービス件数 ${n}`}
                                    >
                                        {n}
                                    </button>
                                ) : (
                                    <div className="h-[30px]" />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="mt-3 text-right">
                    <Button size="sm" variant="secondary" onClick={onClose}>閉じる</Button>
                </div>
            </div>
        </div>
    );
}

// ===================== 画面本体 =====================

export default function ShiftPage() {
    const [shifts, setShifts] = useState<ShiftData[]>([]);
    const [currentPage] = useState(1);
    const [userId, setUserId] = useState<string>("");
    void userId;
    const [shiftDate, setShiftDate] = useState<Date>(new Date());
    const [accountId, setAccountId] = useState<string>("");
    void accountId;
    const [kaipokeUserId, setKaipokeUserId] = useState<string>("");
    void kaipokeUserId;

    const [showMonth, setShowMonth] = useState(false);
    const [monthCursor, setMonthCursor] = useState<Date>(new Date());
    const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});

    const [showFinder, setShowFinder] = useState(false);
    const [finderWindow, setFinderWindow] = useState<{ start: Date | null; end: Date | null }>({ start: null, end: null });
    void finderWindow;
    const [finderAnchor, setFinderAnchor] = useState<string | null>(null); // ←どこに出すか
    const [candidateShifts, setCandidateShifts] = useState<ShiftData[]>([]);
    const [candidateFilter] = useState<{ postal?: string[]; gender?: string[]; service?: string[] }>({});
    void candidateFilter; // 現状未使用
    const [creatingShiftRequest, setCreatingShiftRequest] = useState(false);
    const [csAdjustMap, setCsAdjustMap] = useState<Record<string, { label?: string; advance?: number; back?: number; biko?: string }>>({});
    // 候補フィルターUI・値
    const [filterOpen, setFilterOpen] = useState(false);

    // 3つのフィルター
    const [filterArea, setFilterArea] = useState<string[]>([]);
    const [filterService, setFilterService] = useState<string[]>([]);
    const [filterGender, setFilterGender] = useState<string[]>([]);

    // 選択肢
    const [areaOptions, setAreaOptions] = useState<Array<{ code: string; label: string }>>([]);
    const [serviceOptions, setServiceOptions] = useState<string[]>([]);
    const genderOptions = ["男性希望", "女性希望", "男女問わず"] as const;

    // 候補の“元配列”を保持
    const [rawCandidates, setRawCandidates] = useState<ShiftData[]>([]);

    const normalizeGender = (g: string) => (g?.trim() === "" ? "男女問わず" : g.trim());
    const VALID_GENDERS = new Set(["男性希望", "女性希望", "男女問わず"]);

    function getEffectiveFilters() {
        const areaSet = new Set(areaOptions.map(o => o.code));
        const svcSet = new Set(serviceOptions);
        return {
            area: filterArea.filter(v => areaSet.has(v)),
            svc: filterService.filter(v => svcSet.has(v)),
            gender: filterGender
                .map(v => v.trim())
                .filter(v => VALID_GENDERS.has(v)),
        };
    }
    // 保存キー
    const storageKey = useMemo(
        () => (userId ? `shift-candidate-filters:${userId}` : null),
        [userId]
    );
    // 自分の当日シフトから空き窓算出（将来拡張用）
    const myWindows = computeFreeWindowsForSelectedDate(shifts, shiftDate);
    void myWindows;

    function applyCandidateFilters(list: ShiftData[]) {
        const { area, svc, gender } = getEffectiveFilters();
        const noFilters = area.length === 0 && svc.length === 0 && gender.length === 0;
        if (noFilters) return list; // ← ここが超重要

        return list.filter((s) => {
            if (area.length > 0 && !area.includes(s.postal_code_3 || "")) return false;
            if (svc.length > 0 && !svc.includes(s.service_code || "")) return false;
            if (gender.length > 0) {
                const g = normalizeGender(s.gender_request_name || "");
                if (!gender.includes(g)) return false;
            }
            return true;
        });
    }

    // openFinder の中身を修正
    async function openFinder(start: Date | null, end: Date | null, anchor: string) {
        setFinderWindow({ start, end });
        setFinderAnchor(anchor);
        setShowFinder(true);

        const fetched = await fetchCandidatesForDay(shiftDate);
        const { map, merged } = await mergeCsAdjustability(fetched); // map: Record<string, AdjustSpec>
        setCsAdjustMap(map);

        // 自分が担当しているものを除外（staff_01/02/03 に一致するもの）
        const myShiftIds = new Set(shifts.map(s => s.shift_id)); // 念のため、画面に出てる自分シフトも除外
        // 既存の filtered 生成（自分担当除外・窓内判定など）はそのまま
        const filtered = merged
            .filter(s => !isMyAssignment(s, userId, kaipokeUserId))
            .filter(s => !myShiftIds.has(s.shift_id))
            .filter(s => canFitWindow(s, { start, end }, map[s.kaipoke_cs_id]));


        // ...filtered を作った直後（areaOptions / serviceOptions の set 後）に：
        const { area, svc, gender } = getEffectiveFilters();
        const noFilters = area.length === 0 && svc.length === 0 && gender.length === 0;

        // ★エリア選択肢の抽出（postal_code_3 + district）
        // エリア選択肢
        setAreaOptions(() => {
            const m = new Map<string, string>();
            filtered.forEach(s => {
                const code = s.postal_code_3 || "";
                if (!code) return;
                if (!m.has(code)) m.set(code, `${code}（${s.district || ""}）`);
            });
            return Array.from(m, ([code, label]) => ({ code, label }));
        });

        // サービス種別
        setServiceOptions(() => {
            const set = new Set<string>();
            filtered.forEach(s => s.service_code && set.add(s.service_code));
            return Array.from(set).sort();
        });

        // フィルタ適用
        setRawCandidates(filtered); // ← 追加（任意）
        setCandidateShifts(noFilters ? filtered : applyCandidateFilters(filtered));
    }

    async function toggleFinder(start: Date | null, end: Date | null, anchor: string) {
        // すでに同じ場所が開いていれば閉じる
        if (showFinder && finderAnchor === anchor) {
            setShowFinder(false);
            setFinderAnchor(null);
            setCandidateShifts([]);
            return;
        }
        await openFinder(start, end, anchor);
    }

    function FinderStrip() {
        if (!showFinder) return null;
        return (
            <div className="mt-2 p-3 rounded-xl border bg-[#f7fafc] w-full max-w-full">
                <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold">候補（空き時間に入れるシフト）</div>
                    <button
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                        onClick={() => { setShowFinder(false); setFinderAnchor(null); setCandidateShifts([]); }}
                    >
                        候補を閉じる
                    </button>
                </div>

                {/* ★帯だけ横スクロール */}
                <div className="shift-rail">
                    <div className="shift-rail__inner">
                        {candidateShifts.map((shift) => {
                            const spec = csAdjustMap[shift.kaipoke_cs_id];
                            const hasCap = !!spec && (Number(spec.advance ?? 0) !== 0 || Number(spec.back ?? 0) !== 0);

                            return (
                                <div key={shift.shift_id} className="shift-rail__item">
                                    <ShiftCard
                                        shift={shift}
                                        mode="request"
                                        creatingRequest={creatingShiftRequest}
                                        onRequest={(attend, note) => handleShiftRequestWithAlert(shift, attend, note)}
                                        extraActions={<GroupAddButton shift={shift} />}
                                        // ★ 可能な時だけ上書き。不可/不明時は一切渡さず（= ShiftCard の自動解決に任せる）
                                        {...(hasCap ? { timeAdjustable: true, timeAdjustText: (spec?.label || "時間調整可能") } : {})}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }


    async function handleShiftRequestWithAlert(
        shift: ShiftData,
        attendRequest: boolean,
        timeAdjustNote?: string
    ) {
        setCreatingShiftRequest(true);

        // 型（この関数のローカルだけで使用）
        type AssignResult = {
            status: 'assigned' | 'replaced' | 'error' | 'noop';
            slot?: 'staff_01' | 'staff_02' | 'staff_03';
            message?: string;
        };
        type ShiftAssignApiResponse =
            | { ok: true; assign: AssignResult; stages?: unknown }
            | { ok?: false; error: string; assign?: AssignResult; stages?: unknown };

        // util
        const toHM = (t?: string | null) => (t ? t.slice(0, 5) : '');
        const makeTraceId =
            (typeof crypto !== 'undefined' && 'randomUUID' in crypto && typeof crypto.randomUUID === 'function')
                ? crypto.randomUUID.bind(crypto)
                : () => `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

        try {
            // 1) 認証と自分の ID 取得
            const { data: { session } } = await supabase.auth.getSession();
            const authUserId = session?.user?.id;
            if (!authUserId) { alert('ログイン情報が取得できません'); return; }

            if (!accountId) {
                alert('ユーザーIDを取得できていません。数秒後に再度お試しください。');
                return;
            }

            // 2) RPA リクエスト登録（/shift-coordinate と同様）
            {
                const { error } = await supabase.from('rpa_command_requests').insert({
                    template_id: '92932ea2-b450-4ed0-a07b-4888750da641',
                    requester_id: authUserId,
                    approver_id: authUserId,
                    status: 'approved',
                    request_details: {
                        shift_id: shift.shift_id,
                        kaipoke_cs_id: shift.kaipoke_cs_id,
                        shift_start_date: shift.shift_start_date,
                        shift_start_time: shift.shift_start_time,
                        service_code: shift.service_code,
                        postal_code_3: shift.postal_code_3,
                        client_name: shift.client_name,
                        requested_by: accountId,            // users.user_id（社内ID）
                        requested_kaipoke_user_id: kaipokeUserId,
                        attend_request: attendRequest,
                        // 任意メモ
                        time_adjust_note: timeAdjustNote ?? null,
                    },
                });

                if (error) {
                    alert('送信に失敗しました: ' + error.message);
                    return;
                }

                // 2-α) RPA登録の完了トースト（/shift-coordinate 準拠）
                alert('希望リクエストを登録しました！');
            }

            // 3) Shift更新（/api/shift-assign-after-rpa を /shift-coordinate と同じ引数で呼ぶ）
            const traceId = makeTraceId();
            const assignResp = await fetch('/api/shift-assign-after-rpa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-trace-id': traceId },
                body: JSON.stringify({
                    shift_id: shift.shift_id,
                    requested_by_user_id: accountId, // users.user_id
                    accompany: Boolean(attendRequest),
                    role_code: null,
                    trace_id: traceId,
                }),
            });

            const assignRaw = await assignResp.text();
            let assignJson: ShiftAssignApiResponse | null = null;
            try { assignJson = JSON.parse(assignRaw) as ShiftAssignApiResponse; } catch { /* noop */ }

            if (!assignResp.ok || !assignJson || !('assign' in assignJson) || !assignJson.assign) {
                const errMsg = (assignJson && 'error' in assignJson && typeof assignJson.error === 'string')
                    ? assignJson.error : `HTTP ${assignResp.status}`;
                alert(`※シフト割当は未反映: ${errMsg}`);
                return;
            }

            // 4) LWメッセージ送付（/shift-coordinate と同様の2段構え）
            //    4-1) 「シフト希望が登録されました」通知（RPA完了の周知）
            //    4-2) 割当が 'assigned' | 'replaced' の場合に「担当を変更しました」通知
            const [{ data: chanData }, { data: userData }] = await Promise.all([
                supabase
                    .from('group_lw_channel_view')
                    .select('channel_id')
                    .eq('group_account', shift.kaipoke_cs_id)
                    .maybeSingle(),
                supabase
                    .from('user_entry_united_view')
                    .select('lw_userid')
                    .eq('auth_user_id', authUserId)
                    .eq('group_type', '人事労務サポートルーム')
                    .limit(1)
                    .single(),
            ]);

            const mention = userData?.lw_userid ? `<m userId="${userData.lw_userid}">さん` : '職員さん';

            if (chanData?.channel_id) {
                // 4-1) RPA完了の通知（/shift-coordinate の文面）
                const msgRpaDone =
                    `✅シフト希望が登録されました\n\n` +
                    `・カイポケ反映までお待ちください\n\n` +
                    `・日付: ${shift.shift_start_date}\n` +
                    `・時間: ${toHM(shift.shift_start_time)}～${toHM(shift.shift_end_time)}\n` +
                    `・利用者: ${shift.client_name} 様\n` +
                    `・種別: ${shift.service_code}\n` +
                    `・エリア: ${shift.postal_code_3}（${shift.district}）\n` +
                    `・同行希望: ${attendRequest ? 'あり' : 'なし'}\n` +
                    `・担当者: ${mention}`;

                await fetch('/api/lw-send-botmessage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId: chanData.channel_id, text: msgRpaDone }),
                });

                // 4-2) 担当変更の通知（割当結果が assigned/replaced のとき）
                const { status } = assignJson.assign;
                if (status === 'assigned' || status === 'replaced') {
                    const msgAssigned =
                        `${shift.shift_start_date} ${toHM(shift.shift_start_time)}～${toHM(shift.shift_end_time)} のシフトの担当を${mention}に変更しました（マイファミーユ）。\n` +
                        `変更に問題がある場合には、マネジャーに問い合わせください。`;

                    await fetch('/api/lw-send-botmessage', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ channelId: chanData.channel_id, text: msgAssigned }),
                    });
                }
            } else {
                console.warn('チャネルIDが取得できませんでした');
            }

            // 5) 既存どおり：時間調整のアラートも作成（/portal/shift 既存の文面を踏襲）
            const message =
                `●●様 ${shift.shift_start_date} ${toHM(shift.shift_start_time)}～ のサービス時間調整の依頼が来ています。` +
                `マネジャーは利用者様調整とシフト変更をお願いします。` +
                (timeAdjustNote ? `\n希望の時間調整: ${timeAdjustNote}` : '');
            await supabase.from('alert_log').insert({
                message,
                visible_roles: ['manager', 'staff'],
                severity: 2,
                status: 'open',
                status_source: 'system',
                kaipoke_cs_id: shift.kaipoke_cs_id,
                shift_id: shift.shift_id,
            });

            // 完了
            alert('希望リクエストを登録し、シフト反映・通知まで実施しました！');

        } catch (e) {
            console.error(e);
            alert('処理中にエラーが発生しました');
        } finally {
            setCreatingShiftRequest(false);
        }
    }

    function clearFilters() {
        setFilterArea([]);
        setFilterService([]);
        setFilterGender([]);
        // 保存しているものもクリア
        if (storageKey) {
            localStorage.removeItem(storageKey);
        }
        // 候補を表示中なら元一覧に戻す
        setCandidateShifts(rawCandidates);
    }

    // 月カレンダー用：その月のシフトを取得し、ログインユーザー分のみ日別件数に集計
    async function fetchMonthCounts(targetMonth: Date) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userRecord } = await supabase
            .from("users")
            .select("user_id, kaipoke_user_id")
            .eq("auth_user_id", user.id)
            .single();

        if (!userRecord?.user_id) return;

        const start = startOfMonth(targetMonth);
        const end = endOfMonth(targetMonth);

        type ShiftRecord = {
            shift_start_date: string;
            staff_01_user_id: string | null;
            staff_02_user_id: string | null;
            staff_03_user_id: string | null;
        };

        const allMonth: ShiftRecord[] = [];
        for (let i = 0; i < 10; i++) {
            const { data, error } = await supabase
                .from("shift_csinfo_postalname_view")
                .select("kaipoke_cs_id,shift_id, shift_start_date, shift_start_time, staff_01_user_id, staff_02_user_id, staff_03_user_id,require_doc_group")
                .gte("shift_start_date", format(start, "yyyy-MM-dd"))
                .lte("shift_start_date", format(end, "yyyy-MM-dd"))
                .order("shift_start_date", { ascending: true })
                .range(i * 1000, (i + 1) * 1000 - 1);

            if (error || !data?.length) break;
            allMonth.push(...(data as ShiftRecord[]));
        }

        const myKeys = new Set(
            [userRecord.user_id, userRecord.kaipoke_user_id]
                .map((v) => (v ?? "").toString().trim().toLowerCase())
                .filter((x) => x.length > 0)
        );

        const mine = allMonth.filter((s) => {
            const assignees = [
                s.staff_01_user_id,
                s.staff_02_user_id,
                s.staff_03_user_id,
            ].map((v) => (v ?? "").toString().trim().toLowerCase());
            return assignees.some((a) => myKeys.has(a));
        });


        const counts: Record<string, number> = {};
        for (const s of mine) {
            const key = s.shift_start_date; // "YYYY-MM-DD"
            counts[key] = (counts[key] ?? 0) + 1;
        }
        setMonthCounts(counts);
    }

    useEffect(() => {
        // 日付切替時に前回の帯を閉じる＆内容クリア
        setShowFinder(false);
        setFinderAnchor(null);
        setCandidateShifts([]);
    }, [shiftDate]);

    useEffect(() => {
        if (showMonth) { void fetchMonthCounts(monthCursor); }
    }, [showMonth, monthCursor]);

    useEffect(() => {
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: userRecord } = await supabase
                .from("users")
                .select("user_id, kaipoke_user_id")
                .eq("auth_user_id", user.id)
                .single();

            if (!userRecord?.user_id) return;

            setAccountId(userRecord.user_id);
            setKaipokeUserId(userRecord.kaipoke_user_id || "");
            setUserId(userRecord.user_id);

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const thirtyDaysISO = thirtyDaysAgo.toISOString();

            const allShifts: ShiftViewRow[] = [];
            for (let i = 0; i < 10; i++) {
                const { data, error } = await supabase
                    .from("shift_csinfo_postalname_view")
                    .select("*")
                    .gte("shift_start_date", thirtyDaysISO)
                    .order("shift_start_date", { ascending: true })
                    .range(i * 1000, (i + 1) * 1000 - 1);

                if (error || !data?.length) break;
                allShifts.push(...(data as ShiftViewRow[]));
            }

            const myKeys = new Set(
                [userRecord.user_id, userRecord.kaipoke_user_id]
                    .map((v) => (v ?? "").toString().trim().toLowerCase())
                    .filter((x) => x.length > 0)
            );

            const filteredByUser = allShifts.filter((s) => {
                const assignees = [
                    s.staff_01_user_id,
                    s.staff_02_user_id,
                    s.staff_03_user_id,
                ].map((v) => (v ?? "").toString().trim().toLowerCase());
                return assignees.some((a) => myKeys.has(a));
            });


            const startOfDay = new Date(shiftDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(shiftDate);
            endOfDay.setHours(23, 59, 59, 999);

            const filteredByDate = filteredByUser.filter((s) => {
                const shiftTime = new Date(`${s.shift_start_date}T${s.shift_start_time}`).getTime();
                return shiftTime >= startOfDay.getTime() && shiftTime <= endOfDay.getTime();
            });

            try {
                const dd = format(shiftDate, "yyyy-MM-dd");
                const lines = filteredByDate
                    .filter(s => s.shift_start_date === dd)
                    .map(s => `${s.shift_id}/${s.kaipoke_cs_id}/${(s.shift_start_time || "").slice(0, 5)}`)
                    .join(" , ");
                alert(`[page] myShifts @ ${dd}\n${lines || "(none)"}`);
            } catch { }

            const sorted = filteredByDate.sort((a, b) => {
                const d1 = a.shift_start_date + a.shift_start_time;
                const d2 = b.shift_start_date + b.shift_start_time;
                return d1.localeCompare(d2);
            });

            setShifts(
                sorted.map((s) => ({
                    shift_id: s.shift_id,
                    shift_start_date: s.shift_start_date,
                    shift_start_time: s.shift_start_time,
                    shift_end_time: s.shift_end_time,
                    service_code: s.service_code ?? "",
                    kaipoke_cs_id: s.kaipoke_cs_id,
                    staff_01_user_id: s.staff_01_user_id ?? "",
                    staff_02_user_id: s.staff_02_user_id ?? "",
                    staff_03_user_id: s.staff_03_user_id ?? "",
                    address: s.district ?? "",
                    client_name: s.name ?? "",
                    gender_request_name: s.gender_request_name ?? "",
                    male_flg: Boolean(s.male_flg),
                    female_flg: Boolean(s.female_flg),
                    postal_code_3: s.postal_code_3 ?? "",
                    district: s.district ?? "",
                    commuting_flg: Boolean(s.commuting_flg),
                    standard_route: s.standard_route ?? "",
                    standard_trans_ways: s.standard_trans_ways ?? "",
                    standard_purpose: s.standard_purpose ?? "",
                    biko: s.biko ?? "",
                }))
            );
        };

        void fetchData();
    }, [shiftDate]);

    useEffect(() => {
        if (!showFinder) return;
        setCandidateShifts(applyCandidateFilters(rawCandidates));
    }, [showFinder, rawCandidates, filterArea, filterService, filterGender]);

    useEffect(() => {
        if (!showFinder) return;
        const validAnchors = new Set<string>([
            "no-shift", "before-first",
            ...shifts.map(s => `after:${s.shift_id}`)
        ]);
        if (!validAnchors.has(finderAnchor ?? "")) {
            setShowFinder(false);
            setFinderAnchor(null);
            setCandidateShifts([]);
        }
    }, [shifts, showFinder, finderAnchor]);

    // 初期ロード：localStorage から値を復元
    useEffect(() => {
        if (!storageKey) return;
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            setFilterArea(Array.isArray(parsed.area) ? parsed.area : []);
            setFilterService(Array.isArray(parsed.service) ? parsed.service : []);
            setFilterGender(Array.isArray(parsed.gender) ? parsed.gender : []);
        } catch { }
    }, [storageKey]);

    // 保存
    useEffect(() => {
        if (!storageKey) return;
        const payload = {
            area: filterArea,
            service: filterService,
            gender: filterGender,
        };
        localStorage.setItem(storageKey, JSON.stringify(payload));
    }, [storageKey, filterArea, filterService, filterGender]);

    /*
    useEffect(() => {
        if (!showFinder || candidateShifts.length === 0) return;
        // 直近の候補に対して再フィルタ（元の一覧は保持していないため、
        // ここでは簡便に現在表示分へ再適用。必要なら元配列を別stateで保持してもOK）
        setCandidateShifts(prev => applyCandidateFilters(prev));
    }, [showFinder, filterArea, filterStartHour, filterEndHour, filterGender]);
    */

    const handlePrevDay = () => setShiftDate(subDays(shiftDate, 1));
    const handleNextDay = () => setShiftDate(addDays(shiftDate, 1));
    const handleDeleteAll = () => {
        if (!shifts.length) return;
        if (confirm("本当にこの日の全シフトをお休み処理しますか？")) {
            shifts.forEach((shift) => void handleShiftReject(shift, "お休み希望"));
        }
    };

    const start = (currentPage - 1) * PAGE_SIZE;
    const paginatedShifts = shifts.slice(start, start + PAGE_SIZE);

    async function handleShiftReject(shift: ShiftData, reason: string) {
        try {
            const shiftStartJst = toJstDate(shift.shift_start_date, shift.shift_start_time);
            const diffHours = (shiftStartJst.getTime() - Date.now()) / (1000 * 60 * 60);

            if (diffHours < 6) {
                alert("サービス開始まで6時間を切っているので、ここからシフトを外せません。マネジャーに相談してください");
                return;
            }

            const session = await supabase.auth.getSession();
            const authUserId = session.data?.session?.user?.id;
            if (!authUserId) {
                alert("ログイン情報が取得できません");
                return;
            }

            // 取得時に level_sort も取る（あなたの貼り付け通りでOK）
            const { data: userData } = await supabase
                .from("user_entry_united_view")
                .select("manager_auth_user_id,manager_user_id,lw_userid,manager_lw_userid,manager_kaipoke_user_id,level_sort")
                .eq("auth_user_id", authUserId)
                .eq("group_type", "人事労務サポートルーム")
                .limit(1)
                .single();

            // ★ここを修正（! の位置がNGなので括弧で明示 or 数値化して判定）
            const levelSort = Number(userData?.level_sort);
            const canUse = Number.isFinite(levelSort) && levelSort >= 5_000_000;
            //alert("sort_level: " + levelSort);
            //alert("canUse: " + canUse);


            if (!canUse) {
                alert("アシスタントマネジャー以上はこの機能は使えません。マネジャーグループ内でリカバリー調整を行って下さい");
                return;
            }


            const { error } = await supabase.from("rpa_command_requests").insert({
                template_id: "92932ea2-b450-4ed0-a07b-4888750da641",
                requester_id: authUserId,
                approver_id: userData.manager_auth_user_id,
                status: "approved",
                request_details: {
                    shift_id: shift.shift_id,
                    kaipoke_cs_id: shift.kaipoke_cs_id,
                    shift_start_date: shift.shift_start_date,
                    shift_start_time: shift.shift_start_time,
                    service_code: shift.service_code,
                    postal_code_3: shift.postal_code_3,
                    client_name: shift.client_name,
                    requested_by: userData.manager_user_id,
                    attend_request: false,
                    requested_kaipoke_user_id: userData.manager_kaipoke_user_id,
                },
            });

            if (error) {
                alert("送信に失敗しました: " + error.message);
                return;
            }

            // === 送信前・超強力アラートデバッグ ===
            const preShiftId = shift.shift_id;
            const preFromUser = accountId;                  // ここが空になりやすい
            const preToUser = userData?.manager_user_id;
            const preReason = reason;

            /*
            alert(
                [
                    "[precheck] /api/shift-reassign 送信前チェック",
                    `shiftId: ${preShiftId || "(empty)"}`,
                    `fromUserId: ${preFromUser || "(empty)"}`,
                    `toUserId: ${preToUser || "(empty)"}`,
                    `reason: ${preReason || "(empty)"}`,
                ].join("\n")
            );
            */

            // どれか空ならここで止める（APIに空を送らない）
            if (!preShiftId || !preFromUser || !preToUser) {
                alert("必要なIDが空のため送信しません。上の precheck を確認してください。");
                return;
            }

            const payload = {
                shiftId: preShiftId,
                fromUserId: preFromUser,
                toUserId: preToUser,
                reason: preReason,
            };

            const bodyStr = JSON.stringify(payload);
            //alert(`[payload JSON] length=${bodyStr.length}\n${bodyStr}`);


            const res = await fetch("/api/shift-reassign", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: bodyStr,
            });
            if (!res.ok) {
                const msg = await res.text().catch(() => "");
                alert(`担当交代の登録に失敗しました。\n${msg}`);
                return;
            }

            // ③ 送信先チャンネル取得
            const { data: chanData } = await supabase
                .from("group_lw_channel_view")
                .select("channel_id")
                .eq("group_account", shift.kaipoke_cs_id)
                .maybeSingle();

            // ④ LINE WORKS 通知（/portal/shift の既存ロジックを流用）
            if (chanData?.channel_id) {
                const mentionUser =
                    userData?.lw_userid ? `<m userId="${userData.lw_userid}">さん` : "職員さん";
                // ★ 条件キーも参照先も manager_lw_userid に統一
                const mentionMgr =
                    userData?.manager_lw_userid ? `<m userId="${userData.manager_lw_userid}">さん` : "マネジャー";
                const startTimeNoSeconds = (shift.shift_start_time || "").slice(0, 5);

                const message =
                    `${mentionUser}が${shift.shift_start_date} ${startTimeNoSeconds}のシフトに入れないため` +
                    `シフト処理指示（理由: ${reason || "未記入"}）。代わりに${mentionMgr}にシフトを移しました。`;

                await fetch("/api/lw-send-botmessage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ channelId: chanData.channel_id, text: message }),
                });

                // 3日以内なら別チャンネルにも周知
                const shiftDateTime = new Date(`${shift.shift_start_date}T${shift.shift_start_time}`);
                const threeDaysLater = new Date();
                threeDaysLater.setDate(threeDaysLater.getDate() + 3);

                if (shiftDateTime < threeDaysLater) {
                    const altMessage =
                        `${shift.client_name}様の${shift.shift_start_date} ${startTimeNoSeconds}のシフトに` +
                        `${mentionUser}が入れないため、シフト処理指示（理由: ${reason || "未記入"}）。` +
                        `シフ子からサービスに入れる希望を出してください。よろしくお願いします。`;

                    await fetch("/api/lw-send-botmessage", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ channelId: "146763225", text: altMessage }),
                    });
                }
            } else {
                console.warn("チャネルIDが取得できませんでした", shift.kaipoke_cs_id);
            }

            // ⑤ UI更新 & 完了アラート
            setShifts(prev => prev.filter(s => s.shift_id !== shift.shift_id));
            alert("✅ シフト外し処理を登録しました");
        } catch (err) {
            console.error(err);
            alert("処理中にエラーが発生しました");
        }
    }


    return (
        <div className="content min-w-0">

            {/* ▼ 空き時間のシフト候補：条件UI（最上部 / 折りたたみ） */}
            <div className="mb-4">
                <button
                    className="text-sm underline decoration-dotted"
                    onClick={() => setFilterOpen(v => !v)}
                    aria-expanded={filterOpen}
                >
                    {filterOpen ? "▲条件設定を閉じる" : "▼空き時間のシフト候補の条件設定をする"}
                </button>

                {filterOpen && (
                    <div className="mt-2 p-3 rounded-xl border bg-[#fafafa]">
                        {/* エリア */}
                        <div className="mb-3">
                            <label className="block text-xs mb-1">エリア（複数選択）</label>
                            <select
                                multiple
                                className="w-full border rounded p-2 h-[7rem]"
                                value={filterArea}
                                onChange={(e) => setFilterArea(Array.from(e.target.selectedOptions, o => o.value))}
                            >
                                {areaOptions.map(opt => (
                                    <option key={opt.code} value={opt.code}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* サービス種別 */}
                        <div className="mb-3">
                            <label className="block text-xs mb-1">サービス種別（複数選択）</label>
                            <select
                                multiple
                                className="w-full border rounded p-2 h-[7rem]"
                                value={filterService}
                                onChange={(e) => setFilterService(Array.from(e.target.selectedOptions, o => o.value))}
                            >
                                {serviceOptions.map(sc => (
                                    <option key={sc} value={sc}>{sc}</option>
                                ))}
                            </select>
                        </div>

                        {/* 性別希望 */}
                        <div className="mb-1">
                            <label className="block text-xs mb-1">性別希望（複数選択）</label>
                            <select
                                multiple
                                className="w-full border rounded p-2 h-[5.5rem]"
                                value={filterGender}
                                onChange={(e) => setFilterGender(Array.from(e.target.selectedOptions, o => o.value))}
                            >
                                {genderOptions.map(g => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                            条件はこのユーザーで保存され、次回以降も引き継がれます。
                        </div>

                        <div className="text-xs text-gray-500 mt-1">
                            条件はこのユーザーで保存され、次回以降も引き継がれます。
                        </div>

                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="px-3 py-1 text-sm rounded bg-gray-400 text-white hover:bg-gray-500"
                            >
                                条件をクリア
                            </button>
                        </div>

                    </div>
                )}
            </div>
            <div className="content min-w-0">
                <DateNavigator
                    date={shiftDate}
                    onPrev={handlePrevDay}
                    onNext={handleNextDay}
                    onToggleMonth={() => { setMonthCursor(shiftDate); setShowMonth((v) => !v); }}
                />
            </div>

            <div className="text-right mb-4">
                <Button onClick={handleDeleteAll} className="bg-red-500 text-white">この日はお休み希望</Button>
            </div>

            {showMonth && (
                <MonthCalendar
                    month={monthCursor}
                    counts={monthCounts}
                    onDayPick={(d) => { setShiftDate(d); setShowMonth(false); }}
                    onPrevMonth={() => setMonthCursor((m) => subMonths(m, 1))}
                    onNextMonth={() => setMonthCursor((m) => addMonths(m, 1))}
                    onClose={() => setShowMonth(false)}
                />
            )}

            {/* --- 空き時間シフト導線（ボタンは冒頭1回＋各シフトの“後ろ”に出す） --- */}
            {shifts.length === 0 ? (
                <>
                    <div className="text-sm text-gray-500">シフトがありません</div>
                    <div className="mt-3">
                        <Button onClick={() => toggleFinder(null, null, "no-shift")}>
                            空き時間のシフトを見つける
                        </Button>
                        {showFinder && finderAnchor === "no-shift" && <FinderStrip />}
                    </div>
                </>
            ) : (
                <>
                    {/* 冒頭：その日の最初のシフトより前の空き */}
                    <div className="my-3">
                        <Button
                            onClick={() => toggleFinder(
                                null,
                                toJstDate(shifts[0].shift_start_date, shifts[0].shift_start_time),
                                "before-first"
                            )}
                        >
                            空き時間のシフトを見つける
                        </Button>
                        { /* 直下に “同じ場所にだけ” Finder を出す */}
                        {showFinder && finderAnchor === "before-first" && <FinderStrip />}
                    </div>

                    {/* 各シフトカード + 直後にボタン（= 間 と 最後の後ろ をカバー） */}
                    {paginatedShifts.map((shift) => {
                        const idx = shifts.findIndex((s) => s.shift_id === shift.shift_id);
                        const endCurr = toJstDate(shift.shift_start_date, shift.shift_end_time);
                        const startNext =
                            idx >= 0 && idx < shifts.length - 1
                                ? toJstDate(shifts[idx + 1].shift_start_date, shifts[idx + 1].shift_start_time)
                                : null; // 最後のシフトの後ろは end=null で「終日後ろ」探索に
                        const anchor = `after:${shift.shift_id}`;
                        return (
                            <div key={shift.shift_id} className="mb-4">
                                <ShiftCard
                                    shift={shift}
                                    mode="reject"
                                    onReject={(reason) => handleShiftReject(shift, reason)}
                                    extraActions={<GroupAddButton shift={shift} />}
                                />
                                <div className="mt-2">
                                    <Button onClick={() => toggleFinder(endCurr, startNext, anchor)}>
                                        空き時間のシフトを見つける
                                    </Button>
                                </div>
                                { /* クリックした“このカードの直後”にだけ表示 */}
                                {showFinder && finderAnchor === anchor && <FinderStrip />}
                            </div>
                        );
                    })}
                </>
            )}

            <div className="content">
                <DateNavigator
                    date={shiftDate}
                    onPrev={handlePrevDay}
                    onNext={handleNextDay}
                    onToggleMonth={() => { setMonthCursor(shiftDate); setShowMonth((v) => !v); }}
                />
            </div>
        </div>
    );
}

function toJstDate(dateStr: string, timeStr?: string) {
    const hhmm = (timeStr ?? "00:00").slice(0, 5);
    return new Date(`${dateStr}T${hhmm}:00+09:00`);
}
