//api/disability-check/update/route.ts
import { NextRequest, NextResponse } from "next/server";  // NextRequest と NextResponse をインポート
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const { id, check } = await req.json();  // リクエストボディを取得

  try {
    // Supabase でデータを更新
    const { error } = await supabaseAdmin
      .from("disability_check")
      .update({ is_checked: check })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ message: "Updated successfully" });  // 成功した場合のレスポンス
  } catch (err) {
    console.error("Error updating check", err);
    return NextResponse.json({ error: "Error updating check" }, { status: 500 });  // エラーレスポンス
  }
}
