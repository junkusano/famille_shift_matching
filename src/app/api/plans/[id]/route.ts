// src/app/api/plans/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

type Ctx = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    await getUserFromBearer(req);

    const { id } = await params;

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("plan_id", id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (planError) throw planError;
    if (!plan) {
      return json({ ok: false, error: "plan not found" }, 404);
    }

    const { data: services, error: servicesError } = await supabaseAdmin
      .from("plan_services")
      .select(`
        plan_service_id,
        plan_id,
        template_id,
        shift_service_code_id,
        service_code,
        plan_document_kind,
        plan_service_category,
        display_order,
        service_no,
        weekday,
        weekday_jp,
        start_time,
        end_time,
        duration_minutes,
        is_biweekly,
        nth_weeks,
        monthly_occurrence_factor,
        monthly_minutes,
        monthly_hours,
        required_staff_count,
        two_person_work_flg,
        service_title,
        service_detail,
        procedure_notes,
        observation_points,
        family_action,
        schedule_note,
        source_snapshot,
        generation_meta,
        active,
        created_at,
        updated_at
      `)
      .eq("plan_id", id)
      .eq("active", true)
      .order("service_no", { ascending: true })
      .order("display_order", { ascending: true })
      .order("weekday", { ascending: true })
      .order("start_time", { ascending: true });

    if (servicesError) throw servicesError;

    return json({
      ok: true,
      data: {
        plan,
        services: services ?? [],
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/plans/[id]][GET] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}