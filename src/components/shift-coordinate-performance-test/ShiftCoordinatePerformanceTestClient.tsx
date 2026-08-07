"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
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
  sms_phone_number?: string | null;
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

  const handleShiftRequest = useCallback(
    async (shift: PerformanceShiftData, attendRequest: boolean, timeAdjustNote?: string) => {
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
            body: JSON.stringify({ channelId: chanData.channel_id, text: message }),
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

            if ((status === "assigned" || status === "replaced") && chanData?.channel_id) {
              const text =
                `${shift.shift_start_date} ${toHm(shift.shift_start_time)}～${toHm(shift.shift_end_time)} のシフトの担当を${mention}に変更しました（マイファミーユ）。\n` +
                `変更に問題がある場合には、マネジャーに問い合わせください。`;

              await fetch("/api/lw-send-botmessage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ channelId: chanData.channel_id, text }),
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
    <div className="content">
      <h2 className="text-xl font-bold mb-4">シフ子（ｼﾌﾄｺｰﾃﾞｨﾈｰﾄ：自分で好きなシフトを取れます）</h2>

      <table style={{ width: "100%", borderSpacing: "1rem 0" }}>
        <tbody>
          <tr>
            <td style={{ width: "50%" }}>
              <div className="mb-1 flex items-center gap-3 text-xs">
                <label>
                  <input
                    type="radio"
                    name="dateFilterType"
                    checked={dateFilterType === "date"}
                    onChange={() => {
                      setDateFilterType("date");
                      setFilterWeekday([]);
                    }}
                    className="mr-1"
                  />
                  日付
                </label>

                <label>
                  <input
                    type="radio"
                    name="dateFilterType"
                    checked={dateFilterType === "weekday"}
                    onChange={() => {
                      setDateFilterType("weekday");
                      setFilterDate([]);
                    }}
                    className="mr-1"
                  />
                  曜日
                </label>
              </div>

              {dateFilterType === "date" ? (
                <>
                  <label className="text-xs">日付（複数選択）</label>
                  <select
                    multiple
                    value={filterDate}
                    onChange={(event) =>
                      setFilterDate(Array.from(event.target.selectedOptions, (option) => option.value))
                    }
                    className="w-full border rounded p-1 h-[6rem]"
                  >
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
                </>
              ) : (
                <>
                  <label className="text-xs">曜日（複数選択）</label>
                  <select
                    multiple
                    value={filterWeekday}
                    onChange={(event) =>
                      setFilterWeekday(Array.from(event.target.selectedOptions, (option) => option.value))
                    }
                    className="w-full border rounded p-1 h-[6rem]"
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
            </td>

            <td style={{ width: "50%" }}>
              <label className="text-xs">種別（複数選択）</label>
              <select
                multiple
                value={filterService}
                onChange={(event) =>
                  setFilterService(Array.from(event.target.selectedOptions, (option) => option.value))
                }
                className="w-full border rounded p-1 h-[6rem]"
              >
                {filterOptions.serviceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr>
            <td style={{ width: "50%" }}>
              <label className="text-xs">住所エリア（複数選択）</label>
              <select
                multiple
                value={filterPostal}
                onChange={(event) =>
                  setFilterPostal(Array.from(event.target.selectedOptions, (option) => option.value))
                }
                className="w-full border rounded p-1 h-[6rem]"
              >
                {filterOptions.postalOptions.map((postalOption) => (
                  <option key={postalOption.postal_code_3} value={postalOption.postal_code_3}>
                    {postalOption.postal_code_3}（{postalOption.district}）
                  </option>
                ))}
              </select>
            </td>

            <td style={{ width: "50%" }}>
              <label className="text-xs">利用者名（複数選択）</label>
              <select
                multiple
                value={filterName}
                onChange={(event) =>
                  setFilterName(Array.from(event.target.selectedOptions, (option) => option.value))
                }
                className="w-full border rounded p-1 h-[6rem]"
              >
                {filterOptions.nameOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </td>
          </tr>

          <tr>
            <td style={{ width: "50%" }}>
              <label className="text-xs">ヘルパー希望（複数選択）</label>
              <select
                multiple
                value={filterGender}
                onChange={(event) =>
                  setFilterGender(Array.from(event.target.selectedOptions, (option) => option.value))
                }
                className="w-full border rounded p-1 h-[6rem]"
              >
                {filterOptions.genderOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </td>

            <td style={{ width: "50%" }}>
              <Button onClick={applyFilters} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                フィルターを適用
              </Button>
              <Button onClick={clearFilters} className="w-full bg-gray-400 hover:bg-gray-500 text-white">
                フィルター解除
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <ShiftWishWidgetPerformanceTest filterOptions={filterOptions} />

      <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        表示している「概算給与」は、基本時給・サービス加算・回ごと単価・通勤費から算出した目安です。
        実際の給与は、個人別時給、同日に複数サービスへ入る場合の移動時間加算等により変動します。
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {paginatedShifts.map((shift) => (
          <ShiftCardPerformanceTest
            key={shift.shift_id}
            shift={shift}
            staffMap={staffMap}
            myServiceKeys={myServiceKeys}
            userRole={userRole}
            creatingRequest={creatingShiftRequest}
            onRequest={(attend, note) => {
              void handleShiftRequest(shift, attend, note);
            }}
            extraActions={<GroupAddButtonPerformanceTest shift={shift} />}
          />
        ))}
      </div>

      <div className="flex justify-between mt-6">
        <Button disabled={currentPage === 1} onClick={() => setCurrentPage((page) => page - 1)}>
          戻る
        </Button>
        <Button
          disabled={start + PAGE_SIZE >= filteredShifts.length}
          onClick={() => setCurrentPage((page) => page + 1)}
        >
          次へ
        </Button>
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
