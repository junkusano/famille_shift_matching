import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

const MAX_HTML = 300_000;
const MAX_TEXT = 80_000;
const MAX_JSON = 400_000;

function stringValue(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}

function clipped(value: unknown, max: number): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function safeJson(value: unknown, max: number): unknown {
  try {
    const text = JSON.stringify(value ?? {});
    return text.length <= max ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function normalizeScripts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

export async function POST(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const body = await request.json() as Record<string, unknown>;
    const service = stringValue(body.service, 50);
    const operation = stringValue(body.operation, 100);
    const stage = stringValue(body.stage, 100);
    if (!service || !operation || !stage) {
      return NextResponse.json({ ok: false, error: "service, operation, stage are required" }, { status: 400 });
    }
    const errorValue = typeof body.error === "object" && body.error !== null ? body.error as Record<string, unknown> : {};
    const captureType = body.captureType === "error" || body.captureType === "automatic" ? body.captureType : "manual";
    const snapshotInsert = {
      service,
      page_type: stringValue(body.pageType, 100),
      purpose: stringValue(body.purpose, 200),
      page_url: stringValue(body.pageUrl, 2000),
      page_path: stringValue(body.pagePath, 1000),
      page_title: stringValue(body.pageTitle, 500),
      body_html: clipped(body.bodyHtml, MAX_HTML),
      body_text: clipped(body.bodyText, MAX_TEXT),
      important_dom: safeJson(body.importantDom, MAX_JSON),
      scripts: normalizeScripts(body.scripts),
      dom_fingerprint: stringValue(body.domFingerprint, 100),
      extension_version: stringValue(body.extensionVersion, 50),
      manifest_version: stringValue(body.manifestVersion, 50),
      ...(stringValue(body.capturedAt, 80) ? { captured_at: stringValue(body.capturedAt, 80) } : {}),
    };
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("rpa_page_snapshots")
      .insert(snapshotInsert)
      .select("id")
      .single();
    if (snapshotError) throw snapshotError;

    const { data: diagnostic, error: diagnosticError } = await supabaseAdmin
      .from("rpa_diagnostics")
      .insert({
        snapshot_id: snapshot.id,
        service,
        operation,
        stage,
        error_name: stringValue(errorValue.name, 200),
        error_message: stringValue(errorValue.message, 2000),
        error_stack: stringValue(errorValue.stack, 10000),
        selector: stringValue(body.selector, 500),
        expected_selector: stringValue(body.expectedSelector, 500),
        selector_found: typeof body.selectorFound === "boolean" ? body.selectorFound : null,
        action: stringValue(body.action, 200),
        retry_count: typeof body.retryCount === "number" && Number.isFinite(body.retryCount) ? Math.max(0, Math.min(100, Math.trunc(body.retryCount))) : 0,
        metadata: safeJson(body.metadata, MAX_JSON),
        capture_type: captureType,
      })
      .select("id")
      .single();
    if (diagnosticError) throw diagnosticError;
    return NextResponse.json({ ok: true, diagnosticId: diagnostic.id, snapshotId: snapshot.id });
  } catch (error) {
    if (isRpaTaimeeError(error)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[rpa/diagnostics] save failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "diagnostic save failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const params = request.nextUrl.searchParams;
    const service = stringValue(params.get("service"), 50);
    const pageType = stringValue(params.get("page_type"), 100);
    const limit = Math.min(Number(params.get("limit") ?? "50") || 50, 200);
    let query = supabaseAdmin
      .from("rpa_page_snapshots")
      .select("*")
      .order("captured_at", { ascending: false })
      .limit(limit);
    if (service) query = query.eq("service", service);
    if (pageType) query = query.eq("page_type", pageType);
    const { data, error } = await query;
    if (error) throw error;
    if (params.get("latest") === "1") return NextResponse.json({ ok: true, snapshot: data?.[0] ?? null });
    return NextResponse.json({ ok: true, snapshots: data ?? [] });
  } catch (error) {
    if (isRpaTaimeeError(error)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error("[rpa/diagnostics] lookup failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "diagnostic lookup failed" }, { status: 500 });
  }
}
