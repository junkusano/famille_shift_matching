//api/parking/cs_places/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { user } = await getUserFromBearer(req);
  if (!user?.id) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });

  // 必要ならここで admin 判定（既存の isAdmin 関数があれば差し替え）
  // const isAdmin = await isAdminByAuthUserId(user.id); if (!isAdmin) ...

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  // join（FKがあるので cs_kaipoke_info を展開できる想定）
  let query = supabaseAdmin
    .from("parking_cs_places")
    .select(
      "id,kaipoke_cs_id,serial,label,location_link,parking_orientation,permit_required,remarks,picture1_url,picture2_url,police_station_place_id,updated_at,created_at, cs_kaipoke_info(name,address)"
    )
    .order("updated_at", { ascending: false })
    .order("kaipoke_cs_id", { ascending: true })
    .order("serial", { ascending: true });

  if (q) {
    // “利用者名/住所/コード/ラベル” をざっくり検索
    // ※ PostgREST の or 構文。環境により調整が必要なら教えてください。
    query = query.or(
      [
        `police_station_place_id.ilike.%${q}%`,
        `label.ilike.%${q}%`,
        `remarks.ilike.%${q}%`,
        `cs_kaipoke_info.name.ilike.%${q}%`,
        `cs_kaipoke_info.address.ilike.%${q}%`,
      ].join(",")
    );
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}
