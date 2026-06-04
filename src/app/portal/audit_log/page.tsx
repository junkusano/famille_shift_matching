//app/portal/audit_log/page.tsx
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

  actor_user_id_text: string | null;

  change_reason: string | null;
  penalty_level: string | null;
  event_type: string | null;

  shift_id: string | null;
  cs_name: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;
};

type ActorOption = {
  user_id: string;
  auth_user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
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
  const [savingId, setSavingId] = useState<string | null>(null);

  const [actorOptions, setActorOptions] = useState<ActorOption[]>([]);

  const fetchActorOptions = async () => {
    const { data, error } = await supabase
      .from("user_entry_united_view_single")
      .select("user_id, auth_user_id, last_name_kanji, first_name_kanji")
      .not("auth_user_id", "is", null)
      .not("user_id", "is", null)
      .order("user_id", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setActorOptions((data ?? []) as ActorOption[]);
  };

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

  const updatePenalty = async (
    auditId: string,
    changeReason: string | null,
    penaltyLevel: string | null,
    actorUserIdText: string | null
  ) => {
    setSavingId(auditId);

    const res = await fetch("/api/audit-log/update-penalty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auditId,
        changeReason,
        penaltyLevel,
        actorUserIdText,
      }),
    });

    setSavingId(null);

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error ?? "保存に失敗しました");
      return;
    }

    await fetchRows();
  };

  useEffect(() => {
    void fetchRows();
    void fetchActorOptions();
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
              <th className="p-2 border-b">action</th>
              <th className="p-2 border-b">shift_id</th>
              <th className="p-2 border-b text-red-600">利用者名 *</th>
              <th className="p-2 border-b text-red-600">開始日 *</th>
              <th className="p-2 border-b text-red-600">開始 *</th>
              <th className="p-2 border-b text-red-600">service_code *</th>
              <th className="p-2 border-b text-red-600">staff_01 *</th>

              <th className="p-2 border-b">changed_cols</th>
              <th className="p-2 border-b">event_type</th>
              <th className="p-2 border-b">reason</th>
              <th className="p-2 border-b">penalty</th>
              <th className="p-2 border-b">保存</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => (
              <tr key={r.audit_id} className="hover:bg-gray-50">
                <td className="p-2 border-b">{toJstDateTime(r.created_at)}</td>
                <td className="p-2 border-b">
                  <select
                    className="border px-2 py-1 w-40"
                    defaultValue={r.actor_user_id_text ?? ""}
                    id={`actor-${r.audit_id}`}
                  >
                    <option value="">未設定</option>
                    {actorOptions.map((u) => (
                      <option key={u.auth_user_id} value={u.user_id}>
                        {u.user_id}
                        {u.last_name_kanji || u.first_name_kanji
                          ? `（${u.last_name_kanji ?? ""}${u.first_name_kanji ?? ""}）`
                          : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 border-b">{r.request_path ?? ""}</td>
                <td className="p-2 border-b font-semibold">{r.action}</td>
                <td className="p-2 border-b">{r.shift_id ?? ""}</td>
                <td className="p-2 border-b">{r.cs_name ?? ""}</td>
                <td className="p-2 border-b">{r.shift_start_date ?? ""}</td>
                <td className="p-2 border-b">{r.shift_start_time ?? ""}</td>
                <td className="p-2 border-b">{r.service_code ?? ""}</td>
                <td className="p-2 border-b">{r.staff_01_user_id ?? ""}</td>

                <td className="p-2 border-b">
                  {(r.changed_cols ?? []).join(", ")}
                </td>
                <td className="p-2 border-b">
                  {r.event_type ?? ""}
                </td>

                <td className="p-2 border-b">
                  <input
                    className="border px-2 py-1 w-48"
                    defaultValue={r.change_reason ?? ""}
                    id={`reason-${r.audit_id}`}
                  />
                </td>

                <td className="p-2 border-b">
                  <select
                    className="border px-2 py-1"
                    defaultValue={r.penalty_level ?? ""}
                    id={`penalty-${r.audit_id}`}
                  >
                    <option value="">対象外</option>
                    <option value="minor">minor</option>
                    <option value="moderate">moderate</option>
                    <option value="severe">severe</option>
                  </select>
                </td>

                <td className="p-2 border-b">
                  <button
                    className="border px-3 py-1 rounded disabled:opacity-50"
                    disabled={savingId === r.audit_id}
                    onClick={() => {
                      const reasonInput = document.getElementById(
                        `reason-${r.audit_id}`
                      ) as HTMLInputElement | null;

                      const penaltySelect = document.getElementById(
                        `penalty-${r.audit_id}`
                      ) as HTMLSelectElement | null;

                      const actorSelect = document.getElementById(
                        `actor-${r.audit_id}`
                      ) as HTMLSelectElement | null;

                      void updatePenalty(
                        r.audit_id,
                        reasonInput?.value.trim() || null,
                        penaltySelect?.value || null,
                        actorSelect?.value || null
                      );
                    }}
                  >
                    {savingId === r.audit_id ? "保存中" : "保存"}
                  </button>
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={15} className="p-4 text-center">
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
