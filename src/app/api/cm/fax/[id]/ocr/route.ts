import { NextRequest, NextResponse } from "next/server";
import { extractGoogleDriveFileId } from "@/lib/google-drive/upload";
import { downloadCsDocPdf, extractTextWithAbbyy } from "@/lib/cs-docs-reprocess";
import { supabaseAdmin } from "@/lib/supabase/service";

export const maxDuration = 120;

type FaxPage = { id: number; page_number: number; ocr_status: string | null };

function formatOcrError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const preferred = ["message", "error", "details", "hint", "code", "status"]
      .map((key) => value[key])
      .filter((item) => item !== undefined && item !== null && item !== "");

    if (preferred.length > 0) {
      return preferred
        .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
        .join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

/**
 * ABBYYのtxt結果をFAXページへ割り当てる。
 *
 * ABBYYはPDFによってフォームフィードを返さないことがあるため、
 * ページ数と単純に同じ長さだと決めつけない。ページ数が一致する場合は
 * PDF全体のページ位置を優先し、それ以外は未処理ページへ順番に割り当て、
 * 判定できない残りは「未処理」のままにする。
 */
function mapOcrTextToPages(
  ocrText: string,
  allPages: FaxPage[],
  targetPages: FaxPage[],
): Map<number, string> {
  const chunks = ocrText.split(/\f+/).map((text) => text.trim());
  const pageTexts = new Map<number, string>();

  if (chunks.length === allPages.length) {
    allPages.forEach((page, index) => {
      if (targetPages.some((target) => target.id === page.id)) {
        pageTexts.set(page.id, chunks[index] ?? "");
      }
    });
    return pageTexts;
  }

  targetPages.forEach((page, index) => {
    pageTexts.set(page.id, chunks[index] ?? "");
  });

  // 区切りがなく全文が1チャンクの場合は、全文を最初の未処理ページに保存する。
  // 他ページをエラー扱いにせず、必要なら個別に再実行できる状態を保つ。
  if (chunks.length === 1 && targetPages[0]) {
    pageTexts.set(targetPages[0].id, chunks[0]);
  }

  return pageTexts;
}

/** ABBYYへFAX PDFを送り、未処理ページのOCR結果を保存するAPI。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  let faxId = 0;
  try {
    // /api/* は middleware が未ログインアクセスを401で遮断するため、
    // このテストAPIではBearer/Cookieの二重検証を行わない。

    faxId = Number((await params).id);
    if (!Number.isInteger(faxId) || faxId <= 0) {
      return NextResponse.json({ ok: false, error: "FAX IDが不正です" }, { status: 400 });
    }

    const { data: fax, error: faxError } = await supabaseAdmin
      .from("cm_fax_received")
      .select("id,file_id,file_path,page_count")
      .eq("id", faxId)
      .single();
    if (faxError || !fax?.file_id) {
      return NextResponse.json({ ok: false, error: "FAX PDFが見つかりません" }, { status: 404 });
    }

    const { data: pages, error: pageError } = await supabaseAdmin
      .from("cm_fax_pages")
      .select("id,page_number,ocr_status")
      .eq("fax_received_id", faxId)
      .order("page_number", { ascending: true })
    if (pageError || !pages?.length) {
      return NextResponse.json({ ok: false, error: "FAXページが見つかりません" }, { status: 404 });
    }

    const targetPages = pages
      .map((page, index) => ({ page, index }))
      .filter(({ page }) => page.ocr_status !== "completed");
    if (targetPages.length === 0) {
      return NextResponse.json({ ok: true, faxId, processedPages: 0, skipped: true });
    }

    await supabaseAdmin
      .from("cm_fax_received")
      .update({ status: "OCR処理中" })
      .eq("id", faxId);

    await supabaseAdmin
      .from("cm_fax_pages")
      .update({ ocr_status: "processing", ocr_requested_at: new Date().toISOString() })
      .eq("fax_received_id", faxId)
      .in("id", targetPages.map(({ page }) => page.id));

    const fileId = extractGoogleDriveFileId(String(fax.file_id));
    // FAXの保存先は、サービスアカウントから直接見えない場合があるため、
    // 共通のGASゲートウェイ／共有リンクへのフォールバックを利用する。
    const pdf = await downloadCsDocPdf(fileId, "");
    const ocrText = await extractTextWithAbbyy(pdf);
    if (!ocrText) throw new Error("ABBYY OCR結果が空です");

    // ABBYYのtxt出力は通常、ページ区切りをフォームフィードで返す。
    // 区切りがない場合は全文を1ページ目に保存し、他ページは再確認対象に残す。
    const pageTexts = mapOcrTextToPages(
      ocrText,
      pages as FaxPage[],
      targetPages.map(({ page }) => page),
    );

    // 本番DBには旧生成型にない列が存在するため、ここだけ実行時スキーマとして扱う。
    const db = supabaseAdmin as any;
    const processed: Array<{ pageNumber: number; textLength: number }> = [];

    for (const { page } of targetPages) {
      const text = pageTexts.get(page.id) ?? "";
      if (!text) {
        // ABBYYのページ区切りが取得できない場合に、未判定ページを
        // 誤って「OCR失敗」にしない。次回の再実行対象として残す。
        await supabaseAdmin.from("cm_fax_pages").update({ ocr_status: "pending" }).eq("id", page.id);
        continue;
      }

      const { data: existing } = await db
        .from("cm_fax_ocr_results")
        .select("id")
        .eq("fax_received_id", faxId)
        .eq("page_number", page.page_number)
        .maybeSingle();
      const resultPayload = {
        fax_received_id: faxId,
        page_number: page.page_number,
        // The production schema stores OCR text in detected_text.
        detected_text: text,
        ocr_engine: "ABBYY",
        processed_at: new Date().toISOString(),
        processing_time_ms: Date.now() - startedAt,
      };
      const result = existing?.id
        ? await db.from("cm_fax_ocr_results").update(resultPayload).eq("id", existing.id).select("id").single()
        : await db.from("cm_fax_ocr_results").insert(resultPayload).select("id").single();
      if (result.error) throw result.error;

      await supabaseAdmin
        .from("cm_fax_pages")
        .update({ ocr_status: "completed", ocr_result_id: result.data.id })
        .eq("id", page.id);
      processed.push({ pageNumber: page.page_number, textLength: text.length });
    }

    const remaining = targetPages.length - processed.length;
    await supabaseAdmin
      .from("cm_fax_received")
      .update({ status: remaining === 0 ? "pending" : "OCR要確認" })
      .eq("id", faxId);

    return NextResponse.json({
      ok: true,
      faxId,
      processedPages: processed.length,
      remainingPages: remaining,
      textLength: processed.reduce((total, page) => total + page.textLength, 0),
    });
  } catch (error) {
    if (faxId > 0) {
      await supabaseAdmin.from("cm_fax_pages").update({ ocr_status: "error" }).eq("fax_received_id", faxId).eq("page_number", 1);
      await supabaseAdmin.from("cm_fax_received").update({ status: "error" }).eq("id", faxId);
    }
    const message = formatOcrError(error);
    console.error("[api][cm][fax][ocr] error", {
      faxId,
      message,
      error: error instanceof Error ? { name: error.name, stack: error.stack } : error,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
