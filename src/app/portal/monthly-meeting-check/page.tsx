"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // ★追加（shiftページでも使ってるはず）

type Row = {
    target_month: string; // YYYY-MM-01
    user_id: string;
    full_name_kanji: string; // ★必須（姓+名 or user_id）
    orgunitname: string | null; // ★追加（APIが返すなら表示できる）
    required: boolean;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    minutes_url: string | null;
    staff_comment: string | null;
    manager_checked: boolean | null;
};

// ★追加：編集用（画面で入力中の値）
type EditRow = {
    attended_regular: boolean;
    attended_extra: boolean;
    minutes_url: string;
    staff_comment: string;
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

/*function readRows(v: unknown): Row[] | undefined {
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

        // ★追加
        const full_name_kanji =
            it.full_name_kanji === null ? null : readString(it.full_name_kanji) ?? undefined;

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
            full_name_kanji,
        });
    }

    return rows;
}*/

async function fetchWithBearer(input: RequestInfo, init?: RequestInit) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    const token = data.session?.access_token;
    if (!token) throw new Error("unauthorized");

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);

    // JSON送る場合に備えて（GETでは不要だが害なし）
    if (init?.body && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
    }

    return fetch(input, { ...init, headers });
}

export default function MonthlyMeetingCheckPage() {
    const [ym, setYm] = useState<string>(ymNowJst());
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string>("");

    // ★追加：編集状態（user_id -> 入力中の値）
    const [edit, setEdit] = useState<Record<string, EditRow>>({});

    // ★追加：行ごとの保存中フラグ
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const visibleRows = useMemo(() => rows, [rows]); // とりあえず全件表示
    // ★追加：過去12ヶ月＋今月の選択肢を作る
    const monthOptions = useMemo(() => {
        const list: string[] = [];
        const now = new Date();
        for (let i = -6; i <= 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, "0");
            list.push(`${y}-${m}`);
        }
        return list;
    }, []);

    async function load() {
        setMsg("");
        setLoading(true);

        try {
            // ★APIから「全従業員 + 既存の入力値」を取得する
            const res = await fetchWithBearer(`/api/monthly-meeting/attendance?ym=${ym}`);
            const j: unknown = await res.json();

            if (!isRecord(j) || readBoolean(j.ok) !== true) {
                throw new Error(isRecord(j) ? (readString(j.error) ?? "load failed") : "load failed");
            }
            const raw = Array.isArray(j.rows) ? j.rows : [];

            function isRowCandidate(v: unknown): v is Record<string, unknown> {
                return isRecord(v);
            }

            const newRows: Row[] = raw
                .filter(isRowCandidate)
                .filter((r) =>
                    typeof r["user_id"] === "string" &&
                    typeof r["target_month"] === "string" &&
                    typeof r["full_name_kanji"] === "string"
                )
                .map((r) => ({
                    target_month: r["target_month"] as string,
                    user_id: r["user_id"] as string,
                    full_name_kanji: r["full_name_kanji"] as string,
                    orgunitname: typeof r["orgunitname"] === "string" ? r["orgunitname"] : null,

                    required: typeof r["required"] === "boolean" ? r["required"] : true,

                    attended_regular:
                        r["attended_regular"] === null
                            ? null
                            : typeof r["attended_regular"] === "boolean"
                                ? r["attended_regular"]
                                : null,

                    attended_extra:
                        r["attended_extra"] === null
                            ? null
                            : typeof r["attended_extra"] === "boolean"
                                ? r["attended_extra"]
                                : null,

                    minutes_url:
                        r["minutes_url"] === null
                            ? null
                            : typeof r["minutes_url"] === "string"
                                ? r["minutes_url"]
                                : null,

                    staff_comment:
                        r["staff_comment"] === null
                            ? null
                            : typeof r["staff_comment"] === "string"
                                ? r["staff_comment"]
                                : null,

                    manager_checked:
                        r["manager_checked"] === null
                            ? null
                            : typeof r["manager_checked"] === "boolean"
                                ? r["manager_checked"]
                                : null,
                }));

            setRows(newRows);

            // ★入力欄の初期化（既存値があればそれを入れる）
            const next: Record<string, EditRow> = {};
            for (const r of newRows) {
                next[r.user_id] = {
                    attended_regular: r.attended_regular ?? false,
                    attended_extra: r.attended_extra ?? false,
                    minutes_url: r.minutes_url ?? "",
                    staff_comment: r.staff_comment ?? "",
                };
            }
            setEdit(next);

        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    // ★追加：1行保存（チェック/URL/コメント）
    async function saveRow(user_id: string) {
        const v = edit[user_id];
        if (!v) return;

        setSaving((p) => ({ ...p, [user_id]: true }));
        setMsg("");

        try {
            const res = await fetchWithBearer("/api/monthly-meeting/attendance", {
                method: "PATCH", // or "POST"（あなたのAPIに合わせて）
                body: JSON.stringify({
                    target_month: `${ym}-01`,
                    user_id,
                    attended_regular: v.attended_regular,
                    attended_extra: v.attended_extra,
                    minutes_url: v.minutes_url,
                    staff_comment: v.staff_comment,
                }),
            });

            const j: unknown = await res.json();
            if (!isRecord(j) || readBoolean(j.ok) !== true) {
                throw new Error(isRecord(j) ? (readString(j.error) ?? "save failed") : "save failed");
            }

            setMsg("保存しました");
            await load(); // 最新反映
        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setSaving((p) => ({ ...p, [user_id]: false }));
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
                    <select
                        className="border rounded px-2 py-1"
                        value={ym}
                        onChange={(e) => setYm(e.target.value)}
                    >
                        {monthOptions.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
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
                <div className="text-sm mb-2">従業員一覧</div>

                <div className="overflow-auto">
                    <table className="min-w-[900px] w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="border p-2 text-left">従業員</th>
                                <th className="border p-2">月例</th>
                                <th className="border p-2">追加</th>
                                <th className="border p-2 text-left">議事録URL</th>
                                <th className="border p-2 text-left">コメント</th>
                                <th className="border p-2">保存</th>
                            </tr>
                        </thead>

                        <tbody>
                            {visibleRows.map((r) => {
                                const e = edit[r.user_id] ?? {
                                    attended_regular: false,
                                    attended_extra: false,
                                    minutes_url: "",
                                    staff_comment: "",
                                };

                                return (
                                    <tr key={`${r.target_month}-${r.user_id}`}>
                                        <td className="border p-2">
                                            {r.full_name_kanji}
                                        </td>

                                        {/* 月例 */}
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={e.attended_regular}
                                                onChange={(ev) =>
                                                    setEdit((p) => ({
                                                        ...p,
                                                        [r.user_id]: { ...e, attended_regular: ev.target.checked },
                                                    }))
                                                }
                                            />
                                        </td>

                                        {/* 追加 */}
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={e.attended_extra}
                                                onChange={(ev) =>
                                                    setEdit((p) => ({
                                                        ...p,
                                                        [r.user_id]: { ...e, attended_extra: ev.target.checked },
                                                    }))
                                                }
                                            />
                                        </td>

                                        {/* 議事録URL（入力＋開く） */}
                                        <td className="border p-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    className="border rounded px-2 py-1 w-full"
                                                    value={e.minutes_url}
                                                    onChange={(ev) =>
                                                        setEdit((p) => ({
                                                            ...p,
                                                            [r.user_id]: { ...e, minutes_url: ev.target.value },
                                                        }))
                                                    }
                                                    placeholder="https://..."
                                                />
                                                {e.minutes_url.startsWith("http") && (
                                                    <a
                                                        className="text-blue-600 underline whitespace-nowrap"
                                                        href={e.minutes_url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        開く
                                                    </a>
                                                )}
                                            </div>
                                        </td>

                                        {/* コメント（入力） */}
                                        <td className="border p-2">
                                            <input
                                                className="border rounded px-2 py-1 w-full"
                                                value={e.staff_comment}
                                                onChange={(ev) =>
                                                    setEdit((p) => ({
                                                        ...p,
                                                        [r.user_id]: { ...e, staff_comment: ev.target.value },
                                                    }))
                                                }
                                                placeholder="コメント"
                                            />
                                        </td>

                                        {/* 保存（※「確認」列を「保存」に変えるのがおすすめ） */}
                                        <td className="border p-2 text-center">
                                            <button
                                                className="border rounded px-3 py-1"
                                                onClick={() => saveRow(r.user_id)}
                                                disabled={loading || saving[r.user_id] === true}
                                            >
                                                保存
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {visibleRows.length === 0 && (
                                <tr>
                                    <td className="border p-3 text-sm text-gray-600" colSpan={6}>
                                        従業員データが0件です（在籍者の取得条件をご確認ください）
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
}
