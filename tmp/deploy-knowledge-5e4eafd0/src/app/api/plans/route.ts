// src/app/api/plans/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(req: NextRequest) {
  try {
    await getUserFromBearer(req);

    const { searchParams } = new URL(req.url);
    const assessmentId = String(searchParams.get("assessment_id") ?? "").trim();

    if (!assessmentId) {
      return json({ ok: false, error: "assessment_id is required" }, 400);
    }

    const { data, error } = await supabaseAdmin
      .from("plans")
      .select(`
        plan_id,
        assessment_id,
        client_info_id,
        kaipoke_cs_id,
        plan_document_kind,
        title,
        version_no,
        status,
        issued_on,
        plan_start_date,
        plan_end_date,
        author_user_id,
        author_name,
        person_family_hope,
        assistance_goal,
        remarks,
        weekly_plan_comment,
        monthly_summary,
        pdf_file_url,
        pdf_generated_at,
        digisign_status,
        digisign_sent_at,
        digisign_completed_at,
        lineworks_sent_at,
        is_deleted,
        created_at,
        updated_at
      `)
      .eq("assessment_id", assessmentId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return json({ ok: true, data: data ?? [] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api/plans][GET] error", msg);
    return json({ ok: false, error: msg }, 500);
  }
}