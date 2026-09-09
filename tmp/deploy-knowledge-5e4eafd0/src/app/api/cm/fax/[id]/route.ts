// =============================================================
// src/app/api/cm/fax/[id]/route.ts
// FAX詳細取得API（新DB構造対応版）
//
// 【v3.2対応】
// - rotation_confirmed を優先して返却
// - 確定値 → 推定値 → 0 の優先順位
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
  _req: NextRequest,
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

    logger.info("FAX詳細取得", { faxId });

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
    // ページ取得（rotation_confirmed を追加）
    // ---------------------------------------------------------
    const { data: pagesData, error: pagesError } = await supabaseAdmin
      .from("cm_fax_pages")
      .select(`
        id,
        fax_received_id,
        page_number,
        rotation,
        rotation_confirmed,
        logical_order,
        image_url,
        ocr_status,
        kaipoke_cs_id,
        suggested_client_name,
        suggested_doc_type_id,
        suggested_confidence,
        document_type_id,
        is_advertisement,
        assigned_by,
        assigned_at,
        created_at,
        updated_at
      `)
      .eq("fax_received_id", faxId)
      .order("page_number", { ascending: true });

    if (pagesError) {
      logger.error("ページ取得エラー", { error: pagesError.message });
    }

    // ---------------------------------------------------------
    // 事業所取得
    // ---------------------------------------------------------
    const { data: officesData } = await supabaseAdmin
      .from("cm_fax_received_offices")
      .select(`
        id,
        fax_received_id,
        office_id,
        is_primary,
        assigned_by,
        assigned_at
      `)
      .eq("fax_received_id", faxId);

    const officeIds = (officesData || []).map((o) => o.office_id);

    // 事業所詳細を取得
    let officeDetails: Array<{
      id: number;
      office_name: string;
      fax: string | null;
      fax_proxy: string | null;
      service_type: string | null;
    }> = [];

    if (officeIds.length > 0) {
      const { data: officeData } = await supabaseAdmin
        .from("cm_kaipoke_other_office")
        .select("id, office_name, fax, fax_proxy, service_type")
        .in("id", officeIds);

      officeDetails = officeData || [];
    }

    const officeMap = new Map(officeDetails.map((o) => [o.id, o]));

    // ---------------------------------------------------------
    // 書類取得
    // ---------------------------------------------------------
    const { data: documentsData } = await supabaseAdmin
      .from("cm_fax_documents")
      .select("*")
      .eq("fax_received_id", faxId)
      .order("created_at", { ascending: true });

    // 書類-ページ紐付け取得
    const docIds = (documentsData || []).map((d) => d.id);
    const docPagesMap = new Map<number, Array<{ page_id: number; page_order: number }>>();

    if (docIds.length > 0) {
      const { data: docPagesData } = await supabaseAdmin
        .from("cm_fax_document_pages")
        .select("fax_document_id, fax_page_id, page_order")
        .in("fax_document_id", docIds);

      for (const dp of docPagesData || []) {
        if (!docPagesMap.has(dp.fax_document_id)) {
          docPagesMap.set(dp.fax_document_id, []);
        }
        docPagesMap.get(dp.fax_document_id)!.push({
          page_id: dp.fax_page_id,
          page_order: dp.page_order,
        });
      }
    }

    // 書類-利用者紐付け取得
    const docClientsMap = new Map<number, Array<{ id: string; name: string; isPrimary: boolean }>>();

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
    // OCR結果取得（suggested_reason用）
    // ---------------------------------------------------------
    const pageIds = (pagesData || []).map((p) => p.id);
    const ocrByPage = new Map<number, { text: string | null; clientName: string | null; reason: string | null }>();

    if (pageIds.length > 0) {
      const { data: ocrData } = await supabaseAdmin
        .from("cm_fax_ocr_results")
        .select("fax_page_id, ocr_text, extracted_client_name, suggested_reason")
        .in("fax_page_id", pageIds);

      for (const ocr of ocrData || []) {
        const page = (pagesData || []).find((p) => p.id === ocr.fax_page_id);
        if (page) {
          ocrByPage.set(page.page_number, {
            text: ocr.ocr_text,
            clientName: ocr.extracted_client_name,
            reason: ocr.suggested_reason,
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

    // ページ一覧（rotation_confirmed を優先）
    const pages = (pagesData || []).map((p) => {
      const ocr = ocrByPage.get(p.page_number);
      return {
        id: p.id,
        fax_received_id: p.fax_received_id,
        page_number: p.page_number,
        image_url: p.image_url,
        image_drive_file_id: null,
        // 【v3.2】確定値 → 推定値 → 0 の優先順位
        rotation: p.rotation_confirmed ?? p.rotation ?? 0,
        logical_order: p.logical_order,
        ocr_status: p.ocr_status || "pending",
        ocr_text: ocr?.text || null,
        suggested_client_id: p.kaipoke_cs_id,
        suggested_client_name: p.suggested_client_name || ocr?.clientName || null,
        suggested_doc_type_id: p.suggested_doc_type_id,
        suggested_confidence: p.suggested_confidence ? Number(p.suggested_confidence) : null,
        suggested_reason: ocr?.reason || null,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    // 事業所一覧
    const offices = (officesData || []).map((o) => {
      const detail = officeMap.get(o.office_id);
      return {
        id: o.id,
        fax_received_id: o.fax_received_id,
        office_id: o.office_id,
        office_name: detail?.office_name || "",
        fax: detail?.fax || null,
        fax_proxy: detail?.fax_proxy || null,
        service_type: detail?.service_type || null,
        is_primary: o.is_primary,
        assigned_by: o.assigned_by,
        assigned_at: o.assigned_at,
      };
    });

    // 書類一覧
    const documents = (documentsData || []).map((d) => {
      const docPages = docPagesMap.get(d.id) || [];
      const docClients = docClientsMap.get(d.id) || [];
      const docType = d.document_type_id ? docTypeMap.get(d.document_type_id) : null;

      // page_id から page_number を取得
      const pageNumberMap = new Map((pagesData || []).map((p) => [p.id, p.page_number]));

      return {
        id: d.id,
        fax_received_id: d.fax_received_id,
        document_type_id: d.document_type_id,
        document_type_name: docType?.name || null,
        office_id: d.office_id,
        office_name: d.office_id ? officeMap.get(d.office_id)?.office_name || null : null,
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
        page_ids: docPages.map((p) => p.page_id),
        page_numbers: docPages.map((p) => pageNumberMap.get(p.page_id) || 0),
      };
    });

    // 文書種別マスタ
    const documentTypes = (docTypesData || []).map((dt) => ({
      id: dt.id,
      name: dt.name,
      category: dt.category,
      sort_order: dt.sort_order,
    }));

    // 処理状況
    const assignedPageIds = new Set(documents.flatMap((d) => d.page_ids || []));
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