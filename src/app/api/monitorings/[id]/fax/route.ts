import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendFaximoFax } from "@/lib/faximo/client";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { getMonitoringRecord } from "@/lib/monitoring/repository";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

function processKey(): string {
  return `mn${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`.slice(
    0,
    20,
  );
}

export async function POST(request: NextRequest, { params }: Context) {
  let historyId: string | null = null;
  let faxLogBatchId: string | null = null;
  let faxLogProcessKey: string | null = null;
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    if (!["pdf_final", "fax_sent"].includes(monitoring.status) || !monitoring.current_pdf_snapshot_id) {
      return NextResponse.json(
        { ok: false, error: "確定PDFを作成してからFAX送信してください" },
        { status: 409 },
      );
    }
    const context = await loadMonitoringContext({
      clientInfoId: monitoring.client_info_id,
      periodStart: monitoring.period_start,
      periodEnd: monitoring.period_end,
    });
    const target = context.fax_target;
    if (!target.fax_number) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "モニタリングのFAX送信先が登録されていません。担当ケアマネジャー・相談支援事業所等のFAX番号を確認してください。",
          detail_url: `/portal/kaipoke-info-detail/${monitoring.client_info_id}`,
        },
        { status: 409 },
      );
    }

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .select("id,storage_bucket,storage_path,filename")
      .eq("id", monitoring.current_pdf_snapshot_id)
      .eq("monitoring_id", id)
      .maybeSingle();
    if (snapshotError) throw snapshotError;
    if (!snapshot) throw new Error("FAX送信用PDFが見つかりません");

    const { count: previousAccepted, error: countError } = await supabaseAdmin
      .from("monitoring_fax_history")
      .select("id", { count: "exact", head: true })
      .eq("monitoring_id", id)
      .eq("status", "accepted");
    if (countError) throw countError;
    const sendProcessKey = processKey();
    const batchId = crypto.randomUUID();
    const { data: history, error: historyError } = await supabaseAdmin
      .from("monitoring_fax_history")
      .insert({
        monitoring_id: id,
        client_info_id: monitoring.client_info_id,
        kaipoke_cs_id: monitoring.kaipoke_cs_id,
        pdf_snapshot_id: snapshot.id,
        sent_by: actor.userId,
        sent_by_name: actor.name,
        fax_number: target.fax_number,
        destination_name: target.office_name || "送信先名称未設定",
        contact_name: target.contact_name,
        status: "sending",
        process_key: sendProcessKey,
      })
      .select("id")
      .single();
    if (historyError) throw historyError;
    historyId = history.id;

    const subject = `モニタリング ${monitoring.period_start}～${monitoring.period_end}`.slice(0, 50);
    const { error: faxLogError } = await supabaseAdmin.from("fax_log").insert({
      batch_id: batchId,
      process_key: sendProcessKey,
      fax_number: target.fax_number,
      office_name: target.office_name,
      fax_master_id: target.fax_id,
      subject,
      file_names: [snapshot.filename],
      file_count: 1,
      recipient_count: 1,
      status: "requesting",
      status_message: "faximoSilverへ送信依頼中",
      requester_user_id: actor.userId,
      requester_user_name: actor.name,
      page_name: `/portal/kaipoke-info-detail/${monitoring.client_info_id}/monitoring/${id}`,
      mail_to: process.env.FAXIMO_RESULT_EMAIL?.trim() || null,
      retry_count: 1,
    });
    if (faxLogError) throw new Error(`FAX履歴の登録に失敗しました: ${faxLogError.message}`);
    faxLogBatchId = batchId;
    faxLogProcessKey = sendProcessKey;

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(snapshot.storage_bucket)
      .download(snapshot.storage_path);
    if (downloadError) throw downloadError;

    const result = await sendFaximoFax({
      faxNumbers: [target.fax_number],
      attachments: [{ filename: snapshot.filename, data: Buffer.from(await blob.arrayBuffer()) }],
      subject,
      headerInfo: (context.office_name || "ファミーユ").slice(0, 80),
      retryCount: 1,
      resultEmail: process.env.FAXIMO_RESULT_EMAIL?.trim(),
      processKey: sendProcessKey,
    });
    const sentAt = result.accepttime || new Date().toISOString();
    const { error: updateHistoryError } = await supabaseAdmin
      .from("monitoring_fax_history")
      .update({
        status: "accepted",
        sent_at: sentAt,
        external_fax_id: result.idxcnt ?? null,
        process_key: result.processkey ?? sendProcessKey,
        faximo_result_code: result.result,
      })
      .eq("id", history.id);
    if (updateHistoryError) throw updateHistoryError;
    await supabaseAdmin
      .from("fax_log")
      .update({
        status: "accepted",
        status_message: "faximoSilverが送信依頼を受け付けました",
        faximo_result_code: result.result,
        faximo_request_id: result.idxcnt ?? null,
        accepted_at: sentAt,
        updated_at: new Date().toISOString(),
      })
      .eq("batch_id", batchId)
      .eq("process_key", sendProcessKey);

    const { error: updateMonitoringError } = await supabaseAdmin
      .from("client_monitorings")
      .update({ status: "fax_sent" })
      .eq("id", id);
    if (updateMonitoringError) throw updateMonitoringError;
    await recordMonitoringEvent({
      monitoringId: id,
      action: (previousAccepted ?? 0) > 0 ? "fax_resend" : "fax_send",
      actor,
      metadata: {
        fax_history_id: history.id,
        pdf_snapshot_id: snapshot.id,
        destination_name: target.office_name,
        fax_number: target.fax_number,
        external_fax_id: result.idxcnt ?? null,
      },
    });
    return NextResponse.json({
      ok: true,
      data: { history_id: history.id, sent_at: sentAt, external_fax_id: result.idxcnt ?? null },
    });
  } catch (error) {
    if (historyId) {
      await supabaseAdmin
        .from("monitoring_fax_history")
        .update({
          status: "request_failed",
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq("id", historyId);
    }
    if (faxLogBatchId && faxLogProcessKey) {
      await supabaseAdmin
        .from("fax_log")
        .update({
          status: "request_failed",
          status_message: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        })
        .eq("batch_id", faxLogBatchId)
        .eq("process_key", faxLogProcessKey);
    }
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json(
      { ok: false, error: normalized.message },
      { status: normalized.status === 500 ? 502 : normalized.status },
    );
  }
}
