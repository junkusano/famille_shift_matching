//portal/disability-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/** ビュー行の型（disability_check_view の列名に一致） */
interface Row {
  kaipoke_cs_id: string;
  client_name: string;
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
  // ① 初期フィルタ：前月 × 障害
  const [yearMonth, setYearMonth] = useState<string>(getPrevMonth());
  const [kaipokeServicek, setKaipokeServicek] = useState<string>(""); // （全て）
  // ③ Districtは未選択（全件）
  const [districts, setDistricts] = useState<string[]>([]);

  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const yearMonthOptions = useMemo(buildYearMonthOptions, []);

  // ② 検索用ステート
  const [filterClientName, setFilterClientName] = useState<string>("");    // 利用者名（Select）
  const [filterStaffId, setFilterStaffId] = useState<string>("");          // 実績担当者（Select）
  //const [filterKaipokeId, setFilterKaipokeId] = useState<string>("");      // カイポケID（Text）
  //const [filterIdo, setFilterIdo] = useState<string>("");                  // 受給者証番号（Text）
  const [filterTeamId, setFilterTeamId] = useState<string>("");
  const [isManager, setIsManager] = useState<boolean>(false);

  // ② Selectbox 用の選択肢
  const clientNameOptions = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.client_name) set.add(r.client_name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [records]);

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
      if (filterClientName && r.client_name !== filterClientName) return false;

      if (filterStaffId && r.asigned_jisseki_staff_id !== filterStaffId) return false;

      // ★追加：チームで絞り込み
      if (filterTeamId && r.asigned_org_id !== filterTeamId) return false;

      // if (filterKaipokeId && !r.kaipoke_cs_id.includes(filterKaipokeId)) return false;

      // if (filterIdo && !(r.ido_jukyusyasho ?? "").includes(filterIdo)) return false;

      return true;
    });
  }, [records, filterClientName, filterStaffId, filterTeamId]);

  // 件数はフィルタ後を表示
  const totalCount = records.length;              // 全件（APIから来た件数）
  const filteredCount = filteredRecords.length;   // 表示中（絞り込み後）
  const checkedCount = filteredRecords.filter((r) => !!r.is_checked).length; // 回収済（表示中の中で）


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
      const res = await fetch("/api/disability-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yearMonth, kaipokeServicek, districts }),
      });
      if (!res.ok) throw new Error("failed");
      const rows: Row[] = await res.json();

      // 念のためクライアント側でも district → client_name で昇順
      rows.sort((a, b) => {
        const da = (a.district ?? "");
        const db = (b.district ?? "");
        const byDistrict = da.localeCompare(db, "ja");
        if (byDistrict !== 0) return byDistrict;
        return (a.client_name ?? "").localeCompare(b.client_name ?? "", "ja");
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
      await fetch("/api/disability-check/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          check: checked,
          year_month: row.year_month,
          kaipoke_servicek: row.kaipoke_servicek,
          kaipoke_cs_id: row.kaipoke_cs_id,
        }),
      });
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
      await fetch("/api/disability-check/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submitted,
          year_month: row.year_month,
          kaipoke_servicek: row.kaipoke_servicek,
          kaipoke_cs_id: row.kaipoke_cs_id,
        }),
      });
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

  // ★追加：ログインユーザーの system_role を取得してマネージャー判定
  useEffect(() => {
    const loadRole = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const authUserId = sess.session?.user?.id;

        if (!authUserId) {
          setIsManager(false);
          return;
        }

        const { data, error } = await supabase
          .from("user_entry_united_view")
          .select("system_role")
          .eq("auth_user_id", authUserId)
          .maybeSingle();

        if (error) {
          console.error("Failed to load system_role", error);
          setIsManager(false);
          return;
        }

        const role = String(data?.system_role ?? "").toLowerCase();

        // ★ここは環境の role 値に合わせて調整してください
        // 例: "manager" / "admin" / "member" など
        setIsManager(role === "manager" || role === "admin");
      } catch (e) {
        console.error("Failed to determine role", e);
        setIsManager(false);
      }
    };

    loadRole();
  }, []);

  /** 初回：District候補だけロード */
  useEffect(() => {
    fetchDistricts();
  }, []);

  /** フィルタ変更で再読込 */
  useEffect(() => {
    fetchRecords();
  }, [yearMonth, kaipokeServicek, districts]);

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
              setFilterClientName("");
              setFilterStaffId("");
              setFilterTeamId("");
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
            value={filterClientName}
            onChange={(e) => setFilterClientName(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="">（全て）</option>
            {clientNameOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ width: 220 }}>
          実績担当者
          <select
            value={filterStaffId}
            onChange={(e) => setFilterStaffId(e.target.value)}
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
                <td style={{ padding: 8 }}>{r.client_name}</td>
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
                  {r.asigned_jisseki_staff_name ?? "-"}
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
                    disabled={!isManager}
                    onChange={(e) => {
                      if (!isManager) return;
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
