// src/app/api/table-view/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tableName = searchParams.get("tableName");
    const limit = Number(searchParams.get("limit") ?? "1000");
    const select = searchParams.get("select") ?? "*";

    if (!tableName) {
      return NextResponse.json(
        { ok: false, error: "tableName is required" },
        { status: 400 }
      );
    }

    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 5000)
      : 1000;

    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select(select)
      .limit(safeLimit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}