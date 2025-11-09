// app/api/postal-districts/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("postal_district")
      .select("postal_code_3,district")
      .order("district", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("[postal-districts] fetch error", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
