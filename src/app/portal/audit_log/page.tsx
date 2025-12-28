"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AuditLogRow = {
  audit_id: string;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  created_at: string;

  request_path: string | null;
  changed_cols: string[] | null;

  // actor（業務用 user_id）
  actor_user_id_text: string | null;

  // shift（※すべて最新値）
  shift_id: string | null;
  cs_name: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;
};

function toJstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(false);

  // filters（actor は user_id）
  const [filterActorUserId, setFilterActorUserId] = useState("");
  const [filterCsName, setFilterCsName] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchRows = async () => {
    setLoading(true);

    let q = supabase
      .from("audit_log_display_view")
      .select("*")
      .order("created_at", { ascending: false });

    if (filterActorUserId.trim()) {
      q = q.eq("actor_user_id_text", filterActorUserId.trim());
    }

    if (filterCsName.trim()) {
      q = q.ilike("cs_name", `%${filterCsName.trim()}%`);
    }

    if (filterDateFrom) {
      q = q.gte("created_at", `${filterDateFrom}T00:00:00+09:00`);
    }
    if (filterDateTo) {
      q = q.lt("created_at", `${filterDateTo}T24:00:00+09:00`);
    }

    const { data } = await q;
    setRows((data ?? []) as AuditLogRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">監査ログ</h1>

      {/* 注意書き */}
      <div className="text-sm text-red-600 font-semibold">
        * 開始日・利用者名・staff_01・service_code・開始時刻 等は  
        最新のシフトデータを表示しており、変更時の値ではありません。
      </div>

      {/* Filters */}
      <div className="border p-3 rounded space-y-2">
        <div className="grid grid-cols-4 gap-2">
          <input
            className="border px-2 py-1"
            placeholder="actor user_id"
            value={filterActorUserId}
            onChange={(e) => setFilterActorUserId(e.target.value)}
          />
          <input
            className="border px-2 py-1"
            placeholder="利用者名"
            value={filterCsName}
            onChange={(e) => setFilterCsName(e.target.value)}
          />
          <input
            type="date"
            className="border px-2 py-1"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
          />
          <input
            type="date"
            className="border px-2 py-1"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
          />
        </div>

        <button
          className="border px-3 py-1"
          onClick={() => void fetchRows()}
          disabled={loading}
        >
          検索
        </button>
      </div>

      {/* Table */}
      <div className="border rounded overflow-auto">
        <table className="min-w-[1400px] text-sm w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 border-b">created_at</th>
              <th className="p-2 border-b">actor</th>
              <th className="p-2 border-b">path</th>
              <th className="p-2 border-b">shift_id</th>

              <th className="p-2 border-b text-red-600">利用者名 *</th>
              <th className="p-2 border-b text-red-600">開始日 *</th>
              <th className="p-2 border-b text-red-600">開始 *</th>
              <th className="p-2 border-b text-red-600">service_code *</th>
              <th className="p-2 border-b text-red-600">staff_01 *</th>

              <th className="p-2 border-b">changed_cols</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.audit_id} className="hover:bg-gray-50">
                <td className="p-2 border-b">{toJstDateTime(r.created_at)}</td>
                <td className="p-2 border-b">{r.actor_user_id_text ?? ""}</td>
                <td className="p-2 border-b">{r.request_path ?? ""}</td>
                <td className="p-2 border-b">{r.shift_id ?? ""}</td>

                <td className="p-2 border-b">{r.cs_name ?? ""}</td>
                <td className="p-2 border-b">{r.shift_start_date ?? ""}</td>
                <td className="p-2 border-b">{r.shift_start_time ?? ""}</td>
                <td className="p-2 border-b">{r.service_code ?? ""}</td>
                <td className="p-2 border-b">{r.staff_01_user_id ?? ""}</td>

                <td className="p-2 border-b">
                  {(r.changed_cols ?? []).join(", ")}
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4 text-center">
                  データなし
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
