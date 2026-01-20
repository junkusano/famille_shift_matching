//portal/parking_cs_places/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRoleContext } from "@/context/RoleContext";

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
    is_active: boolean;
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
    const [sendingId, setSendingId] = useState<string | null>(null);
    const { role } = useRoleContext();
    const isMember = (role ?? "") === "member";

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
        const list = rows.map((r) => ({ ...r, ...(edit[r.id] ?? {}) }));

        list.sort((a, b) => {
            const aKey = (a.police_station_place_id ?? "").trim();
            const bKey = (b.police_station_place_id ?? "").trim();

            // 両方空 → 同順位
            if (!aKey && !bKey) return 0;

            // a だけ空 → a を後ろへ
            if (!aKey) return 1;

            // b だけ空 → b を後ろへ
            if (!bKey) return -1;

            // 両方値あり → 文字列昇順
            return aKey.localeCompare(bKey, "ja");
        });

        return list;
    }, [rows, edit]);


    // ★同じ police_station_place_id の件数（共有数）を作る
    const sharedCountMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const r of mergedRows) {
            const key = (r.police_station_place_id ?? "").trim();
            if (!key) continue;
            map.set(key, (map.get(key) ?? 0) + 1);
        }
        return map;
    }, [mergedRows]);

    // ★同じコードの利用者一覧（表示用）
    const sharedUsersMap = useMemo(() => {
        const map = new Map<string, Array<{ kaipoke_cs_id: string; client_name: string | null }>>();
        for (const r of mergedRows) {
            const key = (r.police_station_place_id ?? "").trim();
            if (!key) continue;
            const arr = map.get(key) ?? [];
            arr.push({ kaipoke_cs_id: r.kaipoke_cs_id, client_name: r.client_name });
            map.set(key, arr);
        }
        return map;
    }, [mergedRows]);

    const setField = (id: string, patch: Partial<Row>) => {
        if (isMember) return; // ★member は編集禁止
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
                is_active?: boolean; 
            };

            const payload: PatchBody = {};

            // ★「編集した項目だけ」詰める（undefined の項目は送らない）
            if ("police_station_place_id" in patch) payload.police_station_place_id = patch.police_station_place_id ?? null;
            if ("label" in patch) payload.label = patch.label;
            if ("location_link" in patch) payload.location_link = patch.location_link ?? null;
            if ("parking_orientation" in patch) payload.parking_orientation = patch.parking_orientation ?? null;
            if ("permit_required" in patch) payload.permit_required = patch.permit_required ?? null;
            if ("remarks" in patch) payload.remarks = patch.remarks ?? null;
            if ("is_active" in patch) payload.is_active = !!patch.is_active; 

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

    const applyPermit = async (parkingCsPlaceId: string) => {
        setError(null);
        setSendingId(parkingCsPlaceId);

        try {
            const ok = window.confirm("「許可証申請」メッセージを送信します。よろしいですか？");
            if (!ok) return;

            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            const res = await fetch(`/api/parking/permit-apply`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({ parking_cs_place_id: parkingCsPlaceId }),
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
                        ? String((json as { message?: unknown }).message ?? "apply failed")
                        : "apply failed";
                throw new Error(msg);
            }

            alert("送信しました。");
        } catch (e: unknown) {
            setError(getErrMessage(e));
        } finally {
            setSendingId(null);
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
                                <th className="border-b p-2 w-[90px]">有効</th>
                                <th className="border-b p-2 w-[120px]">状態</th>
                                <th className="border-b p-2 w-[140px]">認識コード</th>
                                <th className="border-b p-2 w-[110px]">共有</th>
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
                                const canApply = !!(r.police_station_place_id && r.police_station_place_id.trim());
                                return (
                                    <tr
                                        key={r.id}
                                        className={`hover:bg-gray-50 ${isNoRecent ? "bg-gray-100 text-gray-400" : ""}`}
                                    >
                                        <td className="border-b p-2">
                                            <button
                                                className={`rounded-md px-2 py-1 text-xs font-semibold ${r.is_active ? "bg-green-600 text-white" : "bg-gray-300 text-gray-700"
                                                    } ${isMember ? "opacity-50 cursor-not-allowed" : ""}`}
                                                disabled={isMember}
                                                onClick={() => setField(r.id, { is_active: !r.is_active })}
                                                title={isMember ? "member は変更できません" : ""}
                                            >
                                                {r.is_active ? "有効" : "無効"}
                                            </button>
                                        </td>

                                        <td className="border-b p-2">
                                            {r.isTarget ? (
                                                <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
                                                    対象
                                                </span>
                                            ) : (
                                                <span className="inline-flex rounded-full bg-red-600 px-2 py-1 text-xs font-semibold text-white">
                                                    シフト無
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

                                        {/* ★共有列 */}
                                        <td className="border-b p-2">
                                            {(() => {
                                                const key = (r.police_station_place_id ?? "").trim();
                                                if (!key) return <span className="text-gray-500">-</span>;

                                                const cnt = sharedCountMap.get(key) ?? 0;
                                                if (cnt <= 1) {
                                                    return <span className="text-gray-500">-</span>;
                                                }

                                                const users = sharedUsersMap.get(key) ?? [];
                                                // 自分以外の利用者を最大2名だけ表示（長くなりすぎ防止）
                                                const others = users
                                                    .filter((u) => u.kaipoke_cs_id !== r.kaipoke_cs_id)
                                                    .slice(0, 2);

                                                return (
                                                    <div>
                                                        <span className="inline-flex rounded-full bg-indigo-600 px-2 py-1 text-xs font-semibold text-white">
                                                            {cnt}名
                                                        </span>
                                                        <div className="mt-1 text-[11px] text-gray-600">
                                                            {others.length ? (
                                                                <>
                                                                    {others.map((u) => u.client_name ?? u.kaipoke_cs_id).join(" / ")}
                                                                    {users.length - 1 > 2 ? " …" : ""}
                                                                </>
                                                            ) : (
                                                                <>共有</>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
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
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    className={`w-full rounded-md px-3 py-2 text-sm ${sendingId === r.id ? "bg-gray-300 text-gray-700" : "bg-amber-500 text-white hover:opacity-90"
                                                        }`}
                                                    disabled={sendingId === r.id || !canApply}
                                                    onClick={() => void applyPermit(r.id)}
                                                >
                                                    {sendingId === r.id ? "送信中..." : "申請"}
                                                </button>
                                                <button
                                                    className={`w-full rounded-md px-3 py-2 text-sm ${dirty && !isMember
                                                            ? "bg-blue-600 text-white hover:opacity-90"
                                                            : "border text-gray-500"
                                                        }`}
                                                    disabled={isMember || !dirty || savingId === r.id}
                                                    title={isMember ? "member は保存できません" : ""}
                                                    onClick={() => void saveRow(r.id)}
                                                >
                                                    {isMember ? "保存（権限なし）" : savingId === r.id ? "保存中..." : "保存"}
                                                </button>
                                            </div>
                                        </td>

                                    </tr>
                                );
                            })}

                            {!mergedRows.length && (
                                <tr>
                                    <td colSpan={11} className="p-6 text-center text-sm text-gray-600">
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
                </ul>
            </div>
        </div>
    );
}
