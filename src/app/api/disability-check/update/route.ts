//api/disability-check/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type Body = {
  check: boolean;
  submitted?: boolean;
  year_month: string;
  kaipoke_servicek: string;
  kaipoke_cs_id: string;
};

export async function PUT(req: NextRequest) {
  try {
    const { check, submitted, year_month, kaipoke_servicek, kaipoke_cs_id } =
      (await req.json()) as Body;

    // どの項目を更新するかを組み立てる
    const row: {
      kaipoke_cs_id: string;
      year_month: string;
      kaipoke_servicek: string;
      is_checked?: boolean;
      application_check?: boolean;
    } = {
      kaipoke_cs_id,
      year_month,
      kaipoke_servicek,
    };

    // 回収チェック（is_checked）を更新する場合
    if (typeof check === "boolean") {
      row.is_checked = check;
    }

    // 提出チェック（application_check）を更新する場合
    if (typeof submitted === "boolean") {
      row.application_check = submitted;
    }

    // どちらも入っていないリクエストはエラー
    if (row.is_checked === undefined && row.application_check === undefined) {
      return NextResponse.json(
        { error: "no_update_field" },
        { status: 400 }
      );
    }

    // 複合キーで upsert（障害/移動支援のユニーク制約に準拠）
    const { error } = await supabaseAdmin
      .from("disability_check")
      .upsert([row], {
        onConflict: "kaipoke_cs_id,year_month,kaipoke_servicek",
      });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[disability-check] upsert error", e);
    return NextResponse.json({ error: "upsert_failed" }, { status: 500 });
  }
}