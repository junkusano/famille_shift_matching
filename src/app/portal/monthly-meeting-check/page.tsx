"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
    target_month: string; // YYYY-MM-01
    user_id: string;
    required: boolean;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    minutes_url: string | null;
    staff_comment: string | null;
    manager_checked: boolean | null;
    user_name?: string | null;
};

function ymNowJst(): string {
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const y = jst.getFullYear();
    const m = String(jst.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function toErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "Unknown error";
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
}

function readBoolean(v: unknown): boolean | undefined {
    return typeof v === "boolean" ? v : undefined;
}

function readRows(v: unknown): Row[] | undefined {
    if (!Array.isArray(v)) return undefined;

    const rows: Row[] = [];
    for (const it of v) {
        if (!isRecord(it)) continue;

        const target_month = readString(it.target_month);
        const user_id = readString(it.user_id);
        const required = readBoolean(it.required);

        if (!target_month || !user_id || typeof required !== "boolean") continue;

        // nullable booleans/strings
        const attended_regular =
            it.attended_regular === null ? null : readBoolean(it.attended_regular) ?? null;
        const attended_extra =
            it.attended_extra === null ? null : readBoolean(it.attended_extra) ?? null;

        const minutes_url = it.minutes_url === null ? null : readString(it.minutes_url) ?? null;
        const staff_comment = it.staff_comment === null ? null : readString(it.staff_comment) ?? null;

        const manager_checked =
            it.manager_checked === null ? null : readBoolean(it.manager_checked) ?? null;

        const user_name = it.user_name === null ? null : readString(it.user_name) ?? undefined;

        rows.push({
            target_month,
            user_id,
            required,
            attended_regular,
            attended_extra,
            minutes_url,
            staff_comment,
            manager_checked,
            user_name,
        });
    }

    return rows;
}

// 成功時だけ返す型（失敗は throw する）
type SyncOk = { required_count: number };
type AttendanceOk = { rows: Row[] };

function parseSyncOk(j: unknown): SyncOk {
    if (!isRecord(j)) throw new Error("Invalid response");
    if (readBoolean(j.ok) !== true) {
        throw new Error(readString(j.error) ?? "sync failed");
    }
    const required_count = typeof j.required_count === "number" ? j.required_count : 0;
    return { required_count };
}

function parseAttendanceOk(j: unknown): AttendanceOk {
    if (!isRecord(j)) throw new Error("Invalid response");
    if (readBoolean(j.ok) !== true) {
        throw new Error(readString(j.error) ?? "load failed");
    }
    const rows = readRows(j.rows) ?? [];
    return { rows };
}

export default function MonthlyMeetingCheckPage() {
    const [ym, setYm] = useState<string>(ymNowJst());
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string>("");

    const requiredRows = useMemo(() => rows.filter((r) => r.required), [rows]);

    async function runSync() {
        setMsg("");
        setLoading(true);
        try {
            const res = await fetch("/api/monthly-meeting/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ ym }),
            });

            const j: unknown = await res.json();
            const ok = parseSyncOk(j);

            setMsg(`対象者を更新しました: ${ok.required_count}件`);
            await load();
        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    async function load() {
        setMsg("");
        setLoading(true);
        try {
            const res = await fetch(`/api/monthly-meeting/attendance?ym=${encodeURIComponent(ym)}`);
            const j: unknown = await res.json();

            const ok = parseAttendanceOk(j);

            setRows(ok.rows);
        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ym]);

    return (
        <div className="p-4 space-y-4">
            {/* 上段：操作 */}
            <div className="rounded border p-3 space-y-2">
                <div className="flex items-center gap-2">
                    <label className="text-sm">対象月</label>
                    <input
                        className="border rounded px-2 py-1"
                        value={ym}
                        onChange={(e) => setYm(e.target.value)}
                        placeholder="YYYY-MM"
                    />
                    <button className="border rounded px-3 py-1" onClick={runSync} disabled={loading}>
                        対象者を更新（shift参照）
                    </button>
                    <button className="border rounded px-3 py-1" onClick={load} disabled={loading}>
                        再読込
                    </button>
                </div>

                <div className="text-xs text-gray-600">
                    参加チェック：10日以降に未入力（空欄）があればLINEWORKS通知。確認：10日以降に未入力（空欄）があればアラートバー通知。
                </div>

                {msg && <div className="text-sm">{msg}</div>}
            </div>

            {/* 下段：表 */}
            <div className="rounded border p-3">
                <div className="text-sm mb-2">対象者一覧（required=true）</div>

                <div className="overflow-auto">
                    <table className="min-w-[900px] w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="border p-2 text-left">従業員</th>
                                <th className="border p-2">月例</th>
                                <th className="border p-2">追加</th>
                                <th className="border p-2 text-left">議事録URL</th>
                                <th className="border p-2 text-left">コメント</th>
                                <th className="border p-2">確認</th>
                            </tr>
                        </thead>

                        <tbody>
                            {requiredRows.map((r) => (
                                <tr key={`${r.target_month}-${r.user_id}`}>
                                    <td className="border p-2">{r.user_name ?? r.user_id}</td>
                                    <td className="border p-2 text-center">
                                        {r.attended_regular === true ? "✅" : r.attended_regular === false ? "❌" : ""}
                                    </td>
                                    <td className="border p-2 text-center">
                                        {r.attended_extra === true ? "✅" : r.attended_extra === false ? "❌" : ""}
                                    </td>
                                    <td className="border p-2">
                                        {r.minutes_url ? (
                                            <a className="text-blue-600 underline" href={r.minutes_url} target="_blank" rel="noreferrer">
                                                議事録
                                            </a>
                                        ) : (
                                            ""
                                        )}
                                    </td>
                                    <td className="border p-2">{r.staff_comment ?? ""}</td>
                                    <td className="border p-2 text-center">
                                        {r.manager_checked === true ? "✅" : r.manager_checked === false ? "❌" : ""}
                                    </td>
                                </tr>
                            ))}

                            {requiredRows.length === 0 && (
                                <tr>
                                    <td className="border p-3 text-sm text-gray-600" colSpan={6}>
                                        データがありません（先に「対象者を更新（shift参照）」を押してください）
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
