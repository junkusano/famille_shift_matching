//portal/disability-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/** ビュー行の型（disability_check_view の列名に一致） */
interface Row {
  kaipoke_cs_id: string;
  client_name: string;
  client_kana: string | null; // ★追加
  year_month: string;         // YYYY-MM
  kaipoke_servicek: string;   // "障害" | "移動支援" など
  ido_jukyusyasho: string | null;
  is_checked: boolean | null;
  district: string | null;
  // ① 実績担当者（API / View 側で JOIN して返してもらう想定）
  asigned_jisseki_staff_id: string | null;   // user_id 等
  asigned_jisseki_staff_name: string | null; // 氏名
  // チーム（asigned_org）
  asigned_org_id: string | null;     // orgunitid
  asigned_org_name: string | null;   // orgunitname

  // ③ 提出フラグ
  is_submitted: boolean | null;
}

interface DistrictRow {
  postal_code_3: string;
  district: string | null;
}

/** 前月 YYYY-MM を返す */
const getPrevMonth = (): string => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

/** 過去5年〜将来6ヶ月の YYYY-MM リスト（降順） */
const buildYearMonthOptions = (): string[] => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const list: string[] = [];
  for (let offset = -60; offset <= 6; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    list.push(`${y}-${m}`);
  }
  return list.sort().reverse();
};

const DisabilityCheckPage: React.FC = () => {
  // ★共通：正規化（ゼロ幅スペース等も除去）
  const norm = (s: string) =>
    (s ?? "")
      .normalize("NFKC")
      .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF　]+/g, "") // NBSP/ゼロ幅/全角空白も除去
      .trim();

  // ★追加：kaipoke_cs_id 専用の正規化（数字と * だけ残す）
  const normCsId = (s: string) => norm(s).replace(/[^\d*]/g, "");

  // ★カタカナ→ひらがな
  const kanaKey = (s: string) =>
    norm(s).replace(/[\u30A1-\u30F6]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );

  // ★日本語ソート
  const jaCollator = useMemo(
    () =>
      new Intl.Collator("ja", {
        usage: "sort",
        sensitivity: "base",
        ignorePunctuation: true,
        numeric: false,
      }),
    []
  );

  // ★地域ランク（表示とSelectを揃える）
  const areaRank = (d?: string | null) => {
    const s = norm(d ?? "");
    if (s.includes("春日井")) return 0;
    if (s.includes("名古屋")) return 1;
    return 2;
  };

  const areaLabel = (d?: string | null) => {
    const r = areaRank(d);
    if (r === 0) return "春日井市";
    if (r === 1) return "名古屋市";
    return "その他";
  };

  // ① 初期フィルタ：前月 × 障害
  const [yearMonth, setYearMonth] = useState<string>(getPrevMonth());
  const [kaipokeServicek, setKaipokeServicek] = useState<string>(""); // （全て）
  // ③ Districtは未選択（全件）
  const [districts, setDistricts] = useState<string[]>([]);

  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const yearMonthOptions = useMemo(buildYearMonthOptions, []);

  // ② 検索用ステート
  const [filterKaipokeCsId, setFilterKaipokeCsId] = useState<string>("");  // 利用者（kaipoke_cs_id）
  const [filterStaffId, setFilterStaffId] = useState<string>("");          // 実績担当者（Select）
  //const [filterKaipokeId, setFilterKaipokeId] = useState<string>("");      // カイポケID（Text）
  //const [filterIdo, setFilterIdo] = useState<string>("");                  // 受給者証番号（Text）
  const [filterTeamId, setFilterTeamId] = useState<string>("");
  const [isManager, setIsManager] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // ★追加：member 判定（manager/admin 以外はすべて member）
  const isMember = !(isManager || isAdmin);

  // ★追加：ログインユーザー自身の user_id（＝ asigned_jisseki_staff_id と同じ系統のID）
  const [myUserId, setMyUserId] = useState<string>("");

  // ★追加：URL（searchParams）からの初期反映が終わったか（無限ループ防止）
  const [didInitFromUrl, setDidInitFromUrl] = useState<boolean>(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ★追加：実績担当者リンククリック時に “実際に絞り込み状態” にする
  const handleClickStaff = (staffId: string) => {
    // member は担当者固定運用なので、クリック絞り込みは不要（必要ならこの if を外す）
    if (!(isManager || isAdmin)) return;

    // 実績担当者で絞り込む
    setFilterStaffId(staffId);

    // 必要なら他の絞り込みを解除（「その人担当の利用者一覧」を出したい意図に合わせる）
    setFilterKaipokeCsId("");
    setFilterTeamId("");

    // URL も要件通りに更新（ym は “今絞っている年月”）
    const qp = new URLSearchParams(searchParams.toString());
    qp.set("ym", yearMonth);
    qp.set("user_id", staffId);

    router.push(`${pathname}?${qp.toString()}`);
  };

  // ② Selectbox 用の選択肢
  type ClientOption = {
    id: string;
    name: string;
    kana: string;
    district: string | null;
    group: string; // "春日井市" | "名古屋市" | "その他"
  };

  type ClientGroup = { label: string; options: ClientOption[] };

  const clientGroups = useMemo<ClientGroup[]>(() => {
    // ★同一IDを1件にする：IDは必ず正規化してキーにする
    const map = new Map<string, ClientOption>(); // normId -> option

    records.forEach((r) => {
      const id = normCsId(r.kaipoke_cs_id); // ★ここを変更
      if (!id) return;

      const name = (r.client_name ?? "").trim();
      if (!name) return;

      const kana = (r.client_kana ?? r.client_name ?? "").toString();

      if (map.has(id)) return; // ★同一IDは必ず1件

      map.set(id, {
        id,
        name,
        kana,
        district: r.district ?? null,
        group: areaLabel(r.district),
      });
    });

    const all = Array.from(map.values());

    // グループ分け
    const groups: Record<string, ClientOption[]> = {
      春日井市: [],
      名古屋市: [],
      その他: [],
    };

    all.forEach((o) => {
      (groups[o.group] ?? groups["その他"]).push(o);
    });

    // 各グループ内を「かな優先の五十音順」
    const sortByKana = (a: ClientOption, b: ClientOption) => {
      const ak = kanaKey(a.kana);
      const bk = kanaKey(b.kana);
      const by = jaCollator.compare(ak, bk);
      if (by !== 0) return by;
      return jaCollator.compare(norm(a.id), norm(b.id));
    };

    const result: ClientGroup[] = [
      { label: "春日井市", options: groups["春日井市"].sort(sortByKana) },
      { label: "名古屋市", options: groups["名古屋市"].sort(sortByKana) },
      { label: "その他", options: groups["その他"].sort(sortByKana) },
    ].filter((g) => g.options.length > 0); // 空グループは非表示

    return result;
  }, [records, jaCollator]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>(); // id -> name
    records.forEach((r) => {
      if (r.asigned_jisseki_staff_id && r.asigned_jisseki_staff_name) {
        map.set(r.asigned_jisseki_staff_id, r.asigned_jisseki_staff_name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [records]);

  const teamOptions = useMemo(() => {
    const map = new Map<string, string>(); // id -> name
    records.forEach((r) => {
      if (r.asigned_org_id && r.asigned_org_name) {
        map.set(r.asigned_org_id, r.asigned_org_name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }, [records]);

  // ② 各種フィルタ（年月・サービス・地域 + 検索条件）をかけた後のリスト
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      if (
        filterKaipokeCsId &&
        normCsId(r.kaipoke_cs_id) !== normCsId(filterKaipokeCsId)
      ) return false;
      if (filterStaffId && r.asigned_jisseki_staff_id !== filterStaffId) return false;

      // ★追加：チームで絞り込み
      if (filterTeamId && r.asigned_org_id !== filterTeamId) return false;

      // if (filterKaipokeId && !r.kaipoke_cs_id.includes(filterKaipokeId)) return false;

      // if (filterIdo && !(r.ido_jukyusyasho ?? "").includes(filterIdo)) return false;

      return true;
    });
  }, [records, filterKaipokeCsId, filterStaffId, filterTeamId]);

  // ★追加：一括印刷対象（表示中の利用者を重複なしで集める）
  const bulkClientIds = useMemo(() => {
    const set = new Set<string>();
    filteredRecords.forEach((r) => {
      const id = normCsId(r.kaipoke_cs_id);
      if (id) set.add(id);
    });
    return Array.from(set);
  }, [filteredRecords]);

  // 件数はフィルタ後を表示
  // ===== ユニーク利用者数（kaipoke_cs_id）でカウントする =====
  const uniqCountByService = (svc: string) => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.kaipoke_servicek === svc && r.kaipoke_cs_id) {
        set.add(r.kaipoke_cs_id);
      }
    });
    return set.size;
  };

  const uniqCount = (rows: Row[]) => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.kaipoke_cs_id) set.add(r.kaipoke_cs_id);
    });
    return set.size;
  };

  const uniqCheckedCount = (rows: Row[]) => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.kaipoke_cs_id && r.is_checked) set.add(r.kaipoke_cs_id);
    });
    return set.size;
  };

  // ★サービス別「件数」（利用者数）
  const countShogai = uniqCountByService("障害");
  const countIdo = uniqCountByService("移動支援");

  // ★「全て」の件数は障害＋移動支援（利用者数）
  const totalCount =
    kaipokeServicek === ""
      ? countShogai + countIdo
      : uniqCount(records);

  // ★表示中・回収済も利用者数で統一
  const filteredCount = uniqCount(filteredRecords);
  const checkedCount = uniqCheckedCount(filteredRecords);


  /** District 選択肢取得 */
  const fetchDistricts = async () => {
    try {
      const res = await fetch("/api/postal-districts", { method: "GET" });
      if (!res.ok) throw new Error("failed");
      const rows: DistrictRow[] = await res.json();
      const uniq = Array.from(
        new Set(
          rows
            .map((r) => (r.district ?? "").trim())
            .filter((d) => d.length > 0)
        )
      ).sort((a, b) => a.localeCompare(b, "ja"));
      setAllDistricts(uniq);
    } catch {
      console.error("Failed to fetch districts");
    }
  };

  /** ビューからデータ取得（Server 絞り込み＋Client 最終ソート） */
  const fetchRecords = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch("/api/disability-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        // cookies を使う運用に将来寄せる場合に備えて入れておいてもOK
        credentials: "same-origin",
        body: JSON.stringify({
          yearMonth,
          kaipokeServicek,
          districts,
          staffId:
            (isManager || isAdmin)
              ? (filterStaffId || null)
              : myUserId,
          kaipoke_cs_id: filterKaipokeCsId || null,
        }),
      });
      if (!res.ok) throw new Error("failed");
      const rows: Row[] = await res.json();

      // ★追加：五十音順比較のための正規化
      const norm = (s: string) =>
        (s ?? "")
          .normalize("NFKC")          // 全角半角などを揃える
          .replace(/[\s　]+/g, "")    // 半角/全角スペース除去
          .trim();

      // ★追加：カタカナ→ひらがな（全角範囲）
      // ※NFKC後なので半角カナの揺れも減ります
      const kanaKey = (s: string) =>
        norm(s).replace(/[\u30A1-\u30F6]/g, (ch) =>
          String.fromCharCode(ch.charCodeAt(0) - 0x60)
        );

      // ★追加：日本語の並び替えを明示
      const jaCollator = new Intl.Collator("ja", {
        usage: "sort",
        sensitivity: "base",
        ignorePunctuation: true,
        numeric: false,
      });

      // ★置換：春日井→名古屋市→その他、同エリア内は五十音順
      rows.sort((a, b) => {
        const areaRank = (d?: string | null) => {
          const s = norm(d ?? "");
          if (s.includes("春日井")) return 0;
          if (s.includes("名古屋")) return 1;
          return 2;
        };

        const ra = areaRank(a.district);
        const rb = areaRank(b.district);
        if (ra !== rb) return ra - rb;

        const ak = kanaKey(a.client_kana ?? a.client_name ?? "");
        const bk = kanaKey(b.client_kana ?? b.client_name ?? "");
        const byName = jaCollator.compare(ak, bk);

        if (byName !== 0) return byName;

        // 同名安定化
        return norm(a.kaipoke_cs_id ?? "").localeCompare(norm(b.kaipoke_cs_id ?? ""), "ja");
      });

      setRecords(rows);
    } catch {
      console.error("Failed to fetch records");
      setRecords([]);
    }
  };

  /** ✅ チェック更新 */
  const handleCheckChange = async (row: Row, checked: boolean) => {
    // 先に画面を更新（楽観的）
    setRecords((prev) =>
      prev.map((r) =>
        r.kaipoke_cs_id === row.kaipoke_cs_id &&
          r.year_month === row.year_month &&
          r.kaipoke_servicek === row.kaipoke_servicek
          ? { ...r, is_checked: checked }
          : r
      )
    );
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch("/api/disability-check/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          check: checked,
          year_month: row.year_month,
          kaipoke_servicek: row.kaipoke_servicek,
          kaipoke_cs_id: row.kaipoke_cs_id,
        }),
      });

      // ★重要：非2xxを失敗扱いにする
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`update failed: ${res.status} ${t}`);
      }
    } catch {
      // 失敗時は元に戻す
      setRecords((prev) =>
        prev.map((r) =>
          r.kaipoke_cs_id === row.kaipoke_cs_id &&
            r.year_month === row.year_month &&
            r.kaipoke_servicek === row.kaipoke_servicek
            ? { ...r, is_checked: !checked }
            : r
        )
      );
    }
  };

  /** ③ 提出フラグ 更新 */
  const handleSubmitChange = async (row: Row, submitted: boolean) => {
    // 楽観的更新
    setRecords((prev) =>
      prev.map((r) =>
        r.kaipoke_cs_id === row.kaipoke_cs_id &&
          r.year_month === row.year_month &&
          r.kaipoke_servicek === row.kaipoke_servicek
          ? { ...r, is_submitted: submitted }
          : r
      )
    );
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const res = await fetch("/api/disability-check/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: "same-origin",
        body: JSON.stringify({
          submitted,
          year_month: row.year_month,
          kaipoke_servicek: row.kaipoke_servicek,
          kaipoke_cs_id: row.kaipoke_cs_id,
        }),
      });

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`update failed: ${res.status} ${t}`);
      }
    } catch {
      // 失敗時は元に戻す
      setRecords((prev) =>
        prev.map((r) =>
          r.kaipoke_cs_id === row.kaipoke_cs_id &&
            r.year_month === row.year_month &&
            r.kaipoke_servicek === row.kaipoke_servicek
            ? { ...r, is_submitted: !submitted }
            : r
        )
      );
    }
  };

  /** 受給者証番号 更新 */
  const handleIdoChange = async (row: Row, value: string) => {
    setRecords((prev) =>
      prev.map((r) =>
        r.kaipoke_cs_id === row.kaipoke_cs_id ? { ...r, ido_jukyusyasho: value } : r
      )
    );
    try {
      await fetch("/api/disability-check/update-ido-jukyusyasho", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.kaipoke_cs_id, idoJukyusyasho: value }),
      });
    } catch {
      console.error("Failed to update ido_jukyusyasho");
    }
  };

  // ★追加：表示中（=担当分）の利用者をまとめて一括印刷
  const handleBulkPrint = () => {
    const payload = {
      month: yearMonth,
      clientIds: bulkClientIds, // 表示されている利用者の ID を渡す
    };

    // データを localStorage に保存
    localStorage.setItem("jisseki_bulk_print", JSON.stringify(payload));

    // 一括印刷ページ（新規追加）を別タブで開く
    window.open(
      `/portal/jisseki/print/bulk?month=${encodeURIComponent(yearMonth)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // ★追加：ログインユーザーの system_role を取得して権限判定
  useEffect(() => {
    const loadRole = async () => {
      try {
        // 1) ログインユーザーを取得（user を正しく取り出す）
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) {
          setIsAdmin(false);
          setIsManager(false);
          setMyUserId("");
          return;
        }

        const authUserId = userData.user.id;

        // 2) role を view から取得（data/error の名前衝突を避ける）
        // 2) まず single を試す
        const { data: roleRow1, error: roleErr1 } = await supabase
          .from("user_entry_united_view_single")
          .select("system_role,user_id")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        let roleRow = roleRow1;
        let roleErr = roleErr1;

        // 3) single が取れない/ user_id が空なら、fallback で united_view を試す
        if (!roleErr && (!roleRow?.user_id || !roleRow?.system_role)) {
          const { data: roleRow2, error: roleErr2 } = await supabase
            .from("user_entry_united_view")
            .select("system_role,user_id")
            .eq("auth_user_id", authUserId)
            .maybeSingle();

          roleRow = roleRow2;
          roleErr = roleErr2;
        }

        if (roleErr || !roleRow?.user_id) {
          console.error("Failed to load system_role (no row)", roleErr);
          setIsAdmin(false);
          setIsManager(false);
          setMyUserId("");
          return;
        }

        const role = String(roleRow.system_role ?? "").trim().toLowerCase();

        const isAdminRole = role === "admin" || role === "super_admin";
        // ★ manager 系ロール（senior_manager 等）をまとめて拾う
        const isManagerRole = isAdminRole || role.includes("manager");

        setIsAdmin(isAdminRole);
        setIsManager(isManagerRole);
        setMyUserId(String(roleRow.user_id));

      } catch (e) {
        console.error("Failed to determine role", e);
        setIsAdmin(false);
        setIsManager(false);
        setMyUserId("");
      }
    };

    loadRole();
  }, []);

  // ★追加⑤：URL（クエリ）→ state 初期反映
  useEffect(() => {
    if (didInitFromUrl) return;

    // role 取得が終わるまで待つ
    if (!myUserId && !isManager && !isAdmin) return;

    const cs =
      searchParams.get("kaipoke_cs_id") ??
      searchParams.get("cs") ??
      "";

    setFilterKaipokeCsId(cs);

    if (isManager || isAdmin) {
      // manager / admin は URL 指定を尊重
      const staff =
        searchParams.get("user_id") ??
        searchParams.get("staffId") ??
        "";
      setFilterStaffId(staff);
    } else {
      // member は常に自分固定
      setFilterStaffId(myUserId);
    }

    setDidInitFromUrl(true);
  }, [didInitFromUrl, searchParams, isManager, isAdmin, myUserId]);

  // ★追加⑥：state → URL（クエリ）同期
  useEffect(() => {
    if (!didInitFromUrl) return;

    const qp = new URLSearchParams();

    // 共通：年月・サービス・チーム・地域
    if (yearMonth) qp.set("ym", yearMonth);
    if (kaipokeServicek) qp.set("svc", kaipokeServicek); // ""(全て)は省略
    if (filterTeamId) qp.set("team", filterTeamId);
    if (districts[0]) qp.set("dist", districts[0]);

    // 利用者（新キーに統一）
    if (filterKaipokeCsId) qp.set("kaipoke_cs_id", filterKaipokeCsId);

    // 実績担当者
    if (!(isManager || isAdmin)) {
      // member は常に自分固定
      if (myUserId) qp.set("user_id", myUserId);
    } else {
      // manager/admin は選択されているときだけURLに出す（未選択=全件）
      if (filterStaffId) qp.set("user_id", filterStaffId);
    }

    // manager/admin は staffId を qp に入れない（= URL から消える）
    const next = qp.toString();
    const nextUrl = next ? `${pathname}?${next}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [
    didInitFromUrl,
    yearMonth,
    kaipokeServicek,
    filterTeamId,
    districts,
    filterKaipokeCsId,   // ★追加
    filterStaffId,      // ★追加
    isManager,
    myUserId,
    pathname,
    router,
  ]);

  /** 初回：District候補だけロード */
  useEffect(() => {
    fetchDistricts();
  }, []);

  /** フィルタ変更で再読込 */
  useEffect(() => {
    fetchRecords();
  }, [yearMonth, kaipokeServicek, districts, filterStaffId, filterKaipokeCsId]);

  return (
    <div>
      <h1>実績記録チェック</h1>
      <p style={{ color: "red", marginTop: 4, marginBottom: 12 }}>
        実績担当者は、直近で１番シフトに入っている人を割り当てて、毎月20日に自動更新されています。
      </p>

      {/* 件数表示 */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ marginRight: 16 }}>件数：{totalCount}</span>
        <span style={{ marginRight: 16 }}>表示中：{filteredCount}</span>
        <span>回収済：{checkedCount}</span>
      </div>

      {/* ★追加：admin, manager, member 向け 一括印刷ボタン */}
      {(isAdmin || isManager || !(isManager || isAdmin)) && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={handleBulkPrint}
            disabled={bulkClientIds.length === 0}
            style={{
              padding: "8px 12px",
              border: "1px solid #999",
              borderRadius: 6,
              background: bulkClientIds.length ? "#fff" : "#f5f5f5",
              cursor: bulkClientIds.length ? "pointer" : "not-allowed",
            }}
          >
            担当分を一括印刷（{bulkClientIds.length}名）
          </button>
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            表示中の担当利用者をまとめて印刷します（別タブで印刷画面が開きます）
          </div>
        </div>
      )}

      {/* フィルタ：横並び・幅180 */}
      <div className="filters" style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12 }}>
        <label style={{ width: 180 }}>
          年月
          <select
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            style={{ width: 180 }}
          >
            {yearMonthOptions.map((ym) => (
              <option key={ym} value={ym}>
                {ym}
              </option>
            ))}
          </select>
        </label>

        <label style={{ width: 180 }}>
          サービス
          <select
            value={kaipokeServicek}
            onChange={(e) => {
              const v = e.target.value;
              setKaipokeServicek(v);

              // ★追加：サービス切替時に検索条件をリセット（これが効きます）
              setFilterKaipokeCsId("");
              setFilterStaffId((isManager || isAdmin) ? "" : myUserId);
              setFilterTeamId("");
              setDistricts([]);
            }}
            style={{ width: 180 }}
          >
            <option value="">（全て）</option>
            <option value="障害">障害</option>
            <option value="移動支援">移動支援</option>
          </select>
        </label>

        <label style={{ width: 180 }}>
          地域（複数可）
          <select
            value={districts[0] ?? ""} // 1件目 or 全て
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                // 全件
                setDistricts([]);
              } else {
                setDistricts([v]); // 1件だけ選択
              }
            }}
            style={{ width: 180 }}
          >
            <option value="">（全て）</option>
            {allDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ② 追加の検索欄 */}
      <div
        style={{
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <label style={{ width: 180 }}>
          利用者名
          <select
            value={filterKaipokeCsId}
            onChange={(e) => setFilterKaipokeCsId(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="">（全て）</option>
            {clientGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label style={{ width: 220 }}>
          実績担当者
          <select
            value={filterStaffId}
            disabled={isMember} // ★memberのみ無効
            onChange={(e) => {
              if (isMember) return;
              setFilterStaffId(e.target.value);
            }}
            style={{ width: 220 }}
          >
            <option value="">（全て）</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* ★追加：チーム名検索 */}
        <label style={{ width: 220 }}>
          チーム名
          <select
            value={filterTeamId}
            onChange={(e) => setFilterTeamId(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">（全て）</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {/*
<label style={{ width: 180 }}>
  カイポケID
  <input
    type="text"
    value={filterKaipokeId}
    onChange={(e) => setFilterKaipokeId(e.target.value)}
    style={{ width: 180 }}
  />
</label>

<label style={{ width: 180 }}>
  受給者証番号
  <input
    type="text"
    value={filterIdo}
    onChange={(e) => setFilterIdo(e.target.value)}
    style={{ width: 180 }}
  />
</label>
*/}

      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>地域</th>
            <th style={{ textAlign: "left", padding: 8 }}>カイポケID</th>
            <th style={{ textAlign: "left", padding: 8 }}>利用者名</th>
            <th style={{ textAlign: "left", padding: 8 }}>受給者証番号</th>
            <th style={{ textAlign: "left", padding: 8 }}>実績担当者</th>
            <th style={{ textAlign: "left", padding: 8 }}>チーム名</th> {/* ★追加 */}
            <th style={{ textAlign: "center", padding: 8, width: 80 }}>提出✅</th>
            <th style={{ textAlign: "center", padding: 8, width: 80 }}>回収✅</th>
          </tr>
        </thead>
        <tbody>
          {filteredRecords.map((r) => {
            const key = `${r.kaipoke_cs_id}-${r.year_month}-${r.kaipoke_servicek}`;
            return (
              <tr key={key} style={{ verticalAlign: "middle" }}>
                <td style={{ padding: 8 }}>{r.district ?? "-"}</td>
                <td style={{ padding: 8 }}>{r.kaipoke_cs_id}</td>

                {/* ★追加：利用者名を印刷ページへのリンクにする */}
                <td style={{ padding: 8 }}>
                  <Link
                    href={`/portal/jisseki/print?kaipoke_cs_id=${encodeURIComponent(
                      r.kaipoke_cs_id
                    )}&month=${encodeURIComponent(r.year_month)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline"
                  >
                    {r.client_name}
                  </Link>
                </td>

                <td style={{ padding: 8 }}>
                  <input
                    type="text"
                    value={r.ido_jukyusyasho ?? ""}
                    onChange={(e) => handleIdoChange(r, e.target.value)}
                    style={{
                      height: 28,
                      lineHeight: "28px",
                      padding: "2px 6px",
                      boxSizing: "border-box",
                      width: "100%",
                    }}
                  />
                </td>
                {/* ① 実績担当者表示 */}
                <td style={{ padding: 8 }}>
                  {r.asigned_jisseki_staff_id ? (
                    <a
                      href={`/portal/disability-check?ym=${encodeURIComponent(
                        yearMonth
                      )}&user_id=${encodeURIComponent(r.asigned_jisseki_staff_id)}`}
                      className="text-blue-600 underline"
                      onClick={(e) => {
                        e.preventDefault(); // ★URLだけ変わって表示が変わらないのを防ぐ
                        handleClickStaff(r.asigned_jisseki_staff_id!);
                      }}
                    >
                      {r.asigned_jisseki_staff_name ?? r.asigned_jisseki_staff_id}
                    </a>
                  ) : (
                    <span>-</span>
                  )}
                </td>

                {/* ★追加：チーム名 */}
                <td style={{ padding: 8 }}>
                  {r.asigned_org_name ?? "-"}
                </td>

                {/* ③ 提出チェックボックス */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!r.is_submitted}
                    onChange={(e) => handleSubmitChange(r, e.target.checked)}
                    style={{ display: "inline-block" }}
                  />
                </td>
                {/* 既存：回収チェックボックス */}
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!r.is_checked}
                    disabled={isMember} // ★memberのみ無効
                    onChange={(e) => {
                      if (isMember) return;
                      handleCheckChange(r, e.target.checked);
                    }}
                    style={{ display: "inline-block" }}
                  />
                </td>
              </tr>
            );
          })}
          {records.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: "center", padding: 12 }}>
                該当データがありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DisabilityCheckPage;
