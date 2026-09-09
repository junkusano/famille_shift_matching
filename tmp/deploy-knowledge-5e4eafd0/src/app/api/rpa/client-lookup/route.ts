import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

const KAIPOKE_ID_PATTERN = /^\d{1,20}$/;

export const dynamic = "force-dynamic";

/**
 * GET /api/rpa/client-lookup?kaipoke_cs_id=8088456
 *
 * Existing middleware requires an authenticated My Famille session. This route
 * returns only the minimum client fields needed by the Chrome extension.
 */
export async function GET(request: NextRequest) {
  const kaipokeCsId = request.nextUrl.searchParams.get("kaipoke_cs_id")?.trim() ?? "";

  if (!KAIPOKE_ID_PATTERN.test(kaipokeCsId)) {
    return NextResponse.json(
      { error: "kaipoke_cs_id must be a 1-20 digit value" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id, name, kaipoke_cs_id")
    .eq("kaipoke_cs_id", kaipokeCsId)
    .maybeSingle();

  if (error) {
    console.error("[rpa/client-lookup] lookup failed", { code: error.code });
    return NextResponse.json({ error: "client lookup failed" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({
      exists: false,
      kaipoke_cs_id: kaipokeCsId,
      client: null,
    });
  }

  return NextResponse.json({
    exists: true,
    kaipoke_cs_id: data.kaipoke_cs_id,
    client: { id: data.id, name: data.name },
  });
}
