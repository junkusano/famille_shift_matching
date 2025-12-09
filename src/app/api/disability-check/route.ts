//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  yearMonth: string;
  kaipokeServicek: string;
  districts?: string[];
};

export async function POST(req: NextRequest) {
  try {
    const { yearMonth, kaipokeServicek, districts = [] } = (await req.json()) as Body;

    let query = supabaseAdmin
      .from("disability_check_view")
      .select(
        "kaipoke_cs_id,year_month,kaipoke_servicek,client_name,ido_jukyusyasho,is_checked,district"
      )
      .eq("year_month", yearMonth)
      .eq("kaipoke_servicek", kaipokeServicek)
      .order("district", { ascending: true })
      .order("client_name", { ascending: true });

    if (districts.length > 0) {
      query = query.in("district", districts);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (e) {
    console.error("[disability-check] fetch error", e);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
