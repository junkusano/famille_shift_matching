// =============================================================
// src/app/api/cm/fax/stats/route.ts
// FAX統計取得API（一覧から分離）
//
// 【新規】統計だけを取得する軽量API
// - 一覧APIから分離することで並列取得可能
// - キャッシュヘッダー付与で高速化
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

const logger = createLogger("cm/api/fax/stats");

type FaxPageRow = {
  fax_received_id: number;
  assigned_at: string | null;
  is_advertisement: boolean;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assignment = searchParams.get("assignment") || "mine";
    const search = searchParams.get("search") || "";

    logger.info("FAX統計取得開始", { assignment, search });

    // 全FAXを取得（軽量カラムのみ）
    let query = supabaseAdmin
      .from("cm_fax_received")
      .select("id, office_id, page_count, status");

    // 検索フィルター
    if (search) {
      query = query.or(`fax_number.ilike.%${search}%,file_name.ilike.%${search}%`);
    }

    const { data: allFax, error: faxError } = await query;

    if (faxError) {
      logger.error("FAX取得エラー", { error: faxError.message });
      return NextResponse.json({ ok: false, error: faxError.message }, { status: 500 });
    }

    const faxIds = (allFax || []).map((f) => f.id);

    // ページ情報を取得（並列可能だが、faxIdsが必要なので直列）
    let pagesData: FaxPageRow[] = [];
    if (faxIds.length > 0) {
      const { data: pages } = await supabaseAdmin
        .from("cm_fax_pages")
        .select("fax_received_id, assigned_at, is_advertisement")
        .in("fax_received_id", faxIds);
      pagesData = (pages || []) as FaxPageRow[];
    }

    // FAXごとのページ情報をマップ化
    const pagesByFaxId = new Map<number, FaxPageRow[]>();
    for (const p of pagesData) {
      const existing = pagesByFaxId.get(p.fax_received_id) || [];
      existing.push(p);
      pagesByFaxId.set(p.fax_received_id, existing);
    }

    // 各FAXの状態を計算
    const faxWithStatus = (allFax || []).map((fax) => {
      const pages = pagesByFaxId.get(fax.id) || [];
      const assignedCount = pages.filter((p) => p.assigned_at !== null).length;
      const pageCount = fax.page_count || pages.length;
      const isAllAd = pages.length > 0 && pages.every((p) => p.is_advertisement === true);
      const progress = pageCount > 0 ? assignedCount / pageCount : 0;

      return {
        office_id: fax.office_id,
        page_count: pageCount,
        status: fax.status,
        assigned_page_count: assignedCount,
        is_all_advertisement: isAllAd,
        progress,
      };
    });

    // 広告FAXを除外
    const nonAdFaxList = faxWithStatus.filter((f) => !f.is_all_advertisement);

    // 統計計算
    const stats = {
      total: nonAdFaxList.length,
      pending: nonAdFaxList.filter((f) => f.assigned_page_count === 0 && f.status !== "OCR処理中").length,
      processing: nonAdFaxList.filter((f) => f.status === "OCR処理中" || (f.progress > 0 && f.progress < 1)).length,
      completed: nonAdFaxList.filter((f) => f.progress === 1 && f.page_count > 0).length,
      unassignedOffice: nonAdFaxList.filter((f) => f.office_id === null).length,
    };

    logger.info("FAX統計取得完了", { stats });

    // キャッシュヘッダー付与（5秒間キャッシュ）
    return NextResponse.json(
      { ok: true, stats },
      {
        headers: {
          "Cache-Control": "private, max-age=5",
        },
      }
    );
  } catch (e) {
    logger.error("FAX統計取得例外", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}