import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import {
  CsDocDriveFileUnavailableError,
  rerunCsDocOcr,
  rerunCsDocOcrFromPdf,
  rerunCsDocSummary,
} from "@/lib/cs-docs-reprocess";
import { supabaseAdmin } from "@/lib/supabase/service";

export const maxDuration = 120;

type Body = {
  id?: string;
  mode?: "ocr" | "summary";
  ocr_text?: string;
};

const REPROCESS_ROLES = new Set(["manager", "admin", "system_admin", "super_admin"]);

async function canReprocess(authUserId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error) throw error;
  return REPROCESS_ROLES.has(String(data?.system_role ?? "").toLowerCase());
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromBearer(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }
    if (!(await canReprocess(user.id))) {
      return NextResponse.json({ ok: false, error: "再処理の権限がありません" }, { status: 403 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const id = String(form.get("id") ?? "").trim();
      const mode = String(form.get("mode") ?? "");
      const file = form.get("file");

      if (!id) {
        return NextResponse.json({ ok: false, error: "id がありません" }, { status: 400 });
      }
      if (mode !== "ocr" || !(file instanceof File)) {
        return NextResponse.json(
          { ok: false, error: "再OCRするPDFファイルを指定してください" },
          { status: 400 },
        );
      }

      const pdf = Buffer.from(await file.arrayBuffer());
      if (pdf.length === 0 || pdf.subarray(0, 4).toString("utf8") !== "%PDF") {
        return NextResponse.json(
          { ok: false, error: "PDF形式のファイルを選択してください" },
          { status: 400 },
        );
      }

      return NextResponse.json({
        ok: true,
        mode: "ocr",
        ocr_text: await rerunCsDocOcrFromPdf(id, pdf),
      });
    }

    const body = (await req.json()) as Body;
    const id = body.id?.trim() ?? "";
    if (!id) return NextResponse.json({ ok: false, error: "id がありません" }, { status: 400 });

    if (body.mode === "ocr") {
      return NextResponse.json({ ok: true, mode: "ocr", ocr_text: await rerunCsDocOcr(id) });
    }
    if (body.mode === "summary") {
      return NextResponse.json({
        ok: true,
        mode: "summary",
        summary: await rerunCsDocSummary(id, body.ocr_text),
      });
    }
    return NextResponse.json({ ok: false, error: "mode は ocr または summary を指定してください" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api][cs-docs][reprocess] error", error);
    if (error instanceof CsDocDriveFileUnavailableError) {
      return NextResponse.json(
        { ok: false, code: error.code, error: message },
        { status: 422 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
