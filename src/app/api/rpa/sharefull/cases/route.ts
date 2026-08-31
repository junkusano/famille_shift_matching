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

    const csIds = Array.from(new Set((data ?? []).map((row) => row.kaipoke_cs_id).filter(Boolean)));
    const { data: clients, error: clientError } = csIds.length
      ? await supabaseAdmin.from("cs_kaipoke_info").select("kaipoke_cs_id,name").in("kaipoke_cs_id", csIds)
      : { data: [], error: null };
    if (clientError) throw clientError;
    const clientNames = new Map((clients ?? []).map((client) => [String(client.kaipoke_cs_id), client.name ?? "-"]));
    const cases = [...(data ?? [])].map((row) => ({
      ...row,
      client_name: clientNames.get(String(row.kaipoke_cs_id ?? "")) ?? "-",
    })).sort((a, b) => {
      const aActive = a.status === "active" ? 0 : 1;
      const bActive = b.status === "active" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return a.client_name.localeCompare(b.client_name, "ja");
    });
    return NextResponse.json({ cases });
  } catch (error) {
    if (isRpaTaimeeError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[rpa/sharefull/cases] failed", error);
    return NextResponse.json({ error: "Sharefull案件一覧の取得に失敗しました" }, { status: 500 });
  }
}
