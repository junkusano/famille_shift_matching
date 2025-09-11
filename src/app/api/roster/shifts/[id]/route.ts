// ----------------------------------------------
// app/api/roster/shifts/[id]/route.ts（PATCH スケルトン）
// ----------------------------------------------
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string }}){
  try {
    const id = params.id; // `${shift_id}_${staff_id}` を想定
    const body = await req.json();
    const { start_at, end_at, staff_id } = body as { start_at?: string; end_at?: string; staff_id?: string };

    // TODO: DB更新
    //  - id から shift_id, 元staff_id を分解
    //  - shift の担当者変更（複数担当の配列を更新）
    //  - start/end の更新（分解して日付・時刻に反映）

    return NextResponse.json({ ok: true, id, start_at, end_at, staff_id });
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message || "unknown" }, { status: 500 });
  }
}
