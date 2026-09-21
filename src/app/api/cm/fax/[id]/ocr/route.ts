import { NextRequest, NextResponse } from "next/server";
import { extractGoogleDriveFileId } from "@/lib/google-drive/upload";
import { downloadCsDocPdf, extractTextWithAbbyy } from "@/lib/cs-docs-reprocess";
import { supabaseAdmin } from "@/lib/supabase/service";

export const maxDuration = 120;

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
    const pageTexts = ocrText.split(/\f+/).map((text) => text.trim());

    // 本番DBには旧生成型にない列が存在するため、ここだけ実行時スキーマとして扱う。
    const db = supabaseAdmin as any;
    const processed: Array<{ pageNumber: number; textLength: number }> = [];

    for (const { page, index } of targetPages) {
      const text = pageTexts[index] || (index === 0 ? ocrText : "");
      if (!text) {
        await supabaseAdmin.from("cm_fax_pages").update({ ocr_status: "error" }).eq("id", page.id);
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api][cm][fax][ocr] error", { faxId, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
