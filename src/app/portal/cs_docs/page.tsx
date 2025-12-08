// src/app/portal/cs_docs/page.tsx
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  getCsDocsInitialData,
  updateCsDocById,
  deleteCsDocById,
  CsDocRow,
  CsDocsInitialData,
} from "@/lib/cs_docs";

type DocOption = { value: string; label: string };

/* 日付を YYYY-MM-DD に整形 */
function formatDate(value: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const SOURCE_OPTIONS = ["FAX", "MAIL", "UPLOAD", "DIGISIGN", "SCAN", "OTHER"];

export const dynamic = "force-dynamic";

export default async function CsDocsPage() {
  // ① cs_docs + kaipoke_cs_id/name は lib から取得
  const { docs, kaipokeList }: CsDocsInitialData = await getCsDocsInitialData();

  // ② user_doc_master は添付の API から取得（category=cs_doc）
  //    Server Component なので絶対URLにする
  const h = await headers(); // ★ ここを await に修正
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
    if (!id) return;

    const url = (formData.get("url") as string) || null;
    const kaipoke_cs_id = (formData.get("kaipoke_cs_id") as string) || null;
    const source = (formData.get("source") as string) || null;

    // user-doc-master API は { value, label } を返すので、
    // doc_name には label を保存する想定
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

    revalidatePath("/portal/cs_docs");
  };

  /* ========== 削除アクション（Server Action） ========== */
  const deleteAction = async (formData: FormData) => {
    "use server";

    const id = String(formData.get("id") ?? "");
    if (!id) return;

    await deleteCsDocById(id);
    revalidatePath("/portal/cs_docs");
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-lg font-bold">cs_docs 管理</h1>

      <p className="text-sm text-gray-600">
        url, 利用者（cs_kaipoke_info: kaipoke_cs_id,name）, source,
        doc_name（user_doc_master API）, ocr_text, summary, doc_date_raw を
        インラインで編集して保存できます。
      </p>

      <div className="border rounded overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="border px-2 py-1 w-32">URL</th>
              <th className="border px-2 py-1 w-52">利用者</th>
              <th className="border px-2 py-1 w-24">Source</th>
              <th className="border px-2 py-1 w-48">doc_name</th>
              <th className="border px-2 py-1 w-40">日付(doc_date_raw)</th>
              <th className="border px-2 py-1 w-80">OCR テキスト</th>
              <th className="border px-2 py-1 w-80">Summary</th>
              <th className="border px-2 py-1 w-28">操作</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((row: CsDocRow) => (
              <tr key={row.id}>
                <td colSpan={8} className="border px-0 py-0">
                  {/* 各行ごとに 1 つの form。保存: action=saveAction, 削除: button の formAction=deleteAction */}
                  <form
                    action={saveAction}
                    className="grid grid-cols-[8rem,13rem,5rem,11rem,9rem,1fr,1fr,5rem] gap-px"
                  >
                    {/* hidden: id */}
                    <input type="hidden" name="id" value={row.id} />

                    {/* URL */}
                    <div className="p-1 border-r">
                      <input
                        className="border rounded px-1 py-0.5 text-[11px] w-full"
                        name="url"
                        defaultValue={row.url ?? ""}
                      />
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
                    </div>

                    {/* 利用者（cs_kaipoke_info: kaipoke_cs_id, name） */}
                    <div className="p-1 border-r">
                      <select
                        name="kaipoke_cs_id"
                        defaultValue={row.kaipoke_cs_id ?? ""}
                        className="border rounded px-1 py-0.5 text-[11px] w-full"
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
                    </div>

                    {/* Source */}
                    <div className="p-1 border-r">
                      <select
                        name="source"
                        defaultValue={row.source ?? ""}
                        className="border rounded px-1 py-0.5 text-[11px] w-full"
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
                        className="border rounded px-1 py-0.5 text-[11px] w-full"
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
                        className="border rounded px-1 py-0.5 text-[11px] w-full"
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
                        onClick={(e) => {
                          if (!confirm("このレコードを削除しますか？")) {
                            e.preventDefault();
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}

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
