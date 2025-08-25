// /src/app/api/shift-wish/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Row = {
  id: string | number;
  user_id: string;
  request_type?: string | null;
  preferred_date?: unknown | null;
  preferred_weekday?: unknown | null;
  time_start_hour?: number | null;
  time_end_hour?: number | null;
  postal_area_json?: unknown | null;
  area_text?: string | null;
  full_name?: string | null;
  gender?: string | null;
  qual_text?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  schedule_text?: string | null;
  fax_name_masked?: string | null;
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY; // 一旦SRKでも可（server only）

  if (!url || !key) {
    return NextResponse.json(
      { error: "Supabase env missing" },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("shift_wish_portal_view")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // data は unknown[] 型なのでアサートで Row[] に
  return NextResponse.json((data ?? []) as Row[]);
}

// /src/app/api/shift-wish/route.ts の下に追記（既存の GET は残す）
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("shift_wishes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}