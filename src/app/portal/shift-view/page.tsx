//portal/shift-view/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftData } from "@/types/shift";
import ShiftCard from "@/components/shift/ShiftCard";
import { Button } from "@/components/ui/button";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  subMonths,
  addMonths,
} from "date-fns";
import { ja } from "date-fns/locale";
import Link from "next/link";
import type { JSX } from "react";


/**
 * /portal/shift-view
 * - 単一セレクトのフィルター（担当者 / 日付 / 利用者）
 * - URLクエリ (?staff=, ?date=YYYY-MM-DD, ?client=) と同期
 * - 一覧は ShiftCard を reject モードで表示
 * - 「月間」は本ページ内のオーバーレイで自己再描画
 * - 未ログインは /login へ（?next= 元URL）
 * - 訪問記録ボタン: 自分が担当 or role in {manager, admin} のときのみ
 * - お休みボタン: 指定日で自分の担当がある場合のみ
 */

type StaffLite = { user_id: string; label: string };

type ShiftRow = {
  id: string | number;
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  service_code: string | null;
  kaipoke_cs_id: string;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  name: string | null;
  gender_request_name: string | null;
  male_flg: boolean | null;
  female_flg: boolean | null;
  postal_code_3: string | null;
  district: string | null;
  require_doc_group: string | null;
  level_sort_order?: number | null;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export default function ShiftViewPage() {
  // ===== URLクエリ連携 =====
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  const qStaff = (search.get("staff") ?? "").trim(); // user_id
  const qDate = (search.get("date") ?? "").trim(); // YYYY-MM-DD
  const qClient = (search.get("client") ?? "").trim(); // 利用者名（部分一致）

  const setQuery = (params: Record<string, string | undefined>): void => {
    const next = new URLSearchParams(search.toString());
    Object.entries(params).forEach(([k, v]) => {
      if (!v) next.delete(k);
      else next.set(k, v);
    });
    router.replace(`${pathname}?${next.toString()}`);
  };

  // ===== 認証ゲート（未ログインは /login） =====
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const qs = search?.toString();
        const next = qs ? `${pathname}?${qs}` : pathname;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      setAuthChecked(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        const qs = search?.toString();
        const next = qs ? `${pathname}?${qs}` : pathname;
        router.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    });
    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== ログイン者（user_id / role） =====
  const [meUserId, setMeUserId] = useState<string>("");
  const [meRole, setMeRole] = useState<string | null>(null); // "manager" | "admin" | ...

  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: me } = await supabase
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      setMeUserId(me?.user_id ?? "");
      setMeRole(me?.system_role ?? null);
    })();
  }, [authChecked]);

  // ===== データ状態 =====
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffLite[]>([]);
  const [dateOptions, setDateOptions] = useState<string[]>([]);
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ===== 月間UI（自己再描画） =====
  const [showMonth, setShowMonth] = useState<boolean>(false);
  const [monthCursor, setMonthCursor] = useState<Date>(() =>
    qDate ? new Date(qDate) : new Date()
  );

  // ===== 権限制御 =====
  const canUseRecordFor = (s: ShiftData): boolean => {
    const mine =
      !!meUserId &&
      [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(meUserId);
    const elevated = meRole === "manager" || meRole === "admin";
    return mine || elevated;
  };

  const isMyShift = (s: ShiftData): boolean =>
    !!meUserId &&
    [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(meUserId);

  // ===== データ取得（クエリ反映） =====
  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      setLoading(true);
      try {
        // 基本は今日以降
        const jstToday = new Date(Date.now() + 9 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);

        const query = supabase
          .from("shift_csinfo_postalname_view")
          .select("*")
          .gte("shift_start_date", jstToday)
          .order("shift_start_date", { ascending: true })
          .order("shift_start_time", { ascending: true })
          .order("shift_id", { ascending: true });

        if (qDate) query.eq("shift_start_date", qDate);
        if (qClient) query.ilike("name", `%${qClient}%`);
        if (qStaff) {
          query.or(
            [
              `staff_01_user_id.eq.${qStaff}`,
              `staff_02_user_id.eq.${qStaff}`,
              `staff_03_user_id.eq.${qStaff}`,
            ].join(",")
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        const rows = (data ?? []) as ShiftRow[];
        const mapped: ShiftData[] = rows.map((s) => ({
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
          address: s.district ?? "",
          client_name: s.name ?? "",
          gender_request_name: s.gender_request_name ?? "",
          male_flg: Boolean(s.male_flg),
          female_flg: Boolean(s.female_flg),
          postal_code_3: s.postal_code_3 ?? "",
          district: s.district ?? "",
          require_doc_group: s.require_doc_group ?? null,
          level_sort_order:
            typeof s.level_sort_order === "number" ? s.level_sort_order : null,
        }));

        setShifts(mapped);

        // セレクト候補の構築
        const staffIds = uniq(
          mapped
            .flatMap((m) => [m.staff_01_user_id, m.staff_02_user_id, m.staff_03_user_id])
            .filter((v): v is string => v.length > 0)
        );

        const staffMap = new Map<string, string>();
        if (staffIds.length > 0) {
          const { data: userRows } = await supabase
            .from("users")
            .select("user_id,last_name_kanji,first_name_kanji,display_name")
            .in("user_id", staffIds);
          (userRows ?? []).forEach((u) => {
            const label =
              (u.display_name?.trim() ?? "") ||
              `${u.last_name_kanji ?? ""}${u.first_name_kanji ?? ""}` ||
              u.user_id;
            staffMap.set(u.user_id, label);
          });
        }
        setStaffOptions(staffIds.map((id) => ({ user_id: id, label: staffMap.get(id) ?? id })));
        setDateOptions(uniq(mapped.map((m) => m.shift_start_date)));
        setClientOptions(uniq(mapped.map((m) => m.client_name!).filter((nm) => nm.length > 0)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, qStaff, qDate, qClient]);

  // ===== ページ上「お休み」：この日の自分担当のみ対象 =====
  const myShiftsToday = useMemo<ShiftData[]>(
    () => shifts.filter((s) => isMyShift(s)),
    [shifts, meUserId]
  );
  const canShowOffAll: boolean =
    !!meUserId && qDate.length > 0 && myShiftsToday.length > 0;

  async function handleOffAll(): Promise<void> {
    if (!canShowOffAll) return;
    if (!confirm("この日の自分の全シフトをお休み希望として登録しますか？")) return;

    setSubmitting(true);
    try {
      for (const s of myShiftsToday) {
        await fetch("/api/shift-reassign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftId: s.shift_id,
            fromUserId: meUserId,
            toUserId: "manager:auto",
            reason: "お休み希望(shift-view)",
          }),
        });
      }
      alert("お休み希望を登録しました");
      router.refresh?.();
    } catch (e) {
      console.error(e);
      alert("お休み処理に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // ===== 月間UI（オーバーレイ） =====
  function MonthOverlay(): JSX.Element | null {
    if (!showMonth) return null;
    const start = startOfMonth(monthCursor);
    const end = endOfMonth(monthCursor);
    const days = eachDayOfInterval({ start, end });

    return (
      <div className="fixed inset-0 z-[200] bg-black/30 flex items-start justify-center p-4 md:pl-[250px] md:pr-8">
        <div className="w-full max-w-md rounded-2xl bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <Button size="sm" variant="outline" onClick={() => setMonthCursor((d) => subMonths(d, 1))}>
              前の月
            </Button>
            <div className="font-bold">{format(monthCursor, "yyyy年MM月", { locale: ja })}</div>
            <Button size="sm" variant="outline" onClick={() => setMonthCursor((d) => addMonths(d, 1))}>
              次の月
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const dim = !isSameMonth(d, monthCursor);
              return (
                <button
                  key={key}
                  className={`rounded-md border text-sm py-2 ${dim ? "opacity-40" : ""}`}
                  onClick={() => {
                    setShowMonth(false);
                    setQuery({ date: key });
                  }}
                >
                  {format(d, "d")}
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-right">
            <Button size="sm" variant="secondary" onClick={() => setShowMonth(false)}>
              閉じる
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ===== 表示配列 =====
  const visible: ShiftData[] = shifts; // 取得時にすでにクエリ適用済み

  if (!authChecked) {
    return <div className="p-4 text-sm text-gray-500">ログイン状態を確認しています...</div>;
  }

  return (
    <div className="content min-w-0">
      {/* このページ内だけで ShiftCard の“既存・月間リンク”を非表示 */}
      <style jsx global>{`
        a[href^="/portal/roster/monthly"] {
          display: none !important;
        }
      `}</style>

      <h2 className="text-xl font-bold mb-3">シフト一覧（Reject モード・柔軟フィルター）</h2>

      {/* フィルター（単一セレクト） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-end">
        <div>
          <label className="text-xs">担当者（Staff_01/02/03 の user_id）</label>
          <select
            className="w-full border rounded p-2"
            value={qStaff}
            onChange={(e) => setQuery({ staff: e.target.value || undefined })}
          >
            <option value="">— 指定なし —</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.label}（{s.user_id}）
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs">日付</label>
          <div className="flex gap-2">
            <select
              className="w-full border rounded p-2"
              value={qDate}
              onChange={(e) => setQuery({ date: e.target.value || undefined })}
            >
              <option value="">— 指定なし —</option>
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={() => setShowMonth(true)}>
              月間
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs">利用者</label>
          <select
            className="w-full border rounded p-2"
            value={qClient}
            onChange={(e) => setQuery({ client: e.target.value || undefined })}
          >
            <option value="">— 指定なし —</option>
            {clientOptions.map((nm) => (
              <option key={nm} value={nm}>
                {nm}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showMonth && <MonthOverlay />}

      {/* 日別お休み（自分担当が存在するときのみ） */}
      {canShowOffAll && (
        <div className="text-right mb-3">
          <Button disabled={submitting} className="bg-red-600 text-white" onClick={handleOffAll}>
            {submitting ? "処理中..." : "この日はお休み希望（自分担当のみ）"}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-gray-500">該当するシフトがありません</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            const allowRecord = canUseRecordFor(s);
            const hideCss = allowRecord ? undefined : (
              <style>{`#srbtn-${s.shift_id}{ display:none !important; }`}</style>
            );
            return (
              <div key={s.shift_id} className="relative">
                {hideCss}
                <ShiftCard
                  shift={s}
                  mode="reject"
                  onReject={(reason) => {
                    fetch("/api/shift-reassign", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        shiftId: s.shift_id,
                        fromUserId: meUserId,
                        toUserId: "manager:auto",
                        reason,
                      }),
                    }).then(() => router.refresh?.());
                  }}
                  extraActions={
                    allowRecord ? (
                      <Button asChild variant="secondary">
                        <Link href={`/shift-record?shift_id=${encodeURIComponent(s.shift_id)}`}>
                          訪問記録
                        </Link>
                      </Button>
                    ) : null
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
