import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { downloadGoogleDriveFile } from "@/lib/google-drive/upload";
import { extractTextWithAbbyy } from "@/lib/cs-docs-reprocess";
import { supabaseAdmin } from "@/lib/supabase/service";

export const maxDuration = 120;

const ALLOWED_ROLES = new Set(["manager", "admin", "system_admin", "super_admin"]);

async function canRunOcr(authUserId: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return ALLOWED_ROLES.has(String(data?.system_role ?? "").toLowerCase());
}

/** ABBYYへ1件のFAX PDFを送り、1ページ目のOCR結果を保存するテスト用API。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  let faxId = 0;
  try {
    const { user } = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    if (!(await canRunOcr(user.id))) {
      return NextResponse.json({ ok: false, error: "OCR実行の権限がありません" }, { status: 403 });
    }

    faxId = Number((await params).id);
    if (!Number.isInteger(faxId) || faxId <= 0) {
      return NextResponse.json({ ok: false, error: "FAX IDが不正です" }, { status: 400 });
    }

    const { data: fax, error: faxError } = await supabaseAdmin
      .from("cm_fax_received")
      .select("id,file_id,page_count")
      .eq("id", faxId)
      .single();
    if (faxError || !fax?.file_id) {
      return NextResponse.json({ ok: false, error: "FAX PDFが見つかりません" }, { status: 404 });
    }

    const { data: page, error: pageError } = await supabaseAdmin
      .from("cm_fax_pages")
      .select("id,page_number,ocr_status")
      .eq("fax_received_id", faxId)
      .order("page_number", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pageError || !page) {
      return NextResponse.json({ ok: false, error: "FAXページが見つかりません" }, { status: 404 });
    }

    await supabaseAdmin
      .from("cm_fax_pages")
      .update({ ocr_status: "processing", ocr_requested_at: new Date().toISOString() })
      .eq("id", page.id);

    const pdf = await downloadGoogleDriveFile(String(fax.file_id));
    const ocrText = await extractTextWithAbbyy(pdf);
    if (!ocrText) throw new Error("ABBYY OCR結果が空です");

    // 本番DBには旧生成型にない ocr_text 列が存在するため、ここだけ実行時スキーマとして扱う。
    const db = supabaseAdmin as any;
    const { data: existing } = await db
      .from("cm_fax_ocr_results")
      .select("id")
      .eq("fax_received_id", faxId)
      .eq("page_number", page.page_number)
      .maybeSingle();
    const resultPayload = {
      fax_received_id: faxId,
      page_number: page.page_number,
      ocr_text: ocrText,
      detected_text: ocrText,
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

    return NextResponse.json({ ok: true, faxId, pageNumber: page.page_number, resultId: result.data.id, textLength: ocrText.length });
  } catch (error) {
    if (faxId > 0) {
      await supabaseAdmin.from("cm_fax_pages").update({ ocr_status: "error" }).eq("fax_received_id", faxId).eq("page_number", 1);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api][cm][fax][ocr] error", { faxId, message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
