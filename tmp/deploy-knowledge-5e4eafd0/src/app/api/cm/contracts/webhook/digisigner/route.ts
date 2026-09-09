// =============================================================
// src/app/api/cm/contracts/webhook/digisigner/route.ts
// DigiSigner Webhook受信エンドポイント
//
// 外部（DigiSigner）からHTTPリクエストを受けるため、
// 唯一APIルートとして残す。
//
// セキュリティ:
//   層1: URLクエリパラメータのトークン検証
//        （cm_rpa_credentials.digisigner.webhook_token と照合）
//   層2: DB整合性チェック（書類存在確認 + ステータス遷移の妥当性）
//
// v2変更:
//   - cm_contract_document_signers 子テーブルベースに書き換え
//   - 処理フロー:
//     1. トークン検証 → 不一致なら即 401
//     2. ペイロードを cm_contract_webhook_logs に記録
//     3. 署名完了イベント処理:
//        a. cm_contract_document_signers の該当署名者を signed に更新
//        b. 同一書類の全署名者が signed なら書類を signed に更新（all_signed_at 記録）
//        c. 同一契約の全書類が signed なら契約を signed に更新
//     4. "DIGISIGNER_EVENT_ACCEPTED" をテキストで返却
// =============================================================

import { NextRequest } from "next/server";
import { createLogger } from "@/lib/common/logger";
import { supabaseAdmin } from "@/lib/supabase/service";

const logger = createLogger("cm/api/contracts/webhook/digisigner");

// =============================================================
// トークン取得（cm_rpa_credentials から）
// =============================================================

async function getWebhookToken(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("cm_rpa_credentials")
    .select("credentials")
    .eq("service_name", "digisigner")
    .eq("is_active", true)
    .single();

  if (error || !data) {
    logger.error("DigiSigner認証情報取得失敗", { error: error?.message });
    return null;
  }

  return data.credentials?.webhook_token ?? null;
}

// =============================================================
// POST ハンドラ
// =============================================================

export async function POST(request: NextRequest) {
  try {
    // -------------------------------------------------------
    // 層1: トークン検証
    // -------------------------------------------------------
    const token = request.nextUrl.searchParams.get("token");
    const expectedToken = await getWebhookToken();

    if (!expectedToken) {
      logger.error("Webhook Token未設定（cm_rpa_credentials を確認）");
      return new Response("Internal Server Error", { status: 500 });
    }

    if (!token || token !== expectedToken) {
      logger.warn("Webhook不正アクセス: トークン不一致", {
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
      });
      return new Response("Unauthorized", { status: 401 });
    }

    // -------------------------------------------------------
    // ペイロード取得
    // -------------------------------------------------------
    const payload = await request.json();

    logger.info("DigiSigner Webhook受信", {
      event_type: payload.event_type,
      document_id: payload.document_id,
      signature_request_id: payload.signature_request_id,
    });

    // -------------------------------------------------------
    // Webhookログ記録
    // -------------------------------------------------------
    const { error: logError } = await supabaseAdmin
      .from("cm_contract_webhook_logs")
      .insert({
        event_type: payload.event_type || "unknown",
        digisigner_document_id: payload.document_id || null,
        digisigner_signature_request_id:
          payload.signature_request_id || null,
        payload,
        processing_status: "received",
      });

    if (logError) {
      logger.warn("Webhookログ記録エラー", { message: logError.message });
    }

    // -------------------------------------------------------
    // 署名完了イベント処理
    // -------------------------------------------------------
    if (
      payload.event_type === "signature_request_completed" &&
      payload.document_id
    ) {
      await processSignatureCompleted(payload.document_id);
    }

    // DigiSignerが期待するレスポンス形式
    return new Response("DIGISIGNER_EVENT_ACCEPTED", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logger.error("Webhook処理例外", { error: message });
    return new Response("Internal Server Error", { status: 500 });
  }
}

// =============================================================
// 署名完了処理（v2: 子テーブルベース）
//
// signature_request_completed イベントは、DigiSignerの署名リクエスト内の
// 全署名者が署名を完了した時点で発火される。
//
// 処理フロー:
//   1. digisigner_document_id で親書類を特定
//   2. 子テーブルの全署名者を signed に一括更新
//   3. 親書類の signing_status を signed に更新（all_signed_at 記録）
//   4. 同一契約の全書類が signed なら契約を signed に更新
// =============================================================

async function processSignatureCompleted(documentId: string) {
  logger.info("署名完了処理開始", { documentId });

  // -------------------------------------------------------
  // 層2-a: 該当書類の存在確認
  // -------------------------------------------------------
  const { data: doc, error: docError } = await supabaseAdmin
    .from("cm_contract_documents")
    .select("id, contract_id, signing_status")
    .eq("digisigner_document_id", documentId)
    .maybeSingle();

  if (docError || !doc) {
    logger.warn("書類特定失敗（不正なdocument_idの可能性）", {
      documentId,
      error: docError?.message,
    });
    return;
  }

  // -------------------------------------------------------
  // 層2-b: ステータス遷移の妥当性チェック
  //   signing → signed のみ許可
  //   pending（まだ送信されていない）や signed（既に完了）からの更新は無視
  // -------------------------------------------------------
  if (doc.signing_status !== "signing") {
    logger.warn("不正なステータス遷移を拒否", {
      documentId,
      currentStatus: doc.signing_status,
      requestedStatus: "signed",
    });
    return;
  }

  const now = new Date().toISOString();

  // -------------------------------------------------------
  // Step 1: 子テーブルの全署名者を signed に一括更新
  //
  // signature_request_completed は全署名者完了で発火されるため、
  // 該当書類の全署名者を一括で signed にする
  // -------------------------------------------------------
  const { data: updatedSigners, error: signersUpdateError } = await supabaseAdmin
    .from("cm_contract_document_signers")
    .update({
      signing_status: "signed",
      signed_at: now,
    })
    .eq("document_id", doc.id)
    .neq("signing_status", "signed")  // 冪等性: 既に signed の署名者はスキップ
    .select("id, role");

  if (signersUpdateError) {
    logger.error("署名者ステータス一括更新エラー", {
      message: signersUpdateError.message,
      docId: doc.id,
    });
    return;
  }

  logger.info("署名者ステータス一括更新完了", {
    docId: doc.id,
    updatedCount: updatedSigners?.length ?? 0,
  });

  // -------------------------------------------------------
  // Step 2: 全署名者が signed か検証（安全確認）
  // -------------------------------------------------------
  const { data: allSigners } = await supabaseAdmin
    .from("cm_contract_document_signers")
    .select("id, signing_status")
    .eq("document_id", doc.id);

  const allSignersSigned = (allSigners ?? []).every(
    (s) => s.signing_status === "signed"
  );

  if (!allSignersSigned) {
    // signature_request_completed なのに未完了の署名者がいる場合
    // ログを残すが書類ステータスは更新しない
    logger.warn("全署名者が signed でないため書類更新をスキップ", {
      docId: doc.id,
      signerStatuses: (allSigners ?? []).map((s) => s.signing_status),
    });
    return;
  }

  // -------------------------------------------------------
  // Step 3: 親書類の signing_status を signed に更新
  // -------------------------------------------------------
  const { error: updateDocError } = await supabaseAdmin
    .from("cm_contract_documents")
    .update({
      signing_status: "signed",
      all_signed_at: now,
    })
    .eq("id", doc.id);

  if (updateDocError) {
    logger.error("書類ステータス更新エラー", {
      message: updateDocError.message,
    });
    return;
  }

  logger.info("書類ステータス更新完了", { docId: doc.id });

  // -------------------------------------------------------
  // Step 4: 同じ契約の全書類が signed か確認 → 契約ステータス更新
  // -------------------------------------------------------
  const { data: allDocs } = await supabaseAdmin
    .from("cm_contract_documents")
    .select("id, signing_status")
    .eq("contract_id", doc.contract_id);

  const allDocsSigned = (allDocs ?? []).every(
    (d) => d.signing_status === "signed"
  );

  if (allDocsSigned) {
    // 契約側も signing → signed のみ許可
    const { data: contract } = await supabaseAdmin
      .from("cm_contracts")
      .select("id, status")
      .eq("id", doc.contract_id)
      .single();

    if (contract?.status !== "signing") {
      logger.warn("契約ステータス遷移を拒否", {
        contractId: doc.contract_id,
        currentStatus: contract?.status,
      });
      return;
    }

    const { error: updateContractError } = await supabaseAdmin
      .from("cm_contracts")
      .update({
        status: "signed",
        signed_at: now,
      })
      .eq("id", doc.contract_id);

    if (updateContractError) {
      logger.error("契約ステータス更新エラー", {
        message: updateContractError.message,
      });
    } else {
      logger.info("契約ステータスを signed に更新", {
        contractId: doc.contract_id,
      });
    }
  }

  // -------------------------------------------------------
  // Webhookログの processing_status を更新
  // -------------------------------------------------------
  await supabaseAdmin
    .from("cm_contract_webhook_logs")
    .update({
      processing_status: "processed",
      processed_at: now,
    })
    .eq("digisigner_document_id", documentId)
    .eq("processing_status", "received");
}