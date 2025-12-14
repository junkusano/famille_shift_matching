// src/lib/cs_docs_judge_logics.ts
import { supabaseAdmin } from "@/lib/supabase/service";

export type JudgeLogics = {
  version: 1;
  generated_at: string; // ISO
  mode: "full" | "incremental";
  window_hours: number;
  stats: {
    total_docs: number;
    recent_docs: number;
    top_sources: Array<{ source: string; count: number }>;
    applicable_date_range: { min: string | null; max: string | null };
    doc_name_samples: string[];
    url_samples: string[];
  };
  notes: string[];
};

type CsDocRow = {
  id: string;
  url: string;
  source: string;
  doc_name: string | null;
  applicable_date: string | null; // date
  updated_at: string; // timestamptz
};

function toTopCounts(values: string[], topN: number): Array<{ source: string; count: number }> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([source, count]) => ({ source, count }));
}

function uniqKeepOrder(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

export async function rebuildJudgeLogicsForDocTypes(params: {
  mode: "full" | "incremental";
  windowHours: number;
}): Promise<{ updated: number; targetDocTypeIds: string[] }> {
  const { mode, windowHours } = params;

  // 対象 doc_type_id を決める
  const base = supabaseAdmin
    .from("cs_docs")
    .select("doc_type_id")
    .not("doc_type_id", "is", null);

  const { data: docTypeRows, error: docTypeErr } =
    mode === "incremental"
      ? await base.gte("updated_at", new Date(Date.now() - windowHours * 3600 * 1000).toISOString())
      : await base;

  if (docTypeErr) throw docTypeErr;

  const targetDocTypeIds = uniqKeepOrder(
    (docTypeRows ?? [])
      .map((r) => (r as { doc_type_id: string | null }).doc_type_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
    5000
  );

  let updated = 0;

  for (const docTypeId of targetDocTypeIds) {
    // total count
    const { count: totalCount, error: cntErr } = await supabaseAdmin
      .from("cs_docs")
      .select("id", { count: "exact", head: true })
      .eq("doc_type_id", docTypeId);
    if (cntErr) throw cntErr;

    // recent count（ウィンドウ内）
    const sinceIso = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();
    const { count: recentCount, error: rcErr } = await supabaseAdmin
      .from("cs_docs")
      .select("id", { count: "exact", head: true })
      .eq("doc_type_id", docTypeId)
      .gte("updated_at", sinceIso);
    if (rcErr) throw rcErr;

    // サンプル（最新から）
    const { data: sampleDocs, error: smpErr } = await supabaseAdmin
      .from("cs_docs")
      .select("id,url,source,doc_name,applicable_date,updated_at")
      .eq("doc_type_id", docTypeId)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (smpErr) throw smpErr;

    const rows = (sampleDocs ?? []) as CsDocRow[];
    const sources = rows.map((r) => r.source);
    const topSources = toTopCounts(sources, 10);

    const applicableDates = rows.map((r) => r.applicable_date).filter((v): v is string => !!v);
    const minDate = applicableDates.length ? applicableDates.slice().sort()[0] : null;
    const maxDate = applicableDates.length ? applicableDates.slice().sort().reverse()[0] : null;

    const docNameSamples = uniqKeepOrder(
      rows.map((r) => r.doc_name ?? "").filter((v) => v.trim().length > 0),
      20
    );
    const urlSamples = uniqKeepOrder(rows.map((r) => r.url), 10);

    const judgeLogics: JudgeLogics = {
      version: 1,
      generated_at: new Date().toISOString(),
      mode,
      window_hours: windowHours,
      stats: {
        total_docs: totalCount ?? 0,
        recent_docs: recentCount ?? 0,
        top_sources: topSources,
        applicable_date_range: { min: minDate, max: maxDate },
        doc_name_samples: docNameSamples,
        url_samples: urlSamples,
      },
      notes: [
        "このサマリーは cs_docs の蓄積データから自動生成されています。",
        "判定ロジック（judge_logics）の中身は運用に合わせて拡張してください（例：OCRの特徴語、metaの傾向など）。",
      ],
    };

    const { error: updErr } = await supabaseAdmin
      .from("user_doc_master")
      .update({ judge_logics: judgeLogics })
      .eq("id", docTypeId);

    if (updErr) throw updErr;

    updated += 1;
  }

  return { updated, targetDocTypeIds };
}
