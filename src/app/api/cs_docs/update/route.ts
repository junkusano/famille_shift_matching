import { NextRequest, NextResponse } from "next/server";
import {
  updateCsDocById,
  syncCsDocToKaipokeDocumentsSmart,
} from "@/lib/cs_docs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id: string;
      url: string | null;

      prev_kaipoke_cs_id: string | null;

      kaipoke_cs_id: string | null;
      source: string;
      doc_name: string | null;
      doc_date_raw: string | null;
      ocr_text: string | null;
      summary: string | null;
    };

    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const fixedSource =
      body.source && String(body.source).trim() !== "" ? body.source : "manual";

    await updateCsDocById({
      id: body.id,
      url: body.url ?? null,
      kaipoke_cs_id: body.kaipoke_cs_id ?? null,
      source: fixedSource,
      doc_name: body.doc_name ?? null,
      ocr_text: body.ocr_text ?? null,
      summary: body.summary ?? null,
      doc_date_raw: body.doc_date_raw ?? null,
    });

    // ★ documents 同期（URL/移動を考慮して更新）
    await syncCsDocToKaipokeDocumentsSmart({
      url: body.url ?? null,
      prevKaipokeCsId: body.prev_kaipoke_cs_id ?? null,
      nextKaipokeCsId: body.kaipoke_cs_id ?? null,
      source: fixedSource,
      doc_name: body.doc_name ?? null,
      doc_date_raw: body.doc_date_raw ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("cs_docs update error:", e);
    return NextResponse.json(
      { error: e?.message ?? "update failed" },
      { status: 500 }
    );
  }
}
