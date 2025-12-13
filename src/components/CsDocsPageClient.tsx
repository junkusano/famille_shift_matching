"use client";

import { useMemo, useState } from "react";
import type { CsDocRow, CsDocsInitialData } from "@/lib/cs_docs";
import Link from "next/link";

type DocOption = { value: string; label: string };

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
  // 例: https://drive.google.com/uc?export=view&id=XXXX
  const m1 = url.match(/[?&]id=([^&]+)/);
  if (m1?.[1]) return m1[1];

  // 例: https://drive.google.com/file/d/XXXX/view
  const m2 = url.match(/\/file\/d\/([^/]+)/);
  if (m2?.[1]) return m2[1];

  return null;
}

function toDrivePreviewUrl(url: string): string {
  const id = extractDriveFileId(url);
  if (!id) return url;
  // PDFもこれなら “プレビュー” で開く（ダウンロードになりにくい）
  return `https://drive.google.com/file/d/${id}/preview`;
}

type Props = {
  initialData: CsDocsInitialData;
  docMasterList: DocOption[];
};

type Draft = {
  kaipoke_cs_id: string; // "" 許容（未設定）
  source: string;
  doc_name: string;
  doc_date_raw: string; // YYYY-MM-DD or ""
  ocr_text: string;
  summary: string;
};

export default function CsDocsPageClient({ initialData, docMasterList }: Props) {
  const [docs, setDocs] = useState<CsDocRow[]>(initialData.docs);

  // ★ 利用者候補フィルター（ページ上部）
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

  // ★ 行ごとの編集状態（未保存でも背景色が変わる）
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

  const isMissing = (v: string) => v.trim() === "";

  const handleSave = async (row: CsDocRow) => {
    const d = getDraft(row);

    const payload = {
      id: row.id,
      url: row.url ?? null,

      // ★ “移動” を扱うために、更新前の値も送る
      prev_kaipoke_cs_id: row.kaipoke_cs_id ?? null,

      kaipoke_cs_id: emptyToNull(d.kaipoke_cs_id),
      source: emptyToNull(d.source) ?? "manual", // source NOT NULL 対策
      doc_name: emptyToNull(d.doc_name),
      doc_date_raw: emptyToNull(d.doc_date_raw),

      ocr_text: emptyToNull(d.ocr_text),
      summary: emptyToNull(d.summary),
    };

    const res = await fetch("/api/cs-docs/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      alert(`保存に失敗しました\n${txt}`);
      return;
    }

    // ★ 保存後の表示：即時反映（元に戻さない）
    setDocs((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              kaipoke_cs_id: payload.kaipoke_cs_id,
              source: payload.source,
              doc_name: payload.doc_name,
              doc_date_raw: payload.doc_date_raw,
              ocr_text: payload.ocr_text,
              summary: payload.summary,
            }
          : r
      )
    );
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

        <div className="text-xs text-gray-600">
          □（ピンク背景）項目について、利用者、Source、doc_name、日付等の特定を行ってください。利用者情報に紐づき、同期されます。
        </div>

        {/* ★利用者フィルター */}
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-600 whitespace-nowrap">
            利用者フィルター
          </div>
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

              const csInfoId = (row as any).cs_kaipoke_info_id as string | null; // 既存Rowに入っている前提（なければnull）
              const detailHref =
                csInfoId && csInfoId.trim() !== ""
                  ? `/portal/kaipoke-info-detail/${csInfoId}`
                  : null;

              return (
                <tr key={row.id} className="border-t align-top">
                  {/* ファイル */}
                  <td className="p-2 whitespace-nowrap">
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

                  {/* 利用者 */}
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
                          isMissing(d.kaipoke_cs_id) ? "bg-pink-100" : "",
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

                  {/* Source */}
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

                  {/* doc_name */}
                  <td className="p-2">
                    <select
                      value={d.doc_name}
                      onChange={(e) =>
                        patchDraft(row.id, { doc_name: e.target.value }, row)
                      }
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

                  {/* 日付 */}
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

                  {/* OCR */}
                  <td className="p-2">
                    <textarea
                      value={d.ocr_text}
                      onChange={(e) =>
                        patchDraft(row.id, { ocr_text: e.target.value }, row)
                      }
                      className="border w-full h-24"
                    />
                  </td>

                  {/* Summary */}
                  <td className="p-2">
                    <textarea
                      value={d.summary}
                      onChange={(e) =>
                        patchDraft(row.id, { summary: e.target.value }, row)
                      }
                      className="border w-full h-24"
                    />
                  </td>

                  {/* 操作 */}
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
      </div>
    </div>
  );
}
