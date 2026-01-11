// src/app/api/event-tasks/meta/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
//import { isAdminByAuthUserId } from "@/lib/auth/isAdmin"; // ←既存パスに合わせて
import type { EventTaskMetaResponse } from "@/types/eventTasks";

type CsKaipokeInfoRow = {
    kaipoke_cs_id: string;
    name: string | null;
    kana: string | null;
};


type UserEntryRow = {
  user_id: string;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
  roster_sort: number | null;
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const { user } = await getUserFromBearer(req);
    if (!user) return NextResponse.json({ message: "Missing token" }, { status: 401 });

    //const admin = await isAdminByAuthUserId(supabaseAdmin, user.id);
    //if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    // templates
    const { data: templates, error: tErr } = await supabaseAdmin
        .from("event_template")
        .select("id,template_name,overview,due_rule_type,due_offset_days,is_active")
        .order("updated_at", { ascending: false });

    if (tErr) return NextResponse.json({ message: tErr.message }, { status: 500 });

    // clients（列名が環境で違う可能性があるので、多めに取って最後に整形）
    const { data: clientsRaw, error: cErr } = await supabaseAdmin
        .from("cs_kaipoke_info")
        .select("kaipoke_cs_id, name, kana")
        .order("kana", { ascending: true, nullsFirst: false })
        .limit(5000);

    if (cErr) return NextResponse.json({ message: cErr.message }, { status: 500 });

    const clients = (clientsRaw ?? []).map((r: CsKaipokeInfoRow) => ({
        kaipoke_cs_id: r.kaipoke_cs_id,
        name: r.name ?? r.kana ?? r.kaipoke_cs_id,
    }));

    // users（担当者選択用：user_entry_united_view_single を想定）
    const { data: usersRaw, error: uErr } = await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id,last_name_kanji,first_name_kanji,roster_sort,status,system_role")
        .order("roster_sort", { ascending: true, nullsLast: true })
        .limit(5000);

    if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });

    const users = (usersRaw ?? [])
        .filter((r) => !!r.user_id)
        .map((r: UserEntryRow) => ({
            user_id: r.user_id as string,
            name: `${r.last_name_kanji ?? ""}${r.first_name_kanji ?? ""}`.trim() || r.user_id,
        }));

    const res: EventTaskMetaResponse = { admin: true, templates, clients, users };

    return NextResponse.json(res);
}
