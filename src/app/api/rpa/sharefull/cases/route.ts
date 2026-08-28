import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const { data, error } = await supabaseAdmin.from("spot_offer_template_unified")
      .select("core_id,template_title,internal_label,work_description,matching_place_name,meeting_yuubinn,meeting_place,meeting_place_banchi,required_licenses,matching_msg,kaipoke_cs_id,status,start_at,end_at,updated_at")
      .order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;
    return NextResponse.json({ cases: data ?? [] });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/cases] failed", error);
    return NextResponse.json({ error: "Sharefull案件一覧の取得に失敗しました" }, { status: 500 });
  }
}
