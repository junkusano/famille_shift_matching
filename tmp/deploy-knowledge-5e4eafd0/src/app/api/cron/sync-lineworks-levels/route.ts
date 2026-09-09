import { fetchAllLevels } from "@/lib/lineworks/fetchAllLevels";
import { saveLevelsTemp } from "@/lib/supabase/saveLevelsTemp";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const levels = await fetchAllLevels();
    await saveLevelsTemp(levels);
    return NextResponse.json({ status: "OK", count: levels.length });
  } catch (err) {
    console.error("❌ levels_temp 同期エラー:", err);
    return NextResponse.json(
      { error: "levels_temp 同期失敗", detail: String(err) },
      { status: 500 }
    );
  }
}
