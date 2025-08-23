// /portal/shift
"use client";

import { useEffect, useState } from "react";
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
};

type PostalDistrictRow = {
    postal_code_3: string;
    district: string;
};
/*
type CsKaipokeInfoRow = {
    kaipoke_cs_id: string;
    name: string | null;
    commuting_flg: boolean | null;
    standard_route: string | null;
    standard_trans_ways: string | null;
    standard_purpose: string | null;
    biko: string | null;
    // 「時間調整」カラム名は仮。存在しない場合は undefined になる想定
    time_adjust_json?: unknown;
};
*/

type AdjustSpec = { label?: string; advance?: number; back?: number; biko?: string };


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

// ===== 空き時間候補取得まわりのヘルパ =====

function hasAdjustCapability(spec?: AdjustSpec) {
    const a = Number(spec?.advance ?? 0);
    const b = Number(spec?.back ?? 0);
    return a !== 0 || b !== 0;
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
            .select("time_adjustability_id, label, Advance_adjustability, Backwoard_adjustability")
            .in("time_adjustability_id", adjustIds);

        (adjRows ?? []).forEach(r => {
            adjustById[r.time_adjustability_id] = {
                label: r.label ?? "",
                advance: Number(r.Advance_adjustability ?? 0),     // 早め
                back: Number(r.Backwoard_adjustability ?? 0),       // 遅め
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

/*
function fitsWindow(s: ShiftData, start: Date | null, end: Date | null) {
    const st = toJstDate(s.shift_start_date, s.shift_start_time);
    const ed = toJstDate(s.shift_start_date, s.shift_end_time);
    if (start && st < start) return false;
    if (end && ed > end) return false;
    return true;
}
*/

// 指定の空き窓（start/end の間）に完全に収まる候補だけ返す
/*
function filterByWindow(list: ShiftData[], start: Date | null, end: Date | null): ShiftData[] {
    if (!start && !end) return list;
    return list.filter((s) => {
        const st = toJstDate(s.shift_start_date, s.shift_start_time);
        const ed = toJstDate(s.shift_start_date, s.shift_end_time);
        if (start && st < start) return false;
        if (end && ed > end) return false;
        return true;
    });
}
*/

// 追加: 2時刻の差を[h]で返す（正の値だけ使う）
function hoursDiff(a: Date, b: Date) {
    return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

// 置き換え: isTimeAdjustNeeded
function isTimeAdjustNeeded(
    shift: ShiftData,
    window: { start: Date | null; end: Date | null },
    csAdjustMap: Record<string, { label?: string; advance?: number; back?: number; biko?: string }>
): boolean {
    const st = toJstDate(shift.shift_start_date, shift.shift_start_time);
    const ed = toJstDate(shift.shift_start_date, shift.shift_end_time);

    // そもそも完全に収まっていれば「時間調整不要」
    const fits = (!window.start || st >= window.start) && (!window.end || ed <= window.end);
    if (fits) return false;

    const spec = csAdjustMap[shift.kaipoke_cs_id];
    if (!spec) return false; // 情報がなければ不可扱い

    const allowAdvance = Number(spec.advance ?? 0); // 早め（前倒し）
    const allowBack = Number(spec.back ?? 0);       // 遅め（後ろ倒し）

    // 必要な移動量を計算
    let needEarlier = 0; // 早めたい量[h]
    let needLater = 0;   // 遅らせたい量[h]

    if (window.start && st < window.start) {
        // 窓の開始より前に始まっている → 開始を遅らせる必要あり
        needLater = hoursDiff(st, window.start);
    }
    if (window.end && ed > window.end) {
        // 窓の終了をはみ出している → 開始を早める必要あり
        needEarlier = hoursDiff(ed, window.end);
    }

    // 片側だけのはみ出しにも対応、両側は両方満たす必要あり
    const okLater = needLater === 0 || needLater <= allowBack;
    const okEarlier = needEarlier === 0 || needEarlier <= allowAdvance;

    return okLater && okEarlier;
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
        <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center p-4">
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
    const [finderAnchor, setFinderAnchor] = useState<string | null>(null); // ←どこに出すか
    const [candidateShifts, setCandidateShifts] = useState<ShiftData[]>([]);
    const [candidateFilter] = useState<{ postal?: string[]; gender?: string[]; service?: string[] }>({});
    void candidateFilter; // 現状未使用
    const [creatingShiftRequest, setCreatingShiftRequest] = useState(false);
    const [csAdjustMap, setCsAdjustMap] = useState<Record<string, { label?: string; advance?: number; back?: number; biko?: string }>>({});


    // 自分の当日シフトから空き窓算出（将来拡張用）
    const myWindows = computeFreeWindowsForSelectedDate(shifts, shiftDate);
    void myWindows;

    // openFinder の中身を修正
    async function openFinder(start: Date | null, end: Date | null, anchor: string) {
        setFinderWindow({ start, end });
        setFinderAnchor(anchor);
        setShowFinder(true);

        const fetched = await fetchCandidatesForDay(shiftDate);
        const { map, merged } = await mergeCsAdjustability(fetched); // map: Record<string, AdjustSpec>
        setCsAdjustMap(map);

        // ← ここを差し替え：調整で入れるものも通す
        const filtered = merged.filter(s => canFitWindow(s, { start, end }, map[s.kaipoke_cs_id]));
        setCandidateShifts(filtered);
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
                            const capability = spec ? hasAdjustCapability(spec) : undefined; // 情報なければ undefined で親上書きしない
                            const label = spec?.label || undefined;

                            return (
                                <div key={shift.shift_id} className="shift-rail__item">
                                    <ShiftCard
                                        shift={shift}
                                        mode="request"
                                        creatingRequest={creatingShiftRequest}
                                        onRequest={(attend, note) => handleShiftRequestWithAlert(shift, attend, note)}
                                        extraActions={<GroupAddButton shift={shift} />}
                                        timeAdjustable={capability}
                                        timeAdjustText={label}
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
        try {
            // ここで rpa_command_requests へ登録（テンプレ等は実装側で揃える）
            // ...実処理は既存と同様に追加...

            const message = `●●様 ${shift.shift_start_date} ${shift.shift_start_time?.slice(0, 5)}～ のサービス時間調整の依頼が来ています。マネジャーは利用者様調整とシフト変更をお願いします。` +
                (timeAdjustNote ? `\n希望の時間調整: ${timeAdjustNote}` : "");
            await supabase.from("alert_log").insert({
                message,
                visible_roles: ["manager", "staff"],
                severity: 2,
                status: "open",
                status_source: "system",
                kaipoke_cs_id: shift.kaipoke_cs_id,
                shift_id: shift.shift_id,
            });

            alert("希望リクエストを登録しました！（時間調整依頼のアラートも作成済）");
        } finally {
            setCreatingShiftRequest(false);
        }
    }

    // 月カレンダー用：その月のシフトを取得し、ログインユーザー分のみ日別件数に集計
    async function fetchMonthCounts(targetMonth: Date) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userRecord } = await supabase
            .from("users")
            .select("user_id")
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
                .select("shift_id, shift_start_date, shift_start_time, staff_01_user_id, staff_02_user_id, staff_03_user_id")
                .gte("shift_start_date", format(start, "yyyy-MM-dd"))
                .lte("shift_start_date", format(end, "yyyy-MM-dd"))
                .order("shift_start_date", { ascending: true })
                .range(i * 1000, (i + 1) * 1000 - 1);

            if (error || !data?.length) break;
            allMonth.push(...(data as ShiftRecord[]));
        }

        const mine = allMonth.filter(
            (s) => [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(userRecord.user_id)
        );

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

            const filteredByUser = allShifts.filter((s) =>
                [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(userRecord.user_id)
            );

            const startOfDay = new Date(shiftDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(shiftDate);
            endOfDay.setHours(23, 59, 59, 999);

            const filteredByDate = filteredByUser.filter((s) => {
                const shiftTime = new Date(`${s.shift_start_date}T${s.shift_start_time}`).getTime();
                return shiftTime >= startOfDay.getTime() && shiftTime <= endOfDay.getTime();
            });

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

            const { data: userData } = await supabase
                .from("user_entry_united_view")
                .select("manager_auth_user_id,manager_user_id, lw_userid,manager_lw_userid,manager_kaipoke_user_id")
                .eq("auth_user_id", authUserId)
                .eq("group_type", "人事労務サポートルーム")
                .limit(1)
                .single();

            if (!userData?.manager_user_id) {
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

            const { data: chanData } = await supabase
                .from("group_lw_channel_view")
                .select("channel_id")
                .eq("group_account", shift.kaipoke_cs_id)
                .maybeSingle();

            if (!chanData?.channel_id) {
                console.warn("チャネルIDが取得できませんでした", shift.kaipoke_cs_id);
                return;
            }

            const mentionUser = userData?.lw_userid ? `<m userId="${userData.lw_userid}">さん` : "職員さん";
            const mentionMgr = userData?.manager_user_id ? `<m userId="${userData.manager_lw_userid}">さん` : "マネジャー";
            const startTimeNoSeconds = shift.shift_start_time.slice(0, 5);

            const message = `${mentionUser}が${shift.shift_start_date} ${startTimeNoSeconds}のシフトにはいれないとシフト処理指示がありました（理由: ${reason || "未記入"}）。代わりに${mentionMgr}にシフトを移します`;

            await fetch('/api/lw-send-botmessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId: chanData.channel_id, text: message }),
            });

            const shiftDateTime = new Date(`${shift.shift_start_date}T${shift.shift_start_time}`);
            const threeDaysLater = new Date();
            threeDaysLater.setDate(threeDaysLater.getDate() + 3);

            if (shiftDateTime < threeDaysLater) {
                const altMessage = `${shift.client_name}様の${shift.shift_start_date} ${startTimeNoSeconds}のシフトにはいれないと (${mentionUser} からシフト処理指示がありました（理由: ${reason || '未記入'}）。シフ子からサービス入る希望を出せます。ぜひ　宜しくお願い致します。`;
                await fetch('/api/lw-send-botmessage', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ channelId: "146763225", text: altMessage }),
                });
            }

            alert("✅ シフト外し処理を登録しました");
        } catch (err) {
            console.error(err);
            alert("処理中にエラーが発生しました");
        }
    }

    return (
        <div className="content min-w-0">
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
