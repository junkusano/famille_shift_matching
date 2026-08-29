import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const PLAN_WRITE_ROLES = new Set(["manager", "admin", "system_admin", "super_admin"]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await getUserFromBearer(req);
    const body = await req.json();
    const planId = typeof body.plan_id === "string" ? body.plan_id.trim() : "";
    if (!planId) return json({ ok: false, error: "plan_id is required" }, 400);

    const [{ data: operator, error: operatorError }, { data: plan, error: planError }] =
      await Promise.all([
        supabaseAdmin
          .from("users")
          .select("user_id,system_role")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
        supabaseAdmin
          .from("plans")
          .select("plan_id,plan_document_kind,author_user_id")
          .eq("plan_id", planId)
          .eq("is_deleted", false)
          .maybeSingle(),
      ]);
    if (operatorError) throw operatorError;
    if (planError) throw planError;
    if (!plan) return json({ ok: false, error: "plan not found" }, 404);

    const role = String(operator?.system_role ?? "").toLowerCase();
    const isAuthor =
      Boolean(operator?.user_id) && String(plan.author_user_id ?? "") === String(operator?.user_id);
    if (!PLAN_WRITE_ROLES.has(role) && !isAuthor) {
      return json({ ok: false, error: "このプランへサービスを追加する権限がありません" }, 403);
    }

    const { data: lastService, error: lastServiceError } = await supabaseAdmin
      .from("plan_services")
      .select("service_no,display_order")
      .eq("plan_id", planId)
      .order("service_no", { ascending: false })
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastServiceError) throw lastServiceError;

    const nextOrder = Math.max(
      Number(lastService?.service_no ?? 0),
      Number(lastService?.display_order ?? 0),
    ) + 1;

    const { data, error } = await supabaseAdmin
      .from("plan_services")
      .insert({
        plan_id: planId,
        plan_document_kind: plan.plan_document_kind,
        display_order: nextOrder,
        service_no: nextOrder,
        monthly_occurrence_factor: 5,
        required_staff_count: 1,
        two_person_work_flg: false,
        service_title: "手動追加サービス",
        source_snapshot: { source: "manual" },
        generation_meta: { source: "manual" },
        active: true,
      })
      .select("*")
      .single();
    if (error) throw error;

    return json({ ok: true, data }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/plan-services][POST] error", message);
    return json({ ok: false, error: message }, 500);
  }
}
