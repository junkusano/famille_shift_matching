import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  MonitoringAuthError,
  monitoringAuthErrorResponse,
  requireMonitoringActor,
} from "@/lib/monitoring/auth";
import { isYearMonth } from "@/lib/monitoring/notices";

export const dynamic = "force-dynamic";
const NOTICE_ROLES = new Set(["manager", "admin"]);

async function requireNoticeActor(request: NextRequest) {
  const actor = await requireMonitoringActor(request);
  if (!NOTICE_ROLES.has(actor.role)) {
    throw new MonitoringAuthError("モニタリング共通お知らせを編集する権限がありません", 403);
  }
  return actor;
}

export async function GET(request: NextRequest) {
  try {
    await requireNoticeActor(request);
    const yearMonth = request.nextUrl.searchParams.get("year_month")?.trim() ?? "";
    if (!isYearMonth(yearMonth)) {
      return NextResponse.json(
        { ok: false, error: "対象年月をYYYY-MM形式で指定してください" },
        { status: 400 },
      );
    }
    const { data, error } = await supabaseAdmin
      .from("monitoring_monthly_notices")
      .select("id,service_type,year_month,body,created_by,updated_by,created_at,updated_at")
      .eq("service_type", "care_insurance")
      .eq("year_month", yearMonth)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const actor = await requireNoticeActor(request);
    const body = (await request.json()) as Record<string, unknown>;
    const yearMonth = typeof body.year_month === "string" ? body.year_month.trim() : "";
    const noticeBody = typeof body.body === "string" ? body.body : "";
    if (!isYearMonth(yearMonth)) {
      return NextResponse.json(
        { ok: false, error: "対象年月をYYYY-MM形式で指定してください" },
        { status: 400 },
      );
    }
    if (noticeBody.length > 10_000) {
      return NextResponse.json(
        { ok: false, error: "本文は10,000文字以内で入力してください" },
        { status: 400 },
      );
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("monitoring_monthly_notices")
      .select("created_by")
      .eq("service_type", "care_insurance")
      .eq("year_month", yearMonth)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data, error } = await supabaseAdmin
      .from("monitoring_monthly_notices")
      .upsert(
        {
          service_type: "care_insurance",
          year_month: yearMonth,
          body: noticeBody,
          created_by: existing?.created_by ?? actor.userId,
          updated_by: actor.userId,
        },
        { onConflict: "service_type,year_month" },
      )
      .select("id,service_type,year_month,body,created_by,updated_by,created_at,updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
