//api/disability-check/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";  // supabaseAdmin をインポート

export async function PUT(req: NextRequest) {
  const { check, year_month, kaipoke_servicek, kaipoke_cs_id } = await req.json();  // リクエストボディを取得

  try {
    // disability_check テーブルに upsert する
    const { error } = await supabaseAdmin
      .from("disability_check")
      .upsert([
        {
          kaipoke_cs_id,       // 利用者ID
          is_checked: check,   // チェックボックスを更新
          year_month,          // 月単位の情報を更新
          kaipoke_servicek,    // サービス区分（障害・移動支援）
        }
      ], { onConflict: 'kaipoke_cs_id,year_month,kaipoke_servicek' });  // `kaipoke_cs_id`, `year_month`, `kaipoke_servicek` に対して upsert する

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ message: "Record updated successfully" });  // 成功した場合のレスポンス
  } catch (err) {
    console.error("Error updating or inserting record", err);
    return NextResponse.json({ error: "Error updating or inserting record" }, { status: 500 });  // エラーレスポンス
  }
}
