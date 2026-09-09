import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

type SourceDocumentRow = {
  id: string;
  doc_name: string | null;
  url: string | null;
  ocr_text: string | null;
  summary: string | null;
  applicable_date: string | null;
  doc_date_raw: string | null;
  created_at: string;
};

const CATEGORY_RULES = [
  { key: "basic", label: "基本情報", matches: (name: string) => name.includes("基本情報") },
  {
    key: "service-plan",
    label: "サービス等利用計画",
    matches: (name: string) => name.includes("利用計画"),
  },
  {
    key: "care-plan",
    label: "ケアプラン",
    matches: (name: string) => name.includes("居宅介護支援計画書"),
  },
  {
    key: "meeting",
    label: "担当者会議資料",
    matches: (name: string) =>
      name.includes("サ担会") || name.includes("担当者会議") || name.includes("議事録"),
  },
  {
    key: "information",
    label: "情報連携・看護サマリー",
    matches: (name: string) => name.includes("情報連携") || name.includes("看護サマリー"),
  },
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
    }

    const kaipokeCsId = clean(request.nextUrl.searchParams.get("kaipoke_cs_id"));
    const baseCarePlanId = clean(
      request.nextUrl.searchParams.get("base_care_plan_cs_doc_id"),
    );
    if (!kaipokeCsId) {
      return NextResponse.json(
        { ok: false, error: "kaipoke_cs_id がありません" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("cs_docs")
      .select("id,doc_name,url,ocr_text,summary,applicable_date,doc_date_raw,created_at")
      .eq("kaipoke_cs_id", kaipokeCsId)
      .or(
        [
          "doc_name.ilike.%基本情報%",
          "doc_name.ilike.%利用計画%",
          "doc_name.ilike.%居宅介護支援計画書%",
          "doc_name.ilike.%サ担会%",
          "doc_name.ilike.%担当者会議%",
          "doc_name.ilike.%議事録%",
          "doc_name.ilike.%情報連携%",
          "doc_name.ilike.%看護サマリー%",
        ].join(","),
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    const rows = [...((data ?? []) as SourceDocumentRow[])];
    if (baseCarePlanId && !rows.some((row) => row.id === baseCarePlanId)) {
      const { data: baseCarePlan, error: baseCarePlanError } = await supabaseAdmin
        .from("cs_docs")
        .select("id,doc_name,url,ocr_text,summary,applicable_date,doc_date_raw,created_at")
        .eq("id", baseCarePlanId)
        .eq("kaipoke_cs_id", kaipokeCsId)
        .maybeSingle();
      if (baseCarePlanError) throw baseCarePlanError;
      if (baseCarePlan) rows.unshift(baseCarePlan as SourceDocumentRow);
    }

    const selected = new Map<string, SourceDocumentRow>();

    if (baseCarePlanId) {
      const base = rows.find((row) => row.id === baseCarePlanId);
      if (base) selected.set(base.id, base);
    }

    for (const category of CATEGORY_RULES) {
      const latest = rows.find((row) => category.matches(clean(row.doc_name)));
      if (latest) selected.set(latest.id, latest);
    }

    const documents = [...selected.values()].map((row) => {
      const hasOcr = Boolean(clean(row.ocr_text));
      const hasSummary = Boolean(clean(row.summary));
      const category = CATEGORY_RULES.find((rule) => rule.matches(clean(row.doc_name)));
      return {
        id: row.id,
        doc_name: clean(row.doc_name) || "文書名未設定",
        category: category?.label ?? "関連資料",
        document_date: row.applicable_date ?? row.doc_date_raw ?? row.created_at,
        has_url: Boolean(clean(row.url)),
        has_ocr: hasOcr,
        has_summary: hasSummary,
        needs_ocr: !hasOcr,
        // OCRをやり直した場合は、既存サマリーも新しいOCRから再生成する。
        needs_summary: !hasSummary || !hasOcr,
      };
    });

    return NextResponse.json({
      ok: true,
      documents,
      needs_processing: documents.filter(
        (document) => document.needs_ocr || document.needs_summary,
      ),
    });
  } catch (error) {
    console.error("[assessment][source-documents] error", error);
    return NextResponse.json(
      { ok: false, error: "生成に使用する資料を確認できませんでした" },
      { status: 500 },
    );
  }
}
