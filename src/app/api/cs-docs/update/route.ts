// src/app/api/cs-docs/update/route.ts
import { NextResponse } from "next/server";
import { updateCsDocAndSync, type UpdateCsDocInput } from "@/lib/cs_docs";

type Body = UpdateCsDocInput;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body?.id) {
      return NextResponse.json({ ok: false, error: "id がありません" }, { status: 400 });
    }

    // source NOT NULL 対策（念のため）
    const source = body.source?.trim() ? body.source.trim() : "manual";

    const updated = await updateCsDocAndSync({
      ...body,
      source,
    });

    return NextResponse.json({ ok: true, row: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api][cs-docs][update] error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
