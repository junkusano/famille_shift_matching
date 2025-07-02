import { fetchAllOrgUnits } from "@/lib/lineworks/fetchAllOrgUnits";
import { saveOrgsLwTemp } from "@/lib/supabase/saveOrgsLwTemp";
import { getAccessToken } from "@/lib/getAccessToken";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const token = await getAccessToken();
    const orgUnits = await fetchAllOrgUnits();
    await saveOrgsLwTemp(orgUnits);
    return NextResponse.json({ status: "OK", count: orgUnits.length });
  } catch (err) {
    console.error("❌ orgs_temp 同期エラー:", err);
    return NextResponse.json(
      { error: "orgs_temp 同期失敗", detail: String(err) },
      { status: 500 }
    );
  }
}
