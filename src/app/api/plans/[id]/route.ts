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

        const { data: client, error: clientError } = await supabaseAdmin
            .from("cs_kaipoke_info")
            .select(`
        id,
        kaipoke_cs_id,
        name,
        name_kana,
        kana,
        birth_yyyy_mm_dd,
        postal_code,
        address,
        phone_01,
        phone_02,
        email,
        gender,
        service_kind,
        shogai_jukyusha_no,
        ido_jukyusyasho
      `)
            .eq("id", plan.client_info_id)
            .maybeSingle();

        if (clientError) throw clientError;

        let author = null;

        if (plan.author_user_id) {
            const { data: authorRow, error: authorError } = await supabaseAdmin
                .from("user_entry_united_view_single")
                .select("user_id, lw_userid, last_name_kanji, first_name_kanji")
                .eq("user_id", plan.author_user_id)
                .maybeSingle();

            if (authorError) throw authorError;

            author = authorRow
                ? {
                    user_id: authorRow.user_id,
                    lw_userid: authorRow.lw_userid,
                    last_name_kanji: authorRow.last_name_kanji,
                    first_name_kanji: authorRow.first_name_kanji,
                    display_name: [authorRow.last_name_kanji, authorRow.first_name_kanji]
                        .filter(Boolean)
                        .join(" "),
                }
                : null;
        }

        return json({
            ok: true,
            data: {
                plan,
                services: services ?? [],
                client,
                author,
            },
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[api/plans/[id]][GET] error", msg);
        return json({ ok: false, error: msg }, 500);
    }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
    try {
        await getUserFromBearer(req);

        const { id } = await params;
        const body = await req.json();

        const patch = {
            title: String(body.title ?? "").trim(),
            issued_on: normalizeDateOrNull(body.issued_on),
            plan_start_date: normalizeDateOrNull(body.plan_start_date),
            plan_end_date: normalizeDateOrNull(body.plan_end_date),
            author_name: nullableString(body.author_name),
            person_family_hope: nullableString(body.person_family_hope),
            assistance_goal: nullableString(body.assistance_goal),
            remarks: nullableString(body.remarks),
            weekly_plan_comment: nullableString(body.weekly_plan_comment),
            content: body.content && typeof body.content === "object" ? body.content : {},
        };

        if (!patch.title) {
            return json({ ok: false, error: "タイトルは必須です" }, 400);
        }

        const { data, error } = await supabaseAdmin
            .from("plans")
            .update(patch)
            .eq("plan_id", id)
            .eq("is_deleted", false)
            .select("*")
            .single();

        if (error) throw error;

        return json({ ok: true, data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[api/plans/[id]][PUT] error", msg);
        return json({ ok: false, error: msg }, 500);
    }
}

function nullableString(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
}

function normalizeDateOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s) return null;
    return s;
}