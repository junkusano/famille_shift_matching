import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { rerunCsDocOcr, rerunCsDocSummary } from "@/lib/cs-docs-reprocess";

export const maxDuration = 120;

type Body = {
  id?: string;
  mode?: "ocr" | "summary";
  ocr_text?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromBearer(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
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
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
