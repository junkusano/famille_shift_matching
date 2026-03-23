//app/api/table-view/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
}

if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

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

    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5000) : 1000;

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
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}