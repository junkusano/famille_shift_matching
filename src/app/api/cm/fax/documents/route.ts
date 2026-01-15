// =============================================================
// src/app/api/cm/fax/documents/route.ts
// 書類保存API
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
        { ok: false, error: docError?.message || "Failed to create document" },
        { status: 500 }
      );
    }

    const documentId = docData.id;

    // ---------------------------------------------------------
    // 書類-ページ紐付け
    // ---------------------------------------------------------
    const pageInserts = page_ids.map((pageId: number, index: number) => ({
      fax_document_id: documentId,
      fax_page_id: pageId,
      page_order: index + 1,
    }));

    const { error: pageError } = await supabaseAdmin
      .from("cm_fax_document_pages")
      .insert(pageInserts);

    if (pageError) {
      logger.error("ページ紐付けエラー", { error: pageError.message });
      // ロールバック: 書類を削除
      await supabaseAdmin.from("cm_fax_documents").delete().eq("id", documentId);
      return NextResponse.json(
        { ok: false, error: pageError.message },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // 書類-利用者紐付け（広告以外）
    // ---------------------------------------------------------
    if (!is_advertisement && client_ids && client_ids.length > 0) {
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
    // ---------------------------------------------------------
    const { error: updateError } = await supabaseAdmin
      .from("cm_fax_pages")
      .update({
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
        document_type_id: document_type_id || null,
        is_advertisement: is_advertisement || false,
      })
      .in("id", page_ids);

    if (updateError) {
      logger.warn("ページ更新エラー", { error: updateError.message });
    }

    logger.info("書類保存完了", { documentId, pageCount: page_ids.length });

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
