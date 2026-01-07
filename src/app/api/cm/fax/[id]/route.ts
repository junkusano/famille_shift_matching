// =============================================================
// src/app/api/cm/fax/[id]/route.ts
// FAX詳細取得・更新API（デバッグログ追加版）
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";
import { supabase } from "@/lib/supabaseClient";

// =============================================================
// Logger
// =============================================================

const logger = createLogger("cm/api/fax/detail");

// =============================================================
// GET: FAX詳細取得
// =============================================================

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const faxId = parseInt(id, 10);
    if (isNaN(faxId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fax ID" },
        { status: 400 }
      );
    }

    logger.info("FAX詳細取得開始", { faxId });

    // ---------------------------------------------------------
    // FAX本体取得
    // ---------------------------------------------------------
    const { data: faxData, error: faxError } = await supabaseAdmin
      .from("cm_fax_received")
      .select("*")
      .eq("id", faxId)
      .single();

    if (faxError || !faxData) {
      logger.error("FAX取得エラー", { error: faxError?.message });
      return NextResponse.json(
        { ok: false, error: "FAX not found" },
        { status: 404 }
      );
    }

    // 🔍 DEBUG: FAXデータ確認
    logger.info("🔍 DEBUG: FAXデータ", {
      faxId: faxData.id,
      office_id: faxData.office_id,
      fax_number: faxData.fax_number,
    });

    // ---------------------------------------------------------
    // 事業所情報取得
    // ---------------------------------------------------------
    let officeName: string | null = null;
    let officeFaxNumber: string | null = null;
    let officeFaxProxy: string | null = null;
    let officeNumber: string | null = null; // 🔍 DEBUG用

    if (faxData.office_id) {
      const { data: officeData, error: officeError } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("office_name, fax, fax_proxy, office_number")
        .eq("id", faxData.office_id)
        .single();

      // 🔍 DEBUG: 事業所データ確認
      logger.info("🔍 DEBUG: 事業所データ", {
        office_id: faxData.office_id,
        officeData,
        officeError: officeError?.message,
      });

      if (officeData) {
        officeName = officeData.office_name;
        officeFaxNumber = officeData.fax;
        officeFaxProxy = officeData.fax_proxy;
        officeNumber = officeData.office_number; // 🔍 DEBUG用
      }
    }

    // ---------------------------------------------------------
    // ページ情報取得
    // ---------------------------------------------------------
    const { data: pagesData, error: pagesError } = await supabaseAdmin
      .from("cm_fax_pages")
      .select("*")
      .eq("fax_received_id", faxId)
      .order("page_number", { ascending: true });

    if (pagesError) {
      logger.error("ページ取得エラー", { error: pagesError.message });
    }

    // ---------------------------------------------------------
    // OCR結果取得
    // ---------------------------------------------------------
    const { data: ocrData } = await supabaseAdmin
      .from("cm_fax_ocr_results")
      .select("page_number, detected_text, detected_client_name, detected_doc_type_id")
      .eq("fax_received_id", faxId);

    const ocrByPage = new Map<number, (typeof ocrData)[0]>();
    for (const ocr of ocrData || []) {
      ocrByPage.set(ocr.page_number, ocr);
    }

    // ---------------------------------------------------------
    // 文書種別マスタ取得
    // ---------------------------------------------------------
    const { data: docTypesData } = await supabaseAdmin
      .from("cm_document_types")
      .select("id, name, category")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const docTypeMap = new Map<number, { name: string; category: string }>();
    for (const dt of docTypesData || []) {
      docTypeMap.set(dt.id, { name: dt.name, category: dt.category });
    }

    // ---------------------------------------------------------
    // 利用者候補取得（事業所に紐づく利用者）
    // ---------------------------------------------------------
    let clientCandidates: Array<{
      id: string;
      name: string;
      kana: string;
      care_level: string | null;
    }> = [];

    if (faxData.office_id) {
      // 事業所のoffice_numberを取得
      const { data: officeData, error: officeError } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("office_number")
        .eq("id", faxData.office_id)
        .single();

      // 🔍 DEBUG: office_number確認
      logger.info("🔍 DEBUG: 利用者取得用 office_number", {
        office_id: faxData.office_id,
        office_number: officeData?.office_number,
        error: officeError?.message,
      });

      if (officeData?.office_number) {
        // サービス利用から利用者IDを取得
        const { data: usageData, error: usageError } = await supabaseAdmin
          .from("cm_kaipoke_service_usage")
          .select("kaipoke_cs_id")
          .eq("office_number", officeData.office_number);

        // 🔍 DEBUG: サービス利用データ確認
        logger.info("🔍 DEBUG: サービス利用データ", {
          office_number: officeData.office_number,
          usageCount: usageData?.length || 0,
          usageData: usageData?.slice(0, 10), // 最初の10件のみ
          error: usageError?.message,
        });

        if (usageData && usageData.length > 0) {
          const clientIds = [...new Set(usageData.map((u) => u.kaipoke_cs_id))];

          // 🔍 DEBUG: 利用者ID一覧
          logger.info("🔍 DEBUG: 利用者IDリスト", {
            count: clientIds.length,
            clientIds: clientIds.slice(0, 20), // 最初の20件
          });

          // 利用者情報を取得
          const { data: clientsData, error: clientsError } = await supabaseAdmin
            .from("cm_kaipoke_info")
            .select("kaipoke_cs_id, name, kana")
            .in("kaipoke_cs_id", clientIds)
            .eq("is_active", true);

          // 🔍 DEBUG: 利用者情報
          logger.info("🔍 DEBUG: 利用者情報", {
            requestedIds: clientIds.length,
            returnedCount: clientsData?.length || 0,
            clients: clientsData?.slice(0, 10), // 最初の10件
            error: clientsError?.message,
          });

          // 最新の介護度を取得
          const { data: insuranceData } = await supabaseAdmin
            .from("cm_kaipoke_insurance")
            .select("kaipoke_cs_id, care_level, coverage_end")
            .in("kaipoke_cs_id", clientIds)
            .order("coverage_end", { ascending: false });

          const careLevelMap = new Map<string, string>();
          for (const ins of insuranceData || []) {
            if (!careLevelMap.has(ins.kaipoke_cs_id) && ins.care_level) {
              careLevelMap.set(ins.kaipoke_cs_id, ins.care_level);
            }
          }

          clientCandidates = (clientsData || []).map((c) => ({
            id: c.kaipoke_cs_id,
            name: c.name,
            kana: c.kana || "",
            care_level: careLevelMap.get(c.kaipoke_cs_id) || null,
          }));
        } else {
          // 🔍 DEBUG: サービス利用データがない場合
          logger.warn("🔍 DEBUG: サービス利用データが0件", {
            office_number: officeData.office_number,
          });
        }
      } else {
        // 🔍 DEBUG: office_numberがない場合
        logger.warn("🔍 DEBUG: office_numberが取得できませんでした", {
          office_id: faxData.office_id,
        });
      }
    }

    // 🔍 DEBUG: 最終的な利用者候補
    logger.info("🔍 DEBUG: 最終利用者候補", {
      count: clientCandidates.length,
      candidates: clientCandidates,
    });

    // ---------------------------------------------------------
    // ページ情報を整形
    // ---------------------------------------------------------
    const pages = (pagesData || []).map((page) => {
      const ocr = ocrByPage.get(page.page_number);
      const suggestedDocType = page.suggested_doc_type_id
        ? docTypeMap.get(page.suggested_doc_type_id)
        : null;
      const docType = page.document_type_id
        ? docTypeMap.get(page.document_type_id)
        : null;

      // 推定利用者名を取得
      let suggestedClientName: string | null = null;
      if (page.kaipoke_cs_id) {
        const client = clientCandidates.find((c) => c.id === page.kaipoke_cs_id);
        suggestedClientName = client?.name || ocr?.detected_client_name || null;
      }

      return {
        id: page.id,
        fax_received_id: page.fax_received_id,
        page_number: page.page_number,
        rotation: page.rotation || 0,
        rotation_source: page.rotation_source,
        image_url: page.image_url,
        ocr_status: page.ocr_status || "pending",
        // 推定情報
        suggested_doc_type_id: page.suggested_doc_type_id,
        suggested_doc_type_name: suggestedDocType?.name || null,
        suggested_is_ad: page.suggested_is_ad || false,
        suggested_confidence: page.suggested_confidence,
        suggested_source: page.suggested_source,
        kaipoke_cs_id: page.kaipoke_cs_id,
        suggested_client_name: suggestedClientName,
        // 確定情報
        document_type_id: page.document_type_id,
        document_type_name: docType?.name || null,
        is_advertisement: page.is_advertisement || false,
        assigned_client_id: page.kaipoke_cs_id,
        assigned_client_name: page.assigned_at ? suggestedClientName : null,
        assigned_by: page.assigned_by,
        assigned_at: page.assigned_at,
        // OCR結果
        ocr_text: ocr?.detected_text || null,
        ocr_reason: null,
      };
    });

    // ---------------------------------------------------------
    // レスポンス
    // ---------------------------------------------------------
    const faxDetail = {
      id: faxData.id,
      gmail_message_id: faxData.gmail_message_id,
      fax_number: faxData.fax_number,
      office_id: faxData.office_id,
      office_name: officeName,
      office_fax_number: officeFaxNumber,
      office_fax_proxy: officeFaxProxy,
      office_assigned_by: faxData.office_assigned_by,
      office_assigned_at: faxData.office_assigned_at,
      file_name: faxData.file_name,
      file_path: faxData.file_path,
      file_id: faxData.file_id,
      page_count: faxData.page_count || pages.length,
      status: faxData.status,
      received_at: faxData.received_at,
      processed_at: faxData.processed_at,
      pages,
      // 🔍 DEBUG: 追加情報
      _debug: {
        office_number: officeNumber,
        client_candidates_count: clientCandidates.length,
      },
    };

    logger.info("FAX詳細取得完了", { faxId, pageCount: pages.length });

    return NextResponse.json({
      ok: true,
      fax: faxDetail,
      clientCandidates,
      documentTypes: (docTypesData || []).map((dt) => ({
        id: dt.id,
        name: dt.name,
        category: dt.category,
      })),
    });
  } catch (e) {
    logger.error("FAX詳細取得例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// =============================================================
// PATCH: ページ振り分け保存
// =============================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const faxId = parseInt(id, 10);
    if (isNaN(faxId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid fax ID" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { action } = body;

    // ログインユーザー取得
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || "unknown";

    // ---------------------------------------------------------
    // ページ保存
    // ---------------------------------------------------------
    if (action === "save_page") {
      const { page_id, client_id, document_type_id, is_advertisement, rotation } = body;

      const { error } = await supabaseAdmin
        .from("cm_fax_pages")
        .update({
          kaipoke_cs_id: client_id || null,
          document_type_id: document_type_id || null,
          is_advertisement: is_advertisement || false,
          rotation: rotation || 0,
          assigned_by: userId,
          assigned_at: new Date().toISOString(),
        })
        .eq("id", page_id);

      if (error) {
        logger.error("ページ保存エラー", { error: error.message });
        return NextResponse.json(
          { ok: false, error: error.message },
          { status: 500 }
        );
      }

      logger.info("ページ保存完了", { faxId, pageId: page_id });
      return NextResponse.json({ ok: true });
    }

    // ---------------------------------------------------------
    // 事業所割当
    // ---------------------------------------------------------
    if (action === "assign_office") {
      const { office_id, register_fax_proxy, fax_number } = body;

      // FAXに事業所を割り当て
      const { error: faxError } = await supabaseAdmin
        .from("cm_fax_received")
        .update({
          office_id,
          office_assigned_by: userId,
          office_assigned_at: new Date().toISOString(),
        })
        .eq("id", faxId);

      if (faxError) {
        logger.error("事業所割当エラー", { error: faxError.message });
        return NextResponse.json(
          { ok: false, error: faxError.message },
          { status: 500 }
        );
      }

      // FAX代理番号を登録
      if (register_fax_proxy && fax_number) {
        const { error: proxyError } = await supabaseAdmin
          .from("cm_kaipoke_other_office")
          .update({ fax_proxy: fax_number })
          .eq("id", office_id);

        if (proxyError) {
          logger.warn("FAX代理番号登録エラー", { error: proxyError.message });
        } else {
          logger.info("FAX代理番号登録完了", { officeId: office_id, faxNumber: fax_number });
        }
      }

      logger.info("事業所割当完了", { faxId, officeId: office_id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (e) {
    logger.error("FAX更新例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}