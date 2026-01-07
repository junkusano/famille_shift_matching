// =============================================================
// src/app/api/cm/fax/offices/route.ts
// 事業所検索API
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

const logger = createLogger("cm/api/fax/offices");

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    logger.info("事業所検索", { query });

    let dbQuery = supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id, office_name, fax, fax_proxy")
      .order("office_name", { ascending: true })
      .limit(20);

    if (query) {
      dbQuery = dbQuery.or(
        `office_name.ilike.%${query}%,fax.ilike.%${query}%,fax_proxy.ilike.%${query}%`
      );
    }

    const { data, error } = await dbQuery;

    if (error) {
      logger.error("事業所検索エラー", { error: error.message, code: error.code });
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      offices: (data || []).map(o => ({
        id: o.id,
        office_name: o.office_name,
        fax_number: o.fax,  // fax → fax_number にマッピング
        fax_proxy: o.fax_proxy,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error("事業所検索例外", { message, stack });
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}