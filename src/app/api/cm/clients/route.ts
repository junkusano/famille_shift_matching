// =============================================================
// src/app/api/cm/clients/route.ts
// CM利用者一覧取得API
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/clients");

// =============================================================
// GET: 利用者一覧取得
// =============================================================

export async function GET(req: NextRequest) {
  try {
    // ---------------------------------------------------------
    // クエリパラメータ取得
    // ---------------------------------------------------------
    const { searchParams } = new URL(req.url);

    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    const insurer = searchParams.get("insurer");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 50;
    const offset = (page - 1) * limit;

    // ---------------------------------------------------------
    // 保険者リスト取得（?type=insurers）
    // ---------------------------------------------------------
    if (type === "insurers") {
      logger.info("保険者リスト取得");

      const { data, error } = await supabaseAdmin
        .from("cm_kaipoke_insurance")
        .select("insurer_name")
        .not("insurer_name", "is", null)
        .order("insurer_name");

      if (error) {
        logger.error("保険者リスト取得エラー", { message: error.message });
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      const uniqueInsurers = [...new Set(data?.map((d) => d.insurer_name))].filter(Boolean);

      return NextResponse.json({
        ok: true,
        insurers: uniqueInsurers,
      });
    }

    // デバッグログ
    logger.info("利用者検索開始", { 
      search, 
      status, 
      insurer, 
      page,
      statusIsActive: status === "active",
      statusType: typeof status,
    });

    // ---------------------------------------------------------
    // 保険者一覧を取得（フィルター用）
    // ---------------------------------------------------------
    const { data: insurerData } = await supabaseAdmin
      .from("cm_kaipoke_insurance")
      .select("insurer_name")
      .not("insurer_name", "is", null);

    const insurerSet = new Set<string>();
    (insurerData ?? []).forEach((row) => {
      if (row.insurer_name) {
        insurerSet.add(row.insurer_name);
      }
    });
    const insurerOptions = Array.from(insurerSet).sort();

    // ---------------------------------------------------------
    // クエリ構築
    // ---------------------------------------------------------
    let query = supabaseAdmin
      .from("cm_kaipoke_info")
      .select("*", { count: "exact" });

    // 検索フィルター（名前・カナ）
    // ひらがな→カタカナ変換して両方で検索
    if (search) {
      const searchKatakana = search.replace(/[\u3041-\u3096]/g, (char) =>
        String.fromCharCode(char.charCodeAt(0) + 0x60)
      );
      query = query.or(`name.ilike.%${search}%,kana.ilike.%${search}%,kana.ilike.%${searchKatakana}%`);
    }

    // ステータスフィルター
    if (status === "active") {
      logger.info("ステータスフィルター適用: 利用中");
      query = query.ilike("client_status", "%利用中%");
    } else if (status === "inactive") {
      logger.info("ステータスフィルター適用: 利用停止");
      query = query.not("client_status", "ilike", "%利用中%");
    } else {
      logger.info("ステータスフィルターなし", { status });
    }

    // アクティブのみ
    query = query.eq("is_active", true);

    // ソート・ページネーション（カナ姓→名であいうえお順）
    query = query
      .order("kana_sei", { ascending: true, nullsFirst: false })
      .order("kana_mei", { ascending: true, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // ---------------------------------------------------------
    // 実行
    // ---------------------------------------------------------
    const { data: clients, error: clientsError, count } = await query;

    if (clientsError) {
      logger.error("クエリエラー", {
        message: clientsError.message,
        code: clientsError.code,
        details: clientsError.details,
        hint: clientsError.hint,
      });
      return NextResponse.json(
        { ok: false, error: clientsError.message || "クエリエラー" },
        { status: 500 }
      );
    }

    logger.info("クエリ結果", { 
      clientsCount: clients?.length ?? 0, 
      totalCount: count,
    });

    // ---------------------------------------------------------
    // 被保険者証情報を取得
    // ---------------------------------------------------------
    const kaipokeIds = (clients ?? []).map((c) => c.kaipoke_cs_id);

    let insurances: Record<string, unknown>[] = [];
    if (kaipokeIds.length > 0) {
      const { data: insData, error: insError } = await supabaseAdmin
        .from("cm_kaipoke_insurance")
        .select("*")
        .in("kaipoke_cs_id", kaipokeIds)
        .order("coverage_start", { ascending: false });

      if (insError) {
        logger.warn("被保険者証情報の取得に失敗", {
          message: insError.message,
          code: insError.code,
        });
      } else {
        insurances = insData ?? [];
      }
    }

    // ---------------------------------------------------------
    // 保険者フィルター
    // ---------------------------------------------------------
    let filteredClients = clients ?? [];
    if (insurer) {
      const matchingIds = new Set(
        insurances
          .filter((ins) => ins.insurer_name === insurer)
          .map((ins) => ins.kaipoke_cs_id)
      );
      filteredClients = filteredClients.filter((c) =>
        matchingIds.has(c.kaipoke_cs_id)
      );
    }

    // ---------------------------------------------------------
    // 利用者ごとに被保険者証情報をマッピング
    // ---------------------------------------------------------
    const insuranceMap = new Map<string, Record<string, unknown>[]>();
    for (const ins of insurances) {
      const csId = ins.kaipoke_cs_id as string;
      if (!insuranceMap.has(csId)) {
        insuranceMap.set(csId, []);
      }
      insuranceMap.get(csId)!.push(ins);
    }

    const result = filteredClients.map((client) => ({
      ...client,
      insurances: insuranceMap.get(client.kaipoke_cs_id) ?? [],
    }));

    logger.info("利用者検索完了", { count: result.length, total: count });

    // ---------------------------------------------------------
    // レスポンス
    // ---------------------------------------------------------
    return NextResponse.json({
      ok: true,
      clients: result,
      insurerOptions,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
        hasNext: offset + limit < (count ?? 0),
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    logger.error("例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}