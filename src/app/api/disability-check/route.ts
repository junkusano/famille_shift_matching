//api/disability-check/route.ts
import { NextRequest, NextResponse } from "next/server";  // NextRequestとNextResponseをインポート
import { supabaseAdmin } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  const { yearMonth, kaipokeServicek } = await req.json();  // JSONボディを取得

  try {
    // Supabaseでデータを取得
    const { data, error } = await supabaseAdmin
      .from("disability_check")
      .select("id, name, ido_jukyusyasho, is_checked")
      .eq("year_month", yearMonth)
      .eq("kaipoke_servicek", kaipokeServicek);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json(data);  // 取得したデータを返す
  } catch (err) {
    console.error("Error fetching records", err);
    return NextResponse.json({ error: "Error fetching records" }, { status: 500 });
  }
}

