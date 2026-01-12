//cron/src/app/api/parking/places/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service"; // supabaseクライアント
import { ParkingPlace } from "@/types/parking-places";


export async function POST(req: NextRequest) {
  const { parkingPlace }: { parkingPlace: ParkingPlace } = await req.json();
  const { data, error } = await supabaseAdmin
    .from('parking_cs_places')
    .upsert(parkingPlace);  // 新規追加または更新

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: "駐車場所を保存しました", data });
}

export async function DELETE(req: NextRequest) {
  const { id }: { id: string } = await req.json();
  const { error } = await supabaseAdmin
    .from('parking_cs_places')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ message: "駐車場所を削除しました" });
}
