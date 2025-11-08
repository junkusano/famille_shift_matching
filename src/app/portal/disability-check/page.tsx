//portal/disability-check/page.tsx
"use client";

import React, { useState, useEffect } from "react";

// Record 型を定義
interface Record {
  id: string;
  name: string;
  ido_jukyusyasho: string;
  is_checked: boolean;
}

const DisabilityCheckPage = () => {
  const [yearMonth, setYearMonth] = useState<string>("2025-11"); // 初期年月
  const [kaipokeServicek, setKaipokeServicek] = useState<string>("障害"); // 初期サービス
  const [records, setRecords] = useState<Record[]>([]); // 利用者リストの型を指定

  const fetchRecords = async () => {
    const response = await fetch(`/api/disability-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ yearMonth, kaipokeServicek }),
    });

    if (response.ok) {
      const data = await response.json();
      setRecords(data); // 型がRecord[]なのでそのままセット
    } else {
      console.error("Failed to fetch records");
    }
  };

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

  const handleIjoJukyusyashoChange = async (id: string, value: string) => {
    await fetch(`/api/disability-check/update-ido-jukyusyasho`, {
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

  useEffect(() => {
    fetchRecords();
  }, [yearMonth, kaipokeServicek]);

  return (
    <div>
      <h1>実績記録チェック</h1>
      <div className="filters">
        <label>
          年月:
          <select
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          >
            <option value="2025-11">2025-11</option>
            <option value="2025-12">2025-12</option>
          </select>
        </label>

        <label>
          サービス:
          <select
            value={kaipokeServicek}
            onChange={(e) => setKaipokeServicek(e.target.value)}
          >
            <option value="障害">障害</option>
            <option value="移動支援">移動支援</option>
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th>利用者名</th>
            <th>移動受給者所</th>
            <th>チェック</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
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
