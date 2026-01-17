//portal/parking_cs_places/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

//type CsInfo = { name: string | null; address: string | null } | null;

type Row = {
    id: string;
    kaipoke_cs_id: string;
    serial: number;
    label: string;
    location_link: string | null;
    parking_orientation: string | null;
    permit_required: boolean | null;
    remarks: string | null;
    police_station_place_id: string | null;
    updated_at: string | null;
    created_at: string | null;
    //cs_kaipoke_info: CsInfo;

    client_name: string | null;
    client_address: string | null;
    next_shift_date: string | null;

    hasUpcomingShiftWithin2Months: boolean;
    firstShiftWithin2Months: boolean;
    isTarget: boolean;

};

function getErrMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    try {
        return JSON.stringify(e);
    } catch {
        return "unknown error";
    }
}

export default function ParkingCsPlacesPage() {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState("");

    // 編集中の一時状態（Row の一部だけ差分で持つ）
    const [edit, setEdit] = useState<Record<string, Partial<Row>>>({});

    const load = async (qq = q) => {
        setLoading(true);
        setError(null);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            const res = await fetch(`/api/parking/cs_places?q=${encodeURIComponent(qq)}`, {
                method: "GET",
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
            });

            const json: unknown = await res.json();

            // 型ガード（必要最低限）
            if (
                !res.ok ||
                typeof json !== "object" ||
                json === null ||
                !("ok" in json) ||
                (json as { ok: unknown }).ok !== true
            ) {
                const msg =
                    typeof json === "object" && json !== null && "message" in json
                        ? String((json as { message?: unknown }).message ?? "fetch failed")
                        : "fetch failed";
                throw new Error(msg);
            }

            const dataRows =
                "rows" in json && Array.isArray((json as { rows?: unknown }).rows)
                    ? ((json as { rows: Row[] }).rows ?? [])
                    : [];

            setRows(dataRows);
            setEdit({});
        } catch (e: unknown) {
            setError(getErrMessage(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const mergedRows = useMemo(() => {
        return rows.map((r) => ({ ...r, ...(edit[r.id] ?? {}) }));
    }, [rows, edit]);

    const setField = (id: string, patch: Partial<Row>) => {
        setEdit((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...patch } }));
    };

    const saveRow = async (id: string) => {
        const patch = edit[id];
        if (!patch) return;

        setSavingId(id);
        setError(null);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            type PatchBody = {
                police_station_place_id?: string | null;
                label?: string;
                location_link?: string | null;
                parking_orientation?: string | null;
                permit_required?: boolean | null;
                remarks?: string | null;
            };

            const payload: PatchBody = {};

            // ★「編集した項目だけ」詰める（undefined の項目は送らない）
            if ("police_station_place_id" in patch) payload.police_station_place_id = patch.police_station_place_id ?? null;
            if ("label" in patch) payload.label = patch.label;
            if ("location_link" in patch) payload.location_link = patch.location_link ?? null;
            if ("parking_orientation" in patch) payload.parking_orientation = patch.parking_orientation ?? null;
            if ("permit_required" in patch) payload.permit_required = patch.permit_required ?? null;
            if ("remarks" in patch) payload.remarks = patch.remarks ?? null;

            const res = await fetch(`/api/parking/cs_places/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(payload),
            });


            const json: unknown = await res.json();

            if (
                !res.ok ||
                typeof json !== "object" ||
                json === null ||
                !("ok" in json) ||
                (json as { ok: unknown }).ok !== true
            ) {
                const msg =
                    typeof json === "object" && json !== null && "message" in json
                        ? String((json as { message?: unknown }).message ?? "save failed")
                        : "save failed";
                throw new Error(msg);
            }

            setRows((prev) =>
                prev.map((r) =>
                    r.id === id
                        ? {
                            ...r,
                            ...patch,
                            police_station_place_id: patch.police_station_place_id ?? null,
                            location_link: patch.location_link ?? r.location_link ?? null,
                            parking_orientation: patch.parking_orientation ?? r.parking_orientation ?? null,
                            remarks: patch.remarks ?? r.remarks ?? null,
                            permit_required: patch.permit_required ?? r.permit_required ?? null,
                            label: patch.label ?? r.label,
                        }
                        : r
                )
            );

            setEdit((prev) => {
                const cp = { ...prev };
                delete cp[id];
                return cp;
            });

            alert("保存しました。");
        } catch (e: unknown) {
            setError(getErrMessage(e));
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-lg font-semibold">駐車場所コード管理（police_station_place_id）</h1>

                <div className="flex items-center gap-2">
                    <input
                        className="w-72 rounded-md border px-3 py-2 text-sm"
                        placeholder="検索（利用者名/住所/コード/ラベル/備考）"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    <button
                        className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:opacity-90"
                        onClick={() => void load(q)}
                        disabled={loading}
                    >
                        検索
                    </button>
                    <button
                        className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => {
                            setQ("");
                            void load("");
                        }}
                        disabled={loading}
                    >
                        クリア
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="text-sm text-gray-600">読み込み中...</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border">
                    <table className="min-w-[1200px] w-full border-collapse text-sm">
                        <thead className="bg-gray-50">
                            <tr className="text-left">
                                <th className="border-b p-2 w-[120px]">状態</th>
                                <th className="border-b p-2 w-[140px]">認識コード</th>
                                <th className="border-b p-2 w-[180px]">利用者</th>
                                <th className="border-b p-2 w-[260px]">住所</th>
                                <th className="border-b p-2 w-[70px]">連番</th>
                                <th className="border-b p-2 w-[220px]">ラベル</th>
                                <th className="border-b p-2 w-[90px]">許可証</th>
                                <th className="border-b p-2 w-[160px]">向き</th>
                                <th className="border-b p-2 w-[280px]">備考</th>
                                <th className="border-b p-2 w-[180px]">地図</th>
                                <th className="border-b p-2 w-[110px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {mergedRows.map((r) => {
                                const isNoRecent = !r.isTarget;
                                const dirty = !!edit[r.id];
                                const permitNeed = !!r.permit_required;
                                return (
                                    <tr
                                        key={r.id}
                                        className={`hover:bg-gray-50 ${isNoRecent ? "bg-gray-100 text-gray-400" : ""}`}
                                    >
                                        <td className="border-b p-2">
                                            {r.isTarget ? (
                                                <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                                    対象
                                                </span>
                                            ) : (
                                                <span className="inline-flex rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                                    直近ｼﾌﾄ無
                                                </span>

                                            )}
                                        </td>

                                        <td className="border-b p-2">
                                            <input
                                                className="w-full rounded-md border px-2 py-1"
                                                value={r.police_station_place_id ?? ""}
                                                placeholder="例: 春日井1"
                                                onChange={(e) => setField(r.id, { police_station_place_id: e.target.value })}
                                            />

                                        </td>

                                        <td className="border-b p-2">
                                            <div className="font-semibold">{r.client_name ?? "-"}</div>
                                            <div className="text-[11px] text-gray-500">{r.kaipoke_cs_id}</div>
                                        </td>

                                        <td className="border-b p-2">
                                            <div className="text-gray-800">{r.client_address ?? "-"}</div>
                                        </td>

                                        <td className="border-b p-2">{r.serial}</td>

                                        <td className="border-b p-2">
                                            <input
                                                className="w-full rounded-md border px-2 py-1"
                                                value={r.label}
                                                onChange={(e) => setField(r.id, { label: e.target.value })}
                                            />
                                        </td>

                                        <td className="border-b p-2">
                                            <button
                                                className={`rounded-md px-2 py-1 text-xs font-semibold ${permitNeed ? "bg-red-600 text-white" : "border hover:bg-gray-50"
                                                    }`}
                                                onClick={() => setField(r.id, { permit_required: !permitNeed })}
                                            >
                                                {permitNeed ? "必要" : "不要"}
                                            </button>
                                        </td>

                                        <td className="border-b p-2">
                                            <input
                                                className="w-full rounded-md border px-2 py-1"
                                                value={r.parking_orientation ?? ""}
                                                onChange={(e) => setField(r.id, { parking_orientation: e.target.value })}
                                                placeholder="例: 東向き"
                                            />
                                        </td>

                                        <td className="border-b p-2">
                                            <input
                                                className="w-full rounded-md border px-2 py-1"
                                                value={r.remarks ?? ""}
                                                onChange={(e) => setField(r.id, { remarks: e.target.value })}
                                                placeholder="注意事項など"
                                            />
                                        </td>

                                        <td className="border-b p-2">
                                            {r.location_link ? (
                                                <a
                                                    href={r.location_link}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-blue-700 underline"
                                                >
                                                    地図を開く
                                                </a>
                                            ) : (
                                                <span className="text-gray-500">未登録</span>
                                            )}
                                            <div className="mt-1">
                                                <input
                                                    className="w-full rounded-md border px-2 py-1 text-xs"
                                                    value={r.location_link ?? ""}
                                                    onChange={(e) => setField(r.id, { location_link: e.target.value })}
                                                    placeholder="地図URL"
                                                />
                                            </div>
                                        </td>

                                        <td className="border-b p-2">
                                            <button
                                                className={`w-full rounded-md px-3 py-2 text-sm ${dirty ? "bg-blue-600 text-white hover:opacity-90" : "border text-gray-500"
                                                    }`}
                                                disabled={!dirty || savingId === r.id}
                                                onClick={() => void saveRow(r.id)}
                                            >
                                                {savingId === r.id ? "保存中..." : "保存"}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!mergedRows.length && (
                                <tr>
                                    <td colSpan={10} className="p-6 text-center text-sm text-gray-600">
                                        データがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="mt-4 rounded-md border bg-yellow-50 p-3 text-sm">
                <div className="font-semibold">運用メモ</div>
                <ul className="list-disc pl-5">
                    <li>利用者ページで作られる新規レコードは police_station_place_id = null のままでOK。</li>
                    <li>このページで「春日井1 / 春日井2 …」を付与して、申請書・スタッフの共通認識コードにする。</li>
                    <li>ユニークは “値があるときだけ” かける（null/空は許容）。</li>
                </ul>
            </div>
        </div>
    );
}
