// =============================================================
// src/app/api/cm/fax/route.ts
// FAX一覧取得API（高速化版）
//
// 【最適化】
// - 統計計算を別API（/api/cm/fax/stats）に分離
// - 一覧取得に特化してクエリを最適化
// - 不要なカラムを削減
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

const logger = createLogger("cm/api/fax");

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

// ヘルパー: kaipoke_user_id取得
async function getKaipokeUserId(): Promise<string | null> {
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) return null;

    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("kaipoke_user_id")
      .eq("auth_user_id", authData.user.id)
      .single();

    return userData?.kaipoke_user_id || null;
  } catch {
    return null;
  }
}

// ヘルパー: 担当事業所ID取得
async function getAssignedOfficeIds(kaipokeUserId: string): Promise<number[]> {
  try {
    const { data: supportData } = await supabaseAdmin
      .from("cm_kaipoke_support_office")
      .select("kaipoke_cs_id")
      .eq("care_manager_kaipoke_id", kaipokeUserId);

    if (!supportData?.length) return [];

    const clientIds = [...new Set(supportData.map((d) => d.kaipoke_cs_id))];

    const { data: usageData } = await supabaseAdmin
      .from("cm_kaipoke_service_usage")
      .select("office_number")
      .in("kaipoke_cs_id", clientIds)
      .not("office_number", "is", null);

    if (!usageData?.length) return [];

    const officeNumbers = [...new Set(usageData.map((d) => d.office_number).filter(Boolean))];

    const { data: officeData } = await supabaseAdmin
      .from("cm_kaipoke_other_office")
      .select("id")
      .in("office_number", officeNumbers);

    return (officeData || []).map((o) => o.id);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const assignment = searchParams.get("assignment") || "mine";
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const sortKey = searchParams.get("sortKey") || "receivedAt";
    const sortDir = searchParams.get("sortDir") || "desc";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 20;
    const offset = (page - 1) * limit;

    logger.info("FAX一覧取得開始", { status, page });

    // 担当事業所ID取得（非同期で開始）
    let myAssignedOfficeIds: number[] = [];
    const kaipokeUserId = await getKaipokeUserId();
    if (kaipokeUserId) {
      myAssignedOfficeIds = await getAssignedOfficeIds(kaipokeUserId);
    }

    // FAX一覧クエリ構築
    let query = supabaseAdmin
      .from("cm_fax_received")
      .select("*", { count: "exact" });

    // 担当フィルター
    if (assignment === "mine" && myAssignedOfficeIds.length > 0) {
      query = query.or(`office_id.in.(${myAssignedOfficeIds.join(",")}),office_id.is.null`);
    }

    // 検索フィルター
    if (search) {
      query = query.or(`fax_number.ilike.%${search}%,file_name.ilike.%${search}%`);
    }

    // 事業所未割当フィルター
    if (status === "unassignedOffice") {
      query = query.is("office_id", null);
    }

    // ソート
    const sortColumn = sortKey === "receivedAt" ? "received_at" : "received_at";
    query = query.order(sortColumn, { ascending: sortDir === "asc" });

    // ページネーション
    query = query.range(offset, offset + limit - 1);

    // FAX一覧取得
    const { data: faxList, error: faxError, count } = await query;

    if (faxError) {
      logger.error("FAX一覧取得エラー", { error: faxError.message });
      return NextResponse.json({ ok: false, error: faxError.message }, { status: 500 });
    }

    const faxRows = (faxList || []) as FaxReceivedRow[];
    const faxIds = faxRows.map((f) => f.id);
    const officeIds = [...new Set(faxRows.map((f) => f.office_id).filter((id): id is number => id !== null))];

    // 【並列取得】ページ情報と事業所名を同時に取得
    const [pagesResult, officesResult] = await Promise.all([
      // ページ情報
      faxIds.length > 0
        ? supabaseAdmin
            .from("cm_fax_pages")
            .select("id, fax_received_id, assigned_at, is_advertisement")
            .in("fax_received_id", faxIds)
        : Promise.resolve({ data: [], error: null }),
      // 事業所名
      officeIds.length > 0
        ? supabaseAdmin
            .from("cm_kaipoke_other_office")
            .select("id, office_name")
            .in("id", officeIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // ページ情報をマップ化
    const pagesByFaxId = new Map<number, FaxPageRow[]>();
    for (const p of (pagesResult.data || []) as FaxPageRow[]) {
      const existing = pagesByFaxId.get(p.fax_received_id) || [];
      existing.push(p);
      pagesByFaxId.set(p.fax_received_id, existing);
    }

    // 事業所名をマップ化
    const officeMap = new Map<number, string>();
    for (const o of (officesResult.data || []) as OfficeRow[]) {
      officeMap.set(o.id, o.office_name);
    }

    // レスポンスデータ構築
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

    // 広告FAXを除外
    const filteredList = resultList.filter((f) => !f.is_all_advertisement);

    // ステータスフィルター
    let statusFilteredList = filteredList;
    if (status !== "all" && status !== "unassignedOffice") {
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

    // ページネーション情報
    const pagination = {
      page,
      limit,
      total: count ?? statusFilteredList.length,
      totalPages: Math.ceil((count ?? statusFilteredList.length) / limit),
      hasNext: offset + limit < (count ?? statusFilteredList.length),
      hasPrev: page > 1,
    };

    logger.info("FAX一覧取得完了", { total: pagination.total, filtered: statusFilteredList.length });

    return NextResponse.json({
      ok: true,
      faxList: statusFilteredList,
      pagination,
      myAssignedOfficeIds,
    });
  } catch (e) {
    logger.error("FAX一覧取得例外", e);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}