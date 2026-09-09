//app/api/shift_record_category_l/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function PUT(req: Request) {
  try {
    const { pathname } = new URL(req.url);
    const segs = pathname.split("/").filter(Boolean);
    const id = segs[segs.length - 1];
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const body = await req.json();

    const updateData = {
      l_id: body.l_id as string,
      code: body.code as string,
      name: body.name as string,
      sort_order: body.sort_order as number,
      active: body.active as boolean,
      rules_json: body.rules_json ?? null,
    };

    const { data, error } = await supabase
      .from("shift_record_category_s")
      .update(updateData)
      .eq("id", id)
      .select("id, l_id, code, name, sort_order, active, rules_json")
      .single();

    if (error) {
      console.error("S update error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error("S update exception:", e);
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
