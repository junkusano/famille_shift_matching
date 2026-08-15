//portal/shift-view/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { ShiftData } from "@/types/shift";
import ShiftCard from "@/components/shift/ShiftCard";
import { Button } from "@/components/ui/button";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/SearchableSelect";
import { DepartedStaffShiftBatchCard } from "@/components/shift/DepartedStaffShiftBatchCard";
import { format, startOfMonth, addMonths } from "date-fns";
import Link from "next/link";

/**
 * /portal/shift-view
 * フィルター：担当者（user_id＝値 / 表示は氏名 from user_entry_united_view）/ 日付（選択日以降）/ 利用者（kaipoke_cs_id）
 * URLクエリ：?user_id=, ?date=YYYY-MM-DD, ?client=（= kaipoke_cs_id）
 * 初回のみ user_id と date を注入（URLに無い時だけ）。
 */

export default function ShiftViewPage() {
  // ===== Router & URL =====
  const router = useRouter();
  const search = useSearchParams();
  const pathname = usePathname();

  // 現在のクエリ文字列を state に保持（これが変わるたびに再描画）
  const [searchStr, setSearchStr] = useState<string>("");

  useEffect(() => {
    const s =
      typeof window !== "undefined"
        ? window.location.search
        : (search?.toString() ?? "");
    setSearchStr(s);
  }, [search, pathname]);

  // 常に“最新の”検索文字列から URLSearchParams を作る
  const getSearch = () =>
    new URLSearchParams(
      typeof window !== "undefined"
        ? (searchStr || window.location.search)
        : (search?.toString() ?? "")
    );

  // URLクエリ値は searchStr の変化だけをトリガーに読む（=確実に更新される）
  const qUserId = useMemo(() => (getSearch().get("user_id") ?? "").trim(), [searchStr]);
  const qDate = useMemo(() => (getSearch().get("date") ?? "").trim(), [searchStr]);
  const qYm = useMemo(() => (getSearch().get("ym") ?? "").trim(), [searchStr]); // ★追加
  // client は「名前」ではなく kaipoke_cs_id を持つ
  const qClient = useMemo(() => (getSearch().get("client") ?? "").trim(), [searchStr]);

  // ★表示用の月（印刷ビュー等で使っている qMonth）も ym を優先
  const qMonth = useMemo(() => (qYm ? qYm : (qDate ? qDate.slice(0, 7) : "")), [qYm, qDate]);

  // ★追加：ym があれば「月初～翌月月初未満」で絞り込むための境界
  const monthStart = useMemo(() => {
    if (qYm) return `${qYm}-01`;
    return qDate; // 従来互換（date指定がある場合）
  }, [qYm, qDate]);

  const monthEnd = useMemo(() => {
    if (!qYm) return "";
    const d = new Date(`${qYm}-01T00:00:00`);
    return format(addMonths(startOfMonth(d), 1), "yyyy-MM-dd");
  }, [qYm]);

  // 既存の qUserId, qDate, qClient の下に追加
  const qPage = useMemo(() => {
    const p = parseInt(getSearch().get("page") ?? "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  }, [searchStr]);

  const qPer = useMemo(() => {
    const p = parseInt(getSearch().get("per") ?? "50", 10);
    return Number.isFinite(p) && p > 0 ? p : 50;
  }, [searchStr]);

  // URL書き換え
  const setQuery = (params: Record<string, string | undefined>): void => {
    const next = getSearch();
    for (const [k, v] of Object.entries(params)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
    setSearchStr(qs ? `?${qs}` : "");
  };

  // ===== 認証（未ログインは /login へ） =====
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

  // ===== ログイン者情報（user_idのみ使う） =====
  const [meUserId, setMeUserId] = useState<string>("");

  useEffect(() => {
    if (!authChecked) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMeUserId(""); return; }
      const { data: me } = await supabase
        .from("users")
        .select("user_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      setMeUserId(me?.user_id ?? "");
    })();
  }, [authChecked]);

  // ===== 画面状態 =====
  const [loading, setLoading] = useState<boolean>(true);
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  // ▼ 担当者セレクト：value=user_id, label=氏名（last_name_kanji + " " + first_name_kanji）
  const [staffOptions, setStaffOptions] = useState<SearchableSelectOption[]>([]);
  // ▼ 利用者セレクト：value=kaipoke_cs_id, 表示も kaipoke_cs_id
  const [clientOptions, setClientOptions] = useState<SearchableSelectOption[]>([]);

  // 初期クエリ注入フラグ
  const [initDone, setInitDone] = useState<boolean>(false);

  // shifts の state 定義の近くに追加
  const [totalCount, setTotalCount] = useState<number>(0);
  const totalPages = Math.max(1, Math.ceil(totalCount / qPer));

  // ===== 初期注入：URLに無ければ user_id & date を入れる（1回だけ） =====
  useEffect(() => {
    if (!authChecked || initDone || !meUserId) return;

    const current = getSearch();
    const hasUserId = !!current.get("user_id");
    const hasDate = !!current.get("date") || !!current.get("ym");

    if (!hasUserId && !hasDate) {
      const jstNow = new Date(Date.now() + 9 * 3600 * 1000);
      const first = startOfMonth(jstNow);
      // 初期注入 useEffect 内の setQuery を次のように変更（per: "50" を追加）
      setQuery({ user_id: meUserId, date: format(first, "yyyy-MM-dd"), per: "50", page: "1" });

    }
    setInitDone(true);
  }, [authChecked, initDone, meUserId]);

  // ===== データ取得（URLの各値に追従） =====
  const ready = useMemo(() => authChecked && initDone, [authChecked, initDone]);

  useEffect(() => {
    if (!authChecked) return;

    const ac = new AbortController();
    let alive = true;

    type StaffMasterRow = {
      user_id: string;
      last_name_kanji: string | null;
      first_name_kanji: string | null;
      roster_sort?: number | string | null;
    };

    type ClientMasterRow = {
      kaipoke_cs_id: string;
      name: string | null;
      kana?: string | null;
      service_kind?: string | null;
    };

    const getRosterSort = (value: StaffMasterRow["roster_sort"]) => {
      if (value == null || value === "") return Number.MAX_SAFE_INTEGER;
      const n = Number(value);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };

    (async () => {
      try {
        const [staffRes, clientRes] = await Promise.all([
          fetch("/api/users", { cache: "no-store", signal: ac.signal }),
          fetch("/api/kaipoke-info", { cache: "no-store", signal: ac.signal }),
        ]);

        if (!staffRes.ok) throw new Error(`staff options load failed: ${staffRes.status}`);
        if (!clientRes.ok) throw new Error(`client options load failed: ${clientRes.status}`);

        const staffJson = await staffRes.json();
        const clientJson = await clientRes.json();

        if (!alive || ac.signal.aborted) return;

        const staffRows: StaffMasterRow[] = Array.isArray(staffJson) ? staffJson : [];
        const staffMasterOptions = staffRows
          .filter((staff) => staff.user_id)
          .map((staff) => {
            const name = `${staff.last_name_kanji ?? ""} ${staff.first_name_kanji ?? ""}`.trim();
            return {
              value: staff.user_id,
              label: name || staff.user_id,
              searchText: `${name} ${staff.user_id}`,
              rosterSort: getRosterSort(staff.roster_sort),
            };
          })
          .sort((a, b) => {
            if (a.rosterSort !== b.rosterSort) return a.rosterSort - b.rosterSort;
            return a.label.localeCompare(b.label, "ja");
          })
          .map((option) => ({
            value: option.value,
            label: option.label,
            searchText: option.searchText,
          }));

        const clientRows: ClientMasterRow[] = Array.isArray(clientJson) ? clientJson : [];
        const clientMasterOptions = clientRows
          .filter((client) => client.kaipoke_cs_id)
          .map((client) => ({
            value: client.kaipoke_cs_id,
            label: client.name?.trim() || client.kaipoke_cs_id,
            searchText: [
              client.name,
              client.kana,
              client.kaipoke_cs_id,
              client.service_kind,
            ]
              .filter((value): value is string => Boolean(value))
              .join(" "),
          }))
          .sort((a, b) => a.label.localeCompare(b.label, "ja"));

        setStaffOptions(staffMasterOptions);
        setClientOptions(clientMasterOptions);
      } catch (e) {
        if (!ac.signal.aborted) console.error(e);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [authChecked]);

  useEffect(() => {
    if (!ready) return;

    const ac = new AbortController();
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setShifts([]);

        // クエリビルダー（qDate / qUserId / qClient（= kaipoke_cs_id））
        // buildQuery の select を count 取得に変更
        const buildQuery = () => {
          let q = supabase
            .from("shift_csinfo_postalname_view")
            .select("*", { count: "exact", head: false });

          // ★ym がある場合は月範囲、無い場合は date で下限
          if (monthStart) {
            q = q.gte("shift_start_date", monthStart);
          }
          if (monthEnd) {
            q = q.lt("shift_start_date", monthEnd);
          }

          if (qUserId) {
            q = q.or(
              `staff_01_user_id.eq.${qUserId},staff_02_user_id.eq.${qUserId},staff_03_user_id.eq.${qUserId}`
            );
          }

          if (qClient) {
            q = q.eq("kaipoke_cs_id", qClient);
          }

          return q
            .order("shift_start_date", { ascending: true })
            .order("shift_start_time", { ascending: true })
            .order("shift_id", { ascending: true });
        };

        // ループで全件取得していた部分を、オフセット+リミットに置換
        const from = (qPage - 1) * qPer;
        const to = from + qPer - 1;

        // count を受け取りたいので、buildQuery() に対して range() しつつ結果から count を参照
        const { data, error, count } = await buildQuery().range(from, to);
        if (ac.signal.aborted) return;
        if (error) throw error;

        setTotalCount(count ?? 0);

        // ページングで最大件数制限(1000件)を超えても全件取得
        //const PAGE = 1000;
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

        /*
        const all = (data ?? []) as ShiftRow[];
 
        for (let from = 0; ; from += PAGE) {
          const to = from + PAGE - 1;
          const { data, error } = await buildQuery().range(from, to);
          if (ac.signal.aborted) return;
          if (error) throw error;
 
          const chunk = (data ?? []) as ShiftRow[];
          all.push(...chunk);
 
          if (chunk.length < PAGE) break;
        }
        */
        //if (!alive) return;

        const pageRows = (data ?? []) as ShiftRow[];
        // Supabaseの結果を UI 用の ShiftData に整形
        const mappedPage: ShiftData[] = pageRows.map((s) => ({
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
          judo_ido: s.judo_ido ?? "",
          address: s.district ?? "",
          client_name: s.name ?? "",
          gender_request_name: s.gender_request_name ?? "",
          male_flg: Boolean(s.male_flg),
          female_flg: Boolean(s.female_flg),
          postal_code_3: s.postal_code_3 ?? "",
          district: s.district ?? "",
          require_doc_group: s.require_doc_group ?? null,
          level_sort_order: typeof s.level_sort_order === "number" ? s.level_sort_order : null,
        }));

        //setShifts(mappedPage);
        //setShifts(mapped);
        setShifts(mappedPage);

      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [ready, qUserId, qDate, qClient, qPage, qPer, reloadKey]);

  if (!authChecked) {
    return <div className="p-4 text-sm text-gray-500">ログイン状態を確認しています...</div>;
  }

  // ページャー部品（簡易）：一覧の上と下に同じものを置くと便利
  const Pager = () => (
    <div className="flex items-center justify-between mt-3 mb-3">
      <div className="text-xs text-gray-500">
        {totalCount.toLocaleString()} 件中 {Math.min(totalCount, (qPage - 1) * qPer + 1)}–
        {Math.min(totalCount, qPage * qPer)} を表示（{qPer}/ページ）
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={qPage <= 1}
          onClick={() => setQuery({ page: String(qPage - 1), per: String(qPer) })}
        >
          前へ
        </Button>
        <span className="text-sm">
          {qPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          disabled={qPage >= totalPages}
          onClick={() => setQuery({ page: String(qPage + 1), per: String(qPer) })}
        >
          次へ
        </Button>
      </div>
    </div>
  );

  return (
    <div className="content min-w-0">
      {loading && (
        <div className="fixed top-2 right-2 z-50 bg-black/70 text-white text-xs px-3 py-1 rounded">ロード中…</div>
      )}

      <h2 className="text-xl font-bold">シフト・勤務一覧</h2>
      <p className="text-sm text-gray-600 mb-3">過去の実績確認、訪問記録のエラー確認などで活用してください。</p>
      <DepartedStaffShiftBatchCard onCompleted={() => setReloadKey((value) => value + 1)} />

      {/* フィルター */}
      <div className="mb-2 flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link href="/portal/shift-view">フィルターをクリア</Link>
        </Button>

        {/* ▼ Client（kaipoke_cs_id）と月が特定されている時だけ表示 */}
        {qClient && qMonth && (
          <>
            <Button asChild>
              <Link
                href={`/portal/roster/monthly/print-view?kaipoke_cs_id=${encodeURIComponent(
                  qClient
                )}&month=${encodeURIComponent(qMonth)}`}
              >
                印刷ビュー
              </Link>
            </Button>

            <Button asChild variant="secondary">
              <Link
                href={`/portal/roster/monthly/shift-record-view?kaipoke_cs_id=${encodeURIComponent(
                  qClient
                )}&month=${encodeURIComponent(qMonth)}`}
              >
                訪問記録印刷
              </Link>
            </Button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3 items-end">
        <div>
          <label className="text-xs">担当者（氏名表示 / 値は user_id）</label>
          <SearchableSelect
            options={staffOptions}
            value={qUserId}
            onChange={(value) => setQuery({ user_id: value || undefined, page: "1" })}
            placeholder="指定なし"
            searchPlaceholder="担当者名・IDで検索"
          />
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
          <label className="text-xs">利用者（kaipoke_cs_id）</label>
          <SearchableSelect
            options={clientOptions}
            value={qClient}
            onChange={(value) => setQuery({ client: value || undefined, page: "1" })}
            placeholder="指定なし"
            searchPlaceholder="利用者名・カナ・IDで検索"
          />
        </div>
      </div>
      &nbsp;<Pager />
      {loading ? (
        <div className="text-sm text-gray-500">読み込み中...</div>
      ) : shifts.length === 0 ? (
        <div className="text-sm text-gray-500">該当するシフトがありません</div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {shifts.map((s) => (
            <ShiftCard
              key={s.shift_id}
              shift={s}
              mode="view"
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
            />
          ))}
        </div>
      )}
      <Pager />
    </div>
  );
}
