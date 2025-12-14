import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Attachment = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at: string;
  acquired_at: string;
};

type Body = {
  csKaipokeInfoId: string;     // cs_kaipoke_info.id
  documents: Attachment[];     // 更新後のdocuments（next）
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function toIsoDateOnly(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (!isNonEmptyString(body.csKaipokeInfoId)) {
      return NextResponse.json({ ok: false, error: "csKaipokeInfoId is required" }, { status: 400 });
    }

    const docs = Array.isArray(body.documents) ? body.documents : [];

    // cs_kaipoke_info から kaipoke_cs_id を取得（信頼できる正）
    const { data: info, error: infoErr } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id, kaipoke_cs_id")
      .eq("id", body.csKaipokeInfoId)
      .maybeSingle();

    if (infoErr) throw infoErr;
    const kaipokeCsId = (info?.kaipoke_cs_id ?? null) as string | null;

    // upsert 対象（urlがあるものだけ）
    const upsertRows = docs
      .filter((d) => isNonEmptyString(d.url))
      .map((d) => {
        const acquiredDate = toIsoDateOnly(d.acquired_at);
        return {
          url: d.url!.trim(),
          kaipoke_cs_id: kaipokeCsId,                 // cs_docs側の業務キー
          cs_kaipoke_info_id: body.csKaipokeInfoId,   // FK
          source: "kaipoke-info-detail",
          doc_name: (d.label ?? "").trim() || null,
          applicable_date: acquiredDate,              // date
          doc_date_raw: d.acquired_at || null,        // timestamptz（ISO）
          meta: {
            documents_id: d.id,
            mimeType: d.mimeType ?? null,
            type: d.type ?? null,
            uploaded_at: d.uploaded_at,
          },
        };
      });

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await supabaseAdmin
        .from("cs_docs")
        .upsert(upsertRows, { onConflict: "url" });
      if (upsertErr) throw upsertErr;
    }

    // 削除反映（documents から消えた url の紐付け解除）
    const currentUrls = new Set(upsertRows.map((r) => r.url));
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("cs_docs")
      .select("id,url")
      .eq("cs_kaipoke_info_id", body.csKaipokeInfoId);

    if (exErr) throw exErr;

    const removeIds = (existing ?? [])
      .filter((r) => isNonEmptyString(r.url) && !currentUrls.has(r.url))
      .map((r) => r.id);

    if (removeIds.length > 0) {
      const { error: rmErr } = await supabaseAdmin
        .from("cs_docs")
        .update({ cs_kaipoke_info_id: null, kaipoke_cs_id: null })
        .in("id", removeIds);
      if (rmErr) throw rmErr;
    }

    return NextResponse.json({ ok: true, upserted: upsertRows.length, unlinked: removeIds.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
