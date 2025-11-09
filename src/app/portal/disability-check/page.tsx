//portal/disability-check/page.tsx
"use client";

import React, { useState, useEffect } from "react";

// district の型を定義
interface District {
  postal_code_3: string;  // 郵便番号の上3桁
  district: string;  // 地域名
}

// Record 型を定義
interface Record {
  id: string;
  name: string;
  ido_jukyusyasho: string;
  is_checked: boolean;
  district: string;
}

const DisabilityCheckPage = () => {
  const [yearMonth, setYearMonth] = useState<string>("2025-11"); // 初期年月
  const [kaipokeServicek, setKaipokeServicek] = useState<string>("障害"); // 初期サービス
  const [districts, setDistricts] = useState<string[]>([]); // 選択されたdistricts
  const [allDistricts, setAllDistricts] = useState<District[]>([]); // 利用可能な地域リスト（型定義）
  const [records, setRecords] = useState<Record[]>([]); // 利用者リストの型を指定

  // 年月のリストを生成する関数
  const generateYearMonthOptions = () => {
    const months: string[] = [];
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();  // 月は0から始まるのでそのまま

    // 過去5年と将来6ヶ月分を生成
    for (let i = -5; i <= 6; i++) {
      const targetDate = new Date(currentYear, currentMonth + i, 1);
      const formattedMonth = targetDate.toISOString().slice(0, 7);  // YYYY-MM形式
      months.push(formattedMonth);
    }

    return months;
  };

  // 地域を取得する関数
  const fetchDistricts = async () => {
    const response = await fetch("/api/postal-district");  // 地域のAPI
    if (response.ok) {
      const data: District[] = await response.json();  // 型指定してデータを取得
      setAllDistricts(data);  // 地域データをセット
    } else {
      console.error("Failed to fetch districts");
    }
  };

  // 実績記録を取得する関数
  const fetchRecords = async () => {
    const response = await fetch(`/api/disability-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ yearMonth, kaipokeServicek, districts }),
    });

    if (response.ok) {
      const data = await response.json();
      setRecords(data); // 型がRecord[]なのでそのままセット
    } else {
      console.error("Failed to fetch records");
    }
  };

  // チェックボックスの変更を処理
  const handleCheckChange = async (id: string, check: boolean) => {
    await fetch(`/api/disability-check/update`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, check }),
    });

    setRecords((prev) =>
      prev.map((record) =>
        record.id === id ? { ...record, is_checked: check } : record
      )
    );
  };

  // 受給者証番号の変更
  const handleIjoJukyusyashoChange = async (id: string, value: string) => {
    await fetch(`/api/disability-check/update-ido-jukyusyaho`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, idoJukyusyasho: value }),
    });

    setRecords((prev) =>
      prev.map((record) =>
        record.id === id ? { ...record, ido_jukyusyasho: value } : record
      )
    );
  };

  // 地域選択の変更
  const handleDistrictChange = (selectedDistricts: string[]) => {
    setDistricts(selectedDistricts);
  };

  // 初期データを取得
  useEffect(() => {
    fetchDistricts(); // 地域データを取得
    fetchRecords();   // 実績記録データを取得
  }, [yearMonth, kaipokeServicek, districts]);

  return (
    <div>
      <h1>実績記録チェック</h1>
      <div className="filters" style={{ display: "flex", gap: "20px" }}>
        <label style={{ width: "180px" }}>
          年月:
          <select
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            style={{ width: "180px" }}
          >
            {generateYearMonthOptions().map((month, index) => (
              <option key={index} value={month}>
                {month}
              </option>
            ))}
          </select>
        </label>

        <label style={{ width: "180px" }}>
          サービス:
          <select
            value={kaipokeServicek}
            onChange={(e) => setKaipokeServicek(e.target.value)}
            style={{ width: "180px" }}
          >
            <option value="障害">障害</option>
            <option value="移動支援">移動支援</option>
          </select>
        </label>

        <label style={{ width: "180px" }}>
          地域:
          <select
            multiple
            value={districts}
            onChange={(e) =>
              handleDistrictChange([...e.target.selectedOptions].map(option => option.value))
            }
            style={{ width: "180px" }}
          >
            {allDistricts.map((district, index) => (
              <option key={index} value={district.district}>
                {district.district}
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
          {records.map((record) => (
            <tr key={record.id}>
              <td>{record.district}</td>
              <td>{record.id}</td>
              <td>{record.name}</td>
              <td>
                <input
                  type="text"
                  value={record.ido_jukyusyasho}
                  onChange={(e) =>
                    handleIjoJukyusyashoChange(record.id, e.target.value)
                  }
                />
              </td>
              <td>
                <input
                  type="checkbox"
                  checked={record.is_checked || false}
                  onChange={(e) =>
                    handleCheckChange(record.id, e.target.checked)
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DisabilityCheckPage;
