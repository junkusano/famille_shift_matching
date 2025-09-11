// src/app/api/roster/shifts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

type PatchPayload = {
  start_at?: string;
  end_at?: string;
  staff_id?: string;
};

function isPatchPayload(x: unknown): x is PatchPayload {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  if ("start_at" in o && typeof o.start_at !== "string") return false;
  if ("end_at" in o && typeof o.end_at !== "string") return false;
  if ("staff_id" in o && typeof o.staff_id !== "string") return false;
  return true;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id; // `${shift_id}_${staff_id}` を想定
    const raw = (await req.json()) as unknown;

    if (!isPatchPayload(raw)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const { start_at, end_at, staff_id } = raw;

    // TODO: DB更新処理
    // - id から shift_id と元 staff_id を分解
    // - 担当者配列の更新、開始/終了の更新

    return NextResponse.json({ ok: true, id, start_at, end_at, staff_id });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
