import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // UPDATE/INSERT が RLS に阻まれるなら Service Role を使う
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
  const body = await req.json();

  // フロントから来る想定フィールドを素直に受ける
  const updateData = {
    code: body.code as string,
    name: body.name as string,
    sort_order: body.sort_order as number,
    active: body.active as boolean,
    // ★ これが肝：rules_json をそのまま渡す（null 許容）
    rules_json: body.rules_json ?? null,
  };

  const { data, error } = await supabase
    .from("shift_record_category_l")
    .update(updateData)
    .eq("id", id)
    .select("id, code, name, sort_order, active, rules_json")
    .single();

  if (error) {
    console.error("L update error:", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
