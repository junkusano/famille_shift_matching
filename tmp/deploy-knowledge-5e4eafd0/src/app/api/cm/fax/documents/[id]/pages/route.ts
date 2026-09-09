// =============================================================
// src/app/api/cm/fax/documents/[id]/pages/route.ts
// 既存書類にページ追加API
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/fax/documents/pages");

// =============================================================
// POST: ページ追加
// =============================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const documentId = parseInt(id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid document ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { page_ids } = body;

    // ---------------------------------------------------------
    // バリデーション
    // ---------------------------------------------------------
    if (!page_ids || !Array.isArray(page_ids) || page_ids.length === 0) {
      return NextResponse.json(
        { ok: false, error: "page_ids is required" },
        { status: 400 }
      );
    }

    logger.info("ページ追加開始", { documentId, page_ids });

    // ---------------------------------------------------------
    // 書類存在確認
    // ---------------------------------------------------------
    const { data: docData, error: docError } = await supabaseAdmin
      .from("cm_fax_documents")
      .select("id, fax_received_id, document_type_id, is_advertisement")
      .eq("id", documentId)
      .single();

    if (docError || !docData) {
      logger.error("書類取得エラー", { error: docError?.message });
      return NextResponse.json(
        { ok: false, error: "Document not found" },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // 既存ページの最大順番を取得
    // ---------------------------------------------------------
    const { data: existingPages } = await supabaseAdmin
      .from("cm_fax_document_pages")
      .select("page_order")
      .eq("fax_document_id", documentId)
      .order("page_order", { ascending: false })
      .limit(1);

    const maxOrder = existingPages?.[0]?.page_order || 0;

    // ---------------------------------------------------------
    // ログインユーザー取得
    // ---------------------------------------------------------
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || "unknown";

    // ---------------------------------------------------------
    // ページ追加
    // ---------------------------------------------------------
    const pageInserts = page_ids.map((pageId: number, index: number) => ({
      fax_document_id: documentId,
      fax_page_id: pageId,
      page_order: maxOrder + index + 1,
    }));

    const { error: pageError } = await supabaseAdmin
      .from("cm_fax_document_pages")
      .insert(pageInserts);

    if (pageError) {
      logger.error("ページ追加エラー", { error: pageError.message });
      return NextResponse.json(
        { ok: false, error: pageError.message },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // ページの割当状態を更新（cm_fax_pages）
    // ---------------------------------------------------------
    const { error: updateError } = await supabaseAdmin
      .from("cm_fax_pages")
      .update({
        assigned_by: userId,
        assigned_at: new Date().toISOString(),
        document_type_id: docData.document_type_id,
        is_advertisement: docData.is_advertisement || false,
      })
      .in("id", page_ids);

    if (updateError) {
      logger.warn("ページ更新エラー", { error: updateError.message });
    }

    logger.info("ページ追加完了", { documentId, addedCount: page_ids.length });

    return NextResponse.json({
      ok: true,
      document_id: documentId,
      added_count: page_ids.length,
    });
  } catch (e) {
    logger.error("ページ追加例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
