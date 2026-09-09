"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { addMonths, format, startOfMonth } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftData } from "@/types/shift";
import ShiftCard from "@/components/shift/ShiftCard";
import { DepartedStaffShiftBatchCard } from "@/components/shift/DepartedStaffShiftBatchCard";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/SearchableSelect";

type DisplayMode = "list" | "calendar";
type CalendarStyle = CSSProperties & {
  "--shift-view-beta-week-height"?: string;
};
type ShiftRow = {
  id: string | number;
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  kaipoke_cs_id: string;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  judo_ido: string | null;
  name: string | null;
  gender_request_name: string | null;
  male_flg: boolean | null;
  female_flg: boolean | null;
  postal_code_3: string | null;
  district: string | null;
  require_doc_group: string | null;
  level_sort_order?: number | null;
};

const weekDays = ["日", "月", "火", "水", "木", "金", "土"];
const toIso = (date: Date) => format(date, "yyyy-MM-dd");
const toTime = (value: string | null | undefined) => (value ?? "").slice(0, 5);
const sanitizeFileNamePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, "_").trim();

function createMonthCells(ym: string) {
  const first = new Date(`${ym}-01T00:00:00`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil((first.getDay() + lastDay) / 7);
  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateText = toIso(date);
    return { date: dateText, day: date.getDate(), inMonth: dateText.startsWith(ym) };
  });
}

function estimatePrintLines(shift: ShiftData) {
  const primary = `${toTime(shift.shift_start_time)}–${toTime(shift.shift_end_time)} ${shift.client_name || "利用者名なし"}`;
  const secondary = `${shift.district || "エリアなし"}｜${shift.service_code || "サービス内容なし"}`;
  return Math.ceil(primary.length / 24) + Math.ceil(secondary.length / 22);
}

function mapShift(row: ShiftRow): ShiftData {
  return {
    id: String(row.id ?? row.shift_id), shift_id: row.shift_id,
    shift_start_date: row.shift_start_date, shift_start_time: row.shift_start_time ?? "",
    shift_end_time: row.shift_end_time ?? "", service_code: row.service_code ?? "",
    kaipoke_cs_id: row.kaipoke_cs_id, staff_01_user_id: row.staff_01_user_id ?? "",
    staff_02_user_id: row.staff_02_user_id ?? "", staff_03_user_id: row.staff_03_user_id ?? "",
    judo_ido: row.judo_ido ?? "", address: row.district ?? "", client_name: row.name ?? "",
    gender_request_name: row.gender_request_name ?? "", male_flg: Boolean(row.male_flg),
    female_flg: Boolean(row.female_flg), postal_code_3: row.postal_code_3 ?? "",
    district: row.district ?? "", require_doc_group: row.require_doc_group ?? null,
    level_sort_order: row.level_sort_order ?? null,
  };
}

export default function ShiftViewBetaPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const queryString = search.toString();
  const params = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const queryUserId = params.get("user_id")?.trim() ?? "";
  const queryClient = params.get("client")?.trim() ?? "";
  const queryDate = params.get("date")?.trim() ?? "";
  const queryYm = params.get("ym")?.trim() ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);
  const perPage = Math.max(1, Number(params.get("per") ?? "50") || 50);
  const displayMode: DisplayMode = params.get("view") === "calendar" ? "calendar" : "list";
  const selectedYm = queryYm || queryDate.slice(0, 7) || format(startOfMonth(new Date()), "yyyy-MM");
  const monthStart = `${selectedYm}-01`;
  const monthEnd = format(addMonths(startOfMonth(new Date(`${monthStart}T00:00:00`)), 1), "yyyy-MM-dd");

  const [authChecked, setAuthChecked] = useState(false);
  const [myUserId, setMyUserId] = useState("");
  const [staffOptions, setStaffOptions] = useState<SearchableSelectOption[]>([]);
  const [clientOptions, setClientOptions] = useState<SearchableSelectOption[]>([]);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [calendarShifts, setCalendarShifts] = useState<ShiftData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const initialUserApplied = useRef(false);

  const setQuery = useCallback((updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(queryString);
    Object.entries(updates).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }, [pathname, queryString, router]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace(`/login?next=${encodeURIComponent(`${pathname}?${queryString}`)}`); return; }
      const { data: me } = await supabase.from("users").select("user_id").eq("auth_user_id", user.id).maybeSingle();
      if (!active) return;
      setMyUserId(me?.user_id ?? "");
      setAuthChecked(true);
    })();
    return () => { active = false; };
  }, [pathname, queryString, router]);

  useEffect(() => {
    if (!authChecked || initialUserApplied.current || queryUserId || !myUserId) return;
    initialUserApplied.current = true;
    setQuery({ user_id: myUserId, date: queryDate || monthStart, per: String(perPage), page: "1" });
  }, [authChecked, monthStart, myUserId, perPage, queryDate, queryUserId, setQuery]);

  useEffect(() => {
    if (!authChecked) return;
    const controller = new AbortController();
    (async () => {
      try {
        const [staffResponse, clientResponse] = await Promise.all([
          fetch("/api/users", { cache: "no-store", signal: controller.signal }),
          fetch("/api/kaipoke-info", { cache: "no-store", signal: controller.signal }),
        ]);
        if (!staffResponse.ok || !clientResponse.ok) throw new Error("フィルター候補の取得に失敗しました");
        const staffRows = await staffResponse.json() as Array<{ user_id: string; last_name_kanji?: string | null; first_name_kanji?: string | null; roster_sort?: number | null }>;
        const clientRows = await clientResponse.json() as Array<{ kaipoke_cs_id: string; name?: string | null; kana?: string | null; service_kind?: string | null }>;
        setStaffOptions(staffRows.filter((row) => row.user_id).map((row) => {
          const name = `${row.last_name_kanji ?? ""} ${row.first_name_kanji ?? ""}`.trim() || row.user_id;
          return { value: row.user_id, label: name, searchText: `${name} ${row.user_id}`, rosterSort: Number(row.roster_sort ?? Number.MAX_SAFE_INTEGER) };
        }).sort((a, b) => (a.rosterSort as number) - (b.rosterSort as number) || a.label.localeCompare(b.label, "ja")).map(({ value, label, searchText }) => ({ value, label, searchText })));
        setClientOptions(clientRows.filter((row) => row.kaipoke_cs_id).map((row) => ({
          value: row.kaipoke_cs_id, label: row.name?.trim() || row.kaipoke_cs_id,
          searchText: [row.name, row.kana, row.kaipoke_cs_id, row.service_kind].filter(Boolean).join(" "),
        })).sort((a, b) => a.label.localeCompare(b.label, "ja")));
      } catch (error) { if (!controller.signal.aborted) console.error(error); }
    })();
    return () => controller.abort();
  }, [authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const from = (page - 1) * perPage;
        let query = supabase
          .from("shift_csinfo_postalname_view")
          .select("*", { count: "exact" });
        if (displayMode === "calendar" || queryYm) query = query.gte("shift_start_date", monthStart).lt("shift_start_date", monthEnd);
        else if (queryDate) query = query.gte("shift_start_date", queryDate);
        if (queryUserId) query = query.or(`staff_01_user_id.eq.${queryUserId},staff_02_user_id.eq.${queryUserId},staff_03_user_id.eq.${queryUserId}`);
        if (queryClient) query = query.eq("kaipoke_cs_id", queryClient);
        const { data, error, count } = await query.order("shift_start_date").order("shift_start_time").order("shift_id").range(from, from + perPage - 1);
        if (error) throw error;
        if (active) { setShifts(((data ?? []) as ShiftRow[]).map(mapShift)); setTotalCount(count ?? 0); }
      } catch (error) { if (active) { console.error(error); setShifts([]); setTotalCount(0); } }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [authChecked, displayMode, monthEnd, monthStart, page, perPage, queryClient, queryDate, queryUserId, queryYm, reloadKey]);

  useEffect(() => {
    if (!authChecked || displayMode !== "calendar") return;
    let active = true;
    (async () => {
      setCalendarLoading(true);
      try {
        const all: ShiftRow[] = [];
        for (let from = 0; ; from += 1000) {
          let query = supabase.from("shift_csinfo_postalname_view").select("*");
          query = query.gte("shift_start_date", monthStart).lt("shift_start_date", monthEnd);
          if (queryUserId) query = query.or(`staff_01_user_id.eq.${queryUserId},staff_02_user_id.eq.${queryUserId},staff_03_user_id.eq.${queryUserId}`);
          if (queryClient) query = query.eq("kaipoke_cs_id", queryClient);
          const { data, error } = await query.order("shift_start_date").order("shift_start_time").order("shift_id").range(from, from + 999);
          if (error) throw error;
          const chunk = (data ?? []) as ShiftRow[];
          all.push(...chunk);
          if (chunk.length < 1000) break;
        }
        if (active) setCalendarShifts(all.map(mapShift));
      } catch (error) { if (active) { console.error(error); setCalendarShifts([]); } }
      finally { if (active) setCalendarLoading(false); }
    })();
    return () => { active = false; };
  }, [authChecked, displayMode, monthEnd, monthStart, queryClient, queryUserId]);

  const shiftsByDate = useMemo(() => {
    const grouped = new Map<string, ShiftData[]>();
    calendarShifts.forEach((shift) => grouped.set(shift.shift_start_date, [...(grouped.get(shift.shift_start_date) ?? []), shift]));
    return grouped;
  }, [calendarShifts]);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const cells = useMemo(() => createMonthCells(selectedYm), [selectedYm]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, index) => cells.slice(index * 7, index * 7 + 7)), [cells]);
  const populatedWeeks = useMemo(() => weeks.filter((week) => week.length > 0), [weeks]);
  const calendarLayout = useMemo(() => {
    const metrics = populatedWeeks.map((week) => {
      const dailyShifts = week.map((cell) => shiftsByDate.get(cell.date) ?? []);
      const maxShiftCount = Math.max(0, ...dailyShifts.map((dayShifts) => dayShifts.length));
      const maxEstimatedLines = Math.max(1, ...dailyShifts.map((dayShifts) => 1 + dayShifts.reduce((sum, shift) => sum + estimatePrintLines(shift), 0)));
      const longestDetail = Math.max(0, ...dailyShifts.flatMap((dayShifts) => dayShifts.map((shift) => `${shift.district ?? ""}${shift.service_code ?? ""}`.length)));
      return { maxShiftCount, maxEstimatedLines, longestDetail };
    });
    const canBalance = populatedWeeks.length >= 5
      && populatedWeeks.length <= 6
      && metrics.every((week) => week.maxShiftCount <= 3 && week.maxEstimatedLines <= 8 && week.longestDetail <= 46);
    return { canBalance, weekCount: populatedWeeks.length };
  }, [populatedWeeks, shiftsByDate]);
  const calendarStyle: CalendarStyle | undefined = calendarLayout.canBalance
    ? { "--shift-view-beta-week-height": `${165 / calendarLayout.weekCount}mm` }
    : undefined;
  const selectedStaffName = staffOptions.find((option) => option.value === queryUserId)?.label ?? "";
  const selectedClientName = clientOptions.find((option) => option.value === queryClient)?.label ?? "";
  const monthForFileName = selectedYm.replace("-", "");
  const conditionTitle = selectedStaffName && selectedClientName
    ? `担当者：${selectedStaffName} ／ 利用者：${selectedClientName}様`
    : selectedStaffName
      ? `担当者：${selectedStaffName}`
      : selectedClientName
        ? `利用者：${selectedClientName}様`
        : "";
  const printButtonLabel = selectedStaffName && selectedClientName
    ? `【${selectedStaffName}】担当【${selectedClientName}様】カレンダー印刷・PDF保存`
    : selectedStaffName
      ? `【${selectedStaffName}】担当者カレンダー印刷・PDF保存`
      : selectedClientName
        ? `【${selectedClientName}様】利用者カレンダー印刷・PDF保存`
        : "全体カレンダー印刷・PDF保存";
  const pdfFileName = ["シフト・勤務一覧", selectedStaffName, selectedClientName, monthForFileName]
    .filter(Boolean)
    .map(sanitizeFileNamePart)
    .join("_");
  const handlePrint = () => {
    const originalTitle = document.title;
    const restoreTitle = () => { document.title = originalTitle; };
    document.title = pdfFileName;
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
  };

  if (!authChecked) return <div className="p-4 text-sm text-gray-500">ログイン状態を確認しています...</div>;
  const Pager = () => <div className="my-3 flex items-center justify-between print:hidden"><div className="text-xs text-gray-500">{totalCount.toLocaleString()} 件中 {totalCount ? (page - 1) * perPage + 1 : 0}–{Math.min(totalCount, page * perPage)} を表示（{perPage}/ページ）</div><div className="flex items-center gap-2"><Button variant="outline" disabled={page <= 1} onClick={() => setQuery({ page: String(page - 1) })}>前へ</Button><span className="text-sm">{page} / {totalPages}</span><Button variant="outline" disabled={page >= totalPages} onClick={() => setQuery({ page: String(page + 1) })}>次へ</Button></div></div>;

  return <div className="content min-w-0">
    <div className="print:hidden">
      <h2 className="text-xl font-bold">シフト・勤務一覧 <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">β版</span></h2>
      <p className="mb-3 text-sm text-gray-600">既存のシフト情報を、一覧または月間カレンダーで確認できます。</p>
      <DepartedStaffShiftBatchCard onCompleted={() => setReloadKey((value) => value + 1)} />
      <div className="mb-2 flex flex-wrap justify-end gap-2"><Button asChild variant="outline"><Link href="/portal/shift-view-beta">フィルターをクリア</Link></Button>{queryClient && <><Button asChild><Link href={`/portal/roster/monthly/print-view?kaipoke_cs_id=${encodeURIComponent(queryClient)}&month=${encodeURIComponent(selectedYm)}`}>印刷ビュー</Link></Button><Button asChild variant="secondary"><Link href={`/portal/roster/monthly/shift-record-view?kaipoke_cs_id=${encodeURIComponent(queryClient)}&month=${encodeURIComponent(selectedYm)}`}>訪問記録印刷</Link></Button></>}<Button variant={displayMode === "list" ? "default" : "outline"} onClick={() => setQuery({ view: undefined, page: "1" })}>一覧</Button><Button variant={displayMode === "calendar" ? "default" : "outline"} onClick={() => setQuery({ view: "calendar", ym: selectedYm, page: "1" })}>月間カレンダー</Button>{displayMode === "calendar" && <Button onClick={handlePrint}>{printButtonLabel}</Button>}</div>
      <div className="mb-3 grid grid-cols-1 items-end gap-3 md:grid-cols-3"><div><label className="text-xs">担当者（氏名表示 / 値は user_id）</label><SearchableSelect options={staffOptions} value={queryUserId} onChange={(value) => setQuery({ user_id: value || undefined, page: "1" })} placeholder="指定なし" searchPlaceholder="担当者名・IDで検索" /></div><div><label className="text-xs">対象月</label><input type="month" className="w-full rounded border p-2" value={selectedYm} onChange={(event) => setQuery({ ym: event.target.value || undefined, date: event.target.value ? `${event.target.value}-01` : undefined, page: "1" })} /></div><div><label className="text-xs">利用者（kaipoke_cs_id）</label><SearchableSelect options={clientOptions} value={queryClient} onChange={(value) => setQuery({ client: value || undefined, page: "1" })} placeholder="指定なし" searchPlaceholder="利用者名・カナ・IDで検索" /></div></div>
    </div>
    {displayMode === "list" ? <><Pager />{loading ? <div className="text-sm text-gray-500">読み込み中...</div> : shifts.length === 0 ? <div className="text-sm text-gray-500">該当するシフトがありません</div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{shifts.map((shift) => <ShiftCard key={shift.shift_id} shift={shift} mode="view" onReject={(reason) => { fetch("/api/shift-reassign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: shift.shift_id, fromUserId: myUserId, toUserId: "manager:auto", reason }) }).then(() => router.refresh()); }} />)}</div>}<Pager /></> : <section className="shift-view-beta-print mx-auto max-w-[1120px]" aria-label={`${selectedYm}の月間シフトカレンダー`}><h3 className="mb-3 text-center text-xl font-bold">{selectedYm.replace("-", "年")}月 シフト・勤務一覧</h3>{conditionTitle && <p className="mb-2 text-center text-sm font-medium">{conditionTitle}</p>}{calendarLoading ? <div className="text-sm text-gray-500">カレンダーを読み込み中...</div> : <table className={`shift-view-beta-calendar w-full border-collapse border border-slate-500${calendarLayout.canBalance ? " shift-view-beta-calendar--balanced" : ""}`} style={calendarStyle}><thead><tr>{weekDays.map((day) => <th key={day} scope="col" className="border border-slate-500 py-1.5 text-center text-sm font-bold">{day}</th>)}</tr></thead><tbody>{populatedWeeks.map((week) => <tr key={week[0]?.date} className="shift-view-beta-week">{week.map((cell) => { const dayShifts = shiftsByDate.get(cell.date) ?? []; return <td key={cell.date} className={`shift-view-beta-day min-h-[125px] border border-slate-400 p-1.5 align-top ${cell.inMonth ? "bg-white" : "bg-slate-50 text-slate-400"}`}><div className="mb-1 text-xs font-bold">{cell.inMonth ? cell.day : ""}</div>{cell.inMonth && dayShifts.map((shift) => <div key={shift.shift_id} className="shift-view-beta-event mb-1 border-t border-slate-200 pt-1 text-[11px] leading-tight"><div className="shift-view-beta-event-primary font-semibold">{toTime(shift.shift_start_time)}–{toTime(shift.shift_end_time)} <span>{shift.client_name || "利用者名なし"}</span></div><div className="shift-view-beta-event-secondary">{shift.district || "エリアなし"}<span className="px-0.5">｜</span>{shift.service_code || "サービス内容なし"}</div></div>)}</td>; })}</tr>)}</tbody></table>}</section>}
    <style jsx global>{`@media print { @page { size: A4 landscape; margin: 8mm; } body > * { visibility: hidden !important; } .shift-view-beta-print, .shift-view-beta-print * { visibility: visible !important; } .shift-view-beta-print { position: absolute; left: 0; top: 0; width: 100%; max-width: none !important; } .shift-view-beta-print h3 { margin: 0 0 1mm; font-size: 14pt; } .shift-view-beta-print p { margin: 0 0 2mm; font-size: 8pt; } .shift-view-beta-calendar { table-layout: fixed; } .shift-view-beta-calendar thead { display: table-header-group; } .shift-view-beta-calendar tbody { display: table-row-group; } .shift-view-beta-week { break-inside: avoid; page-break-inside: avoid; } .shift-view-beta-day { min-height: 19mm !important; height: auto !important; padding: 0.8mm !important; overflow: visible !important; break-inside: avoid; page-break-inside: avoid; } .shift-view-beta-calendar--balanced .shift-view-beta-week { height: var(--shift-view-beta-week-height); } .shift-view-beta-event { margin: 0.35mm 0 0 !important; padding-top: 0.35mm !important; font-size: 7.2pt; line-height: 1.08; break-inside: avoid; page-break-inside: avoid; } .shift-view-beta-event-primary, .shift-view-beta-event-secondary { overflow-wrap: anywhere; word-break: break-word; } .shift-view-beta-event-secondary span { padding: 0 0.5mm; } }`}</style>
  </div>;
}
