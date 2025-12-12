// src/app/portal/cs_docs/page.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  getCsDocsInitialData,
  updateCsDocById,
  deleteCsDocById,
  CsDocRow,
  CsDocsInitialData,
  syncCsDocToKaipokeDocuments,
} from "@/lib/cs_docs";

type DocOption = { value: string; label: string };

/* 日付を YYYY-MM-DD に整形（YYYY-MM-DD またはタイムスタンプから） */
function formatDate(value: string | null): string {
  if (!value) return "";
  // すでに YYYY-MM-DD ならそのまま
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // 先頭が YYYY-MM-DD で始まる場合（"2025-11-26 10:19:57.551+00" 等）は先頭 10 文字を使う
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(value)) {
    return value.slice(0, 10);
  }

  // それ以外は Date パースしてから整形（保険）
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const SOURCE_OPTIONS = [
  "FAX",
  "MAIL",
  "UPLOAD",
  "DIGISIGN",
  "SCAN",
  "OTHER",
  "Backfill",
  "manual",
];


export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: { [key: string]: string | string[] | undefined };
};

/** 一覧ページの URL をクエリ付きで生成 */
function buildListPath(
  page: number,
  kaipokeCsId: string,
  kaipokeQuery: string
): string {
  const params = new URLSearchParams();
  if (kaipokeCsId) params.set("kaipoke_cs_id", kaipokeCsId);
  if (kaipokeQuery) params.set("kaipoke_query", kaipokeQuery);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/portal/cs_docs${qs ? `?${qs}` : ""}`;
}

export default async function CsDocsPage({ searchParams }: PageProps) {
  // クエリ（ページ・利用者フィルタ）
  const rawPage =
    typeof searchParams?.page === "string"
      ? parseInt(searchParams.page, 10)
      : 1;
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  const filterKaipokeCsId =
    typeof searchParams?.kaipoke_cs_id === "string"
      ? (searchParams.kaipoke_cs_id as string)
      : "";

  const kaipokeQuery =
    typeof searchParams?.kaipoke_query === "string"
      ? (searchParams.kaipoke_query as string)
      : "";

  // ① cs_docs + kaipoke_cs_id/name は lib から取得（doc_date_raw 降順 + ページ分だけ）
  const { docs, kaipokeList, totalCount, perPage }: CsDocsInitialData =
    await getCsDocsInitialData({
      page,
      perPage: 50,
      kaipokeCsId: filterKaipokeCsId || null,
    });

  const totalPages =
    perPage > 0 ? Math.max(1, Math.ceil(totalCount / perPage)) : 1;
  const fromIndex = (page - 1) * perPage + 1;
  const toIndex = Math.min(page * perPage, totalCount);

  // 利用者絞り込み用の select だけ、名前 or cs_id によるテキストフィルターをかける（③）
  const filteredKaipokeListForFilter = kaipokeQuery
    ? kaipokeList.filter((k) => {
      const q = kaipokeQuery.trim();
      return (
        k.name.includes(q) ||
        k.kaipoke_cs_id.includes(q)
      );
    })
    : kaipokeList;

  // ② user_doc_master は添付の API から取得（category=cs_doc）
  //    Server Component なので絶対URLにする
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    "localhost:3000";
  const forwardedProto = h.get("x-forwarded-proto");
  const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  const protocol = forwardedProto ?? "https";
  const baseUrl = envSiteUrl ?? `${protocol}://${host}`;

  const res = await fetch(`${baseUrl}/api/user-doc-master?category=cs_doc`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `user_doc_master API エラー: ${res.status} ${res.statusText}`
    );
  }
  const docMasterList = (await res.json()) as DocOption[];

  /* ========== 保存アクション（Server Action） ========== */
  const saveAction = async (formData: FormData) => {
    "use server";

    const id = String(formData.get("id") ?? "");
    if (!id) {
      return; // 何も返さない = Promise<void>
    }

    const url = (formData.get("url") as string) || null;
    const kaipoke_cs_id = (formData.get("kaipoke_cs_id") as string) || null;
    const rawSource = String(formData.get("source") ?? "").trim();
    const source = rawSource !== "" ? rawSource : "manual";

    const doc_name = (formData.get("doc_name") as string) || null;

    const ocr_text =
      (formData.get("ocr_text") as string | null | undefined) ?? null;
    const summary =
      (formData.get("summary") as string | null | undefined) ?? null;

    const doc_date_raw_raw = (formData.get("doc_date_raw") as string) || "";
    const doc_date_raw = doc_date_raw_raw ? doc_date_raw_raw : null;

    await updateCsDocById({
      id,
      url,
      kaipoke_cs_id,
      source,
      doc_name,
      ocr_text,
      summary,
      doc_date_raw,
    });

    try {
      await syncCsDocToKaipokeDocuments({
        url,
        kaipoke_cs_id,
        doc_name,
        doc_date_raw,
      });
    } catch (e) {
      console.error("[cs_docs] syncCsDocToKaipokeDocuments failed:", e);
    }

    revalidatePath("/portal/cs_docs");
    // ここで何も return しない → Promise<void> になる
  };


  /* ========== 削除アクション（Server Action） ========== */
  const deleteAction = async (formData: FormData) => {
    "use server";

    const id = String(formData.get("id") ?? "");
    if (!id) return;

    await deleteCsDocById(id);

    // 削除後も同じフィルタ・ページに戻る（念のため存在しないページにはしない）
    const nextPage =
      docs.length === 1 && page > 1 ? page - 1 : page;
    redirect(buildListPath(nextPage, filterKaipokeCsId, kaipokeQuery));
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">cs_docs 管理</h1>

      <p className="text-sm text-gray-600">
        背景が赤くなっている項目（利用者、Source、doc_name、日付 など）について、
        正しい値を入力して「保存」してください。保存時に利用者情報（cs_kaipoke_info）
        側の書類情報とも同期されます（URL が一致するもののみ）。
      </p>

      {/* 絞り込みフォーム */}
      <form
        method="GET"
        action="/portal/cs_docs"
        className="flex flex-wrap items-end gap-4 text-xs"
      >
        <div>
          <label className="block text-[11px] text-gray-600">
            利用者検索（名前 or CS-ID 部分一致）
          </label>
          <input
            name="kaipoke_query"
            defaultValue={kaipokeQuery}
            className="border rounded px-1 py-0.5 text-[11px] min-w-[16rem]"
            placeholder="例）戸城 / 8180 など"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-600">
            利用者で絞り込み
          </label>
          <select
            name="kaipoke_cs_id"
            defaultValue={filterKaipokeCsId}
            className="border rounded px-1 py-0.5 text-[11px] min-w-[16rem]"
          >
            <option value="">(すべて)</option>
            {filteredKaipokeListForFilter.map((k) => (
              <option key={k.kaipoke_cs_id} value={k.kaipoke_cs_id}>
                {k.name} ({k.kaipoke_cs_id})
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="page" value="1" />
        <button
          type="submit"
          className="border rounded px-3 py-1 text-[11px] bg-gray-100 hover:bg-gray-200"
        >
          絞り込み
        </button>
        {(filterKaipokeCsId || kaipokeQuery) && (
          <a
            href="/portal/cs_docs"
            className="border rounded px-3 py-1 text-[11px] bg-white hover:bg-gray-100"
          >
            絞り込み解除
          </a>
        )}
      </form>

      <div className="border rounded overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th colSpan={8} className="border px-0 py-0">
                <div className="grid grid-cols-[8rem,13rem,5rem,11rem,9rem,1fr,1fr,5rem]">
                  <div className="px-2 py-1 border-r">URL</div>
                  <div className="px-2 py-1 border-r">利用者</div>
                  <div className="px-2 py-1 border-r">Source</div>
                  <div className="px-2 py-1 border-r">doc_name</div>
                  <div className="px-2 py-1 border-r">日付(doc_date_raw)</div>
                  <div className="px-2 py-1 border-r">OCR テキスト</div>
                  <div className="px-2 py-1 border-r">Summary</div>
                  <div className="px-2 py-1">操作</div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {docs.map((row: CsDocRow) => {
              const isEmptyKaipoke = !row.kaipoke_cs_id;
              const isEmptySource = !row.source;
              const isEmptyDocName = !row.doc_name;
              const isEmptyDocDate = !row.doc_date_raw;

              const kaipokeInfo = kaipokeList.find(
                (k) => k.kaipoke_cs_id === row.kaipoke_cs_id
              );

              return (
                <tr key={row.id}>
                  <td colSpan={8} className="border px-0 py-0">
                    {/* 各行ごとに 1 つの form。保存: action=saveAction, 削除: button の formAction=deleteAction */}
                    <form
                      action={saveAction}
                      className="grid grid-cols-[8rem,13rem,5rem,11rem,9rem,1fr,1fr,5rem] gap-px"
                    >
                      {/* hidden: id */}
                      <input type="hidden" name="id" value={row.id} />

                      {/* URL（キー扱い：編集不可・非テキストボックス） */}
                      <div className="p-1 border-r">
                        <div className="text-[11px] break-all">
                          {row.url ?? "(URLなし)"}
                        </div>
                        {row.url && (
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-600 underline mt-1 inline-block"
                          >
                            開く
                          </a>
                        )}
                        {/* サーバ側には値を渡す（同期用） */}
                        <input
                          type="hidden"
                          name="url"
                          value={row.url ?? ""}
                        />
                      </div>

                      {/* 利用者（cs_kaipoke_info: kaipoke_cs_id, name） */}
                      <div className="p-1 border-r">
                        <select
                          name="kaipoke_cs_id"
                          defaultValue={row.kaipoke_cs_id ?? ""}
                          className={`border rounded px-1 py-0.5 text-[11px] w-full ${isEmptyKaipoke ? "bg-red-100" : ""
                            }`}
                        >
                          {[
                            { value: "", label: "(未設定)" },
                            ...kaipokeList.map((k) => ({
                              value: k.kaipoke_cs_id,
                              label: `${k.name} (${k.kaipoke_cs_id})`,
                            })),
                          ].map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {kaipokeInfo && (
                          <a
                            href={`/portal/kaipoke-info-detail/${kaipokeInfo.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block text-[11px] text-blue-600 underline"
                          >
                            利用者詳細を開く
                          </a>
                        )}
                      </div>

                      {/* Source */}
                      <div className="p-1 border-r">
                        <select
                          name="source"
                          defaultValue={row.source ?? ""}
                          className={`border rounded px-1 py-0.5 text-[11px] w-full ${isEmptySource ? "bg-red-100" : ""
                            }`}
                        >
                          {[
                            { value: "", label: "(未設定)" },
                            ...SOURCE_OPTIONS.map((s) => ({
                              value: s,
                              label: s,
                            })),
                          ].map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* doc_name（user_doc_master API の label を保存） */}
                      <div className="p-1 border-r">
                        <select
                          name="doc_name"
                          defaultValue={row.doc_name ?? ""}
                          className={`border rounded px-1 py-0.5 text-[11px] w-full ${isEmptyDocName ? "bg-red-100" : ""
                            }`}
                        >
                          {[
                            { value: "", label: "(未設定)" },
                            ...docMasterList.map((d) => ({
                              value: d.label,
                              label: d.label,
                            })),
                          ].map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* doc_date_raw */}
                      <div className="p-1 border-r">
                        <input
                          type="date"
                          name="doc_date_raw"
                          defaultValue={formatDate(row.doc_date_raw)}
                          className={`border rounded px-1 py-0.5 text-[11px] w-full ${isEmptyDocDate ? "bg-red-100" : ""
                            }`}
                        />
                      </div>

                      {/* OCR テキスト */}
                      <div className="p-1 border-r">
                        <textarea
                          name="ocr_text"
                          defaultValue={row.ocr_text ?? ""}
                          className="border rounded px-1 py-0.5 text-[11px] w-full h-32"
                        />
                      </div>

                      {/* Summary */}
                      <div className="p-1 border-r">
                        <textarea
                          name="summary"
                          defaultValue={row.summary ?? ""}
                          className="border rounded px-1 py-0.5 text-[11px] w-full h-32"
                        />
                      </div>

                      {/* 操作（保存 / 削除） */}
                      <div className="p-1 flex flex-col gap-1 items-stretch">
                        <button
                          type="submit"
                          className="border rounded px-2 py-1 text-[11px] bg-blue-600 text-white"
                        >
                          保存
                        </button>

                        {/* 同じ form から deleteAction を叩く */}
                        <button
                          formAction={deleteAction}
                          className="border rounded px-2 py-1 text-[11px] bg-red-600 text-white"
                        >
                          削除
                        </button>
                      </div>
                    </form>
                  </td>
                </tr>
              );
            })}

            {docs.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="border px-2 py-4 text-center text-xs text-gray-500"
                >
                  レコードがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ページャー */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div>
          {totalCount === 0 ? (
            <>0 件</>
          ) : (
            <>
              {fromIndex}〜{toIndex} 件 / 全 {totalCount} 件
            </>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <a
                href={buildListPath(page - 1, filterKaipokeCsId, kaipokeQuery)}
                className="border rounded px-2 py-1 bg-white hover:bg-gray-100"
              >
                前へ
              </a>
            ) : (
              <span className="border rounded px-2 py-1 text-gray-300">
                前へ
              </span>
            )}
            <span>
              {page} / {totalPages} ページ
            </span>
            {page < totalPages ? (
              <a
                href={buildListPath(page + 1, filterKaipokeCsId, kaipokeQuery)}
                className="border rounded px-2 py-1 bg-white hover:bg-gray-100"
              >
                次へ
              </a>
            ) : (
              <span className="border rounded px-2 py-1 text-gray-300">
                次へ
              </span>
            )}
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-400">
        ・cs_docs / cs_kaipoke_info は <code>@/lib/cs_docs</code> から直接 Supabase
        を叩いています。<br />
        ・user_doc_master は{" "}
        <code>{baseUrl}/api/user-doc-master?category=cs_doc</code>{" "}
        の結果（value, label）を使っています。
      </div>
    </div>
  );
}
