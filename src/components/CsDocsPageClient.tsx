"use client";

import { useMemo, useState } from "react";
import type { CsDocRow, CsDocsInitialData } from "@/lib/cs_docs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation"; // 追加

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
};

type Draft = {
    kaipoke_cs_id: string;
    source: string;
    doc_name: string;
    doc_date_raw: string;
    ocr_text: string;
    summary: string;
};

export default function CsDocsPageClient({ initialData, docMasterList, page, perPage }: Props) {
    const [docs, setDocs] = useState<CsDocRow[]>(initialData.docs);
    const router = useRouter();
    const searchParams = useSearchParams();

    const hasPrev = page > 1;
    const hasNext = docs.length === perPage; // totalが無くてもOK判定

    const buildHref = (nextPage: number, nextPerPage: number) => {
        const sp = new URLSearchParams(searchParams?.toString());
        sp.set("page", String(nextPage));
        sp.set("perPage", String(nextPerPage));
        return `/portal/cs_docs?${sp.toString()}`;
    };
    const [kaipokeFilter, setKaipokeFilter] = useState<string>("");

    const filteredKaipokeList = useMemo(() => {
        const q = kaipokeFilter.trim().toLowerCase();
        if (!q) return initialData.kaipokeList;

        return initialData.kaipokeList.filter((k) => {
            const name = (k.name ?? "").toLowerCase();
            const id = (k.kaipoke_cs_id ?? "").toLowerCase();
            return name.includes(q) || id.includes(q);
        });
    }, [initialData.kaipokeList, kaipokeFilter]);

    const [drafts, setDrafts] = useState<Record<string, Draft>>({});

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

    const hasKaipokeOption = (value: string): boolean => {
        const v = value.trim();
        if (v === "") return false;
        return initialData.kaipokeList.some((k) => k.kaipoke_cs_id === v);
    };

    const needsPinkKaipoke = (value: string): boolean => {
        // 空欄 または 候補に無い値
        return value.trim() === "" || !hasKaipokeOption(value);
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
        setDrafts((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    return (
        <div className="p-4 space-y-3">
            <div className="space-y-2">
                <h1 className="text-lg font-bold">cs_docs 管理</h1>
                {/* ✅ ページャー */}
                <div className="flex items-center gap-3 text-xs">
                    <div className="text-gray-600">Page: {page}</div>

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

                    <div className="ml-3 flex items-center gap-2">
                        <span className="text-gray-600">表示件数</span>
                        <select
                            value={perPage}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                // perPage 変更時は 1ページ目に戻す
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

                <div className="text-xs text-gray-600">
                    □（ピンク背景）項目について、利用者、Source、doc_name、日付等の特定を行ってください。利用者情報に紐づき、同期されます。
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-600 whitespace-nowrap">利用者フィルター</div>
                    <input
                        value={kaipokeFilter}
                        onChange={(e) => setKaipokeFilter(e.target.value)}
                        placeholder="氏名 or kaipoke_cs_id で検索"
                        className="border px-2 py-1 text-xs w-80"
                    />
                    {kaipokeFilter.trim() !== "" && (
                        <button
                            type="button"
                            className="text-xs underline"
                            onClick={() => setKaipokeFilter("")}
                        >
                            クリア
                        </button>
                    )}
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
                                                <div className="text-gray-400">（利用者未特定）</div>
                                            )}

                                            <select
                                                value={d.kaipoke_cs_id}
                                                onChange={(e) =>
                                                    patchDraft(row.id, { kaipoke_cs_id: e.target.value }, row)
                                                }
                                                className={[
                                                    "border w-full",
                                                    needsPinkKaipoke(d.kaipoke_cs_id) ? "bg-pink-100" : "",
                                                ].join(" ")}

                                            >
                                                <option value="">(未設定)</option>
                                                {filteredKaipokeList.map((k) => (
                                                    <option key={k.kaipoke_cs_id} value={k.kaipoke_cs_id}>
                                                        {k.name} ({k.kaipoke_cs_id})
                                                    </option>
                                                ))}
                                            </select>
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
                                                className="bg-blue-600 text-white px-2 py-1 text-xs"
                                            >
                                                保存
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => handleDelete(row.id)}
                                                className="bg-red-600 text-white px-2 py-1 text-xs"
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
                {/* ✅ ページャー */}
                <div className="flex items-center gap-3 text-xs">
                    <div className="text-gray-600">Page: {page}</div>

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

                    <div className="ml-3 flex items-center gap-2">
                        <span className="text-gray-600">表示件数</span>
                        <select
                            value={perPage}
                            onChange={(e) => {
                                const next = Number(e.target.value);
                                // perPage 変更時は 1ページ目に戻す
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
            </div>
        </div>
    );
}
