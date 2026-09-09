// src/app/api/event-tasks/meta/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import type { EventTaskMetaResponse } from "@/types/eventTasks";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const { user } = await getUserFromBearer(req);
  if (!user) return NextResponse.json({ message: "Missing token" }, { status: 401 });

  // templates
  const { data: templates, error: tErr } = await supabaseAdmin
    .from("event_template")
    .select("id,template_name,overview,due_rule_type,due_offset_days,is_active")
    .order("updated_at", { ascending: false });

  if (tErr) return NextResponse.json({ message: tErr.message }, { status: 500 });

  // doc types（必要書類追加用）

const { data: docTypesRaw, error: dErr } = await supabaseAdmin
  .from("user_doc_master")
  .select("id,label,sort_order,is_active")
  .eq("is_active", true)
  .order("sort_order", { ascending: true })
  .limit(5000);

if (dErr) {
  return NextResponse.json({ message: dErr.message }, { status: 500 });
}

const doc_types = (docTypesRaw ?? []).map((r) => ({
  id: r.id,
  name: r.label, // ← 正式名称
}));


  // clients（kana 昇順）
  const { data: clientsRaw, error: cErr } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("kaipoke_cs_id,name,kana")
    .order("kana", { ascending: true, nullsFirst: false })
    .limit(5000);

  if (cErr) return NextResponse.json({ message: cErr.message }, { status: 500 });

  const clients = (clientsRaw ?? []).map((r: CsKaipokeInfoRow) => ({
    kaipoke_cs_id: r.kaipoke_cs_id,
    name: r.name ?? r.kana ?? r.kaipoke_cs_id,
  }));

  // users（roster_sort 昇順）
  const { data: usersRaw, error: uErr } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id,last_name_kanji,first_name_kanji,roster_sort,status,system_role")
    .order("roster_sort", { ascending: true, nullsFirst: false })
    .limit(5000);

  if (uErr) return NextResponse.json({ message: uErr.message }, { status: 500 });

  const users = (usersRaw ?? [])
    .filter((r) => !!r.user_id)
    .map((r: UserEntryRow) => ({
      user_id: r.user_id as string,
      name: `${r.last_name_kanji ?? ""}${r.first_name_kanji ?? ""}`.trim() || r.user_id,
    }));

  const res: EventTaskMetaResponse = {
    admin: true,
    templates,
    clients,
    users,
    doc_types,
  };

  return NextResponse.json(res);
}
