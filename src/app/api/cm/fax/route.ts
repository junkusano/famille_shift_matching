// =============================================================
// src/app/api/cm/fax/route.ts
// FAX一覧取得API
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/fax");

// =============================================================
// 型定義（ローカル）
// =============================================================

type FaxPageRow = {
  id: number;
  fax_received_id: number;
  assigned_at: string | null;
  is_advertisement: boolean;
};

type FaxReceivedRow = {
  id: number;
  gmail_message_id: string;
  fax_number: string;
  office_id: number | null;
  office_assigned_by: string | null;
  office_assigned_at: string | null;
  file_name: string;
  file_path: string;
  file_id: string;
  page_count: number;
  status: string;
  candidate_clients: unknown;
  received_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type OfficeRow = {
  id: number;
  office_name: string;
};

// =============================================================
// ヘルパー関数
// =============================================================

/**
 * ログインユーザーのkaipoke_user_idを取得
 */
async function getKaipokeUserId(): Promise<string | null> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      logger.warn("認証ユーザー取得失敗", { error: authError?.message });
      return null;
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from("users")
      .select("kaipoke_user_id")
      .eq("auth_user_id", authData.user.id)
      .single();

    if (userError || !userData?.kaipoke_user_id) {
      logger.warn("kaipoke_user_id取得失敗", { error: userError?.message });
      return null;
    }

    return userData.kaipoke_user_id;
  } catch (e) {
    logger.error("getKaipokeUserId例外", e);
    return null;
  }
}

/**
 * 担当事業所IDリストを取得
 * 
 * 紐付けチェーン:
 *   users.kaipoke_user_id
 *     → cm_kaipoke_support_office.care_manager_kaipoke_id（担当利用者取得）
 *     → cm_kaipoke_service_usage.kaipoke_cs_id（利用者のサービス事業所取得）
 *     → cm_kaipoke_service_usage.office_number
 *     → cm_kaipoke_other_office.office_number（office_number → id 変換）
 *     → cm_kaipoke_other_office.id = cm_fax_received.office_id
 */
async function getAssignedOfficeIds(kaipokeUserId: string): Promise<number[]> {
  try {
    // 1. 担当利用者を取得（cm_kaipoke_support_office）
    const { data: supportData, error: supportError } = await supabaseAdmin
      .from("cm_kaipoke_support_office")
      .select("kaipoke_cs_id")
      .eq("care_manager_kaipoke_id", kaipokeUserId);

    if (supportError) {
      logger.error("担当利用者取得エラー", { error: supportError.message });
      return [];
    }

    if (!supportData || supportData.length === 0) {
      logger.info("担当利用者なし", { kaipokeUserId });
      return [];
    }

    const clientIds = [...new Set(supportData.map((d) => d.kaipoke_cs_id))];
    logger.info("担当利用者取得", { count: clientIds.length });

    // 2. 利用者のサービス利用事業所のoffice_numberを取得
    const { data: usageData, error: usageError } = await supabaseAdmin
      .from("cm_kaipoke_service_usage")
      .select("office_number")
      .in("kaipoke_cs_id", clientIds)
      .not("office_number", "is", null);

    if (usageError) {
      logger.error("サービス利用取得エラー", { error: usageError.message });
      return [];
    }

    if (!usageData || usageData.length === 0) {
      logger.info("サービス利用事業所なし");
      return [];
    }

    // office_numberのユニークリストを作成
    const officeNumbers = [...new Set(
      usageData
        .map((d) => d.office_number)
        .filter((n): n is string => n !== null && n !== undefined)
    )];

    logger.info("サービス利用事業所office_number", { count: officeNumbers.length });

    // 3. office_number → cm_kaipoke_other_office.id に変換
    const { data: officeData, error: officeError } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id, office_number")
      .in("office_number", officeNumbers);

    if (officeError) {
      logger.error("事業所ID変換エラー", { error: officeError.message });
      return [];
    }

    // cm_kaipoke_other_office.id のリストを返す（これがcm_fax_received.office_idと比較される）
    const officeIds = (officeData || []).map((o) => o.id);

    logger.info("担当事業所ID取得完了", { officeIds });

    return officeIds;
  } catch (e) {
    logger.error("getAssignedOfficeIds例外", e);
    return [];
  }
}

/**
 * 検索文字列から該当する事業所IDを取得（部分一致）
 */
async function searchOfficeIdsByName(searchText: string): Promise<number[]> {
  if (!searchText || searchText.trim() === "") {
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id")
      .ilike("office_name", `%${searchText}%`);

    if (error) {
      logger.warn("事業所名検索エラー", { error: error.message });
      return [];
    }

    return (data || []).map((o) => o.id);
  } catch (e) {
    logger.error("searchOfficeIdsByName例外", e);
    return [];
  }
}

// =============================================================
// GET: FAX一覧取得
// =============================================================

export async function GET(req: NextRequest) {
  try {
    // ---------------------------------------------------------
    // クエリパラメータ取得
    // ---------------------------------------------------------
    const { searchParams } = new URL(req.url);

    const assignment = searchParams.get("assignment") || "mine";
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const sortKey = searchParams.get("sortKey") || "receivedAt";
    const sortDir = searchParams.get("sortDir") || "desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    logger.info("FAX一覧取得開始", { assignment, status, search, sortKey, sortDir, page });

    // ---------------------------------------------------------
    // 担当事業所ID取得
    // ---------------------------------------------------------
    let myAssignedOfficeIds: number[] = [];
    
    const kaipokeUserId = await getKaipokeUserId();
    if (kaipokeUserId) {
      myAssignedOfficeIds = await getAssignedOfficeIds(kaipokeUserId);
      logger.info("担当事業所ID取得完了", { count: myAssignedOfficeIds.length });
    } else {
      logger.warn("kaipoke_user_idが取得できないため、全件表示");
    }

    // ---------------------------------------------------------
    // 検索文字列から事業所IDを取得（事業所名での部分一致検索用）
    // ---------------------------------------------------------
    let searchOfficeIds: number[] = [];
    if (search) {
      searchOfficeIds = await searchOfficeIdsByName(search);
      logger.info("事業所名検索結果", { searchText: search, matchCount: searchOfficeIds.length });
    }

    // ---------------------------------------------------------
    // FAX一覧クエリ構築
    // ---------------------------------------------------------
    let query = supabaseAdmin
      .from("cm_fax_received")
      .select("*", { count: "exact" });

    // 担当フィルター
    if (assignment === "mine" && myAssignedOfficeIds.length > 0) {
      // 担当事業所 OR 未割当
      query = query.or(`office_id.in.(${myAssignedOfficeIds.join(",")}),office_id.is.null`);
    }

    // 検索フィルター（事業所名、FAX番号、ファイル名で部分一致）
    if (search) {
      // 事業所名でマッチした事業所IDがある場合、それも検索条件に含める
      if (searchOfficeIds.length > 0) {
        query = query.or(
          `fax_number.ilike.%${search}%,file_name.ilike.%${search}%,office_id.in.(${searchOfficeIds.join(",")})`
        );
      } else {
        // 事業所名でマッチしない場合は従来通り
        query = query.or(`fax_number.ilike.%${search}%,file_name.ilike.%${search}%`);
      }
    }

    // ソート
    const sortColumn = sortKey === "receivedAt" ? "received_at" : "received_at";
    query = query.order(sortColumn, { ascending: sortDir === "asc" });

    // ページネーション
    query = query.range(offset, offset + limit - 1);

    // ---------------------------------------------------------
    // FAX一覧取得
    // ---------------------------------------------------------
    const { data: faxList, error: faxError, count } = await query;

    if (faxError) {
      logger.error("FAX一覧取得エラー", { error: faxError.message });
      return NextResponse.json(
        { ok: false, error: faxError.message },
        { status: 500 }
      );
    }

    const faxRows = (faxList || []) as FaxReceivedRow[];
    const faxIds = faxRows.map((f) => f.id);

    // ---------------------------------------------------------
    // ページ情報取得（承認状況・広告判定）
    // ---------------------------------------------------------
    let pagesData: FaxPageRow[] = [];
    if (faxIds.length > 0) {
      const { data: pages, error: pagesError } = await supabaseAdmin
        .from("cm_fax_pages")
        .select("id, fax_received_id, assigned_at, is_advertisement")
        .in("fax_received_id", faxIds);

      if (pagesError) {
        logger.warn("ページ情報取得エラー", { error: pagesError.message });
      } else {
        pagesData = (pages || []) as FaxPageRow[];
      }
    }

    // FAXごとのページ情報をマップ化
    const pagesByFaxId = new Map<number, FaxPageRow[]>();
    for (const p of pagesData) {
      const existing = pagesByFaxId.get(p.fax_received_id) || [];
      existing.push(p);
      pagesByFaxId.set(p.fax_received_id, existing);
    }

    // ---------------------------------------------------------
    // 事業所名取得
    // ---------------------------------------------------------
    const officeIds = [...new Set(faxRows.map((f) => f.office_id).filter((id): id is number => id !== null))];
    const officeMap = new Map<number, string>();

    if (officeIds.length > 0) {
      const { data: offices, error: officeError } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("id, office_name")
        .in("id", officeIds);

      if (officeError) {
        logger.warn("事業所取得エラー", { error: officeError.message });
      } else {
        for (const o of (offices || []) as OfficeRow[]) {
          officeMap.set(o.id, o.office_name);
        }
      }
    }

    // ---------------------------------------------------------
    // レスポンスデータ構築
    // ---------------------------------------------------------
    const resultList = faxRows.map((fax) => {
      const pages = pagesByFaxId.get(fax.id) || [];
      const assignedCount = pages.filter((p) => p.assigned_at !== null).length;
      const isAllAd = pages.length > 0 && pages.every((p) => p.is_advertisement === true);

      return {
        id: fax.id,
        gmail_message_id: fax.gmail_message_id,
        fax_number: fax.fax_number,
        office_id: fax.office_id,
        office_name: fax.office_id ? officeMap.get(fax.office_id) || null : null,
        office_assigned_by: fax.office_assigned_by,
        office_assigned_at: fax.office_assigned_at,
        file_name: fax.file_name,
        file_path: fax.file_path,
        file_id: fax.file_id,
        page_count: fax.page_count || pages.length,
        status: fax.status,
        candidate_clients: Array.isArray(fax.candidate_clients) ? fax.candidate_clients : [],
        received_at: fax.received_at,
        processed_at: fax.processed_at,
        created_at: fax.created_at,
        updated_at: fax.updated_at,
        assigned_page_count: assignedCount,
        is_all_advertisement: isAllAd,
      };
    });

    // 広告確定FAXを除外
    const filteredList = resultList.filter((f) => !f.is_all_advertisement);

    // ---------------------------------------------------------
    // ステータスフィルター（広告除外後に適用）
    // ---------------------------------------------------------
    let statusFilteredList = filteredList;
    if (status !== "all") {
      statusFilteredList = filteredList.filter((fax) => {
        const progress = fax.page_count > 0 ? fax.assigned_page_count / fax.page_count : 0;
        
        switch (status) {
          case "completed":
            return progress === 1 && fax.page_count > 0;
          case "processing":
            return fax.status === "OCR処理中" || (progress > 0 && progress < 1);
          case "pending":
            return progress === 0 && fax.status !== "OCR処理中";
          default:
            return true;
        }
      });
    }

    // ---------------------------------------------------------
    // 統計計算（フィルター前のデータで計算）
    // ---------------------------------------------------------
    const stats = {
      total: filteredList.length,
      pending: filteredList.filter((f) => f.assigned_page_count === 0 && f.status !== "OCR処理中").length,
      processing: filteredList.filter((f) => {
        const progress = f.page_count > 0 ? f.assigned_page_count / f.page_count : 0;
        return f.status === "OCR処理中" || (progress > 0 && progress < 1);
      }).length,
      completed: filteredList.filter((f) => {
        const progress = f.page_count > 0 ? f.assigned_page_count / f.page_count : 0;
        return progress === 1 && f.page_count > 0;
      }).length,
      unassignedOffice: filteredList.filter((f) => f.office_id === null).length,
    };

    // ---------------------------------------------------------
    // ページネーション情報
    // ---------------------------------------------------------
    const totalFiltered = statusFilteredList.length;
    const pagination = {
      page,
      limit,
      total: count ?? totalFiltered,
      totalPages: Math.ceil((count ?? totalFiltered) / limit),
      hasNext: offset + limit < (count ?? totalFiltered),
      hasPrev: page > 1,
    };

    logger.info("FAX一覧取得完了", { 
      total: stats.total, 
      filtered: statusFilteredList.length 
    });

    // ---------------------------------------------------------
    // レスポンス
    // ---------------------------------------------------------
    return NextResponse.json({
      ok: true,
      faxList: statusFilteredList,
      stats,
      pagination,
      myAssignedOfficeIds,
    });

  } catch (e) {
    logger.error("FAX一覧取得例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}