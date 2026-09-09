// =============================================================
// src/app/api/cm/fax/documents/route.ts
// 書類保存API
//
// 【v3.2対応】
// - rotation_confirmed, rotation_confirmed_by, rotation_confirmed_at を保存
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/fax/documents");

// =============================================================
// POST: 書類保存
// =============================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      fax_received_id,
      page_ids,
      document_type_id,
      client_ids,
      client_names,
      office_id,
      is_advertisement,
      requires_response,
      rotation, // 【v3.2追加】回転角度
    } = body;

    // ---------------------------------------------------------
    // バリデーション
    // ---------------------------------------------------------
    if (!fax_received_id) {
      return NextResponse.json(
        { ok: false, error: "fax_received_id is required" },
        { status: 400 }
      );
    }

    if (!page_ids || !Array.isArray(page_ids) || page_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "page_ids is required" },
        { status: 400 }
      );
    }

    logger.info("書類保存開始", {
      fax_received_id,
      page_ids,
      document_type_id,
      client_ids,
      is_advertisement,
      rotation,
    });

    // ---------------------------------------------------------
    // ログインユーザー取得
    // ---------------------------------------------------------
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || "unknown";

    // ---------------------------------------------------------
    // 書類作成
    // ---------------------------------------------------------
    const { data: docData, error: docError } = await supabaseAdmin
      .from("cm_fax_documents")
      .insert({
        fax_received_id,
        document_type_id: document_type_id || null,
        office_id: office_id || null,
        is_advertisement: is_advertisement || false,
        is_cover_sheet: false,
        requires_response: requires_response || false,
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (docError || !docData) {
      logger.error("書類作成エラー", { error: docError?.message });
      return NextResponse.json(
        { ok: false, error: docError?.message || "書類作成に失敗しました" },
        { status: 500 }
      );
    }

    const documentId = docData.id;

    // ---------------------------------------------------------
    // ページ紐付け
    // ---------------------------------------------------------
    const pageInserts = page_ids.map((pageId: number, index: number) => ({
      fax_document_id: documentId,
      fax_page_id: pageId,
      page_order: index,
    }));

    const { error: pageError } = await supabaseAdmin
      .from("cm_fax_document_pages")
      .insert(pageInserts);

    if (pageError) {
      logger.error("ページ紐付けエラー", { error: pageError.message });
      // ロールバック
      await supabaseAdmin.from("cm_fax_documents").delete().eq("id", documentId);
      return NextResponse.json(
        { ok: false, error: pageError.message },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 利用者紐付け（広告以外）
    // ---------------------------------------------------------
    if (client_ids && client_ids.length > 0 && !is_advertisement) {
      const clientInserts = client_ids.map((clientId: string, index: number) => ({
        fax_document_id: documentId,
        kaipoke_cs_id: clientId,
        client_name: client_names?.[index] || null,
        is_primary: index === 0,
        source: "manual",
      }));

      const { error: clientError } = await supabaseAdmin
        .from("cm_fax_document_clients")
        .insert(clientInserts);

      if (clientError) {
        logger.error("利用者紐付けエラー", { error: clientError.message });
        // ロールバック
        await supabaseAdmin.from("cm_fax_document_pages").delete().eq("fax_document_id", documentId);
        await supabaseAdmin.from("cm_fax_documents").delete().eq("id", documentId);
        return NextResponse.json(
          { ok: false, error: clientError.message },
          { status: 500 }
        );
      }
    }

    // ---------------------------------------------------------
    // ページの割当状態を更新（cm_fax_pages）
    // 【v3.2】rotation_confirmed 系を追加
    // ---------------------------------------------------------
    const now = new Date().toISOString();
    
    const updateData: Record<string, unknown> = {
      assigned_by: userId,
      assigned_at: now,
      document_type_id: document_type_id || null,
      is_advertisement: is_advertisement || false,
    };

    // 回転が指定されている場合は確定値として保存
    if (rotation !== undefined && rotation !== null) {
      updateData.rotation_confirmed = rotation;
      updateData.rotation_confirmed_by = userId;
      updateData.rotation_confirmed_at = now;
    }

    const { error: updateError } = await supabaseAdmin
      .from("cm_fax_pages")
      .update(updateData)
      .in("id", page_ids);

    if (updateError) {
      logger.warn("ページ更新エラー", { error: updateError.message });
    }

    logger.info("書類保存完了", { documentId, pageCount: page_ids.length, rotation });

    return NextResponse.json({
      ok: true,
      document_id: documentId,
    });
  } catch (e) {
    logger.error("書類保存例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}