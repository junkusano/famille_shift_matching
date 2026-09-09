"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { useRoleContext } from "@/context/RoleContext";

type Row = {
    id: string;
    kaipoke_cs_id: string | null;
    serial: number;
    label: string;
    location_link: string | null;
    parking_orientation: string | null;
    permit_required: boolean | null;
    remarks: string | null;
    police_station_place_id: string | null;
    updated_at: string | null;
    created_at: string | null;
    client_name: string | null;
    client_address: string | null;
    next_shift_date: string | null;
    hasUpcomingShiftWithin2Months: boolean;
    firstShiftWithin2Months: boolean;
    isTarget: boolean;
    is_active: boolean;
    is_pickup: boolean;
};

type CommonPlaceForm = {
    label: string;
    police_station_place_id: string;
    location_link: string;
    parking_orientation: string;
    remarks: string;
    permit_required: boolean;
    is_pickup: boolean;
};

const emptyCommonPlace: CommonPlaceForm = {
    label: "",
    police_station_place_id: "",
    location_link: "",
    parking_orientation: "",
    remarks: "",
    permit_required: true,
    is_pickup: false,
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
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [q, setQ] = useState("");
    const [edit, setEdit] = useState<Record<string, Partial<Row>>>({});
    const [showCommonForm, setShowCommonForm] = useState(false);
    const [creating, setCreating] = useState(false);
    const [commonPlace, setCommonPlace] = useState<CommonPlaceForm>(emptyCommonPlace);
    const { role } = useRoleContext();
    const isMember = (role ?? "") === "member";

    const load = async (query = q) => {
        setLoading(true);
        setError(null);
        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;
            const res = await fetch(`/api/parking/cs_places?q=${encodeURIComponent(query)}`, {
                headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
            });
            const json = (await res.json().catch(() => null)) as {
                ok?: boolean;
                message?: string;
                rows?: Row[];
            } | null;
            if (!res.ok || json?.ok !== true) throw new Error(json?.message ?? "駐車場所の取得に失敗しました。");
            setRows(json.rows ?? []);
            setEdit({});
        } catch (e) {
            console.error("[parking-cs-places] load failed:", e);
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
        const list = rows.map((row) => ({ ...row, ...(edit[row.id] ?? {}) }));
        list.sort((a, b) => {
            if (a.is_pickup !== b.is_pickup) return a.is_pickup ? -1 : 1;
            const aKey = (a.police_station_place_id ?? "").trim();
            const bKey = (b.police_station_place_id ?? "").trim();
            if (!aKey && !bKey) return 0;
            if (!aKey) return 1;
            if (!bKey) return -1;
            return aKey.localeCompare(bKey, "ja");
        });
        return list;
    }, [rows, edit]);

    const pickupRows = mergedRows.filter((row) => row.is_pickup);
    const regularRows = mergedRows.filter((row) => !row.is_pickup);
    const sharedPlaces = useMemo(() => {
        const map = new Map<string, { count: number; names: string[] }>();
        for (const row of mergedRows) {
            const code = row.police_station_place_id?.trim();
            if (!code) continue;
            const current = map.get(code) ?? { count: 0, names: [] };
            current.count += 1;
            if (row.client_name) current.names.push(row.client_name);
            map.set(code, current);
        }
        return map;
    }, [mergedRows]);

    const setField = (id: string, patch: Partial<Row>) => {
        if (isMember) return;
        setEdit((current) => ({ ...current, [id]: { ...(current[id] ?? {}), ...patch } }));
    };

    const getAccessToken = async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    };

    const saveRow = async (id: string) => {
        const patch = edit[id];
        if (!patch || isMember) return;
        setSavingId(id);
        setError(null);
        setSuccess(null);
        try {
            const accessToken = await getAccessToken();
            const payload: Partial<Row> = {};
            const fields: Array<keyof Row> = [
                "police_station_place_id", "label", "location_link", "parking_orientation",
                "permit_required", "remarks", "is_active", "is_pickup",
            ];
            for (const field of fields) {
                if (field in patch) Object.assign(payload, { [field]: patch[field] });
            }
            const res = await fetch(`/api/parking/cs_places/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(payload),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
            if (!res.ok || json?.ok !== true) throw new Error(json?.message ?? "保存に失敗しました。");
            setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
            setEdit((current) => {
                const next = { ...current };
                delete next[id];
                return next;
            });
            setSuccess("駐車場所を保存しました。");
        } catch (e) {
            console.error("[parking-cs-places] save failed:", e);
            setError(getErrMessage(e));
        } finally {
            setSavingId(null);
        }
    };

    const createCommonPlace = async () => {
        if (isMember || !commonPlace.label.trim()) return;
        setCreating(true);
        setError(null);
        setSuccess(null);
        try {
            const accessToken = await getAccessToken();
            const res = await fetch("/api/parking/cs_places", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify(commonPlace),
            });
            const json = (await res.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
            if (!res.ok || json?.ok !== true) throw new Error(json?.message ?? "共通駐車場所の登録に失敗しました。");
            setCommonPlace(emptyCommonPlace);
            setShowCommonForm(false);
            setSuccess("共通駐車場所を登録しました。");
            await load(q);
        } catch (e) {
            console.error("[parking-cs-places] common place creation failed:", e);
            setError(getErrMessage(e));
        } finally {
            setCreating(false);
        }
    };

    const applyPermit = async (parkingCsPlaceId: string) => {
        if (sendingId) return;
        if (!window.confirm("この駐車場所の許可証を申請します。よろしいですか？")) return;
        setError(null);
        setSuccess(null);
        setSendingId(parkingCsPlaceId);
        try {
            const accessToken = await getAccessToken();
            const res = await fetch("/api/parking/permit-apply", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
                body: JSON.stringify({ parking_cs_place_id: parkingCsPlaceId }),
            });
            const json = (await res.json().catch(() => null)) as {
                ok?: boolean;
                message?: string;
            } | null;
            if (!res.ok || json?.ok !== true) {
                throw new Error(json?.message ?? "駐車許可証の申請に失敗しました。");
            }
            setSuccess("駐車許可証を申請しました。");
        } catch (e) {
            console.error("[parking-cs-places] permit application failed:", e);
            setError(getErrMessage(e));
        } finally {
            setSendingId(null);
        }
    };

    const renderCard = (row: Row) => {
        const dirty = !!edit[row.id];
        const isSending = sendingId === row.id;
        const shared = row.police_station_place_id
            ? sharedPlaces.get(row.police_station_place_id.trim())
            : undefined;
        const inputClass = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600";

        return (
            <article key={row.id} className={`rounded-xl border p-4 shadow-sm ${row.is_pickup ? "border-amber-400 bg-gradient-to-br from-amber-50 to-white shadow-amber-100" : row.isTarget ? "border-gray-200 bg-white" : "border-gray-200 bg-gray-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            {row.is_pickup && <span className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white shadow-sm">★ ピックアップ</span>}
                            {!row.kaipoke_cs_id && <span className="inline-flex rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-800">共通駐車場所</span>}
                            {row.kaipoke_cs_id && !row.isTarget && <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">直近シフトなし</span>}
                            {shared && shared.count > 1 && <span title={shared.names.join(" / ")} className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">認識コード共有 {shared.count}件</span>}
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${row.is_active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"}`}>{row.is_active ? "有効" : "無効"}</span>
                        </div>
                        <h3 className="break-words text-lg font-bold text-gray-900">{row.label || "(場所名未設定)"}</h3>
                        <p className="mt-1 text-sm text-gray-700">{row.kaipoke_cs_id ? `利用者様：${row.client_name ?? row.kaipoke_cs_id}` : "利用者様の訪問に紐づかず、スタッフが共通で利用できます。"}</p>
                        {row.client_address && <p className="mt-1 text-sm text-gray-600">{row.client_address}</p>}
                    </div>
                    {row.permit_required ? (
                        <button type="button" className="min-w-28 rounded-md bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600" disabled={isSending || !!sendingId || !row.is_active} onClick={() => void applyPermit(row.id)}>
                            {isSending ? "申請中..." : "申請する"}
                        </button>
                    ) : <span className="rounded-md border bg-white px-3 py-2 text-sm text-gray-600">許可証不要</span>}
                </div>

                <section className={`mt-4 rounded-lg border p-4 ${row.is_pickup ? "border-amber-300 bg-amber-100/70" : "border-gray-200 bg-gray-100"}`}>
                    <h4 className="text-sm font-bold text-gray-900">場所について</h4>
                    <div className="mt-2 min-h-16 whitespace-pre-wrap break-words text-sm leading-7 text-gray-800">{row.remarks?.trim() || "備考は登録されていません。"}</div>
                </section>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="font-semibold text-gray-600">認識コード</dt><dd className="mt-1 text-gray-900">{row.police_station_place_id || "—"}</dd></div>
                    <div><dt className="font-semibold text-gray-600">連番</dt><dd className="mt-1 text-gray-900">{row.serial}</dd></div>
                    <div><dt className="font-semibold text-gray-600">駐車の向き</dt><dd className="mt-1 text-gray-900">{row.parking_orientation || "—"}</dd></div>
                    <div><dt className="font-semibold text-gray-600">地図</dt><dd className="mt-1">{row.location_link ? <a href={row.location_link} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">地図を開く</a> : "—"}</dd></div>
                </dl>

                {!isMember && (
                    <details className="mt-4 rounded-lg border border-gray-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-gray-800">この場所を編集</summary>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                            <label className="text-sm font-semibold text-gray-700">場所名<input className={inputClass} value={row.label} onChange={(e) => setField(row.id, { label: e.target.value })} /></label>
                            <label className="text-sm font-semibold text-gray-700">認識コード<input className={inputClass} value={row.police_station_place_id ?? ""} onChange={(e) => setField(row.id, { police_station_place_id: e.target.value })} /></label>
                            <label className="text-sm font-semibold text-gray-700">駐車の向き<input className={inputClass} value={row.parking_orientation ?? ""} onChange={(e) => setField(row.id, { parking_orientation: e.target.value })} /></label>
                            <label className="text-sm font-semibold text-gray-700">地図URL<input className={inputClass} value={row.location_link ?? ""} onChange={(e) => setField(row.id, { location_link: e.target.value })} /></label>
                            <label className="text-sm font-semibold text-gray-700 md:col-span-2">備考<textarea className={`${inputClass} min-h-32 resize-y leading-6`} value={row.remarks ?? ""} onChange={(e) => setField(row.id, { remarks: e.target.value })} /></label>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-5">
                            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={row.is_pickup} onChange={(e) => setField(row.id, { is_pickup: e.target.checked })} />ピックアップとして表示する</label>
                            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!row.permit_required} onChange={(e) => setField(row.id, { permit_required: e.target.checked })} />許可証が必要</label>
                            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={row.is_active} onChange={(e) => setField(row.id, { is_active: e.target.checked })} />有効</label>
                            <button type="button" className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300" disabled={!dirty || savingId === row.id} onClick={() => void saveRow(row.id)}>{savingId === row.id ? "保存中..." : "変更を保存"}</button>
                        </div>
                    </details>
                )}
            </article>
        );
    };

    return (
        <main className="mx-auto max-w-6xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h1 className="text-2xl font-bold text-gray-900">駐車許可証申請</h1><p className="mt-1 text-sm text-gray-600">場所の説明を確認してから申請してください。</p></div>
                {!isMember && <button type="button" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => setShowCommonForm((value) => !value)}>共通駐車場所を登録</button>}
            </div>

            <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void load(q); }}>
                <input className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="検索（利用者名・住所・認識コード・場所名・備考）" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white" disabled={loading}>検索</button>
                <button type="button" className="rounded-md border px-4 py-2 text-sm" disabled={loading} onClick={() => { setQ(""); void load(""); }}>クリア</button>
            </form>

            {showCommonForm && !isMember && (
                <section className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <h2 className="font-bold text-indigo-950">共通駐車場所の新規登録</h2><p className="mt-1 text-sm text-indigo-800">利用者様を紐づけずに登録します。</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <input className="rounded-md border px-3 py-2 text-sm" placeholder="場所名（必須）" value={commonPlace.label} onChange={(e) => setCommonPlace((p) => ({ ...p, label: e.target.value }))} />
                        <input className="rounded-md border px-3 py-2 text-sm" placeholder="認識コード（任意）" value={commonPlace.police_station_place_id} onChange={(e) => setCommonPlace((p) => ({ ...p, police_station_place_id: e.target.value }))} />
                        <input className="rounded-md border px-3 py-2 text-sm" placeholder="駐車の向き" value={commonPlace.parking_orientation} onChange={(e) => setCommonPlace((p) => ({ ...p, parking_orientation: e.target.value }))} />
                        <input className="rounded-md border px-3 py-2 text-sm" placeholder="地図URL" value={commonPlace.location_link} onChange={(e) => setCommonPlace((p) => ({ ...p, location_link: e.target.value }))} />
                        <textarea className="min-h-32 rounded-md border px-3 py-2 text-sm leading-6 md:col-span-2" placeholder="場所について・利用条件など" value={commonPlace.remarks} onChange={(e) => setCommonPlace((p) => ({ ...p, remarks: e.target.value }))} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-5">
                        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={commonPlace.is_pickup} onChange={(e) => setCommonPlace((p) => ({ ...p, is_pickup: e.target.checked }))} />ピックアップとして表示する</label>
                        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={commonPlace.permit_required} onChange={(e) => setCommonPlace((p) => ({ ...p, permit_required: e.target.checked }))} />許可証が必要</label>
                        <button type="button" className="ml-auto rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300" disabled={creating || !commonPlace.label.trim()} onClick={() => void createCommonPlace()}>{creating ? "登録中..." : "登録する"}</button>
                    </div>
                </section>
            )}

            {error && <div role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}
            {success && <div role="status" className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm font-semibold text-green-800">{success}</div>}

            {loading ? <p className="mt-6 text-sm text-gray-600">読み込み中...</p> : (
                <div className="mt-6 space-y-8">
                    {pickupRows.length > 0 && <section><h2 className="mb-3 text-xl font-bold text-amber-800">★ おすすめ・ピックアップ</h2><div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{pickupRows.map(renderCard)}</div></section>}
                    <section><h2 className="mb-3 text-xl font-bold text-gray-900">駐車許可証一覧</h2>{regularRows.length > 0 ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{regularRows.map(renderCard)}</div> : <div className="rounded-lg border bg-white p-8 text-center text-sm text-gray-600">該当する駐車場所はありません。</div>}</section>
                </div>
            )}

            <section className="mt-8 rounded-lg border bg-yellow-50 p-4"><h2 className="font-bold">中区大作戦</h2><p className="mt-1 text-sm text-gray-700">コインパーキングを極力使わずに、サービスに行ける様にしていきましょう。</p><div className="mt-4 overflow-hidden rounded border bg-white"><Image src="/nakaku_map.png" alt="中区大作戦マップ" width={1200} height={1800} className="h-auto w-full" /></div><p className="mt-2 text-xs text-gray-500">※ 本マップは暫定運用図です。現地状況により利用可否が変わる場合があります。</p></section>
        </main>
    );
}
