//portal/disability-check/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ビュー行の型（disability_check_view の列に一致） */
interface Row {
  kaipoke_cs_id: string;
  client_name: string;
  year_month: string;         // YYYY-MM
  kaipoke_servicek: string;   // 例: "障害" | "移動支援"
  ido_jukyusyasho: string | null;
  is_checked: boolean | null;
  district: string | null;
}

/** postal_district API の型 */
interface DistrictRow {
  postal_code_3: string;
  district: string | null;
}

/** 前月 YYYY-MM を作る（ローカルTZでOK） */
const getPrevMonth = (): string => {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

/** 過去5年〜将来6ヶ月の YYYY-MM リストを作成（前月を初期選択に使う） */
const buildYearMonthOptions = (): string[] => {
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const list: string[] = [];
  // 過去60ヶ月（5年）〜将来6ヶ月
  for (let offset = -60; offset <= 6; offset++) {
    const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    list.push(`${y}-${m}`);
  }
  // 新しい月が最後に来る並びは使いづらいので降順にする（任意）
  return list.sort().reverse();
};

const DisabilityCheckPage: React.FC = () => {
  // ② 初期は「前月」を選択
  const [yearMonth, setYearMonth] = useState<string>(getPrevMonth());
  // ① 初期は「障害」
  const [kaipokeServicek, setKaipokeServicek] = useState<string>("障害");
  // ③ 初期は district 未選択（＝全件）
  const [districts, setDistricts] = useState<string[]>([]);

  const [records, setRecords] = useState<Row[]>([]);
  const [allDistricts, setAllDistricts] = useState<string[]>([]);
  const yearMonthOptions = useMemo(buildYearMonthOptions, []);

  /** district 一覧の取得（重複 district をユニーク化） */
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

  /** ビューからデータ取得（filter: yearMonth, kaipokeServicek, districts） */
  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/disability-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yearMonth,
          kaipokeServicek,
          districts, // [] のときはAPI側で全件扱い
        }),
      });
      if (!res.ok) throw new Error("failed");
      const rows: Row[] = await res.json();
      setRecords(rows);
    } catch {
      console.error("Failed to fetch records");
    }
  };

  /** ✅チェック更新（disability_check へ upsert） */
  const handleCheckChange = async (row: Row, checked: boolean) => {
    try {
      await fetch("/api/disability-check/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // view には id が無いので「複合キー」で upsert させる
          check: checked,
          year_month: row.year_month,
          kaipoke_servicek: row.kaipoke_servicek,
          kaipoke_cs_id: row.kaipoke_cs_id,
        }),
      });
      setRecords((prev) =>
        prev.map((r) =>
          r.kaipoke_cs_id === row.kaipoke_cs_id &&
          r.year_month === row.year_month &&
          r.kaipoke_servicek === row.kaipoke_servicek
            ? { ...r, is_checked: checked }
            : r
        )
      );
    } catch {
      // エラー時は表示だけ戻す
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

  /** 受給者証番号更新（cs_kaipoke_info を更新） */
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
        body: JSON.stringify({
          id: row.kaipoke_cs_id,
          idoJukyusyasho: value,
        }),
      });
    } catch {
      console.error("Failed to update ido_jukyusyasho");
    }
  };

  /** フィルタ変更で再取得 */
  useEffect(() => {
    fetchRecords();
  }, [yearMonth, kaipokeServicek, districts]);

  /** 初回：district 一覧だけ別でロード（全件表示のまま） */
  useEffect(() => {
    fetchDistricts();
  }, []);

  return (
    <div>
      <h1>実績記録チェック</h1>

      {/* ④ 横並び&幅180px */}
      <div className="filters" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
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

      <table>
        <thead>
          <tr>
            <th>地域</th>
            <th>カイポケID</th>
            <th>利用者名</th>
            <th>受給者証番号</th>
            <th>回収✅</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const key = `${r.kaipoke_cs_id}-${r.year_month}-${r.kaipoke_servicek}`;
            return (
              <tr key={key}>
                <td>{r.district ?? "-"}</td>
                <td>{r.kaipoke_cs_id}</td>
                <td>{r.client_name}</td>
                <td>
                  <input
                    type="text"
                    value={r.ido_jukyusyasho ?? ""}
                    onChange={(e) => handleIdoChange(r, e.target.value)}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!r.is_checked}
                    onChange={(e) => handleCheckChange(r, e.target.checked)}
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
