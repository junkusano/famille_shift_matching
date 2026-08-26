//components/CsDocsPageClient.tsx
"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { CsDocRow, CsDocsFilters, CsDocsInitialData } from "@/lib/cs_docs";
import { isCsDocUserUnset } from "@/lib/cs-docs-user-unset";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/SearchableSelect";
import { supabase } from "@/lib/supabaseClient";

type DocOption = { value: string; label: string };

type UpdateOk = { ok: true; row: CsDocRow };
type UpdateNg = { ok: false; error: string };
type UpdateRes = UpdateOk | UpdateNg;

const SOURCE_OPTIONS = [
    "manual",
    "FAX",
    "MAIL",
    "UPLOAD",
    "DIGISIGN",
    "SCAN",
    "OTHER",
    "Backfill",
];

type ActiveFilters = {
    kaipokeCsId: string;
    unassignedOnly: boolean;
    keyword: string;
    unclassifiedOnly: boolean;
    dateFrom: string;
    dateTo: string;
};

const EMPTY_FILTERS: ActiveFilters = {
    kaipokeCsId: "",
    unassignedOnly: false,
    keyword: "",
    unclassifiedOnly: false,
    dateFrom: "",
    dateTo: "",
};

function normalizeFilters(filters: CsDocsFilters): ActiveFilters {
    return {
        kaipokeCsId: filters.kaipokeCsId?.trim() ?? "",
        unassignedOnly: filters.unassignedOnly === true,
        keyword: filters.keyword?.trim() ?? "",
        unclassifiedOnly: filters.unclassifiedOnly === true,
        dateFrom: filters.dateFrom?.trim() ?? "",
        dateTo: filters.dateTo?.trim() ?? "",
    };
}

function validateDateRange(dateFrom: string, dateTo: string): string | null {
    if (dateFrom && dateTo && dateFrom > dateTo) {
        return "開始日は終了日以前の日付を指定してください。";
    }

    return null;
}

function formatDate(value: string | null): string {
    if (!value) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

function emptyToNull(v: string): string | null {
    const s = v.trim();
    return s === "" ? null : s;
}

function extractDriveFileId(url: string): string | null {
    const m1 = url.match(/[?&]id=([^&]+)/);
    if (m1?.[1]) return m1[1];
    const m2 = url.match(/\/file\/d\/([^/]+)/);
    if (m2?.[1]) return m2[1];
    return null;
}

function toDrivePreviewUrl(url: string): string {
    const id = extractDriveFileId(url);
    if (!id) return url;
    return `https://drive.google.com/file/d/${id}/preview`;
}

function formatDateTime(value: string | null): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
}


type Props = {
    initialData: CsDocsInitialData;
    docMasterList: DocOption[];
    page: number;
    perPage: number;
    filters: CsDocsFilters;
    filterError: string | null;
};

type Draft = {
    kaipoke_cs_id: string;
    source: string;
    doc_name: string;
    doc_date_raw: string;
    ocr_text: string;
    summary: string;
};

export default function CsDocsPageClient({
    initialData,
    docMasterList,
    page,
    perPage,
    filters,
    filterError,
}: Props) {
    const [docs, setDocs] = useState<CsDocRow[]>(initialData.docs);
    const [totalCount, setTotalCount] = useState(initialData.totalCount);
    const router = useRouter();

    const activeFilters = useMemo(() => normalizeFilters(filters), [filters]);
    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    const hasPrev = page > 1;
    const hasNext = page < totalPages;
    const rangeStart = totalCount === 0 || docs.length === 0 ? 0 : (page - 1) * perPage + 1;
    const rangeEnd =
        totalCount === 0 || docs.length === 0
            ? 0
            : Math.min((page - 1) * perPage + docs.length, totalCount);
    const rangeLabel =
        totalCount === 0
            ? "全 0 件"
            : `全 ${totalCount.toLocaleString()} 件中 ${rangeStart.toLocaleString()}-${rangeEnd.toLocaleString()} 件`;

    const buildHref = (nextPage: number, nextPerPage: number) => {
        return buildHrefWithFilters(nextPage, nextPerPage, activeFilters);
    };

    const buildHrefWithFilters = (
        nextPage: number,
        nextPerPage: number,
        nextFilters: ActiveFilters
    ) => {
        const sp = new URLSearchParams();
        sp.set("page", String(nextPage));
        sp.set("perPage", String(nextPerPage));
        if (nextFilters.kaipokeCsId) sp.set("kaipoke_cs_id", nextFilters.kaipokeCsId);
        if (nextFilters.unassignedOnly) sp.set("unassigned", "1");
        if (nextFilters.keyword) sp.set("keyword", nextFilters.keyword);
        if (nextFilters.unclassifiedOnly) sp.set("unclassified", "1");
        if (nextFilters.dateFrom) sp.set("date_from", nextFilters.dateFrom);
        if (nextFilters.dateTo) sp.set("date_to", nextFilters.dateTo);
        return `/portal/cs_docs?${sp.toString()}`;
    };

    const [keywordInput, setKeywordInput] = useState(activeFilters.keyword);
    const [dateFromInput, setDateFromInput] = useState(activeFilters.dateFrom);
    const [dateToInput, setDateToInput] = useState(activeFilters.dateTo);
    const [localFilterError, setLocalFilterError] = useState<string | null>(filterError);

    const hasActiveFilters =
        activeFilters.kaipokeCsId !== "" ||
        activeFilters.unassignedOnly ||
        activeFilters.keyword !== "" ||
        activeFilters.unclassifiedOnly ||
        activeFilters.dateFrom !== "" ||
        activeFilters.dateTo !== "";

    const kaipokeSelectOptions = useMemo<SearchableSelectOption[]>(
        () =>
            initialData.kaipokeList.map((k) => ({
                value: k.kaipoke_cs_id,
                label: `${k.name ?? "(氏名未設定)"} (${k.kaipoke_cs_id})`,
                searchText: [k.name, k.kana, k.kaipoke_cs_id]
                    .filter((value): value is string => Boolean(value))
                    .join(" "),
            })),
        [initialData.kaipokeList],
    );

    const pushFilters = (nextFilters: ActiveFilters) => {
        const dateError = validateDateRange(nextFilters.dateFrom, nextFilters.dateTo);
        if (dateError) {
            setLocalFilterError(dateError);
            return;
        }

        setLocalFilterError(null);
        router.push(buildHrefWithFilters(1, perPage, nextFilters));
    };

    const patchFilters = (patch: Partial<ActiveFilters>) => {
        pushFilters({
            ...activeFilters,
            keyword: keywordInput.trim(),
            dateFrom: dateFromInput,
            dateTo: dateToInput,
            ...patch,
        });
    };

    const handleFilterSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        pushFilters({
            ...activeFilters,
            keyword: keywordInput.trim(),
            dateFrom: dateFromInput,
            dateTo: dateToInput,
        });
    };

    const handleClearFilters = () => {
        setKeywordInput("");
        setDateFromInput("");
        setDateToInput("");
        setLocalFilterError(null);
        router.push(buildHrefWithFilters(1, perPage, EMPTY_FILTERS));
    };

    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [reprocessing, setReprocessing] = useState<
        Record<string, "ocr" | "summary" | undefined>
    >({});

    // ✅ ページ/検索条件が変わったら Server から来た docs を state に反映
    // （useState初期値は初回マウント時しか使われないため）
    useEffect(() => {
        setDocs(initialData.docs);
        setTotalCount(initialData.totalCount);
        setDrafts({}); // ページを跨いだ下書き混在を防ぐ（必要なら消してOK）
    }, [initialData.docs, initialData.totalCount]);

    useEffect(() => {
        setKeywordInput(activeFilters.keyword);
        setDateFromInput(activeFilters.dateFrom);
        setDateToInput(activeFilters.dateTo);
        setLocalFilterError(filterError);
    }, [
        activeFilters.keyword,
        activeFilters.dateFrom,
        activeFilters.dateTo,
        filterError,
    ]);

    const getDraft = (row: CsDocRow): Draft => {
        const d = drafts[row.id];
        if (d) return d;
        return {
            kaipoke_cs_id: row.kaipoke_cs_id ?? "",
            source: row.source ?? "",
            doc_name: row.doc_name ?? "",
            doc_date_raw: formatDate(row.doc_date_raw),
            ocr_text: row.ocr_text ?? "",
            summary: row.summary ?? "",
        };
    };

    const patchDraft = (id: string, patch: Partial<Draft>, row: CsDocRow) => {
        setDrafts((prev) => {
            const base = prev[id] ?? getDraft(row);
            return { ...prev, [id]: { ...base, ...patch } };
        });
    };

    const needsPinkKaipoke = (value: string): boolean => {
        return isCsDocUserUnset(value);
    };

    const isMissing = (v: string) => v.trim() === "";

    const handleSave = async (row: CsDocRow) => {
        const d = getDraft(row);

        const payload = {
            id: row.id,
            url: row.url ?? null,

            prev_kaipoke_cs_id: row.kaipoke_cs_id ?? null,

            kaipoke_cs_id: emptyToNull(d.kaipoke_cs_id),
            source: emptyToNull(d.source) ?? "manual",
            doc_name: emptyToNull(d.doc_name),
            doc_date_raw: emptyToNull(d.doc_date_raw),

            ocr_text: emptyToNull(d.ocr_text),
            summary: emptyToNull(d.summary),
        };

        let res: Response;
        try {
            res = await fetch("/api/cs-docs/update", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            alert(`保存に失敗しました（通信エラー）\n${msg}`);
            return;
        }

        // 失敗時：JSON優先で読む（本文なし問題を回避）
        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            alert(`保存に失敗しました\n${txt}`);
            return;
        }

        const json = (await res.json().catch(() => null)) as UpdateRes | null;

        if (!json) {
            alert("保存に失敗しました\nレスポンスJSONが読めません");
            return;
        }

        if (json.ok !== true) {
            alert(`保存に失敗しました\n${json.error}`);
            return;
        }

        const updated = json.row;

        // ★ サーバーが返した最新rowで即バインド（表示が元に戻る問題を根絶）
        setDocs((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

        // 下書きも最新に寄せる（任意）
        setDrafts((prev) => ({
            ...prev,
            [updated.id]: {
                kaipoke_cs_id: updated.kaipoke_cs_id ?? "",
                source: updated.source ?? "",
                doc_name: updated.doc_name ?? "",
                doc_date_raw: formatDate(updated.doc_date_raw),
                ocr_text: updated.ocr_text ?? "",
                summary: updated.summary ?? "",
            },
        }));

        alert("保存しました");
    };

    const handleReprocess = async (row: CsDocRow, mode: "ocr" | "summary") => {
        const label = mode === "ocr" ? "OCR" : "サマリー";
        const message =
            mode === "ocr"
                ? "現在のOCR本文をABBYYの再OCR結果で上書きしますか？"
                : "現在のサマリーを再生成結果で上書きしますか？";
        if (!confirm(message)) return;

        setReprocessing((prev) => ({ ...prev, [row.id]: mode }));
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            const token = data.session?.access_token;
            if (!token) throw new Error("ログイン情報を取得できませんでした");

            const draft = getDraft(row);
            const response = await fetch("/api/cs-docs/reprocess", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    id: row.id,
                    mode,
                    ...(mode === "summary" ? { ocr_text: draft.ocr_text } : {}),
                }),
            });
            const result = (await response.json().catch(() => null)) as
                | { ok: true; ocr_text?: string; summary?: string }
                | { ok: false; error?: string }
                | null;
            if (!response.ok || !result || result.ok !== true) {
                const errorMessage = result && "error" in result ? result.error : null;
                throw new Error(errorMessage || `${label}の再処理に失敗しました`);
            }

            const value = mode === "ocr" ? result.ocr_text : result.summary;
            if (!value) throw new Error(`${label}の再処理結果が空です`);

            const field = mode === "ocr" ? "ocr_text" : "summary";
            setDocs((prev) =>
                prev.map((item) =>
                    item.id === row.id ? { ...item, [field]: value } : item,
                ),
            );
            setDrafts((prev) => ({
                ...prev,
                [row.id]: {
                    ...(prev[row.id] ?? draft),
                    [field]: value,
                },
            }));

            alert(
                mode === "ocr"
                    ? "再OCRが完了しました。必要に応じて「再サマリー」も実行してください。"
                    : "サマリーの再生成が完了しました。",
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            alert(`${label}の再処理に失敗しました\n${message}`);
        } finally {
            setReprocessing((prev) => ({ ...prev, [row.id]: undefined }));
        }
    };
    const handleDelete = async (id: string) => {
        if (!confirm("削除しますか？")) return;

        const res = await fetch("/api/cs-docs/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => "");
            alert(`削除に失敗しました\n${txt}`);
            return;
        }

        setDocs((prev) => prev.filter((d) => d.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        setDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const renderPager = () => (
        <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="text-gray-600">
                Page: {page} / {totalPages}（{rangeLabel}）
            </div>

            <Link
                href={hasPrev ? buildHref(page - 1, perPage) : "#"}
                aria-disabled={!hasPrev}
                className={[
                    "px-2 py-1 border rounded",
                    hasPrev ? "hover:bg-gray-50" : "opacity-40 pointer-events-none",
                ].join(" ")}
            >
                ← 前へ
            </Link>

            <Link
                href={hasNext ? buildHref(page + 1, perPage) : "#"}
                aria-disabled={!hasNext}
                className={[
                    "px-2 py-1 border rounded",
                    hasNext ? "hover:bg-gray-50" : "opacity-40 pointer-events-none",
                ].join(" ")}
            >
                次へ →
            </Link>

            <div className="flex items-center gap-2">
                <span className="text-gray-600">表示件数</span>
                <select
                    value={perPage}
                    onChange={(e) => {
                        const next = Number(e.target.value);
                        router.push(buildHref(1, Number.isFinite(next) && next > 0 ? next : perPage));
                    }}
                    className="border px-2 py-1 rounded"
                >
                    {[20, 50, 100, 200].map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );

    return (
        <div className="p-4 space-y-3">
            <div className="space-y-2">
                <h1 className="text-lg font-bold">cs_docs 管理</h1>
                {renderPager()}

                <div className="text-xs text-gray-600">
                    □（ピンク背景）項目について、利用者、Source、doc_name、日付等の特定を行ってください。利用者情報に紐づき、同期されます。
                </div>

                <form
                    onSubmit={handleFilterSubmit}
                    className="rounded border bg-gray-50 p-3 space-y-3 text-xs"
                >
                    <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_160px_160px_auto] md:items-end">
                        <label className="space-y-1">
                            <span className="block text-gray-600">OCR・サマリー検索</span>
                            <input
                                value={keywordInput}
                                onChange={(e) => setKeywordInput(e.target.value)}
                                placeholder="キーワード"
                                className="border px-2 py-1 rounded w-full bg-white"
                            />
                        </label>

                        <label className="space-y-1">
                            <span className="block text-gray-600">開始日</span>
                            <input
                                type="date"
                                value={dateFromInput}
                                onChange={(e) => setDateFromInput(e.target.value)}
                                className="border px-2 py-1 rounded w-full bg-white"
                            />
                        </label>

                        <label className="space-y-1">
                            <span className="block text-gray-600">終了日</span>
                            <input
                                type="date"
                                value={dateToInput}
                                onChange={(e) => setDateToInput(e.target.value)}
                                className="border px-2 py-1 rounded w-full bg-white"
                            />
                        </label>

                        <button
                            type="submit"
                            className="border rounded px-3 py-1 bg-white hover:bg-gray-100 whitespace-nowrap"
                        >
                            検索
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={activeFilters.unassignedOnly}
                                onChange={(e) => patchFilters({ unassignedOnly: e.target.checked })}
                            />
                            <span>利用者未設定のみ</span>
                        </label>

                        <label className="inline-flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={activeFilters.unclassifiedOnly}
                                onChange={(e) => patchFilters({ unclassifiedOnly: e.target.checked })}
                            />
                            <span>分類不能のみ</span>
                        </label>

                        <button
                            type="button"
                            className={[
                                "border rounded px-3 py-1 bg-white",
                                hasActiveFilters ? "hover:bg-gray-100" : "opacity-40 pointer-events-none",
                            ].join(" ")}
                            onClick={handleClearFilters}
                            disabled={!hasActiveFilters}
                        >
                            フィルターをクリア
                        </button>

                        {activeFilters.kaipokeCsId && (
                            <span className="text-gray-600">
                                対象利用者ID: {activeFilters.kaipokeCsId}
                            </span>
                        )}
                    </div>

                    {localFilterError && (
                        <div className="text-red-600">{localFilterError}</div>
                    )}
                </form>

                <div className="text-xs text-gray-600">
                    利用者欄は入力検索で候補を絞り込めます。
                </div>
            </div>

            <div className="border rounded overflow-auto">
                <table className="min-w-full text-xs">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-2 text-left w-[90px]">ファイル</th>
                            <th className="p-2 text-left w-[260px]">利用者</th>
                            <th className="p-2 text-left w-[160px]">Source</th>
                            <th className="p-2 text-left w-[220px]">doc_name</th>
                            <th className="p-2 text-left w-[150px]">日付</th>
                            <th className="p-2 text-left w-[280px]">OCR</th>
                            <th className="p-2 text-left w-[280px]">Summary</th>
                            <th className="p-2 text-left w-[110px]">操作</th>
                        </tr>
                    </thead>

                    <tbody>
                        {docs.map((row) => {
                            const d = getDraft(row);
                            const previewUrl =
                                row.url && row.url.trim() !== "" ? toDrivePreviewUrl(row.url) : null;

                            const detailHref =
                                row.cs_kaipoke_info_id && row.cs_kaipoke_info_id.trim() !== ""
                                    ? `/portal/kaipoke-info-detail/${row.cs_kaipoke_info_id}`
                                    : null;

                            return (
                                <tr key={row.id} className="border-t align-top">
                                    <td className="p-2 whitespace-nowrap">
                                        <div className="text-[10px] text-gray-500 mb-1">
                                            {formatDateTime(row.created_at)}
                                        </div>

                                        {previewUrl ? (
                                            <a
                                                href={previewUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-600 underline"
                                            >
                                                プレビュー
                                            </a>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="p-2">
                                        <div className="space-y-1">
                                            {detailHref ? (
                                                <div>
                                                    <Link href={detailHref} className="text-blue-600 underline">
                                                        利用者詳細
                                                    </Link>
                                                </div>
                                            ) : (
                                                <div className={isCsDocUserUnset(row.kaipoke_cs_id) ? "text-red-600" : "text-amber-600"}>
                                                    {isCsDocUserUnset(row.kaipoke_cs_id)
                                                        ? "（利用者未設定）"
                                                        : "（利用者情報取得エラー）"}
                                                </div>
                                            )}

                                            <SearchableSelect
                                                value={d.kaipoke_cs_id}
                                                onChange={(nextValue) =>
                                                    patchDraft(row.id, { kaipoke_cs_id: nextValue ?? "" }, row)
                                                }
                                                options={kaipokeSelectOptions}
                                                placeholder="未設定"
                                                searchPlaceholder="氏名・カナ・kaipoke_cs_idで検索..."
                                                maxVisibleOptions={50}
                                                triggerClassName={[
                                                    "min-h-8 py-1 text-xs",
                                                    needsPinkKaipoke(d.kaipoke_cs_id) ? "bg-pink-100 text-red-600" : "",
                                                ].join(" ")}
                                            />
                                        </div>
                                    </td>

                                    <td className="p-2">
                                        <select
                                            value={d.source}
                                            onChange={(e) => patchDraft(row.id, { source: e.target.value }, row)}
                                            className={[
                                                "border w-full",
                                                isMissing(d.source) ? "bg-pink-100" : "",
                                            ].join(" ")}
                                        >
                                            <option value="">(未設定)</option>
                                            {SOURCE_OPTIONS.map((s) => (
                                                <option key={s} value={s}>
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td className="p-2">
                                        <select
                                            value={d.doc_name}
                                            onChange={(e) => patchDraft(row.id, { doc_name: e.target.value }, row)}
                                            className={[
                                                "border w-full",
                                                isMissing(d.doc_name) ? "bg-pink-100" : "",
                                            ].join(" ")}
                                        >
                                            <option value="">(未設定)</option>
                                            {docMasterList.map((m) => (
                                                <option key={m.value} value={m.value}>
                                                    {m.label}
                                                </option>
                                            ))}
                                        </select>
                                    </td>

                                    <td className="p-2">
                                        <input
                                            type="date"
                                            value={d.doc_date_raw}
                                            onChange={(e) =>
                                                patchDraft(row.id, { doc_date_raw: e.target.value }, row)
                                            }
                                            className={[
                                                "border w-full",
                                                isMissing(d.doc_date_raw) ? "bg-pink-100" : "",
                                            ].join(" ")}
                                        />
                                    </td>

                                    <td className="p-2">
                                        <textarea
                                            value={d.ocr_text}
                                            onChange={(e) => patchDraft(row.id, { ocr_text: e.target.value }, row)}
                                            className="border w-full h-24"
                                        />
                                    </td>

                                    <td className="p-2">
                                        <textarea
                                            value={d.summary}
                                            onChange={(e) => patchDraft(row.id, { summary: e.target.value }, row)}
                                            className="border w-full h-24"
                                        />
                                    </td>

                                    <td className="p-2">
                                        <div className="flex flex-col gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleSave(row)}
                                                disabled={Boolean(reprocessing[row.id])}
                                                className="bg-blue-600 text-white px-2 py-1 text-xs disabled:bg-gray-300"
                                            >
                                                保存
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleReprocess(row, "ocr")}
                                                disabled={Boolean(reprocessing[row.id]) || !row.url}
                                                className="bg-emerald-600 text-white px-2 py-1 text-xs disabled:bg-gray-300"
                                            >
                                                {reprocessing[row.id] === "ocr" ? "再OCR中..." : "再OCR"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleReprocess(row, "summary")}
                                                disabled={Boolean(reprocessing[row.id]) || isMissing(d.ocr_text)}
                                                className="bg-violet-600 text-white px-2 py-1 text-xs disabled:bg-gray-300"
                                            >
                                                {reprocessing[row.id] === "summary"
                                                    ? "再生成中..."
                                                    : "再サマリー"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleDelete(row.id)}
                                                disabled={Boolean(reprocessing[row.id])}
                                                className="bg-red-600 text-white px-2 py-1 text-xs disabled:bg-gray-300"
                                            >
                                                削除
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {docs.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center p-4 text-gray-400">
                                    データがありません
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {renderPager()}

        </div>
    );
}
