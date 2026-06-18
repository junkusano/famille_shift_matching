"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type HealthAttachment = {
    id: string;
    request_id: string;
    file_name: string;
    file_path: string;
    mime_type: string | null;
    file_size: number | null;
    kind: string;
    uploaded_by_user_id: string;
    created_at: string;
    request?: {
        id: string;
        title: string | null;
        status: string;
        submitted_at: string | null;
        created_at: string;
        applicant_user_id: string;
        request_type?: {
            code: string;
            label: string;
        } | null;
    } | null;
};

type GroupedByYear = {
    fiscalYear: number;
    rows: HealthAttachment[];
};

function extractFileId(u?: string | null) {
    if (!u) return null;
    const m = u.match(/(?:\/d\/|[?&]id=)([-\w]{25,})/);
    return m ? m[1] : null;
}

function formatDate(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(
        d.getDate()
    ).padStart(2, "0")}日`;
}

// 2025年度 = 2025/4/1 ～ 2026/3/31
function getFiscalYear(value?: string | null) {
    const d = value ? new Date(value) : new Date();
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    return month >= 4 ? year : year - 1;
}

export default function HealthCheckResultsPage() {
    const [rows, setRows] = useState<HealthAttachment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openYears, setOpenYears] = useState<Record<number, boolean>>({});

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);

            try {
                const { data: sessionData, error: sessionError } =
                    await supabase.auth.getSession();

                if (sessionError) throw sessionError;

                const authUserId = sessionData.session?.user?.id;
                if (!authUserId) {
                    setRows([]);
                    setError("ログイン情報を取得できませんでした。");
                    return;
                }

                const { data: userRows, error: userError } = await supabase
                    .from("user_entry_united_view_single")
                    .select("user_id, auth_user_id")
                    .eq("auth_user_id", authUserId)
                    .limit(1);

                if (userError) throw userError;

                const loginUserId = userRows?.[0]?.user_id;
                if (!loginUserId) {
                    setRows([]);
                    setError("ログインユーザーの user_id が取得できませんでした。");
                    return;
                }

                const { data, error: fetchError } = await supabase
                    .from("wf_request_attachment")
                    .select(
                        `
                        id,
                        request_id,
                        file_name,
                        file_path,
                        mime_type,
                        file_size,
                        kind,
                        uploaded_by_user_id,
                        created_at,
                        request:wf_request!inner(
                            id,
                            title,
                            status,
                            submitted_at,
                            created_at,
                            applicant_user_id,
                            request_type:wf_request_type!inner(
                                code,
                                label
                            )
                        )
                    `
                    )
                    .eq("kind", "health_result")
                    .eq("request.request_type.code", "health_check")
                    .eq("request.applicant_user_id", loginUserId)
                    .order("created_at", { ascending: false });

                if (fetchError) throw fetchError;

                const loaded = (data ?? []) as unknown as HealthAttachment[];
                setRows(loaded);

                const initialOpen: Record<number, boolean> = {};
                for (const row of loaded) {
                    const baseDate =
                        row.request?.submitted_at ?? row.request?.created_at ?? row.created_at;
                    initialOpen[getFiscalYear(baseDate)] = true;
                }
                setOpenYears(initialOpen);
            } catch (e) {
                setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    const grouped = useMemo<GroupedByYear[]>(() => {
        const map = new Map<number, HealthAttachment[]>();

        for (const row of rows) {
            const baseDate =
                row.request?.submitted_at ?? row.request?.created_at ?? row.created_at;
            const fy = getFiscalYear(baseDate);
            const list = map.get(fy) ?? [];
            list.push(row);
            map.set(fy, list);
        }

        return Array.from(map.entries())
            .sort((a, b) => b[0] - a[0])
            .map(([fiscalYear, yearRows]) => ({
                fiscalYear,
                rows: yearRows.sort((a, b) => {
                    const ad = new Date(
                        a.request?.submitted_at ?? a.request?.created_at ?? a.created_at
                    ).getTime();
                    const bd = new Date(
                        b.request?.submitted_at ?? b.request?.created_at ?? b.created_at
                    ).getTime();
                    return bd - ad;
                }),
            }));
    }, [rows]);

    return (
        <div className="min-h-screen bg-gray-50 text-black">
            <div className="border-b bg-white px-4 py-3">
                <h1 className="text-lg font-bold">健康診断結果</h1>
                <p className="mt-1 text-sm text-gray-600">
                    申請フォームから提出された健康診断結果を年度ごとに表示します。
                </p>
            </div>

            <main className="max-w-5xl mx-auto p-4">
                {loading && (
                    <div className="rounded border bg-white p-4 text-sm text-gray-600">
                        読み込み中です…
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {!loading && !error && grouped.length === 0 && (
                    <div className="rounded border bg-white p-4 text-sm text-gray-600">
                        健康診断結果の添付はまだありません。
                    </div>
                )}

                {!loading &&
                    !error &&
                    grouped.map((group) => {
                        const isOpen = openYears[group.fiscalYear] ?? false;

                        return (
                            <section
                                key={group.fiscalYear}
                                className="mb-4 overflow-hidden rounded border bg-white"
                            >
                                <button
                                    type="button"
                                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                                    onClick={() =>
                                        setOpenYears((prev) => ({
                                            ...prev,
                                            [group.fiscalYear]: !isOpen,
                                        }))
                                    }
                                >
                                    <div>
                                        <div className="font-bold">
                                            {isOpen ? "▼" : "▶"} {group.fiscalYear}年度
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">
                                            {group.fiscalYear}年4月1日 ～ {group.fiscalYear + 1}
                                            年3月31日
                                        </div>
                                    </div>

                                    <div className="text-sm text-gray-600">
                                        {group.rows.length}件
                                    </div>
                                </button>

                                {isOpen && (
                                    <div className="border-t p-4">
                                        <div className="space-y-4">
                                            {group.rows.map((row) => {
                                                const baseDate =
                                                    row.request?.submitted_at ??
                                                    row.request?.created_at ??
                                                    row.created_at;

                                                const fileId = extractFileId(row.file_path);

                                                const imageUrl = fileId
                                                    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
                                                    : row.file_path;

                                                const pdfUrl = fileId
                                                    ? `https://drive.google.com/file/d/${fileId}/preview`
                                                    : row.file_path;

                                                const isImage =
                                                    row.mime_type?.startsWith("image/") ||
                                                    /\.(png|jpe?g|webp|gif)$/i.test(row.file_name);

                                                const isPdf =
                                                    row.mime_type === "application/pdf" ||
                                                    /\.pdf$/i.test(row.file_name);

                                                return (
                                                    <div
                                                        key={row.id}
                                                        className="rounded border bg-gray-50 p-3"
                                                    >
                                                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                                <div className="font-semibold">
                                                                    受診日：{formatDate(baseDate)}
                                                                </div>
                                                                <div className="text-xs text-gray-600">
                                                                    {row.file_name}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {isImage ? (
                                                            <div className="rounded border bg-white p-2">
                                                                <img
                                                                    src={imageUrl}
                                                                    alt={row.file_name}
                                                                    className="max-h-[720px] w-full object-contain"
                                                                />
                                                            </div>
                                                        ) : isPdf ? (
                                                            <div className="rounded border bg-white p-2">
                                                                <iframe
                                                                    src={pdfUrl}
                                                                    title={row.file_name}
                                                                    className="h-[720px] w-full rounded border"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="rounded border bg-white p-4 text-sm text-gray-600">
                                                                このファイル形式はプレビュー表示できません。
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>
                        );
                    })}
            </main>
        </div>
    );
}