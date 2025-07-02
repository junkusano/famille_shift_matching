import { NextResponse } from "next/server";
import { fetchAllPositions } from "@/lib/lineworks/fetchAllPositions";
import { savePositionsTemp } from "@/lib/supabase/savePositionsTemp";

export async function GET() {
  try {
    const positions = await fetchAllPositions();
    await savePositionsTemp(positions);
    return NextResponse.json({ message: "positions_temp 同期成功", count: positions.length });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json(
        { error: "positions_temp 同期失敗", detail: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: "positions_temp 同期失敗", detail: "不明なエラーが発生しました" },
      { status: 500 }
    );
  }
}
