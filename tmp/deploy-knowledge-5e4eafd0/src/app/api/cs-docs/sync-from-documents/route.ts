import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Attachment = {
  id: string;
  url: string | null;
  label?: string;
  type?: string;
  mimeType?: string | null;
  uploaded_at?: string | null;
  acquired_at?: string | null;
};

type Body = {
  csKaipokeInfoId: string;     // cs_kaipoke_info.id
  documents: Attachment[];     // 更新後のdocuments（next）
  dateChangedDocumentIds?: string[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function hasAttachmentUrl(doc: Attachment): doc is Attachment & { url: string } {
  return isNonEmptyString(doc.url);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const JST_DATE_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toIsoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const s = value.trim();
  if (s === "") return null;
  if (isValidDateOnly(s)) return s;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;

  const parts = JST_DATE_FORMATTER.formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (!isNonEmptyString(body.csKaipokeInfoId)) {
      return NextResponse.json({ ok: false, error: "csKaipokeInfoId is required" }, { status: 400 });
    }

    const docs = Array.isArray(body.documents) ? body.documents : [];
    const dateChangedDocumentIds = new Set(
      Array.isArray(body.dateChangedDocumentIds)
        ? body.dateChangedDocumentIds.filter(isNonEmptyString)
        : []
    );

    // cs_kaipoke_info から kaipoke_cs_id を取得（信頼できる正）
    const { data: info, error: infoErr } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id, kaipoke_cs_id")
      .eq("id", body.csKaipokeInfoId)
      .maybeSingle();

    if (infoErr) throw infoErr;
    const kaipokeCsId = (info?.kaipoke_cs_id ?? null) as string | null;

    const docsWithUrl = docs.filter(hasAttachmentUrl);
    const urls = [...new Set(docsWithUrl.map((d) => d.url.trim()))];

    const existingDateByUrl = new Map<
      string,
      { applicable_date: string | null; doc_date_raw: string | null }
    >();

    if (urls.length > 0) {
      const { data: existingDates, error: existingDatesErr } = await supabaseAdmin
        .from("cs_docs")
        .select("url, applicable_date, doc_date_raw")
        .in("url", urls);

      if (existingDatesErr) throw existingDatesErr;

      (existingDates ?? []).forEach((row) => {
        if (!isNonEmptyString(row.url)) return;
        existingDateByUrl.set(row.url.trim(), {
          applicable_date: row.applicable_date ?? null,
          doc_date_raw: row.doc_date_raw ?? null,
        });
      });
    }

    // upsert 対象（urlがあるものだけ）
    const upsertRows = docsWithUrl
      .map((d) => {
        const url = d.url.trim();
        const existingDate = existingDateByUrl.get(url);
        const shouldUpdateDate = dateChangedDocumentIds.has(d.id);
        const acquiredDate = shouldUpdateDate ? toIsoDateOnly(d.acquired_at) : null;
        const applicableDate = shouldUpdateDate ? acquiredDate : existingDate?.applicable_date ?? null;
        const docDateRaw = shouldUpdateDate ? acquiredDate : existingDate?.doc_date_raw ?? null;

        return {
          url,
          kaipoke_cs_id: kaipokeCsId,                 // cs_docs側の業務キー
          cs_kaipoke_info_id: body.csKaipokeInfoId,   // FK
          source: "kaipoke-info-detail",
          doc_name: (d.label ?? "").trim() || null,
          applicable_date: applicableDate,             // date
          doc_date_raw: docDateRaw,                   // 書類日付
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
