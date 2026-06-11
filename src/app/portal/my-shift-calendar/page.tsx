"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, startOfMonth, addMonths, addWeeks } from "date-fns";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import type { ShiftData } from "@/types/shift";

type ViewMode = "month" | "week";

type ShiftCalendarRow = {
  id?: string | number | null;
  shift_id: string | number;
  shift_start_date: string;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  kaipoke_cs_id: string | number | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  judo_ido: string | null;
  district: string | null;
  name: string | null;
  gender_request_name: string | null;
  male_flg: boolean | null;
  female_flg: boolean | null;
  postal_code_3: string | null;
  require_doc_group: string | null;
  level_sort_order: number | null;
};

export default function MyShiftCalendarPage() {
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  const ym =
    search.get("ym") ||
    format(startOfMonth(new Date(Date.now() + 9 * 3600 * 1000)), "yyyy-MM");

  const view = (search.get("view") === "week" ? "week" : "month") as ViewMode;

  const [authChecked, setAuthChecked] = useState(false);
  const [meUserId, setMeUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftData[]>([]);

  const monthStart = `${ym}-01`;
  const monthEnd = format(addMonths(startOfMonth(new Date(`${ym}-01T00:00:00`)), 1), "yyyy-MM-dd");

  const setQuery = (params: Record<string, string>) => {
    const next = new URLSearchParams(search.toString());
    Object.entries(params).forEach(([k, v]) => next.set(k, v));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const moveCalendar = (direction: -1 | 1) => {
  const base = new Date(`${ym}-01T00:00:00`);

  if (view === "month") {
    const next = addMonths(base, direction);
    setQuery({ ym: format(next, "yyyy-MM") });
    return;
  }

  const weekBase = search.get("week")
    ? new Date(`${search.get("week")}T00:00:00`)
    : new Date();

  const next = addWeeks(weekBase, direction);
  setQuery({
    view: "week",
    week: format(next, "yyyy-MM-dd"),
    ym: format(next, "yyyy-MM"),
  });
};

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }

      const { data: me } = await supabase
        .from("users")
        .select("user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      setMeUserId(me?.user_id ?? "");
      setAuthChecked(true);
    })();
  }, [pathname, router]);

  useEffect(() => {
    if (!authChecked || !meUserId) return;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("shift_csinfo_postalname_view")
        .select("*")
        .gte("shift_start_date", monthStart)
        .lt("shift_start_date", monthEnd)
        .or(
          `staff_01_user_id.eq.${meUserId},staff_02_user_id.eq.${meUserId},staff_03_user_id.eq.${meUserId}`
        )
        .order("shift_start_date", { ascending: true })
        .order("shift_start_time", { ascending: true });

      if (error) {
        console.error(error);
        setShifts([]);
        setLoading(false);
        return;
      }

      const mapped: ShiftData[] =
  ((data ?? []) as ShiftCalendarRow[]).map((s) => ({
    id: String(s.id ?? s.shift_id),
    shift_id: String(s.shift_id),

    shift_start_date: s.shift_start_date,
    shift_start_time: s.shift_start_time ?? "",
    shift_end_time: s.shift_end_time ?? "",

    service_code: s.service_code ?? "",

    kaipoke_cs_id: s.kaipoke_cs_id
      ? String(s.kaipoke_cs_id)
      : "",

    staff_01_user_id: s.staff_01_user_id ?? "",
    staff_02_user_id: s.staff_02_user_id ?? "",
    staff_03_user_id: s.staff_03_user_id ?? "",

    judo_ido: s.judo_ido ?? "",
    address: s.district ?? "",
    client_name: s.name ?? "",

    gender_request_name: s.gender_request_name ?? "",
    male_flg: Boolean(s.male_flg),
    female_flg: Boolean(s.female_flg),

    postal_code_3: s.postal_code_3 ?? "",
    district: s.district ?? "",

    require_doc_group: s.require_doc_group ?? null,
    level_sort_order: s.level_sort_order ?? null,
  }));

      setShifts(mapped);
      setLoading(false);
    })();
  }, [authChecked, meUserId, monthStart, monthEnd]);

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ShiftData[]>();
    shifts.forEach((s) => {
      if (!map.has(s.shift_start_date)) map.set(s.shift_start_date, []);
      map.get(s.shift_start_date)!.push(s);
    });
    return map;
  }, [shifts]);

  const weekParam = search.get("week");
const baseDate =
  view === "week" && weekParam
    ? new Date(`${weekParam}T00:00:00`)
    : new Date(`${ym}-01T00:00:00`);

const firstDay = startOfMonth(baseDate);

const calendarStart =
  view === "month"
    ? new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() - firstDay.getDay())
    : new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() - baseDate.getDay()
      );

  const days = Array.from({ length: view === "month" ? 42 : 7 }, (_, i) => {
    const d = new Date(calendarStart);
    d.setDate(calendarStart.getDate() + i);
    return d;
  });

  if (!authChecked) {
    return <div className="p-4 text-sm text-gray-500">ログイン状態を確認しています...</div>;
  }

  return (
    <div className="content min-w-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">自分のシフトカレンダー</h2>
          <p className="text-sm text-gray-600">
            時間・利用者・エリア・サービス内容をカレンダー形式で確認できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => moveCalendar(-1)}>
            {view === "month" ? "前月" : "前週"}
          </Button>

          <input
            type="month"
            className="rounded border p-2"
            value={ym}
            onChange={(e) => setQuery({ ym: e.target.value })}
          />

           <Button variant="outline" onClick={() => moveCalendar(1)}>
             {view === "month" ? "次月" : "次週"}
           </Button>

          <Button
            variant={view === "month" ? "default" : "outline"}
            onClick={() => setQuery({ view: "month" })}
          >
            月間
          </Button>

          <Button
            variant={view === "week" ? "default" : "outline"}
            onClick={() => setQuery({ view: "week" })}
          >
            週間
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[900px] grid-cols-7 gap-2">
            {["日", "月", "火", "水", "木", "金", "土"].map((w) => (
              <div key={w} className="text-center text-xs font-bold text-gray-500">
                {w}
              </div>
            ))}

            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dayShifts = shiftsByDate.get(key) ?? [];
              const isCurrentMonth = key.slice(0, 7) === ym;

              return (
                <div
                  key={key}
                  className={`min-h-[150px] rounded border p-2 ${
                    isCurrentMonth ? "bg-gray-50" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <div className="mb-2 text-xs font-bold">{format(d, "M/d")}</div>

                  <div className="space-y-2">
                    {dayShifts.map((s) => (
                      <div key={s.shift_id} className="rounded border bg-white p-2 text-xs shadow-sm">
                        <div className="font-semibold text-gray-900">
                          {s.shift_start_time?.slice(0, 5)}-{s.shift_end_time?.slice(0, 5)}
                        </div>
                        <div>{s.client_name || "利用者名なし"}</div>
                        <div className="text-gray-600">{s.district || "エリアなし"}</div>
                        <div className="text-gray-600">{s.service_code || "サービス内容なし"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}