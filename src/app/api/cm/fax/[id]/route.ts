// =============================================================
// src/app/api/cm/fax/[id]/route.ts
// FAX詳細取得API（新DB構造対応版）
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

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
      .select("page_number, detected_text, detected_client_name")
      .eq("fax_received_id", faxId);

    const ocrByPage = new Map<number, { text: string | null; clientName: string | null }>();
    for (const ocr of ocrData || []) {
      ocrByPage.set(ocr.page_number, {
        text: ocr.detected_text,
        clientName: ocr.detected_client_name,
      });
    }

    // ---------------------------------------------------------
    // 事業所一覧取得（cm_fax_received_offices）
    // ---------------------------------------------------------
    const { data: officesData, error: officesError } = await supabaseAdmin
      .from("cm_fax_received_offices")
      .select(`
        id,
        fax_received_id,
        office_id,
        is_primary,
        assigned_by,
        assigned_at,
        created_at
      `)
      .eq("fax_received_id", faxId)
      .order("is_primary", { ascending: false });

    if (officesError) {
      logger.error("事業所取得エラー", { error: officesError.message });
    }

    // 事業所詳細を取得
    const officeIds = (officesData || []).map((o) => o.office_id);
    const officeDetailsMap = new Map<number, {
      office_name: string;
      fax: string | null;
      fax_proxy: string | null;
      service_type: string | null;
    }>();

    if (officeIds.length > 0) {
      const { data: officeDetails } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("id, office_name, fax, fax_proxy, service_type")
        .in("id", officeIds);

      for (const od of officeDetails || []) {
        officeDetailsMap.set(od.id, {
          office_name: od.office_name,
          fax: od.fax,
          fax_proxy: od.fax_proxy,
          service_type: od.service_type,
        });
      }
    }

    // ---------------------------------------------------------
    // 書類一覧取得（cm_fax_documents）
    // ---------------------------------------------------------
    const { data: docsData, error: docsError } = await supabaseAdmin
      .from("cm_fax_documents")
      .select("*")
      .eq("fax_received_id", faxId)
      .order("sort_order", { ascending: true });

    if (docsError) {
      logger.error("書類取得エラー", { error: docsError.message });
    }

    const docIds = (docsData || []).map((d) => d.id);

    // 書類-ページ中間テーブル
    const docPagesMap = new Map<number, { pageId: number; pageNumber: number }[]>();
    if (docIds.length > 0) {
      const { data: docPages } = await supabaseAdmin
        .from("cm_fax_document_pages")
        .select("fax_document_id, fax_page_id, page_order")
        .in("fax_document_id", docIds)
        .order("page_order", { ascending: true });

      for (const dp of docPages || []) {
        const page = (pagesData || []).find((p) => p.id === dp.fax_page_id);
        if (!docPagesMap.has(dp.fax_document_id)) {
          docPagesMap.set(dp.fax_document_id, []);
        }
        docPagesMap.get(dp.fax_document_id)!.push({
          pageId: dp.fax_page_id,
          pageNumber: page?.page_number || 0,
        });
      }
    }

    // 書類-利用者中間テーブル
    const docClientsMap = new Map<number, { id: string; name: string; isPrimary: boolean }[]>();
    if (docIds.length > 0) {
      const { data: docClients } = await supabaseAdmin
        .from("cm_fax_document_clients")
        .select("fax_document_id, kaipoke_cs_id, client_name, is_primary")
        .in("fax_document_id", docIds);

      for (const dc of docClients || []) {
        if (!docClientsMap.has(dc.fax_document_id)) {
          docClientsMap.set(dc.fax_document_id, []);
        }
        docClientsMap.get(dc.fax_document_id)!.push({
          id: dc.kaipoke_cs_id,
          name: dc.client_name || "",
          isPrimary: dc.is_primary || false,
        });
      }
    }

    // ---------------------------------------------------------
    // 文書種別マスタ取得
    // ---------------------------------------------------------
    const { data: docTypesData } = await supabaseAdmin
      .from("cm_document_types")
      .select("id, name, category, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    const docTypeMap = new Map<number, { name: string; category: string | null }>();
    for (const dt of docTypesData || []) {
      docTypeMap.set(dt.id, { name: dt.name, category: dt.category });
    }

    // ---------------------------------------------------------
    // 利用者候補取得（紐付いた全事業所の利用者）
    // ---------------------------------------------------------
    let clientCandidates: Array<{
      kaipoke_cs_id: string;
      client_name: string;
      client_kana: string;
      office_id: number;
      office_name: string;
    }> = [];

    // 紐付いた事業所のoffice_numberを取得
    if (officeIds.length > 0) {
      const { data: officeNumbers } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("id, office_number, office_name")
        .in("id", officeIds);

      const officeNumberList = (officeNumbers || [])
        .filter((o) => o.office_number)
        .map((o) => ({ id: o.id, number: o.office_number, name: o.office_name }));

      if (officeNumberList.length > 0) {
        // サービス利用から利用者IDを取得
        const { data: usageData } = await supabaseAdmin
          .from("cm_kaipoke_service_usage")
          .select("kaipoke_cs_id, office_number")
          .in("office_number", officeNumberList.map((o) => o.number));

        if (usageData && usageData.length > 0) {
          const clientIds = [...new Set(usageData.map((u) => u.kaipoke_cs_id))];

          // 利用者情報を取得
          const { data: clientsData } = await supabaseAdmin
            .from("cm_kaipoke_info")
            .select("kaipoke_cs_id, name, kana")
            .in("kaipoke_cs_id", clientIds)
            .eq("is_active", true);

          // office_number → office_id/office_name のマップ
          const officeByNumber = new Map<string, { id: number; name: string }>();
          for (const o of officeNumberList) {
            officeByNumber.set(o.number, { id: o.id, name: o.name });
          }

          // 利用者ごとの事業所を特定
          const clientOfficeMap = new Map<string, { id: number; name: string }>();
          for (const u of usageData) {
            const office = officeByNumber.get(u.office_number);
            if (office && !clientOfficeMap.has(u.kaipoke_cs_id)) {
              clientOfficeMap.set(u.kaipoke_cs_id, office);
            }
          }

          clientCandidates = (clientsData || []).map((c) => {
            const office = clientOfficeMap.get(c.kaipoke_cs_id);
            return {
              kaipoke_cs_id: c.kaipoke_cs_id,
              client_name: c.name,
              client_kana: c.kana || "",
              office_id: office?.id || 0,
              office_name: office?.name || "",
            };
          });
        }
      }
    }

    // ---------------------------------------------------------
    // レスポンス構築
    // ---------------------------------------------------------

    // FAX本体
    const fax = {
      id: faxData.id,
      fax_number: faxData.fax_number || "",
      sender_name: null,
      received_at: faxData.received_at,
      page_count: faxData.page_count || (pagesData?.length || 0),
      status: faxData.status || "pending",
      pdf_drive_file_id: faxData.file_id,
      created_at: faxData.created_at,
      updated_at: faxData.updated_at,
    };

    // ページ一覧
    const pages = (pagesData || []).map((p) => {
      const ocr = ocrByPage.get(p.page_number);
      return {
        id: p.id,
        fax_received_id: p.fax_received_id,
        page_number: p.page_number,
        image_url: p.image_url,
        image_drive_file_id: null,
        rotation: p.rotation || 0,
        logical_order: p.logical_order,
        ocr_status: p.ocr_status || "pending",
        ocr_text: ocr?.text || null,
        suggested_client_id: p.kaipoke_cs_id,
        suggested_client_name: p.suggested_client_name || ocr?.clientName || null,
        suggested_doc_type_id: p.suggested_doc_type_id,
        suggested_confidence: p.suggested_confidence ? Number(p.suggested_confidence) : null,
        suggested_reason: null,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    // 事業所一覧
    const offices = (officesData || []).map((o) => {
      const detail = officeDetailsMap.get(o.office_id);
      return {
        id: o.id,
        fax_received_id: o.fax_received_id,
        office_id: o.office_id,
        office_name: detail?.office_name || "",
        fax: detail?.fax || null,
        fax_proxy: detail?.fax_proxy || null,
        service_type: detail?.service_type || null,
        is_primary: o.is_primary || false,
        assigned_by: o.assigned_by,
        assigned_at: o.assigned_at,
      };
    });

    // 書類一覧
    const documents = (docsData || []).map((d) => {
      const docType = d.document_type_id ? docTypeMap.get(d.document_type_id) : null;
      const officeDetail = d.office_id ? officeDetailsMap.get(d.office_id) : null;
      const docPages = docPagesMap.get(d.id) || [];
      const docClients = docClientsMap.get(d.id) || [];

      return {
        id: d.id,
        fax_received_id: d.fax_received_id,
        document_type_id: d.document_type_id,
        document_type_name: docType?.name || null,
        office_id: d.office_id,
        office_name: officeDetail?.office_name || null,
        is_advertisement: d.is_advertisement || false,
        is_cover_sheet: d.is_cover_sheet || false,
        requires_response: d.requires_response || false,
        response_deadline: d.response_deadline,
        response_sent_at: d.response_sent_at,
        assigned_by: d.assigned_by,
        assigned_at: d.assigned_at,
        created_at: d.created_at,
        updated_at: d.updated_at,
        client_ids: docClients.map((c) => c.id),
        client_names: docClients.map((c) => c.name),
        page_ids: docPages.map((p) => p.pageId),
        page_numbers: docPages.map((p) => p.pageNumber),
      };
    });

    // 文書種別
    const documentTypes = (docTypesData || []).map((dt) => ({
      id: dt.id,
      name: dt.name,
      category: dt.category,
      sort_order: dt.sort_order,
    }));

    // 処理状況
    const assignedPageIds = new Set<number>();
    for (const doc of documents) {
      for (const pageId of doc.page_ids || []) {
        assignedPageIds.add(pageId);
      }
    }
    const processingStatus = {
      total_pages: pages.length,
      assigned_pages: assignedPageIds.size,
      total_documents: documents.length,
      completion_rate: pages.length > 0 ? assignedPageIds.size / pages.length : 0,
    };

    logger.info("FAX詳細取得完了", {
      faxId,
      pageCount: pages.length,
      officeCount: offices.length,
      documentCount: documents.length,
      clientCount: clientCandidates.length,
    });

    return NextResponse.json({
      ok: true,
      fax,
      pages,
      offices,
      documents,
      clients: clientCandidates,
      documentTypes,
      processingStatus,
    });
  } catch (e) {
    logger.error("FAX詳細取得例外", e);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}