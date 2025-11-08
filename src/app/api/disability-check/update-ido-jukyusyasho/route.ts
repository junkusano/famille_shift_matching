//api/disability-check/update-ido-jukyusyasho/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";  // supabaseAdmin をインポート

export async function PUT(req: NextRequest) {
  const { id, idoJukyusyasho } = await req.json();  // リクエストボディを取得

  try {
    // `cs_kaipoke_info` テーブルの `ido_jukyusyasho` を更新
    const { error } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .update({
        ido_jukyusyasho: idoJukyusyasho,  // 受給者証番号を更新
      })
      .eq("kaipoke_cs_id", id);  // `id` に対応する `kaipoke_cs_id` を更新

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ message: "ido_jukyusyasho updated successfully" });  // 成功した場合のレスポンス
  } catch (err) {
    console.error("Error updating ido_jukyusyasho", err);
    return NextResponse.json({ error: "Error updating ido_jukyusyasho" }, { status: 500 });
  }
}
