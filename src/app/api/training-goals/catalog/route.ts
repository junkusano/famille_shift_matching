import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

type UserRoleRow = {
    user_id: string | null;
    system_role: string | null;
};

async function requireManagerOrAdmin(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) throw new Error("unauthorized");

    const { data, error } = await supabaseAdmin
        .from("users")
        .select("user_id, system_role")
        .eq("auth_user_id", user.id)
        .maybeSingle<UserRoleRow>();

    if (error) throw error;

    const role = String(data?.system_role ?? "").trim().toUpperCase();

    if (!["ADMIN", "MANAGER", "FULL"].includes(role)) {
        throw new Error("forbidden");
    }

    return {
        myUserId: String(data?.user_id ?? ""),
        role,
    };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

export async function GET(req: NextRequest) {
    try {
        await requireManagerOrAdmin(req);

        const { data, error } = await supabaseAdmin
            .from("training_goal_catalog")
            .select(`
                id,
                training_type,
                training_code,
                training_key,
                target_role,
                target_group,
                training_title,
                training_goal,
                training_month,
                video_url,
                sort_order,
                is_active
            `)
            .order("sort_order", { ascending: true })
            .order("training_key", { ascending: true });

        if (error) throw error;

        return json({ ok: true, rows: data ?? [] });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg === "unauthorized" ? 401 : msg === "forbidden" ? 403 : 500;
        return json({ ok: false, error: msg }, status);
    }
}

export async function POST(req: NextRequest) {
    try {
        await requireManagerOrAdmin(req);

        const body: unknown = await req.json();
        if (!isRecord(body)) {
            return json({ ok: false, error: "invalid body" }, 400);
        }

        const training_type = String(body.training_type ?? "").trim();
        const training_code = String(body.training_code ?? "").trim();
        const training_title = String(body.training_title ?? "").trim();

        if (!training_type) return json({ ok: false, error: "training_type required" }, 400);
        if (!training_code) return json({ ok: false, error: "training_code required" }, 400);
        if (!training_title) return json({ ok: false, error: "training_title required" }, 400);

        const training_key = `${training_type}_${training_code}`;

        const insertRow = {
            training_type,
            training_code,
            training_key,
            target_role: String(body.target_role ?? "both").trim(),
            target_group: body.target_group ? String(body.target_group).trim() : null,
            training_title,
            training_goal: body.training_goal ? String(body.training_goal).trim() : null,
            training_month:
                body.training_month === null || body.training_month === ""
                    ? null
                    : Number(body.training_month),
            video_url: body.video_url ? String(body.video_url).trim() : null,
            sort_order:
                body.sort_order === null || body.sort_order === ""
                    ? 9999
                    : Number(body.sort_order),
            is_active: body.is_active !== false,
        };

        const { data, error } = await supabaseAdmin
            .from("training_goal_catalog")
            .insert(insertRow)
            .select("*")
            .single();

        if (error) throw error;

        return json({ ok: true, row: data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg === "unauthorized" ? 401 : msg === "forbidden" ? 403 : 500;
        return json({ ok: false, error: msg }, status);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        await requireManagerOrAdmin(req);

        const body = await req.json();
        if (!isRecord(body)) {
            return json({ ok: false, error: "invalid body" }, 400);
        }

        const id = String(body.id ?? "").trim();
        if (!id) return json({ ok: false, error: "id required" }, 400);

        const updateRow: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        if ("video_url" in body) {
            const videoUrl = String(body.video_url ?? "").trim();
            updateRow.video_url = videoUrl ? videoUrl : null;
        }

        if ("is_active" in body) {
            updateRow.is_active = body.is_active === true;
        }

        if (Object.keys(updateRow).length === 1) {
            return json({ ok: false, error: "no update fields" }, 400);
        }

        const { data, error } = await supabaseAdmin
            .from("training_goal_catalog")
            .update(updateRow)
            .eq("id", id)
            .select("*")
            .single();

        if (error) throw error;

        return json({ ok: true, row: data });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg === "unauthorized" ? 401 : msg === "forbidden" ? 403 : 500;
        return json({ ok: false, error: msg }, status);
    }
}