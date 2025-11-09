//api/disability-check/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  check: boolean;
  year_month: string;
  kaipoke_servicek: string;
  kaipoke_cs_id: string;
};

export async function PUT(req: NextRequest) {
  try {
    const { check, year_month, kaipoke_servicek, kaipoke_cs_id } =
      (await req.json()) as Body;

    // 複合キーで upsert（テーブル側のチェック制約に準拠：障害/移動支援）
    const { error } = await supabaseAdmin
      .from("disability_check")
      .upsert(
        [
          {
            kaipoke_cs_id,
            year_month,
            kaipoke_servicek,
            is_checked: check,
          },
        ],
        { onConflict: "kaipoke_cs_id,year_month,kaipoke_servicek" }
      );

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[disability-check] upsert error", e);
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }
}