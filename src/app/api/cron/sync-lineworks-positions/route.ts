import { fetchAllPositions } from "@/lib/lineworks/fetchAllPositions";
import { savePositionsTemp } from "@/lib/supabase/savePositionsTemp";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const positions = await fetchAllPositions();
    await savePositionsTemp(positions);
    return NextResponse.json({ status: "OK", count: positions.length });
  } catch (err) {
    console.error("❌ positions_temp 同期エラー:", err);
    return NextResponse.json(
      { error: "positions_temp 同期失敗", detail: String(err) },
      { status: 500 }
    );
  }
}
