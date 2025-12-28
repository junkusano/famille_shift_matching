"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AuditLogRow = {
  audit_id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  actor_user_id: string | null;
  request_path: string | null;
  changed_cols: string[] | null;
  created_at: string;

  // shift（※最新値）
  shift_id: string | null;
  kaipoke_cs_id: string | null;
  cs_name: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;

  // 不要だけど view には存在する想定（型崩れ防止で残してOK）
  staff_02_user_id?: string | null;
  staff_03_user_id?: string | null;
  shift_end_time?: string | null;

  // actor 表示は不要（フィルタは actor_user_id でやる）
  actor_user_id_text?: string | null;
  actor_last_name_kanji?: string | null;
  actor_first_name_kanji?: string | null;
};

function toJstDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default function AuditLogPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // filters
  const [filterActorUserId, setFilterActorUserId] = useState<string>("");
  const [filterCsName, setFilterCsName] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>(""); // YYYY-MM-DD
  const [filterDateTo, setFilterDateTo] = useState<string>(""); // YYYY-MM-DD

  const canSearch = useMemo(() => true, []);

  const fetchRows = async (): Promise<void> => {
    setLoading(true);
    setErrorText(null);

    try {
      let q = supabase
        .from("audit_log_display_view")
        .select("*")
        .order("created_at", { ascending: false });

      if (filterActorUserId.trim()) {
        q = q.eq("actor_user_id", filterActorUserId.trim());
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

      const { data, error } = await q;

      if (error) {
        setErrorText(error.message);
        setRows([]);
        return;
      }

      setRows((data ?? []) as AuditLogRow[]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setErrorText(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">監査ログ（audit_log）</h1>

      {/* ★ 注意書き（赤字・全体赤・*付き） */}
      <div className="rounded-md border p-3">
        <div className="text-sm text-red-600 font-semibold">
          <span className="mr-2">*</span>開始日・利用者名・staff_01・service_code・開始時刻 等は
          <span className="ml-2">*</span>
          <span className="ml-2">
            最新のシフトデータを表示しており、変更時の値ではありません。
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-md border p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">actor_user_id（uuid）</div>
            <input
              className="w-full border rounded px-2 py-1"
              value={filterActorUserId}
              onChange={(e) => setFilterActorUserId(e.target.value)}
              placeholder="例: 00000000-0000-0000-0000-000000000000"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">利用者名（cs_name）</div>
            <input
              className="w-full border rounded px-2 py-1"
              value={filterCsName}
              onChange={(e) => setFilterCsName(e.target.value)}
              placeholder="部分一致（例：山田）"
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">更新日 From</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="text-sm font-medium">更新日 To</div>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="border rounded px-3 py-1"
            disabled={!canSearch || loading}
            onClick={() => void fetchRows()}
          >
            {loading ? "検索中..." : "検索"}
          </button>
          <button
            className="border rounded px-3 py-1"
            disabled={loading}
            onClick={() => {
              setFilterActorUserId("");
              setFilterCsName("");
              setFilterDateFrom("");
              setFilterDateTo("");
              setTimeout(() => void fetchRows(), 0);
            }}
          >
            リセット
          </button>
        </div>

        {errorText ? (
          <div className="text-sm text-red-600 whitespace-pre-wrap">{errorText}</div>
        ) : null}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-auto">
        <table className="min-w-[1400px] w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-2 border-b">created_at</th>
              <th className="text-left p-2 border-b">action</th>
              <th className="text-left p-2 border-b">table</th>
              <th className="text-left p-2 border-b">shift_id</th>

              <th className="text-left p-2 border-b">actor_user_id</th>

              <th className="text-left p-2 border-b">利用者名</th>
              <th className="text-left p-2 border-b">kaipoke_cs_id</th>

              <th className="text-left p-2 border-b">日付</th>
              <th className="text-left p-2 border-b">開始</th>

              <th className="text-left p-2 border-b">service_code</th>
              <th className="text-left p-2 border-b">staff_01</th>

              <th className="text-left p-2 border-b">changed_cols</th>
              <th className="text-left p-2 border-b">path</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.audit_id} className="hover:bg-gray-50">
                <td className="p-2 border-b whitespace-nowrap">
                  {toJstDateTime(r.created_at)}
                </td>
                <td className="p-2 border-b whitespace-nowrap">{r.action}</td>
                <td className="p-2 border-b whitespace-nowrap">{r.table_name}</td>
                <td className="p-2 border-b whitespace-nowrap">{r.shift_id ?? ""}</td>

                <td className="p-2 border-b whitespace-nowrap">{r.actor_user_id ?? ""}</td>

                <td className="p-2 border-b whitespace-nowrap">{r.cs_name ?? ""}</td>
                <td className="p-2 border-b whitespace-nowrap">{r.kaipoke_cs_id ?? ""}</td>

                <td className="p-2 border-b whitespace-nowrap">{r.shift_start_date ?? ""}</td>
                <td className="p-2 border-b whitespace-nowrap">{r.shift_start_time ?? ""}</td>

                <td className="p-2 border-b whitespace-nowrap">{r.service_code ?? ""}</td>
                <td className="p-2 border-b whitespace-nowrap">{r.staff_01_user_id ?? ""}</td>

                <td className="p-2 border-b whitespace-nowrap">
                  {(r.changed_cols ?? []).join(", ")}
                </td>

                <td className="p-2 border-b whitespace-nowrap">{r.request_path ?? ""}</td>
              </tr>
            ))}

            {!loading && rows.length === 0 ? (
              <tr>
                <td className="p-3 text-center" colSpan={13}>
                  該当データなし
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
