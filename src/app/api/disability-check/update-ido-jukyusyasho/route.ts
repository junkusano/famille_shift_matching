//api/disability-check/update-ido-jukyusyasho/route.ts
import { NextRequest, NextResponse } from "next/server";  // NextRequest と NextResponse をインポート
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const { id, idoJukyusyasho } = await req.json();  // リクエストボディを取得

  try {
    // Supabase でデータを更新
    const { error } = await supabaseAdmin
      .from("disability_check")
      .update({ ido_jukyusyasho: idoJukyusyasho })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ message: "Updated successfully" });  // 成功した場合のレスポンス
  } catch (err) {
    console.error("Error updating ido_jukyusyasho", err);
    return NextResponse.json({ error: "Error updating ido_jukyusyasho" }, { status: 500 });  // エラーレスポンス
  }
}
