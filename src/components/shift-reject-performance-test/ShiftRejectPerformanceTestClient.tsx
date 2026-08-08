"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarRange, Filter, Gauge, RotateCcw, Search, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { createTimeAdjustAlertFromShift } from "@/lib/shift/shift_card_alert";
import type { ServiceKey } from "@/lib/certificateJudge";
import type {
  RejectInitialDataResponse,
  RejectInitialDataSuccess,
  RejectPerformanceShift,
  RejectPerformanceStaffRow,
} from "@/types/shiftRejectPerformanceTest";
import GroupAddButtonPerformanceTest from "@/components/shift-coordinate-performance-test/GroupAddButtonPerformanceTest";
import ShiftCardPerformanceTest from "@/components/shift-coordinate-performance-test/ShiftCardPerformanceTest";
import ShiftRejectCardPerformanceTest from "./ShiftRejectCardPerformanceTest";

const PAGE_SIZE = 100;

type FinderWindow = { start: Date | null; end: Date | null };
type CandidateCacheEntry = Pick<
  RejectInitialDataSuccess,
  "shifts" | "staffMap" | "myServiceKeys" | "perf"
>;

function toJstDate(dateStr: string, timeStr?: string | null) {
  return new Date(`${dateStr}T${(timeStr ?? "00:00").slice(0, 5)}:00+09:00`);
}

function canFitWindow(shift: RejectPerformanceShift, window: FinderWindow) {
  const start = toJstDate(shift.shift_start_date, shift.shift_start_time);
  const end = toJstDate(shift.shift_start_date, shift.shift_end_time);
  const fits = (!window.start || start >= window.start) && (!window.end || end <= window.end);
  if (fits) return true;
  if (!shift.time_adjustable) return false;

  const needLater = window.start && start < window.start
    ? Math.abs(start.getTime() - window.start.getTime()) / 36e5
    : 0;
  const needEarlier = window.end && end > window.end
    ? Math.abs(end.getTime() - window.end.getTime()) / 36e5
    : 0;
  return (
    needLater <= Number(shift.time_adjust_back_hours ?? 0) &&
    needEarlier <= Number(shift.time_adjust_advance_hours ?? 0)
  );
}

function formatWindow(window: FinderWindow) {
  if (!window.start && !window.end) return "終日";
  if (!window.start) return `${format(window.end!, "H:mm")} より前`;
  if (!window.end) return `${format(window.start, "H:mm")} より後`;
  return `${format(window.start, "H:mm")} - ${format(window.end, "H:mm")}`;
}

async function fetchWithSession(url: string, signal?: AbortSignal) {
  const sessionResult = await supabase.auth.getSession();
  const accessToken = sessionResult.data.session?.access_token;
  if (!accessToken) throw new Error("ログイン情報が取得できません");
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as RejectInitialDataResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok === false ? payload.error : `HTTP ${response.status}`);
  }
  return payload;
}

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
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <Button variant="outline" onClick={onPrev}>← 前日</Button>
      <button
        type="button"
        onClick={onToggleMonth}
        className="rounded-xl px-4 py-2 text-center transition-colors hover:bg-purple-50"
      >
        <div className="text-xs font-bold tracking-[0.16em] text-purple-700">SELECTED DATE</div>
        <div className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">
          {format(date, "yyyy年M月d日（E）", { locale: ja })}
        </div>
      </button>
      <Button variant="outline" onClick={onNext}>翌日 →</Button>
    </div>
  );
}

function MonthCalendar({
  month,
  counts,
  loading,
  onPick,
  onPrev,
  onNext,
  onClose,
}: {
  month: Date;
  counts: Record<string, number>;
  loading: boolean;
  onPick: (date: Date) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="月間カレンダー">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onPrev}>前月</Button>
        <div className="font-bold text-slate-950">{format(month, "yyyy年M月")}</div>
        <Button variant="outline" size="sm" onClick={onNext}>翌月</Button>
      </div>
      {loading && <div className="mb-2 text-center text-xs text-slate-500">件数を読み込み中...</div>}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {Array.from("日月火水木金土").map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const count = counts[key] ?? 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(day)}
              className={[
                "min-h-14 rounded-lg border p-1 text-left text-xs transition-colors hover:border-purple-300 hover:bg-purple-50",
                isSameMonth(day, month) ? "bg-white text-slate-800" : "bg-slate-50 text-slate-400",
              ].join(" ")}
            >
              <span>{format(day, "d")}</span>
              {count > 0 && (
                <span className="mt-1 block rounded-full bg-purple-100 px-1.5 py-0.5 text-center font-bold text-purple-800">
                  {count}件
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-right"><Button variant="outline" size="sm" onClick={onClose}>閉じる</Button></div>
    </section>
  );
}

export default function ShiftRejectPerformanceTestClient() {
  const requestSequence = useRef(0);
  const candidateCache = useRef(new Map<string, CandidateCacheEntry>());
  const monthCountsCache = useRef(new Map<string, Record<string, number>>());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shiftDate, setShiftDate] = useState(() => new Date());
  const [shifts, setShifts] = useState<RejectPerformanceShift[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, RejectPerformanceStaffRow>>({});
  const [accountId, setAccountId] = useState("");
  const [kaipokeUserId, setKaipokeUserId] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [myServiceKeys, setMyServiceKeys] = useState<ServiceKey[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [serviceFilter, setServiceFilter] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [showMonth, setShowMonth] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [monthCounts, setMonthCounts] = useState<Record<string, number>>({});
  const [monthLoading, setMonthLoading] = useState(false);
  const [finderAnchor, setFinderAnchor] = useState<string | null>(null);
  const [finderWindow, setFinderWindow] = useState<FinderWindow>({ start: null, end: null });
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [rawCandidates, setRawCandidates] = useState<RejectPerformanceShift[]>([]);
  const [candidateStaffMap, setCandidateStaffMap] = useState<Record<string, RejectPerformanceStaffRow>>({});
  const [candidateServiceKeys, setCandidateServiceKeys] = useState<ServiceKey[] | null>(null);
  const [candidateAreaFilter, setCandidateAreaFilter] = useState<string[]>([]);
  const [candidateServiceFilter, setCandidateServiceFilter] = useState<string[]>([]);
  const [candidateGenderFilter, setCandidateGenderFilter] = useState<string[]>([]);
  const [candidateFilterOpen, setCandidateFilterOpen] = useState(false);
  const [creatingShiftRequest, setCreatingShiftRequest] = useState(false);

  const selectedDateString = format(shiftDate, "yyyy-MM-dd");

  useEffect(() => {
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const pageStartedAt = performance.now();
    setLoading(true);
    setLoadError(null);
    setCurrentPage(1);
    setFinderAnchor(null);
    setRawCandidates([]);
    console.time("[shift-reject-performance-test] initial load");

    void fetchWithSession(
      `/api/shift-reject-performance-test/initial-data?date=${encodeURIComponent(selectedDateString)}`,
      controller.signal,
    )
      .then((payload) => {
        if (sequence !== requestSequence.current || payload.scope === "month-counts") return;
        setShifts(payload.shifts);
        setStaffMap(payload.staffMap);
        setAccountId(payload.user.accountId);
        setKaipokeUserId(payload.user.kaipokeUserId);
        setUserRole(payload.user.systemRole);
        setMyServiceKeys(payload.myServiceKeys);
        console.log("[shift-reject-performance-test] initial-data perf", payload.perf);
        console.table(payload.perf.timings);
        requestAnimationFrame(() => {
          console.log("[shift-reject-performance-test] initial render ready", {
            msFromPageStart: Math.round((performance.now() - pageStartedAt) * 10) / 10,
            shifts: payload.shifts.length,
            dbQueryCount: payload.perf.dbQueryCount,
          });
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setLoadError(error instanceof Error ? error.message : "初期データの取得に失敗しました");
        setShifts([]);
      })
      .finally(() => {
        if (sequence !== requestSequence.current) return;
        setLoading(false);
        console.timeEnd("[shift-reject-performance-test] initial load");
      });

    return () => controller.abort();
  }, [selectedDateString]);

  useEffect(() => {
    if (!showMonth) return;
    const month = format(monthCursor, "yyyy-MM");
    const cached = monthCountsCache.current.get(month);
    if (cached) {
      setMonthCounts(cached);
      return;
    }
    let cancelled = false;
    setMonthLoading(true);
    void fetchWithSession(
      `/api/shift-reject-performance-test/initial-data?scope=month-counts&month=${encodeURIComponent(month)}`,
    )
      .then((payload) => {
        if (cancelled || payload.scope !== "month-counts") return;
        monthCountsCache.current.set(month, payload.counts);
        setMonthCounts(payload.counts);
        console.log("[shift-reject-performance-test] month-counts perf", payload.perf);
      })
      .catch((error) => {
        if (!cancelled) console.error("[shift-reject-performance-test] month-counts failed", error);
      })
      .finally(() => {
        if (!cancelled) setMonthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [monthCursor, showMonth]);

  useEffect(() => {
    if (!accountId) return;
    try {
      const raw = localStorage.getItem(`shift-reject-candidate-filters:${accountId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      setCandidateAreaFilter(Array.isArray(parsed.area) ? parsed.area.map(String) : []);
      setCandidateServiceFilter(Array.isArray(parsed.service) ? parsed.service.map(String) : []);
      setCandidateGenderFilter(Array.isArray(parsed.gender) ? parsed.gender.map(String) : []);
    } catch {
      // 壊れた保存値は無視する
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    localStorage.setItem(
      `shift-reject-candidate-filters:${accountId}`,
      JSON.stringify({
        area: candidateAreaFilter,
        service: candidateServiceFilter,
        gender: candidateGenderFilter,
      }),
    );
  }, [accountId, candidateAreaFilter, candidateGenderFilter, candidateServiceFilter]);

  const serviceOptions = useMemo(
    () => Array.from(new Set(shifts.map((shift) => shift.service_code).filter(Boolean))).sort(),
    [shifts],
  );
  const nameOptions = useMemo(
    () => Array.from(new Set(shifts.map((shift) => shift.client_name).filter(Boolean))).sort(),
    [shifts],
  );
  const filteredShifts = useMemo(
    () =>
      shifts.filter(
        (shift) =>
          (!serviceFilter || shift.service_code === serviceFilter) &&
          (!nameFilter || shift.client_name === nameFilter),
      ),
    [nameFilter, serviceFilter, shifts],
  );
  const paginatedShifts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredShifts.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredShifts]);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const candidateAreaOptions = useMemo(() => {
    const values = new Map<string, string>();
    rawCandidates.forEach((shift) => {
      if (shift.postal_code_3) {
        values.set(shift.postal_code_3, `${shift.postal_code_3}（${shift.district || ""}）`);
      }
    });
    return Array.from(values, ([code, label]) => ({ code, label }));
  }, [rawCandidates]);
  const candidateServiceOptions = useMemo(
    () => Array.from(new Set(rawCandidates.map((shift) => shift.service_code).filter(Boolean))).sort(),
    [rawCandidates],
  );
  const candidateGenderOptions = useMemo(
    () => Array.from(new Set(rawCandidates.map((shift) => shift.gender_request_name || "男女問わず"))).sort(),
    [rawCandidates],
  );
  const candidates = useMemo(
    () =>
      rawCandidates.filter((shift) => {
        if (candidateAreaFilter.length && !candidateAreaFilter.includes(shift.postal_code_3)) return false;
        if (candidateServiceFilter.length && !candidateServiceFilter.includes(shift.service_code)) return false;
        const gender = shift.gender_request_name || "男女問わず";
        return !candidateGenderFilter.length || candidateGenderFilter.includes(gender);
      }),
    [candidateAreaFilter, candidateGenderFilter, candidateServiceFilter, rawCandidates],
  );

  const handleShiftReject = useCallback(
    async (shift: RejectPerformanceShift, reason: string) => {
      const startedAt = performance.now();
      try {
        const diffHours =
          (toJstDate(shift.shift_start_date, shift.shift_start_time).getTime() - Date.now()) / 36e5;
        const penaltyLevel = diffHours <= 72 ? "moderate" : "minor";
        if (diffHours < 6) {
          alert("サービス開始まで6時間を切っているので、ここからシフトを外せません。マネジャーに相談してください");
          return false;
        }

        const session = await supabase.auth.getSession();
        const authUserId = session.data.session?.user?.id;
        if (!authUserId) {
          alert("ログイン情報が取得できません");
          return false;
        }
        const { data: userData } = await supabase
          .from("user_entry_united_view")
          .select("manager_auth_user_id,manager_user_id,lw_userid,manager_lw_userid,manager_kaipoke_user_id,level_sort")
          .eq("auth_user_id", authUserId)
          .eq("group_type", "人事労務サポートルーム")
          .limit(1)
          .single();
        const levelSort = Number(userData?.level_sort);
        if (!Number.isFinite(levelSort) || levelSort < 4_500_000) {
          alert("アシスタントマネジャー以上はこの機能は使えません。マネジャーグループ内でリカバリー調整を行って下さい");
          return false;
        }

        const { error: rpaError } = await supabase.from("rpa_command_requests").insert({
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
        if (rpaError) {
          alert("送信に失敗しました: " + rpaError.message);
          return false;
        }
        if (!shift.shift_id || !accountId || !userData.manager_user_id) {
          alert("必要なIDが空のため送信しません。");
          return false;
        }

        const response = await fetch("/api/shift-reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftId: shift.shift_id,
            fromUserId: accountId,
            toUserId: userData.manager_user_id,
            reason: reason || "未記入",
            actorUserId: authUserId,
            eventType: reason === "今日はシフトに入れない" ? "reject_day" : "reject_shift",
            penaltyLevel,
          }),
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          alert(`担当交代の登録に失敗しました。\n${message}`);
          return false;
        }

        const { data: channel } = await supabase
          .from("group_lw_channel_view")
          .select("channel_id")
          .eq("group_account", shift.kaipoke_cs_id)
          .maybeSingle();
        if (channel?.channel_id) {
          const mentionUser = userData.lw_userid
            ? `<m userId="${userData.lw_userid}">さん`
            : "職員さん";
          const mentionManager = userData.manager_lw_userid
            ? `<m userId="${userData.manager_lw_userid}">さん`
            : "マネジャー";
          const startTime = shift.shift_start_time.slice(0, 5);
          await fetch("/api/lw-send-botmessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: channel.channel_id,
              text:
                `${mentionUser}が${shift.shift_start_date} ${startTime}のシフトに入れないため` +
                `シフト処理指示（理由: ${reason || "未記入"}）。代わりに${mentionManager}にシフトを移しました。`,
            }),
          });

          const threeDaysLater = new Date();
          threeDaysLater.setDate(threeDaysLater.getDate() + 3);
          if (new Date(`${shift.shift_start_date}T${shift.shift_start_time}`) < threeDaysLater) {
            await fetch("/api/lw-send-botmessage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                channelId: "146763225",
                text:
                  `${shift.client_name}様の${shift.shift_start_date} ${startTime}のシフトに` +
                  `${mentionUser}が入れないため、シフト処理指示（理由: ${reason || "未記入"}）。` +
                  "シフ子からサービスに入れる希望を出してください。よろしくお願いします。",
              }),
            });
          }
        } else {
          console.warn("[shift-reject-performance-test] channel id unavailable");
        }

        setShifts((current) => current.filter((item) => item.shift_id !== shift.shift_id));
        alert("✅ シフト外し処理を登録しました");
        console.log("[shift-reject-performance-test] reject done", {
          ms: Math.round((performance.now() - startedAt) * 10) / 10,
        });
        return true;
      } catch (error) {
        console.error("[shift-reject-performance-test] reject failed", error);
        alert("処理中にエラーが発生しました");
        return false;
      }
    },
    [accountId],
  );

  const handleShiftRequest = useCallback(
    async (shift: RejectPerformanceShift, attendRequest: boolean, timeAdjustNote?: string) => {
      setCreatingShiftRequest(true);
      try {
        const session = await supabase.auth.getSession();
        const authUserId = session.data.session?.user?.id;
        if (!authUserId || !accountId) {
          alert("ログイン情報またはユーザーIDを取得できません");
          return;
        }
        const { error } = await supabase.from("rpa_command_requests").insert({
          template_id: "92932ea2-b450-4ed0-a07b-4888750da641",
          requester_id: authUserId,
          approver_id: authUserId,
          status: "approved",
          request_details: {
            shift_id: shift.shift_id,
            kaipoke_cs_id: shift.kaipoke_cs_id,
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            service_code: shift.service_code,
            postal_code_3: shift.postal_code_3,
            client_name: shift.client_name,
            requested_by: accountId,
            requested_kaipoke_user_id: kaipokeUserId,
            attend_request: attendRequest,
            time_adjust_note: timeAdjustNote ?? null,
          },
        });
        if (error) {
          alert("送信に失敗しました: " + error.message);
          return;
        }
        alert("希望リクエストを登録しました！");

        const [channelResult, userResult] = await Promise.all([
          supabase
            .from("group_lw_channel_view")
            .select("channel_id")
            .eq("group_account", shift.kaipoke_cs_id)
            .maybeSingle(),
          supabase
            .from("user_entry_united_view_single")
            .select("lw_userid,last_name_kanji,first_name_kanji")
            .eq("auth_user_id", authUserId)
            .limit(1)
            .single(),
        ]);
        const sender = userResult.data?.lw_userid;
        const mention = sender ? `<m userId="${sender}">さん` : "職員さん";
        if (channelResult.data?.channel_id) {
          await fetch("/api/lw-send-botmessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: channelResult.data.channel_id,
              text:
                "✅シフト希望が登録されました\n\n" +
                "・マイファミーユ反映までお待ちください\n\n" +
                `・日付: ${shift.shift_start_date}\n` +
                `・時間: ${shift.shift_start_time}～${shift.shift_end_time}\n` +
                `・利用者: ${shift.client_name} 様\n` +
                `・種別: ${shift.service_code}\n` +
                `・エリア: ${shift.postal_code_3}（${shift.district}）\n` +
                `・同行希望: ${attendRequest ? "あり" : "なし"}\n` +
                `・担当者: ${mention}`,
            }),
          });
        }

        const traceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`;
        const assignResponse = await fetch("/api/shift-assign-after-rpa", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-trace-id": traceId },
          body: JSON.stringify({
            shift_id: shift.shift_id,
            requested_by_user_id: accountId,
            accompany: attendRequest,
            role_code: null,
            trace_id: traceId,
          }),
        });
        const assignPayload = (await assignResponse.json().catch(() => null)) as
          | { assign?: { status?: string }; error?: string }
          | null;
        if (!assignResponse.ok) {
          alert(`※シフト割当は未反映: ${assignPayload?.error || `HTTP ${assignResponse.status}`}`);
        } else if (
          ["assigned", "replaced"].includes(assignPayload?.assign?.status ?? "") &&
          channelResult.data?.channel_id
        ) {
          await fetch("/api/lw-send-botmessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: channelResult.data.channel_id,
              text:
                `${shift.shift_start_date} ${shift.shift_start_time.slice(0, 5)}～${shift.shift_end_time.slice(0, 5)} のシフトの担当を${mention}に変更しました（マイファミーユ）。\n` +
                "変更に問題がある場合には、マネジャーに問い合わせください。",
            }),
          });
        }

        await createTimeAdjustAlertFromShift(
          {
            shift_id: shift.shift_id,
            kaipoke_cs_id: shift.kaipoke_cs_id,
            shift_start_date: shift.shift_start_date,
            shift_start_time: shift.shift_start_time,
            client_name: shift.client_name,
          },
          timeAdjustNote,
        );
      } catch (error) {
        console.error("[shift-reject-performance-test] candidate request failed", error);
        alert("処理中にエラーが発生しました");
      } finally {
        setCreatingShiftRequest(false);
      }
    },
    [accountId, kaipokeUserId],
  );

  const openFinder = useCallback(
    async (window: FinderWindow, anchor: string) => {
      if (finderAnchor === anchor) {
        setFinderAnchor(null);
        return;
      }
      setFinderAnchor(anchor);
      setFinderWindow(window);
      setCandidateError(null);
      setCandidateLoading(true);
      try {
        let cached = candidateCache.current.get(selectedDateString);
        if (!cached) {
          const payload = await fetchWithSession(
            `/api/shift-reject-performance-test/initial-data?scope=candidates&date=${encodeURIComponent(selectedDateString)}`,
          );
          if (payload.scope === "month-counts") throw new Error("候補データの形式が不正です");
          cached = {
            shifts: payload.shifts,
            staffMap: payload.staffMap,
            myServiceKeys: payload.myServiceKeys,
            perf: payload.perf,
          };
          candidateCache.current.set(selectedDateString, cached);
          console.log("[shift-reject-performance-test] candidates perf", payload.perf);
        }
        const myShiftIds = new Set(shifts.map((shift) => String(shift.shift_id)));
        setRawCandidates(
          cached.shifts
            .filter(
              (shift) =>
                ![shift.staff_01_user_id, shift.staff_02_user_id, shift.staff_03_user_id].includes(accountId),
            )
            .filter((shift) => !myShiftIds.has(String(shift.shift_id)))
            .filter((shift) => canFitWindow(shift, window)),
        );
        setCandidateStaffMap(cached.staffMap);
        setCandidateServiceKeys(cached.myServiceKeys);
      } catch (error) {
        setCandidateError(error instanceof Error ? error.message : "候補シフトの取得に失敗しました");
        setRawCandidates([]);
      } finally {
        setCandidateLoading(false);
      }
    },
    [accountId, finderAnchor, selectedDateString, shifts],
  );

  const handleDeleteAll = () => {
    if (!shifts.length) return;
    if (!confirm("本当にこの日の全シフトをお休み処理しますか？")) return;
    shifts.forEach((shift) => void handleShiftReject(shift, "お休み希望"));
  };

  const clearCandidateFilters = () => {
    setCandidateAreaFilter([]);
    setCandidateServiceFilter([]);
    setCandidateGenderFilter([]);
  };

  const finderPanel = finderAnchor ? (
    <section className="rounded-2xl border border-purple-200 bg-purple-50/60 p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold tracking-[0.14em] text-purple-700">AVAILABLE SHIFT FINDER</div>
          <h3 className="mt-1 font-bold text-slate-950">空き時間の候補：{formatWindow(finderWindow)}</h3>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCandidateFilterOpen((value) => !value)}>
            <Filter className="h-4 w-4" /> 条件
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFinderAnchor(null)}>閉じる</Button>
        </div>
      </div>

      {candidateFilterOpen && (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-700">
            エリア（複数選択）
            <select
              multiple
              value={candidateAreaFilter}
              onChange={(event) => setCandidateAreaFilter(Array.from(event.target.selectedOptions, (option) => option.value))}
              className="mt-2 h-28 w-full rounded-lg border p-2 text-sm"
            >
              {candidateAreaOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            サービス種別（複数選択）
            <select
              multiple
              value={candidateServiceFilter}
              onChange={(event) => setCandidateServiceFilter(Array.from(event.target.selectedOptions, (option) => option.value))}
              className="mt-2 h-28 w-full rounded-lg border p-2 text-sm"
            >
              {candidateServiceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-700">
            性別希望（複数選択）
            <select
              multiple
              value={candidateGenderFilter}
              onChange={(event) => setCandidateGenderFilter(Array.from(event.target.selectedOptions, (option) => option.value))}
              className="mt-2 h-28 w-full rounded-lg border p-2 text-sm"
            >
              {candidateGenderOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <div className="md:col-span-3">
            <Button variant="outline" size="sm" onClick={clearCandidateFilters}>
              <RotateCcw className="h-4 w-4" /> 条件をクリア
            </Button>
            <span className="ml-3 text-xs text-slate-500">条件はこのユーザーのブラウザに保存されます。</span>
          </div>
        </div>
      )}

      {candidateLoading ? (
        <div className="mt-4 rounded-xl border bg-white p-4 text-sm text-slate-600">候補を読み込み中...</div>
      ) : candidateError ? (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{candidateError}</div>
      ) : candidates.length ? (
        <div className="mt-4 grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {candidates.slice(0, PAGE_SIZE).map((shift) => (
            <ShiftCardPerformanceTest
              key={shift.shift_id}
              shift={shift}
              staffMap={candidateStaffMap}
              myServiceKeys={candidateServiceKeys}
              userRole={userRole}
              creatingRequest={creatingShiftRequest}
              onRequest={(attendRequest, note) => void handleShiftRequest(shift, attendRequest, note)}
              extraActions={<GroupAddButtonPerformanceTest shift={shift} />}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">
          条件に合う候補シフトがありません。
        </div>
      )}
    </section>
  ) : null;

  return (
    <div className="content bg-slate-50/70 px-3 py-4 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="overflow-hidden rounded-2xl border border-purple-100 bg-gradient-to-br from-white via-purple-50 to-fuchsia-50 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-white/80 px-3 py-1 text-xs font-bold tracking-[0.14em] text-purple-800">
                <Gauge className="h-4 w-4" /> REJECT PERFORMANCE TEST
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                シフ子：担当シフト・お休み手続き Beta
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                担当中のシフト確認、訪問記録、連絡、食事代・駐車許可証申請、シフト辞退をまとめて操作できます。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-center shadow-sm">
                <div className="text-[11px] text-slate-500">担当シフト</div>
                <div className="text-xl font-bold tabular-nums text-slate-950">{shifts.length}</div>
              </div>
              <div className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-center shadow-sm">
                <div className="text-[11px] text-slate-500">表示中</div>
                <div className="text-xl font-bold tabular-nums text-purple-800">{filteredShifts.length}</div>
              </div>
            </div>
          </div>
        </header>

        <DateNavigator
          date={shiftDate}
          onPrev={() => setShiftDate((date) => subDays(date, 1))}
          onNext={() => setShiftDate((date) => addDays(date, 1))}
          onToggleMonth={() => {
            setMonthCursor(shiftDate);
            setShowMonth((value) => !value);
          }}
        />

        {showMonth && (
          <MonthCalendar
            month={monthCursor}
            counts={monthCounts}
            loading={monthLoading}
            onPick={(date) => {
              setShiftDate(date);
              setShowMonth(false);
            }}
            onPrev={() => setMonthCursor((month) => subMonths(month, 1))}
            onNext={() => setMonthCursor((month) => addMonths(month, 1))}
            onClose={() => setShowMonth(false)}
          />
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4" aria-label="表示フィルター">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Filter className="h-4 w-4 text-purple-600" /> 表示条件
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-semibold text-slate-600">
              サービス種別
              <select
                value={serviceFilter}
                onChange={(event) => { setServiceFilter(event.target.value); setCurrentPage(1); }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                {serviceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              利用者名
              <select
                value={nameFilter}
                onChange={(event) => { setNameFilter(event.target.value); setCurrentPage(1); }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">すべて</option>
                {nameOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <Button
              variant="outline"
              className="self-end"
              onClick={() => { setServiceFilter(""); setNameFilter(""); setCurrentPage(1); }}
            >
              <RotateCcw className="h-4 w-4" /> 解除
            </Button>
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-bold tracking-[0.16em] text-purple-700">ASSIGNED SHIFT LIST</div>
            <h2 className="mt-1 text-xl font-bold text-slate-950 sm:text-2xl">担当シフト</h2>
          </div>
          <Button
            onClick={handleDeleteAll}
            disabled={!shifts.length || loading}
            className="bg-purple-600 text-white hover:bg-purple-700"
          >
            <UserX className="h-4 w-4" /> この日はお休み希望
          </Button>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 sm:px-4">
          「概算給与」は基本時給・サービス加算・回ごと単価・通勤費から算出した目安です。実際の給与は個人別時給や移動時間加算等により変動します。
        </div>

        {loading ? (
          <div className="rounded-2xl border bg-white px-4 py-10 text-center text-sm text-slate-600">読み込み中...</div>
        ) : loadError ? (
          <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-6 text-sm text-red-700">{loadError}</div>
        ) : paginatedShifts.length ? (
          <>
            <div className="mb-3">
              <Button
                variant="outline"
                onClick={() =>
                  void openFinder(
                    { start: null, end: toJstDate(shifts[0].shift_start_date, shifts[0].shift_start_time) },
                    "before-first",
                  )
                }
              >
                <Search className="h-4 w-4" /> 最初のシフト前から候補を探す
              </Button>
            </div>
            <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paginatedShifts.map((shift) => {
                const index = shifts.findIndex((item) => item.shift_id === shift.shift_id);
                const nextShift = index >= 0 ? shifts[index + 1] : undefined;
                return (
                  <div key={shift.shift_id} className="flex min-w-0 flex-col gap-2">
                    <ShiftRejectCardPerformanceTest
                      shift={shift}
                      staffMap={staffMap}
                      myServiceKeys={myServiceKeys}
                      userRole={userRole}
                      accountId={accountId}
                      onReject={handleShiftReject}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-purple-200 bg-white text-purple-800 hover:bg-purple-50"
                      onClick={() =>
                        void openFinder(
                          {
                            start: toJstDate(shift.shift_start_date, shift.shift_end_time),
                            end: nextShift
                              ? toJstDate(nextShift.shift_start_date, nextShift.shift_start_time)
                              : null,
                          },
                          `after:${shift.shift_id}`,
                        )
                      }
                    >
                      <Search className="h-4 w-4" /> この後の空き時間から候補を探す
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
            <p className="text-sm text-slate-500">{shifts.length ? "表示条件に一致するシフトがありません。" : "シフトがありません。"}</p>
            {!shifts.length && (
              <Button className="mt-4" onClick={() => void openFinder({ start: null, end: null }, "no-shift")}>
                <Search className="h-4 w-4" /> 空き時間のシフトを見つける
              </Button>
            )}
          </div>
        )}

        {finderPanel}

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>
            戻る
          </Button>
          <span className="text-xs text-slate-500">{currentPage}ページ目 / 1ページ最大{PAGE_SIZE}件</span>
          <Button
            disabled={pageStart + PAGE_SIZE >= filteredShifts.length}
            onClick={() => setCurrentPage((page) => page + 1)}
          >
            次へ
          </Button>
        </div>

        <DateNavigator
          date={shiftDate}
          onPrev={() => setShiftDate((date) => subDays(date, 1))}
          onNext={() => setShiftDate((date) => addDays(date, 1))}
          onToggleMonth={() => {
            setMonthCursor(shiftDate);
            setShowMonth((value) => !value);
          }}
        />

        <section
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          aria-label="不具合・改善提案"
        >
          <div>
            <p className="text-sm font-bold">不具合・改善提案について</p>
            <p className="mt-1 text-xs leading-5 text-amber-900 sm:text-sm">
              不具合があれば、マイファミーユ不具合・改善提案（掲示板）で教えてください。
            </p>
          </div>
          <a
            href="https://board.worksmobile.com/main/article/4090000000184884271"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100 hover:underline sm:text-sm"
          >
            掲示板へ移動 ↗
          </a>
        </section>

        <div className="flex items-center gap-2 rounded-xl border border-purple-100 bg-white px-3 py-2 text-xs text-slate-500">
          <CalendarRange className="h-4 w-4 text-purple-600" />
          Betaページです。本番 `/portal/shift` と Request Performance Test 版には変更を加えていません。
        </div>
      </div>
    </div>
  );
}
