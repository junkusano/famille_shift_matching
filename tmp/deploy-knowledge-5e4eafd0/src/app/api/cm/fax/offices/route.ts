// =============================================================
// src/app/api/cm/fax/offices/route.ts
// 事業所検索API（FAX詳細画面用）
//
// 【修正】FAX番号検索のハイフン混在対応
// - 事業所名で検索 → 通常のilike
// - FAX番号で検索 → ワイルドカードパターン検索
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { buildFaxSearchPattern, normalizeFaxNumber } from "@/lib/cm/faxNumberUtils";

const logger = createLogger("cm/api/fax/offices");

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";

    logger.info("事業所検索", { query });

    if (!query || query.length < 2) {
      return NextResponse.json({
        ok: true,
        offices: [],
      });
    }

    // 検索クエリが数字を含むかチェック（FAX番号検索の可能性）
    const hasDigits = /\d/.test(query);
    const normalized = normalizeFaxNumber(query);
    
    let dbQuery = supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id, office_name, fax, fax_proxy, service_type")
      .order("office_name", { ascending: true })
      .limit(30);

    if (hasDigits && normalized && normalized.length >= 4) {
      // FAX番号検索（ワイルドカードパターン）
      const wildcardPattern = buildFaxSearchPattern(normalized);
      
      if (wildcardPattern) {
        // 事業所名 OR FAX番号（ワイルドカード）OR FAX代行（ワイルドカード）
        dbQuery = dbQuery.or(
          `office_name.ilike.%${query}%,fax.ilike.${wildcardPattern},fax_proxy.ilike.${wildcardPattern}`
        );
        logger.info("FAX検索パターン適用", { query, pattern: wildcardPattern });
      } else {
        // ワイルドカード生成失敗時は通常検索
        dbQuery = dbQuery.or(
          `office_name.ilike.%${query}%,fax.ilike.%${query}%,fax_proxy.ilike.%${query}%`
        );
      }
    } else {
      // 事業所名検索（通常のilike）
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

    logger.info("事業所検索完了", { query, count: data?.length || 0 });

    return NextResponse.json({
      ok: true,
      offices: (data || []).map(o => ({
        id: o.id,
        office_name: o.office_name,
        fax_number: o.fax,  // fax → fax_number にマッピング
        fax_proxy: o.fax_proxy,
        service_type: o.service_type,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error("事業所検索例外", { message, stack });
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}