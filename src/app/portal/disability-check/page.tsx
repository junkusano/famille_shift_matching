//portal/disability-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ビュー行の型（disability_check_view の列名に一致） */
interface Row {
  kaipoke_cs_id: string;
  client_name: string;
  year_month: string;         // YYYY-MM
  kaipoke_servicek: string;   // "障害" | "移動支援" など
  ido_jukyusyasho: string | null;
  is_checked: boolean | null;
  district: string | null;
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
  const [kaipokeServicek, setKaipokeServicek] = useState<string>("障害");
  // ③ Districtは未選択（全件）
  const [districts, setDistricts] = useState<string[]>([]);

  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const yearMonthOptions = useMemo(buildYearMonthOptions, []);

  const totalCount = records.length;
  const checkedCount = records.filter((r) => !!r.is_checked).length;

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

      {/* 件数表示 */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ marginRight: 16 }}>件数：{totalCount}</span>
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
            onChange={(e) => setKaipokeServicek(e.target.value)}
            style={{ width: 180 }}
          >
            <option value="障害">障害</option>
            <option value="移動支援">移動支援</option>
          </select>
        </label>

        <label style={{ width: 180 }}>
          地域（複数可）
          <select
            multiple
            value={districts}
            onChange={(e) =>
              setDistricts(
                Array.from(e.currentTarget.selectedOptions).map((o) => o.value)
              )
            }
            style={{ width: 180, height: 120 }}
          >
            {allDistricts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>地域</th>
            <th style={{ textAlign: "left", padding: 8 }}>カイポケID</th>
            <th style={{ textAlign: "left", padding: 8 }}>利用者名</th>
            <th style={{ textAlign: "left", padding: 8 }}>受給者証番号</th>
            <th style={{ textAlign: "center", padding: 8, width: 80 }}>回収✅</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
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
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!r.is_checked}
                    onChange={(e) => handleCheckChange(r, e.target.checked)}
                    style={{ display: "inline-block" }}
                  />
                </td>
              </tr>
            );
          })}
          {records.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: "center", padding: 12 }}>
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
