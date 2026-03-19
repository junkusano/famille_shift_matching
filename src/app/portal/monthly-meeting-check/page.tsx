"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Row = {
    target_month: string; // YYYY-MM-01
    user_id: string;
    full_name_kanji: string; // ★必須（姓+名 or user_id）
    orgunitname: string | null; // ★追加（APIが返すなら表示できる）
    required: boolean;
    attended_regular: boolean | null;
    attended_extra: boolean | null;
    meeting_date: string | null;   // ★追加
    checked_regular: boolean; // ★追加：確認（月例）
    checked_extra: boolean;   // ★追加：確認（追加）
    minutes_url: string | null;
    staff_comment: string | null;
    manager_checked: boolean | null;
};

// ★追加：編集用（画面で入力中の値）
type EditRow = {
    attended_regular: boolean;
    attended_extra: boolean;
    checked_regular: boolean;
    checked_extra: boolean;
    staff_comment: string;
};

function ymNowJst(): string {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
    }).formatToParts(now);

    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    return `${y}-${m}`;
}

function toErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    if (isRecord(e) && typeof e["message"] === "string") return e["message"];
    try {
        return JSON.stringify(e, null, 2);
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
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const initialYmFromUrl = searchParams.get("ym");
    const [ym, setYm] = useState<string>(
        initialYmFromUrl && /^\d{4}-\d{2}$/.test(initialYmFromUrl)
            ? initialYmFromUrl
            : ymNowJst()
    );
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<string>("");
    const [myRole, setMyRole] = useState<string>(""); // ★追加
    const [authReady, setAuthReady] = useState(false); // ★追加
    const normalizedRole = myRole.trim().toUpperCase();

    // ✅ manager / admin（＋念のためFULLも）だけ「確認（月例）/追加/確認（追加）」を操作できる
    const canManagerEdit =
        normalizedRole === "MANAGER" ||
        normalizedRole === "ADMIN" ||
        normalizedRole === "FULL";

    // ★追加：編集状態（user_id -> 入力中の値）
    const [edit, setEdit] = useState<Record<string, EditRow>>({});

    const [meetingDate, setMeetingDate] = useState<string>("");
    const [sharedMinutesUrl, setSharedMinutesUrl] = useState<string>("");

    // ★追加：行ごとの保存中フラグ
    const visibleRows = useMemo(() => rows, [rows]); // とりあえず全件表示
    // ★追加：過去12ヶ月＋今月の選択肢を作る
    const monthOptions = useMemo(() => {
        const list: string[] = [];

        const now = new Date();
        const parts = new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            year: "numeric",
            month: "2-digit",
        }).formatToParts(now);

        const baseYear = Number(parts.find((p) => p.type === "year")?.value ?? "0");
        const baseMonth = Number(parts.find((p) => p.type === "month")?.value ?? "1");

        for (let i = -6; i <= 6; i++) {
            const d = new Date(baseYear, baseMonth - 1 + i, 1);
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
            // ① 先に対象月の attendance を初期化
            const initRes = await fetchWithBearer("/api/monthly-meeting/attendance/init", {
                method: "POST",
                body: JSON.stringify({ ym }),
            });

            const initJson: unknown = await initRes.json();

            if (!initRes.ok || !isRecord(initJson) || readBoolean(initJson.ok) !== true) {
                throw new Error(
                    isRecord(initJson)
                        ? (readString(initJson.error) ?? `init failed (${initRes.status})`)
                        : `init failed (${initRes.status})`
                );
            }

            // ② そのあと一覧取得
            const res = await fetchWithBearer(`/api/monthly-meeting/attendance?ym=${ym}`);
            const j: unknown = await res.json();

            if (!res.ok || !isRecord(j) || readBoolean(j.ok) !== true) {
                throw new Error(
                    isRecord(j)
                        ? (readString(j.error) ?? `load failed (${res.status})`)
                        : `load failed (${res.status})`
                );
            }
            const roleFromApi = isRecord(j) && typeof j["role"] === "string" ? j["role"] : "";
            setMyRole(roleFromApi.trim().toUpperCase());

            const raw = Array.isArray(j["rows"]) ? j["rows"] : [];

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

                    checked_regular:
                        typeof r["checked_regular"] === "boolean" ? r["checked_regular"] : false,

                    checked_extra:
                        typeof r["checked_extra"] === "boolean" ? r["checked_extra"] : false,
                    meeting_date:
                        r["meeting_date"] === null
                            ? null
                            : typeof r["meeting_date"] === "string"
                                ? r["meeting_date"]
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

            const firstMeetingDate =
                newRows.find((r) => r.meeting_date)?.meeting_date ?? "";
            const firstMinutesUrl =
                newRows.find((r) => r.minutes_url)?.minutes_url ?? "";

            setMeetingDate(firstMeetingDate);
            setSharedMinutesUrl(firstMinutesUrl);

            // ★入力欄の初期化（既存値があればそれを入れる）
            const next: Record<string, EditRow> = {};
            for (const r of newRows) {
                next[r.user_id] = {
                    attended_regular: r.attended_regular ?? false,
                    attended_extra: r.attended_extra ?? false,
                    checked_regular: r.checked_regular ?? false,
                    checked_extra: r.checked_extra ?? false,
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

    async function patchOne(user_id: string, patch: Partial<EditRow>) {
        setMsg("");

        // 画面の状態を先に更新（体感が良い）
        setEdit((p) => {
            const cur = p[user_id];
            if (!cur) return p;
            return { ...p, [user_id]: { ...cur, ...patch } };
        });

        const cur = edit[user_id];
        const merged: EditRow = {
            attended_regular: cur?.attended_regular ?? false,
            attended_extra: cur?.attended_extra ?? false,
            checked_regular: cur?.checked_regular ?? false,
            checked_extra: cur?.checked_extra ?? false,
            staff_comment: cur?.staff_comment ?? "",
            ...patch,
        };

        const res = await fetchWithBearer("/api/monthly-meeting/attendance", {
            method: "PATCH",
            body: JSON.stringify({
                target_month: `${ym}-01`,
                user_id,
                // ✅ 必要な項目だけ送ればOK（ここは patch の中身に合わせる）
                ...("attended_regular" in patch ? { attended_regular: merged.attended_regular } : {}),
                ...("attended_extra" in patch ? { attended_extra: merged.attended_extra } : {}),
                ...("checked_regular" in patch ? { checked_regular: merged.checked_regular } : {}),
                ...("checked_extra" in patch ? { checked_extra: merged.checked_extra } : {}),
            }),
        });

        const j: unknown = await res.json();
        if (!isRecord(j) || readBoolean(j.ok) !== true) {
            throw new Error(isRecord(j) ? (readString(j.error) ?? "save failed") : "save failed");
        }
    }

    async function saveMeetingInfo() {
        setMsg("");
        setLoading(true);

        try {
            if (rows.length === 0) {
                throw new Error("保存対象の従業員データがありません");
            }

            const res = await fetchWithBearer("/api/monthly-meeting/attendance", {
                method: "PATCH",
                body: JSON.stringify({
                    target_month: `${ym}-01`,
                    user_id: rows[0].user_id,
                    apply_shared_fields_to_all: true,
                    meeting_date: meetingDate || null,
                    minutes_url: sharedMinutesUrl || null,
                }),
            });

            const j: unknown = await res.json();

            if (!res.ok || !isRecord(j) || readBoolean(j.ok) !== true) {
                throw new Error(
                    isRecord(j)
                        ? (readString(j.error) ?? `save failed (${res.status})`)
                        : `save failed (${res.status})`
                );
            }

            setMsg("会議日・議事録URLを保存しました");
            await load();
        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    async function saveAll() {
        setMsg("");
        setLoading(true);

        try {
            // ① 月全体の会議情報を一括保存
            {
                const res = await fetchWithBearer("/api/monthly-meeting/attendance", {
                    method: "PATCH",
                    body: JSON.stringify({
                        target_month: `${ym}-01`,
                        user_id: rows[0]?.user_id ?? "",
                        apply_shared_fields_to_all: true,
                        meeting_date: meetingDate || null,
                        minutes_url: sharedMinutesUrl || null,
                    }),
                });

                const j: unknown = await res.json();
                if (!isRecord(j) || readBoolean(j.ok) !== true) {
                    throw new Error(
                        isRecord(j) ? (readString(j.error) ?? "save failed") : "save failed"
                    );
                }
            }

            // ② コメントは各行ごとに保存
            for (const r of rows) {
                const v = edit[r.user_id];
                if (!v) continue;

                const res = await fetchWithBearer("/api/monthly-meeting/attendance", {
                    method: "PATCH",
                    body: JSON.stringify({
                        target_month: `${ym}-01`,
                        user_id: r.user_id,
                        staff_comment: v.staff_comment,
                    }),
                });

                const j: unknown = await res.json();
                if (!isRecord(j) || readBoolean(j.ok) !== true) {
                    throw new Error(
                        isRecord(j) ? (readString(j.error) ?? "save failed") : "save failed"
                    );
                }
            }

            setMsg("保存しました");
            await load();
        } catch (e: unknown) {
            setMsg(toErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                const { data } = await supabase.auth.getSession();
                if (!mounted) return;

                if (data.session?.access_token) {
                    setAuthReady(true);
                    return;
                }

                const {
                    data: { subscription },
                } = supabase.auth.onAuthStateChange((_event, session) => {
                    if (session?.access_token) {
                        setAuthReady(true);
                    }
                });

                return () => subscription.unsubscribe();
            } catch {
                if (mounted) setAuthReady(true);
            }
        };

        const cleanupPromise = initAuth();

        return () => {
            mounted = false;
            void cleanupPromise;
        };
    }, []);

    useEffect(() => {
        if (!authReady) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ym, authReady]);

    useEffect(() => {
        const qym = searchParams.get("ym");

        // URLに ym が入っていれば何もしない
        if (qym && /^\d{4}-\d{2}$/.test(qym)) return;

        // URLに ym が無いときだけ、現在の ym を付ける
        const params = new URLSearchParams(searchParams.toString());
        params.set("ym", ym);
        router.replace(`${pathname}?${params.toString()}`);
    }, [searchParams, ym, router, pathname]);

    useEffect(() => {
        const qym = searchParams.get("ym");
        if (qym && /^\d{4}-\d{2}$/.test(qym) && qym !== ym) {
            setYm(qym);
        }
    }, [searchParams, ym]);

    return (
        <div className="p-4 space-y-4">
            {/* 上段：操作 */}
            <div className="rounded border p-3 space-y-2">
                {/* ★使い方説明（目立つ版） */}
                <div className="rounded border border-blue-300 bg-blue-50 p-4 text-sm leading-7">
                    <div className="flex items-center gap-2 font-bold text-blue-800 mb-2">
                        <span>ℹ</span>
                        <span>月例会議 出席チェックの流れ</span>
                    </div>

                    <div className="font-semibold text-black">月例に参加した場合</div>
                    <div>月例会議に参加 → 「月例」にチェック</div>
                    <div>マネージャー確認 → 「月例（確認）」にチェック（※マネージャーのみ）</div>

                    <div className="mt-3 font-semibold text-black">月例に参加できない場合</div>
                    <div>追加会議に参加 → 「追加」にチェック</div>
                    <div>マネージャー確認 → 「追加（確認）」にチェック（※マネージャーのみ）</div>
                </div>

                <div className="flex items-center gap-2">
                    <label className="text-sm">対象月</label>
                    <select
                        className="border rounded px-2 py-1"
                        value={ym}
                        onChange={(e) => {
                            const nextYm = e.target.value;
                            setYm(nextYm);

                            const params = new URLSearchParams(searchParams.toString());
                            params.set("ym", nextYm);
                            router.replace(`${pathname}?${params.toString()}`);
                        }}
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

                    <button className="border rounded px-3 py-1" onClick={saveAll} disabled={loading}>
                        コメントを保存
                    </button>
                </div>

                <div className="text-xs text-gray-600">
                    参加チェック：10日以降に未入力（空欄）があればLINEWORKS通知。確認：10日以降に未入力（空欄）があればアラートバー通知。
                </div>

                {msg && <div className="text-sm">{msg}</div>}
            </div>

            <div className="rounded border bg-gray-50 p-3 space-y-3">
                <div className="font-semibold text-sm">会議情報登録</div>

                <div className="flex flex-wrap items-center gap-4">
                    <label className="text-sm">
                        会議日
                        <input
                            type="date"
                            className="border rounded px-2 py-1 ml-2"
                            value={meetingDate}
                            onChange={(e) => setMeetingDate(e.target.value)}
                        />
                    </label>

                    <label className="text-sm flex-1 min-w-[320px]">
                        議事録リンク
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                className="border rounded px-2 py-1 w-full"
                                value={sharedMinutesUrl}
                                onChange={(e) => setSharedMinutesUrl(e.target.value)}
                                placeholder="https://..."
                            />
                            {sharedMinutesUrl.startsWith("http") && (
                                <a
                                    className="text-blue-600 underline whitespace-nowrap"
                                    href={sharedMinutesUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    開く
                                </a>
                            )}
                        </div>
                    </label>
                </div>

                <div>
                    <button
                        className="border rounded px-3 py-1 bg-white"
                        onClick={saveMeetingInfo}
                        disabled={loading || rows.length === 0}
                        type="button"
                    >
                        会議情報を保存
                    </button>
                </div>
            </div>

            {/* 下段：表 */}
            <div className="rounded border p-3">
                <div className="text-sm mb-2">従業員一覧</div>

                <div className="overflow-auto max-h-[70vh]">
                    <table className="min-w-[900px] w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50 sticky top-0 z-10">
                                <th className="border p-2 text-left bg-gray-50">従業員</th>
                                <th className="border p-2 bg-gray-50">月例</th>
                                <th className="border p-2 bg-gray-50">確認（月例）</th>
                                <th className="border p-2 bg-gray-50">追加</th>
                                <th className="border p-2 bg-gray-50">確認（追加）</th>
                                <th className="border p-2 text-left bg-gray-50">コメント</th>
                            </tr>
                        </thead>

                        <tbody>
                            {visibleRows.map((r) => {
                                const e = edit[r.user_id] ?? {
                                    attended_regular: false,
                                    attended_extra: false,
                                    checked_regular: false,
                                    checked_extra: false,
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
                                                checked={Boolean(e.attended_regular)}
                                                onChange={async (ev) => {
                                                    const v = ev.target.checked; // true/false
                                                    try {
                                                        await patchOne(r.user_id, { attended_regular: v });
                                                    } catch (err: unknown) {
                                                        setMsg(toErrorMessage(err));
                                                    }
                                                }}
                                            />
                                        </td>

                                        {/* 確認（月例） */}
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(e.checked_regular)}
                                                disabled={!canManagerEdit}
                                                onChange={async (ev) => {
                                                    const v = ev.target.checked;
                                                    try {
                                                        await patchOne(r.user_id, { checked_regular: v });
                                                    } catch (err: unknown) {
                                                        setMsg(toErrorMessage(err));
                                                    }
                                                }}
                                            />
                                        </td>

                                        {/* 追加 */}
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(e.attended_extra)}
                                                disabled={!canManagerEdit}
                                                onChange={async (ev) => {
                                                    const v = ev.target.checked;
                                                    try {
                                                        await patchOne(r.user_id, { attended_extra: v });
                                                    } catch (err: unknown) {
                                                        setMsg(toErrorMessage(err));
                                                    }
                                                }}
                                            />
                                        </td>

                                        {/* 確認（追加） */}
                                        <td className="border p-2 text-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(e.checked_extra)}
                                                disabled={!canManagerEdit}
                                                onChange={async (ev) => {
                                                    const v = ev.target.checked;
                                                    try {
                                                        await patchOne(r.user_id, { checked_extra: v });
                                                    } catch (err: unknown) {
                                                        setMsg(toErrorMessage(err));
                                                    }
                                                }}
                                            />
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
