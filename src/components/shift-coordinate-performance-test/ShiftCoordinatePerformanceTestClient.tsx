"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { Filter, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { createTimeAdjustAlertFromShift } from "@/lib/shift/shift_card_alert";
import type { ServiceKey } from "@/lib/certificateJudge";
import type { ShiftFilterOptions } from "@/lib/supabase/shiftFilterOptions";
import type { ShiftData } from "@/types/shift";
import GroupAddButtonPerformanceTest from "./GroupAddButtonPerformanceTest";
import ShiftCardPerformanceTest from "./ShiftCardPerformanceTest";

const PAGE_SIZE = 100;

type StaffRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  level_sort: number | null;
};

type PerformanceShiftData = ShiftData & {
  basic_information?: string;
  shift_detail_information?: string;
};

type InitialLoadPerf = {
  totalMs: number;
  dbQueryCount: number;
  timings: Array<{
    stage: string;
    ms: number;
    rows?: number;
    details?: Record<string, unknown>;
  }>;
  counts?: Record<string, number>;
};

type InitialDataResponse =
  | {
      ok: true;
      shifts: PerformanceShiftData[];
      filterOptions: ShiftFilterOptions;
      staffMap: Record<string, StaffRow>;
      user: {
        accountId: string;
        kaipokeUserId: string;
        systemRole: string | null;
        customFilter: AppliedFilters | null;
        useCustomFilter: boolean;
      };
      myServiceKeys: ServiceKey[] | null;
      perf: InitialLoadPerf;
    }
  | {
      ok: false;
      error: string;
      perf?: Partial<InitialLoadPerf>;
    };

type AssignResult = {
  status: "assigned" | "replaced" | "error" | "noop";
  slot?: "staff_01" | "staff_02" | "staff_03";
  message?: string;
};

type ShiftAssignApiResponse =
  | { ok: true; assign: AssignResult; stages?: unknown; traceId?: string }
  | { ok?: false; error: string; assign?: AssignResult; stages?: unknown; traceId?: string };

type AppliedFilters = {
  dateFilterType: "date" | "weekday";
  filterDate: string[];
  filterWeekday: string[];
  filterService: string[];
  filterPostal: string[];
  filterName: string[];
  filterGender: string[];
};

const emptyFilterOptions: ShiftFilterOptions = {
  dateOptions: [],
  serviceOptions: [],
  postalOptions: [],
  nameOptions: [],
  genderOptions: [],
};

function createEmptyAppliedFilters(): AppliedFilters {
  return {
    dateFilterType: "date",
    filterDate: [],
    filterWeekday: [],
    filterService: [],
    filterPostal: [],
    filterName: [],
    filterGender: [],
  };
}

function toHm(time?: string | null) {
  return time ? time.slice(0, 5) : "";
}

function summarizeAppliedFilters(filters: AppliedFilters, options: ShiftFilterOptions) {
  const parts: string[] = [];
  if (filters.dateFilterType === "date" && filters.filterDate.length) {
    parts.push(`日付: ${filters.filterDate.map((date) => format(parseISO(date), "M/d")).join(", ")}`);
  }
  if (filters.dateFilterType === "weekday" && filters.filterWeekday.length) {
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    parts.push(`曜日: ${filters.filterWeekday.map((day) => weekdays[Number(day)] ?? day).join(", ")}`);
  }
  if (filters.filterService.length) parts.push(`サービス: ${filters.filterService.join(", ")}`);
  if (filters.filterPostal.length) {
    const areas = filters.filterPostal.map((postal) => {
      const option = options.postalOptions.find((item) => item.postal_code_3 === postal);
      return option?.district ? `${postal} ${option.district}` : postal;
    });
    parts.push(`エリア: ${areas.join(", ")}`);
  }
  if (filters.filterName.length) parts.push(`利用者: ${filters.filterName.join(", ")}`);
  if (filters.filterGender.length) parts.push(`性別: ${filters.filterGender.join(", ")}`);
  return parts;
}

export default function ShiftCoordinatePerformanceTestClient() {
  const didFetchRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shifts, setShifts] = useState<PerformanceShiftData[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, StaffRow>>({});
  const [accountId, setAccountId] = useState("");
  const [kaipokeUserId, setKaipokeUserId] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [myServiceKeys, setMyServiceKeys] = useState<ServiceKey[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterOptions, setFilterOptions] = useState<ShiftFilterOptions>(emptyFilterOptions);
  const [dateFilterType, setDateFilterType] = useState<"date" | "weekday">("date");
  const [filterDate, setFilterDate] = useState<string[]>([]);
  const [filterWeekday, setFilterWeekday] = useState<string[]>([]);
  const [filterService, setFilterService] = useState<string[]>([]);
  const [filterPostal, setFilterPostal] = useState<string[]>([]);
  const [filterName, setFilterName] = useState<string[]>([]);
  const [filterGender, setFilterGender] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>(() => createEmptyAppliedFilters());
  const [useCustomFilter, setUseCustomFilter] = useState(false);
  const [savedCustomFilter, setSavedCustomFilter] = useState<AppliedFilters | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savingCustomFilter, setSavingCustomFilter] = useState(false);
  const [customFilterMessage, setCustomFilterMessage] = useState<string | null>(null);
  const [creatingShiftRequest, setCreatingShiftRequest] = useState(false);

  useEffect(() => {
    if (didFetchRef.current) return;
    didFetchRef.current = true;

    let cancelled = false;
    const pageStartedAt = performance.now();

    const fetchInitialData = async () => {
      console.time("[shift-coordinate-performance-test] initial load");

      try {
        const sessionResult = await supabase.auth.getSession();
        const accessToken = sessionResult.data.session?.access_token;
        if (!accessToken) {
          throw new Error("ログイン情報が取得できません");
        }

        console.time("[shift-coordinate-performance-test] initial-data api");
        const response = await fetch("/api/shift-coordinate-performance-test/initial-data", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });
        console.timeEnd("[shift-coordinate-performance-test] initial-data api");

        const payload = (await response.json()) as InitialDataResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.ok === false ? payload.error : `HTTP ${response.status}`);
        }

        if (cancelled) return;

        setShifts(payload.shifts);
        setStaffMap(payload.staffMap);
        setFilterOptions(payload.filterOptions);
        setAccountId(payload.user.accountId);
        setKaipokeUserId(payload.user.kaipokeUserId);
        setUserRole(payload.user.systemRole);
        setMyServiceKeys(payload.myServiceKeys);
        setSavedCustomFilter(payload.user.customFilter);
        setUseCustomFilter(payload.user.useCustomFilter);
        if (payload.user.useCustomFilter && payload.user.customFilter) {
          const restoredFilter = { ...createEmptyAppliedFilters(), ...payload.user.customFilter };
          setDateFilterType(restoredFilter.dateFilterType);
          setFilterDate(restoredFilter.filterDate);
          setFilterWeekday(restoredFilter.filterWeekday);
          setFilterService(restoredFilter.filterService);
          setFilterPostal(restoredFilter.filterPostal);
          setFilterName(restoredFilter.filterName);
          setFilterGender(restoredFilter.filterGender);
          setAppliedFilters(restoredFilter);
        }
        setLoadError(null);

        console.log("[shift-coordinate-performance-test] initial-data perf", payload.perf);
        console.table(payload.perf.timings);
        requestAnimationFrame(() => {
          console.log("[shift-coordinate-performance-test] initial render ready", {
            msFromPageStart: Math.round((performance.now() - pageStartedAt) * 10) / 10,
            shifts: payload.shifts.length,
            dbQueryCount: payload.perf.dbQueryCount,
          });
        });
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "初期データの取得に失敗しました";
          setLoadError(message);
          console.error("[shift-coordinate-performance-test] initial load failed", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          console.timeEnd("[shift-coordinate-performance-test] initial load");
        }
      }
    };

    void fetchInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredShifts = useMemo(() => {
    return shifts.filter((shift) => {
      const shiftDate = parseISO(shift.shift_start_date);
      const shiftWeekday = String(shiftDate.getDay());

      const matchesDateFilter =
        appliedFilters.dateFilterType === "date"
          ? !appliedFilters.filterDate.length || appliedFilters.filterDate.includes(shift.shift_start_date)
          : !appliedFilters.filterWeekday.length || appliedFilters.filterWeekday.includes(shiftWeekday);

      return (
        matchesDateFilter &&
        (!appliedFilters.filterService.length || appliedFilters.filterService.includes(shift.service_code)) &&
        (!appliedFilters.filterPostal.length || appliedFilters.filterPostal.includes(shift.postal_code_3)) &&
        (!appliedFilters.filterName.length || appliedFilters.filterName.includes(shift.client_name)) &&
        (!appliedFilters.filterGender.length || appliedFilters.filterGender.includes(shift.gender_request_name))
      );
    });
  }, [appliedFilters, shifts]);

  const paginatedShifts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredShifts.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredShifts]);

  const applyFilters = useCallback(() => {
    setAppliedFilters({
      dateFilterType,
      filterDate,
      filterWeekday,
      filterService,
      filterPostal,
      filterName,
      filterGender,
    });
    setCurrentPage(1);
  }, [dateFilterType, filterDate, filterGender, filterName, filterPostal, filterService, filterWeekday]);

  const clearFilters = useCallback(() => {
    setDateFilterType("date");
    setFilterDate([]);
    setFilterWeekday([]);
    setFilterService([]);
    setFilterPostal([]);
    setFilterName([]);
    setFilterGender([]);
    setAppliedFilters(createEmptyAppliedFilters());
    setCurrentPage(1);
  }, []);

  const saveCustomFilter = useCallback(async () => {
    setSavingCustomFilter(true);
    setCustomFilterMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("ログイン情報を取得できません");
      const response = await fetch("/api/shift-coordinate-performance-test/custom-filter", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customFilter: appliedFilters, useCustomFilter }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "保存に失敗しました");
      setSavedCustomFilter(appliedFilters);
      setSaveDialogOpen(false);
      setCustomFilterMessage("個人フィルターを保存しました");
    } catch (error) {
      setCustomFilterMessage(error instanceof Error ? error.message : "個人フィルターの保存に失敗しました");
    } finally {
      setSavingCustomFilter(false);
    }
  }, [appliedFilters, useCustomFilter]);

  const toggleCustomFilter = useCallback(async (enabled: boolean) => {
    setUseCustomFilter(enabled);
    setCustomFilterMessage(null);
    if (enabled && !savedCustomFilter) {
      setUseCustomFilter(false);
      setCustomFilterMessage("保存されている個人フィルターはありません");
      return;
    }
    if (enabled && savedCustomFilter) {
      const restoredFilter = { ...createEmptyAppliedFilters(), ...savedCustomFilter };
      setDateFilterType(restoredFilter.dateFilterType);
      setFilterDate(restoredFilter.filterDate);
      setFilterWeekday(restoredFilter.filterWeekday);
      setFilterService(restoredFilter.filterService);
      setFilterPostal(restoredFilter.filterPostal);
      setFilterName(restoredFilter.filterName);
      setFilterGender(restoredFilter.filterGender);
      setAppliedFilters(restoredFilter);
      setCurrentPage(1);
    }
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) throw new Error("ログイン情報を取得できません");
      const response = await fetch("/api/shift-coordinate-performance-test/custom-filter", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ useCustomFilter: enabled }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "設定の更新に失敗しました");
    } catch (error) {
      setUseCustomFilter(!enabled);
      setCustomFilterMessage(error instanceof Error ? error.message : "設定の更新に失敗しました");
    }
  }, [savedCustomFilter]);

  const handleShiftRequest = useCallback(
    async (
      shift: PerformanceShiftData,
      attendRequest: boolean,
      timeAdjustNote?: string,
      regularShift = false,
      weeklyShiftId?: string,
    ) => {
      const requestStartedAt = performance.now();
      setCreatingShiftRequest(true);
      console.time("[shift-coordinate-performance-test] shift request");

      try {
        const session = await supabase.auth.getSession();
        const userId = session.data?.session?.user?.id;
        if (!userId) {
          alert("ログイン情報が取得できません");
          return;
        }

        if (!accountId) {
          alert("ユーザーIDを取得できていません。数秒後に再度お試しください。");
          return;
        }

        const { error } = await supabase.from("rpa_command_requests").insert({
          template_id: "92932ea2-b450-4ed0-a07b-4888750da641",
          requester_id: userId,
          approver_id: userId,
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
            .select("lw_userid, last_name_kanji, first_name_kanji")
            .eq("auth_user_id", userId)
            .limit(1)
            .single(),
        ]);

        const chanData = channelResult.data;
        const userData = userResult.data;
        const sender = userData?.lw_userid;
        const mention = sender ? `<m userId="${sender}">さん` : `${sender ?? "不明"}さん`;
        const mentions = sender
          ? [{ userId: sender, label: `${userData?.last_name_kanji ?? ""}${userData?.first_name_kanji ?? ""}`.trim() || "申請者" }]
          : [];

        if (chanData?.channel_id) {
          const message =
            `✅シフト希望が登録されました\n\n` +
            `・マイファミーユ反映までお待ちください\n\n` +
            `・日付: ${shift.shift_start_date}\n` +
            `・時間: ${shift.shift_start_time}～${shift.shift_end_time}\n` +
            `・利用者: ${shift.client_name} 様\n` +
            `・種別: ${shift.service_code}\n` +
            `・エリア: ${shift.postal_code_3}（${shift.district}）\n` +
            `・同行希望: ${attendRequest ? "あり" : "なし"}\n` +
            `・担当者: ${mention}`;

          await fetch("/api/lw-send-botmessage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: chanData.channel_id, text: message, mentions }),
          });
        } else {
          console.warn("チャネルIDが取得できませんでした");
        }

        try {
          const traceId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random()}`;
          console.log("[SHIFT ASSIGN][performance-test] start", {
            traceId,
            shift_id: shift.shift_id,
            requested_by_user_id: accountId,
            accompany: attendRequest,
          });

          const resp = await fetch("/api/shift-assign-after-rpa", {
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

          const raw = await resp.text();
          console.log("[SHIFT ASSIGN][performance-test] http", { traceId, status: resp.status, ok: resp.ok, raw });

          let payload: ShiftAssignApiResponse | null = null;
          try {
            payload = JSON.parse(raw) as ShiftAssignApiResponse;
          } catch {
            payload = null;
          }

          console.log("[SHIFT ASSIGN][performance-test] payload", { traceId, payload });

          if (resp.ok && payload && "assign" in payload && payload.assign) {
            const { status, slot, message } = payload.assign;
            console.log("[SHIFT ASSIGN][performance-test] result", { traceId, status, slot, message });

            if (regularShift && weeklyShiftId) {
              try {
                const regularResp = await fetch("/api/regular-shift-requests", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(session.data.session?.access_token ? { Authorization: `Bearer ${session.data.session.access_token}` } : {}),
                  },
                  body: JSON.stringify({ source_shift_id: shift.shift_id, weekly_shift_id: weeklyShiftId }),
                });
                if (!regularResp.ok) console.error("[regular-shift] save failed", await regularResp.text());
              } catch (regularError) {
                console.error("[regular-shift] save failed", regularError);
              }
            }

            if ((status === "assigned" || status === "replaced") && chanData?.channel_id) {
              const text =
                `${shift.shift_start_date} ${toHm(shift.shift_start_time)}～${toHm(shift.shift_end_time)} のシフトの担当を${mention}に変更しました（マイファミーユ）。\n` +
                `変更に問題がある場合には、マネジャーに問い合わせください。`;

              await fetch("/api/lw-send-botmessage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channelId: chanData.channel_id, text, mentions }),
              });
            }
          } else {
            const errMsg =
              payload && "error" in payload && typeof payload.error === "string"
                ? payload.error
                : `HTTP ${resp.status}`;
            alert(`※シフト割当は未反映: ${errMsg}`);
          }
        } catch (error) {
          console.error("[SHIFT ASSIGN][performance-test] exception", error);
          alert("※シフト割当の呼び出しで例外が発生しました");
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
        alert("処理中にエラーが発生しました");
        console.error(error);
      } finally {
        console.log("[shift-coordinate-performance-test] shift request done", {
          ms: Math.round((performance.now() - requestStartedAt) * 10) / 10,
        });
        console.timeEnd("[shift-coordinate-performance-test] shift request");
        setCreatingShiftRequest(false);
      }
    },
    [accountId, kaipokeUserId],
  );

  const start = (currentPage - 1) * PAGE_SIZE;
  const selectedFilterCount = [filterDate, filterWeekday, filterService, filterPostal, filterName, filterGender].reduce(
    (total, values) => total + values.length,
    0,
  );
  const appliedFilterCount = [
    appliedFilters.filterDate,
    appliedFilters.filterWeekday,
    appliedFilters.filterService,
    appliedFilters.filterPostal,
    appliedFilters.filterName,
    appliedFilters.filterGender,
  ].reduce((total, values) => total + values.length, 0);
  const appliedFilterSummary = summarizeAppliedFilters(appliedFilters, filterOptions);

  if (loading) {
    return (
      <div className="content">
        <h2 className="text-xl font-bold mb-4">シフ子（ｼﾌﾄｺｰﾃﾞｨﾈｰﾄ：自分で好きなシフトを取れます）</h2>
        <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">読み込み中...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="content">
        <h2 className="text-xl font-bold mb-4">シフ子（ｼﾌﾄｺｰﾃﾞｨﾈｰﾄ：自分で好きなシフトを取れます）</h2>
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="content bg-slate-50/70 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-cm-primary-50 px-4 py-5 shadow-sm sm:px-6 sm:py-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cm-primary-100/60 blur-3xl" />
          <div className="relative flex items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-cm-primary-100 bg-cm-primary-50 px-3 py-1 text-xs font-semibold text-cm-primary-800">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                ベータ版・UIアップデート
              </div>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                シフ子
                <span className="ml-2 text-cm-primary-700">シフトコーディネート</span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                条件からシフトを探して、入りたい案件をすばやく確認できます。
              </p>
            </div>
            <div className="hidden shrink-0 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-right shadow-sm sm:block">
              <div className="text-xs font-semibold text-slate-500">該当シフト</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-cm-primary-700">{filteredShifts.length}<span className="ml-1 text-sm font-semibold">件</span></div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between" aria-label="不具合・改善提案">
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

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="shift-filter-heading">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-cm-primary-50 p-2 text-cm-primary-700">
                <Filter className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 id="shift-filter-heading" className="text-base font-bold text-slate-900 sm:text-lg">シフトを検索</h2>
                <p className="mt-1 text-xs text-slate-500 sm:text-sm">日付・エリア・サービスなどを組み合わせて絞り込めます。</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {appliedFilterCount > 0 ? `${appliedFilterCount}項目を適用中` : "条件未設定"}
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">日付・曜日</span>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="radiogroup" aria-label="日付と曜日の切り替え">
                  <label className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${dateFilterType === "date" ? "bg-white text-cm-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    <input
                      type="radio"
                      name="dateFilterType"
                      checked={dateFilterType === "date"}
                      onChange={() => {
                        setDateFilterType("date");
                        setFilterWeekday([]);
                      }}
                      className="sr-only"
                    />
                    日付
                  </label>
                  <label className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${dateFilterType === "weekday" ? "bg-white text-cm-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    <input
                      type="radio"
                      name="dateFilterType"
                      checked={dateFilterType === "weekday"}
                      onChange={() => {
                        setDateFilterType("weekday");
                        setFilterDate([]);
                      }}
                      className="sr-only"
                    />
                    曜日
                  </label>
                </div>
              </div>

              {dateFilterType === "date" ? (
                <>
                  <label className="mt-2 block text-xs text-slate-500">日付（複数選択）</label>
                  <select
                    multiple
                    value={filterDate}
                    onChange={(event) => setFilterDate(Array.from(event.target.selectedOptions, (option) => option.value))}
                    className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                    aria-label="日付（複数選択）"
                  >
                    {filterOptions.dateOptions.map((dateStr) => {
                      const weekday = format(parseISO(dateStr), "(E)", { locale: ja });
                      const display = format(parseISO(dateStr), "M/d") + weekday;
                      return <option key={dateStr} value={dateStr}>{display}</option>;
                    })}
                  </select>
                </>
              ) : (
                <>
                  <label className="mt-2 block text-xs text-slate-500">曜日（複数選択）</label>
                  <select
                    multiple
                    value={filterWeekday}
                    onChange={(event) => setFilterWeekday(Array.from(event.target.selectedOptions, (option) => option.value))}
                    className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                    aria-label="曜日（複数選択）"
                  >
                    <option value="0">日曜日</option>
                    <option value="1">月曜日</option>
                    <option value="2">火曜日</option>
                    <option value="3">水曜日</option>
                    <option value="4">木曜日</option>
                    <option value="5">金曜日</option>
                    <option value="6">土曜日</option>
                  </select>
                </>
              )}
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700">種別（複数選択）</label>
              <select
                multiple
                value={filterService}
                onChange={(event) => setFilterService(Array.from(event.target.selectedOptions, (option) => option.value))}
                className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                aria-label="種別（複数選択）"
              >
                {filterOptions.serviceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700">住所エリア（複数選択）</label>
              <select
                multiple
                value={filterPostal}
                onChange={(event) => setFilterPostal(Array.from(event.target.selectedOptions, (option) => option.value))}
                className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                aria-label="住所エリア（複数選択）"
              >
                {filterOptions.postalOptions.map((postalOption) => (
                  <option key={postalOption.postal_code_3} value={postalOption.postal_code_3}>
                    {postalOption.postal_code_3}（{postalOption.district}）
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700">利用者名（複数選択）</label>
              <select
                multiple
                value={filterName}
                onChange={(event) => setFilterName(Array.from(event.target.selectedOptions, (option) => option.value))}
                className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                aria-label="利用者名（複数選択）"
              >
                {filterOptions.nameOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="min-w-0">
              <label className="text-xs font-bold text-slate-700">ヘルパー希望（複数選択）</label>
              <select
                multiple
                value={filterGender}
                onChange={(event) => setFilterGender(Array.from(event.target.selectedOptions, (option) => option.value))}
                className="mt-2 h-32 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-cm-primary-500 focus:ring-2 focus:ring-cm-primary-100"
                aria-label="ヘルパー希望（複数選択）"
              >
                {filterOptions.genderOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="flex flex-col justify-end gap-2 rounded-xl bg-slate-50 p-3 md:col-span-2 xl:col-span-1">
              <div className="text-xs text-slate-500">
                {selectedFilterCount > 0 ? `${selectedFilterCount}項目を選択中` : "条件を選択してください"}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button onClick={applyFilters} className="w-full bg-cm-primary-600 text-white hover:bg-cm-primary-700 sm:flex-1">
                  フィルターを適用
                </Button>
                <Button onClick={clearFilters} variant="outline" className="w-full border-slate-300 bg-white text-slate-700 hover:bg-slate-100 sm:w-auto">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  解除
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div>
              <div className="text-sm font-bold text-slate-800">個人フィルター</div>
              <div className="mt-1 text-xs text-slate-500">保存した条件をこのページの初期表示に使用します</div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={useCustomFilter} onChange={(event) => void toggleCustomFilter(event.target.checked)} className="h-4 w-4 accent-cm-primary-600" />
              個人フィルターを使用
            </label>
            <Button onClick={() => setSaveDialogOpen(true)} variant="outline" className="border-cm-primary-200 text-cm-primary-700 hover:bg-cm-primary-50">
              現在の条件を個人フィルターとして保存
            </Button>
            {customFilterMessage ? <span className="basis-full text-sm text-slate-600" role="status">{customFilterMessage}</span> : null}
          </div>
        </section>

        {saveDialogOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true" aria-labelledby="custom-filter-save-title">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 id="custom-filter-save-title" className="text-lg font-bold text-slate-900">現在のフィルター条件</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">個人フィルターとして保存しますか？{savedCustomFilter ? " 既存の個人フィルターは現在の内容で上書きされます。" : ""}</p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={savingCustomFilter}>キャンセル</Button>
                <Button onClick={() => void saveCustomFilter()} disabled={savingCustomFilter} className="bg-cm-primary-600 text-white hover:bg-cm-primary-700">{savingCustomFilter ? "保存中…" : "保存する"}</Button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="space-y-4" aria-labelledby="shift-list-heading">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-bold tracking-[0.16em] text-cm-primary-700">MAIN SHIFT LIST</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="shift-list-heading" className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">シフ子本体</h2>
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold shadow-sm ${
                    appliedFilterSummary.length > 0
                      ? "border-cm-primary-200 bg-cm-primary-50 text-cm-primary-800"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  role="status"
                  aria-live="polite"
                >
                  {appliedFilterSummary.length > 0 ? "フィルター適用中" : "全体を表示"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2" aria-label="現在適用中のフィルター条件">
                {appliedFilterSummary.length > 0 ? (
                  appliedFilterSummary.map((summary) => (
                    <span key={summary} className="rounded-md bg-cm-primary-50 px-2.5 py-1 text-xs font-semibold text-cm-primary-800">
                      {summary}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">フィルター条件なし（すべてのシフトを表示）</span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">日付・時間・給与の目安を見比べて、入りたいシフトを選べます。</p>
            </div>
            <div className="flex items-center gap-2 self-start rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm sm:self-auto">
              <span className="text-slate-500">表示件数</span>
              <span className="font-bold tabular-nums text-slate-900">{filteredShifts.length}件</span>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 sm:px-4">
            表示している「概算給与」は、基本時給・サービス加算・回ごと単価・通勤費から算出した目安です。
            実際の給与は、個人別時給、同日に複数サービスへ入る場合の移動時間加算等により変動します。
          </div>

          {paginatedShifts.length > 0 ? (
            <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {paginatedShifts.map((shift) => (
                <ShiftCardPerformanceTest
                  key={shift.shift_id}
                  shift={shift}
                  staffMap={staffMap}
                  myServiceKeys={myServiceKeys}
                  userRole={userRole}
                  creatingRequest={creatingShiftRequest}
                  onRequest={(attend, note, regular, weeklyShiftId) => {
                    void handleShiftRequest(shift, attend, note, regular, weeklyShiftId);
                  }}
                  enableRegularShiftRequest
                  extraActions={<GroupAddButtonPerformanceTest shift={shift} />}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              条件に一致するシフトがありません。フィルターを解除してお試しください。
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <Button variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>
              戻る
            </Button>
            <span className="text-xs text-slate-500">{currentPage}ページ目</span>
            <Button
              disabled={start + PAGE_SIZE >= filteredShifts.length}
              onClick={() => setCurrentPage((page) => page + 1)}
            >
              次へ
            </Button>
          </div>
        </section>

        <section aria-label="シフトWish">
          <ShiftWishWidgetPerformanceTest filterOptions={filterOptions} />
        </section>
      </div>
    </div>
  );
}

function ShiftWishWidgetPerformanceTest({
  filterOptions,
}: {
  filterOptions: Pick<ShiftFilterOptions, "postalOptions" | "dateOptions">;
}) {
  const [requestType, setRequestType] = useState<"spot" | "regular">("spot");
  const [selectedDateOrWeekday, setSelectedDateOrWeekday] = useState<string[]>([]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(12);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const startedAt = performance.now();
    setSubmitting(true);
    console.time("[shift-coordinate-performance-test] shift wish");

    try {
      const session = await supabase.auth.getSession();
      const userId = session.data?.session?.user?.id;
      if (!userId) {
        alert("ログインが必要です");
        return;
      }

      const areaJson = selectedAreas.map((code) => {
        const match = filterOptions.postalOptions.find((postalOption) => postalOption.postal_code_3 === code);
        return { postal_code_3: code, district: match?.district ?? "" };
      });

      const isSpot = requestType === "spot";
      const payload = {
        user_id: userId,
        request_type: requestType,
        preferred_date: isSpot ? selectedDateOrWeekday : null,
        preferred_weekday: !isSpot ? selectedDateOrWeekday.map(Number) : null,
        time_start_hour: startHour,
        time_end_hour: endHour,
        postal_area_json: areaJson,
      };

      const { error } = await supabase.from("shift_wishes").insert(payload);

      if (error) {
        alert("送信失敗: " + error.message);
      } else {
        alert("✅ シフト希望を送信しました！");
      }
    } catch (error) {
      alert("送信中にエラーが発生しました");
      console.error(error);
    } finally {
      console.log("[shift-coordinate-performance-test] shift wish done", {
        ms: Math.round((performance.now() - startedAt) * 10) / 10,
      });
      console.timeEnd("[shift-coordinate-performance-test] shift wish");
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-6">
      <p className="text-sm text-gray-800 mb-2 font-semibold">
        シフトWish：シフ子に無いけど、もっとシフトに入りたい。入れるエリア・時間があるよ！　という方はぜひ教えてください。マネジャーがケアマネ・相談員へ掛け合います。
      </p>

      <div className="mb-2 text-sm">
        <label className="mr-4">
          <input type="radio" checked={requestType === "regular"} onChange={() => setRequestType("regular")} />{" "}
          レギュラー希望（曜日指定：複数選択可能）
        </label>
        <label>
          <input type="radio" checked={requestType === "spot"} onChange={() => setRequestType("spot")} />{" "}
          スポット希望（特定日：複数選択可能）
        </label>
      </div>

      {requestType === "spot" ? (
        <select
          multiple
          value={selectedDateOrWeekday}
          onChange={(event) =>
            setSelectedDateOrWeekday(Array.from(event.target.selectedOptions, (option) => option.value))
          }
          className="border rounded px-2 py-1 mb-2"
        >
          <option value="">-- 日付を選択 --</option>
          {filterOptions.dateOptions.map((dateStr) => {
            const weekday = format(parseISO(dateStr), "(E)", { locale: ja });
            const display = format(parseISO(dateStr), "M/d") + weekday;
            return (
              <option key={dateStr} value={dateStr}>
                {display}
              </option>
            );
          })}
        </select>
      ) : (
        <select
          multiple
          value={selectedDateOrWeekday}
          onChange={(event) =>
            setSelectedDateOrWeekday(Array.from(event.target.selectedOptions, (option) => option.value))
          }
          className="border rounded px-2 py-1 mb-2"
        >
          <option value="">-- 曜日を選択 --</option>
          <option value="0">日曜日</option>
          <option value="1">月曜日</option>
          <option value="2">火曜日</option>
          <option value="3">水曜日</option>
          <option value="4">木曜日</option>
          <option value="5">金曜日</option>
          <option value="6">土曜日</option>
        </select>
      )}

      <div className="mb-2 text-sm flex gap-2">
        <label>時間帯（複数選択可能）:</label>
        <select
          value={startHour}
          onChange={(event) => setStartHour(Number(event.target.value))}
          className="border rounded px-2 py-1"
        >
          {[...Array(24)].map((_, index) => (
            <option key={index} value={index}>
              {index}時
            </option>
          ))}
        </select>
        ～
        <select
          value={endHour}
          onChange={(event) => setEndHour(Number(event.target.value))}
          className="border rounded px-2 py-1"
        >
          {[...Array(24)].map((_, index) => (
            <option key={index} value={index}>
              {index}時
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2 text-sm">
        <label>希望エリア（複数選択可能）:</label>
        <select
          multiple
          value={selectedAreas}
          onChange={(event) => setSelectedAreas(Array.from(event.target.selectedOptions, (option) => option.value))}
          className="w-full border rounded p-1 h-[6rem]"
        >
          {filterOptions.postalOptions.map((postalOption) => (
            <option key={postalOption.postal_code_3} value={postalOption.postal_code_3}>
              {postalOption.postal_code_3}（{postalOption.district}）
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3">
        <Button onClick={handleSubmit} disabled={submitting} className="bg-green-600 text-white hover:bg-green-700">
          {submitting ? "送信中..." : "Wishを送る"}
        </Button>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        👉{" "}
        <a
          href="https://board.worksmobile.com/main/board/4090000000109323447?t=56469"
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-600"
        >
          新規案件も確認してみてください
        </a>
      </div>
    </div>
  );
}
