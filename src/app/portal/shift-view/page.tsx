//portal/shift-view/page.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftData } from "@/types/shift";
import ShiftCard from "@/components/shift/ShiftCard";
import { Button } from "@/components/ui/button";
import { format, startOfMonth } from "date-fns";
import Link from "next/link";

/**
 * /portal/shift-view
 * - フィルター：担当者（user_id表示）/ 日付（カレンダー入力）/ 利用者
 * - URLクエリ (?staff=, ?date=YYYY-MM-DD, ?client=) と同期
 * - 一覧は ShiftCard を reject モードで表示
 * - 未ログインは /login へ（?next= 元URL）
 * - 訪問記録ボタン: 自分が担当 or role in {manager, admin} のときのみ
 * - 「この日すべてお休み」ボタン/「月間」オーバーレイは廃止
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

function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }

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
    for (const [k, v] of Object.entries(params)) {
      if (!v) next.delete(k); else next.set(k, v);
    }
    router.replace(`${pathname}?${next.toString()}`);
  };

  // ===== 認証ゲート（未ログインは /login） =====
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const qs = search?.toString();
        const nextUrl = qs ? `${pathname}?${qs}` : pathname;
        router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
        return;
      }
      setAuthChecked(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) {
        const qs = search?.toString();
        const nextUrl = qs ? `${pathname}?${qs}` : pathname;
        router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
      }
    });
    return () => { sub?.subscription?.unsubscribe?.(); };
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
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [initDone, setInitDone] = useState<boolean>(false);

  // ===== 初期値設定：初回アクセスのみ（URLに何も指定が無い場合だけ） =====
  useEffect(() => {
    if (!authChecked || initDone) return;

    const hasAnyParam = Boolean(qStaff || qDate || qClient);
    if (!hasAnyParam) {
      const params: Record<string, string> = {};
      if (meUserId) params.staff = meUserId; // 初回だけ自分の user_id を既定
      const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const first = startOfMonth(jstNow);
      params.date = format(first, "yyyy-MM-dd");
      setQuery(params);
    }
    setInitDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, meUserId, qStaff, qDate, qClient, initDone]);

  // ===== 権限制御 =====
  const canUseRecordFor = (s: ShiftData): boolean => {
    const mine = !!meUserId && [s.staff_01_user_id, s.staff_02_user_id, s.staff_03_user_id].includes(meUserId);
    const elevated = meRole === "manager" || meRole === "admin";
    return mine || elevated;
  };

  // ===== データ取得（クエリ反映） =====
  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      setLoading(true);
      try {
        const query = supabase.from("shift_csinfo_postalname_view").select("*");

        // 日付条件：選択日 以降
        if (qDate) {
          query.gte("shift_start_date", qDate);
        }

        // 担当者（01/02/03 のいずれか）
        if (qStaff) {
          query.or([
            `staff_01_user_id.eq.${qStaff}`,
            `staff_02_user_id.eq.${qStaff}`,
            `staff_03_user_id.eq.${qStaff}`,
          ].join(","));
        }

        // 利用者名（部分一致）
        if (qClient) query.ilike("name", `%${qClient}%`);

        // 表示順
        query.order("shift_start_date", { ascending: true })
             .order("shift_start_time", { ascending: true })
             .order("shift_id", { ascending: true });

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
          level_sort_order: (typeof s.level_sort_order === "number") ? s.level_sort_order : null,
        }));

        setShifts(mapped);

        // セレクト候補の構築（担当者は user_id 表示）
        const staffIds = uniq(
          mapped
            .flatMap((m) => [m.staff_01_user_id, m.staff_02_user_id, m.staff_03_user_id])
            .filter((v): v is string => v.length > 0)
        );
        const staffMap = new Map<string, string>();
        if (staffIds.length > 0) {
          const { data: userRows } = await supabase
            .from("users")
            .select("user_id")
            .in("user_id", staffIds);
          (userRows ?? []).forEach((u) => { staffMap.set(u.user_id, u.user_id); });
        }
        setStaffOptions(staffIds.map((id) => ({ user_id: id, label: staffMap.get(id) ?? id })));
        setClientOptions(uniq(mapped.map((m) => m.client_name!).filter((nm) => nm.length > 0)));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, qStaff, qDate, qClient]);

  if (!authChecked) {
    return <div className="p-4 text-sm text-gray-500">ログイン状態を確認しています...</div>;
  }

  return (
    <div className="content min-w-0">
      {/* このページ内だけで ShiftCard の“既存・月間リンク”を非表示 */}
      <style jsx global>{`
        a[href^="/portal/roster/monthly"] { display: none !important; }
      `}</style>

      <h2 className="text-xl font-bold mb-3">シフト一覧（Reject モード・柔軟フィルター）</h2>

      {/* フィルター（単一セレクト + 日付カレンダー） */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-end">
        <div>
          <label className="text-xs">担当者（user_id）</label>
          <select
            className="w-full border rounded p-2"
            value={qStaff}
            onChange={(e) => setQuery({ staff: e.target.value || undefined })}
          >
            <option value="">— 指定なし —</option>
            {staffOptions.map((s) => (
              <option key={s.user_id} value={s.user_id}>{s.user_id}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs">日付（この日以降を表示）</label>
          <input
            type="date"
            className="w-full border rounded p-2"
            value={qDate}
            onChange={(e) => setQuery({ date: e.target.value || undefined })}
          />
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
              <option key={nm} value={nm}>{nm}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-sm text-gray-500">該当するシフトがありません</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {shifts.map((s) => {
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
