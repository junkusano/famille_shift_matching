import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { MonitoringPdfError, renderMonitoringPdf, type MonitoringPdfSnapshot } from "@/lib/monitoring/pdf";
import {
  getMonitoringGoals,
  getMonitoringRecord,
  monitoringFilename,
} from "@/lib/monitoring/repository";
import { effectiveOfficeNotice } from "@/lib/monitoring/core";
import {
  deleteGoogleDriveFile,
  downloadGoogleDriveFile,
  GoogleDriveFileError,
  uploadBufferToGoogleDrive,
} from "@/lib/google-drive/upload";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

const MONITORING_PDF_DRIVE_FOLDER_ID =
  process.env.MONITORING_PDF_DRIVE_FOLDER_ID?.trim() ||
  "1vm98ZwiiE2H4RP1R918dYBNAusUdH3DS";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest, { params }: Context) {
  let monitoringId: string | null = null;
  let pipelineStage:
    | "auth"
    | "load"
    | "render"
    | "drive"
    | "history"
    | "monitoring" = "auth";
  let driveFileId: string | null = null;
  let snapshotId: string | null = null;

  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    pipelineStage = "load";
    const { id } = await params;
    monitoringId = id;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    if (monitoring.status !== "confirmed") {
      return NextResponse.json(
        { ok: false, error: "サービス提供責任者が確認・確定した後にPDFを作成してください" },
        { status: 409 },
      );
    }

    const [goals, context, versionResult] = await Promise.all([
      getMonitoringGoals(id),
      loadMonitoringContext({
        clientInfoId: monitoring.client_info_id,
        periodStart: monitoring.period_start,
        periodEnd: monitoring.period_end,
      }),
      supabaseAdmin
        .from("client_monitoring_pdf_snapshots")
        .select("version_no")
        .eq("monitoring_id", id)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (versionResult.error) throw versionResult.error;

    const version = Number(versionResult.data?.version_no ?? 0) + 1;
    const insurance = asRecord(context.client.insurance);
    const clientName = String(context.client.name ?? "利用者");
    const effectiveMonitoring = {
      ...monitoring,
      office_notice: effectiveOfficeNotice(monitoring.office_notice, context.office_notice),
    };
    const snapshot: MonitoringPdfSnapshot = {
      monitoring: effectiveMonitoring,
      goals,
      context: {
        client_name: clientName,
        care_level: String(insurance.care_level ?? ""),
        office_name: context.office_name ?? "",
        destination_office: context.fax_target.office_name ?? "",
        care_manager_name: context.fax_target.contact_name ?? context.fax_target.office_name ?? "",
      },
    };

    pipelineStage = "render";
    const pdf = await renderMonitoringPdf(snapshot);
    const filename = monitoringFilename(monitoring, version, clientName);

    pipelineStage = "drive";
    const driveFile = await uploadBufferToGoogleDrive({
      buffer: pdf,
      filename,
      folderId: MONITORING_PDF_DRIVE_FOLDER_ID,
      mimeType: "application/pdf",
    });
    driveFileId = driveFile.fileId;

    pipelineStage = "history";
    const contentHash = createHash("sha256").update(pdf).digest("hex");
    const { data: snapshotRow, error: snapshotError } = await supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .insert({
        monitoring_id: id,
        version_no: version,
        filename,
        content_hash: contentHash,
        content_snapshot: snapshot,
        drive_file_id: driveFile.fileId,
        drive_web_view_link: driveFile.webViewLink,
        drive_folder_id: MONITORING_PDF_DRIVE_FOLDER_ID,
        created_by: actor.userId,
        created_by_name: actor.name,
      })
      .select(
        "id,version_no,filename,content_hash,drive_file_id,drive_web_view_link,drive_folder_id,created_at",
      )
      .single();
    if (snapshotError) throw snapshotError;
    snapshotId = snapshotRow.id;

    pipelineStage = "monitoring";
    const { error: updateError } = await supabaseAdmin
      .from("client_monitorings")
      .update({ status: "pdf_final", current_pdf_snapshot_id: snapshotRow.id })
      .eq("id", id);
    if (updateError) throw updateError;

    await recordMonitoringEvent({
      monitoringId: id,
      action: "pdf_create",
      actor,
      metadata: {
        snapshot_id: snapshotRow.id,
        version,
        content_hash: contentHash,
        drive_file_id: driveFile.fileId,
        drive_folder_id: MONITORING_PDF_DRIVE_FOLDER_ID,
      },
    }).catch((auditError) => {
      console.error("[monitoring:pdf] audit failed", {
        monitoringId: id,
        message: auditError instanceof Error ? auditError.message : String(auditError),
      });
    });

    return NextResponse.json({ ok: true, data: snapshotRow });
  } catch (error) {
    if (snapshotId) {
      await supabaseAdmin
        .from("client_monitoring_pdf_snapshots")
        .delete()
        .eq("id", snapshotId)
        .then(({ error: cleanupError }) => {
          if (cleanupError) {
            console.error("[monitoring:pdf] snapshot cleanup failed", {
              snapshotId,
              message: cleanupError.message,
            });
          }
        });
    }
    if (driveFileId) {
      await deleteGoogleDriveFile(driveFileId).catch((cleanupError) => {
        console.error("[monitoring:pdf] Drive cleanup failed", {
          driveFileId,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
    }

    const normalized = monitoringAuthErrorResponse(error);
    if (normalized.status !== 500) {
      return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
    }

    const message =
      error instanceof MonitoringPdfError
        ? error.message
        : error instanceof GoogleDriveFileError
          ? error.stage === "auth"
            ? "PDF生成には成功しましたが、Google Driveの認証に失敗しました"
            : error.stage === "folder"
              ? "PDF生成には成功しましたが、Google Driveの保存先フォルダが見つからないか、アクセス権がありません"
              : "PDF生成には成功しましたが、Google Driveへの保存に失敗しました"
          : pipelineStage === "history" || pipelineStage === "monitoring"
            ? "PDFは生成・保存されましたが、PDF履歴の保存に失敗しました"
            : "PDF作成処理に失敗しました";

    console.error("[monitoring:pdf] pipeline failed", {
      stage: pipelineStage,
      monitoringId,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { ok: false, error: message, stage: pipelineStage },
      { status: 500 },
    );
  }
}
export async function GET(request: NextRequest, { params }: Context) {
  try {
    await requireMonitoringActor(request);
    const { id } = await params;
    const monitoring = await getMonitoringRecord(id);
    if (!monitoring) {
      return NextResponse.json({ ok: false, error: "モニタリングが見つかりません" }, { status: 404 });
    }
    const requestedSnapshotId = request.nextUrl.searchParams.get("snapshot_id")?.trim();
    const snapshotId = requestedSnapshotId || monitoring.current_pdf_snapshot_id;
    if (!snapshotId) {
      return NextResponse.json({ ok: false, error: "確定PDFがありません" }, { status: 404 });
    }
    const { data: snapshot, error } = await supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .select("id,drive_file_id,filename")
      .eq("id", snapshotId)
      .eq("monitoring_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "PDF履歴が見つかりません" }, { status: 404 });
    }
    if (!snapshot.drive_file_id) {
      return NextResponse.json(
        { ok: false, error: "Google DriveのPDF情報が登録されていません" },
        { status: 404 },
      );
    }
    const pdf = await downloadGoogleDriveFile(snapshot.drive_file_id);
    const responseBody = Uint8Array.from(pdf).buffer;
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const asciiName = `monitoring-${id}.pdf`;
    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(
          snapshot.filename,
        )}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
  }
}
