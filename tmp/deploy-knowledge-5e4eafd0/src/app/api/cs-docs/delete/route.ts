// src/app/api/cs-docs/delete/route.ts
import { NextResponse } from "next/server";
import { deleteCsDocById } from "@/lib/cs_docs";

type Body = { id: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;

    if (!body?.id) {
      return NextResponse.json({ ok: false, error: "id がありません" }, { status: 400 });
    }

    await deleteCsDocById(body.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[api][cs-docs][delete] error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
