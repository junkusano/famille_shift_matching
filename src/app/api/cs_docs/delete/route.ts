// /app/api/cs-docs/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteCsDocById } from "@/lib/cs_docs";

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    await deleteCsDocById(id);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("cs_docs delete error:", e);
    return NextResponse.json(
      { error: e.message ?? "delete failed" },
      { status: 500 }
    );
  }
}
