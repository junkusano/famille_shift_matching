import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { requireMonitoringActor, monitoringAuthErrorResponse } from "@/lib/monitoring/auth";
import { recordMonitoringEvent } from "@/lib/monitoring/audit";
import { loadMonitoringContext } from "@/lib/monitoring/context";
import { renderMonitoringPdf, type MonitoringPdfSnapshot } from "@/lib/monitoring/pdf";
import {
  getMonitoringGoals,
  getMonitoringRecord,
  monitoringFilename,
} from "@/lib/monitoring/repository";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const actor = await requireMonitoringActor(request, { manage: true });
    const { id } = await params;
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
    const snapshot: MonitoringPdfSnapshot = {
      monitoring,
      goals,
      context: {
        client_name: String(context.client.name ?? ""),
        care_level: String(insurance.care_level ?? ""),
        office_name: context.office_name ?? "",
        destination_office: context.fax_target.office_name ?? "",
        care_manager_name: context.fax_target.contact_name ?? "",
      },
    };
    const pdf = await renderMonitoringPdf(snapshot);
    const filename = monitoringFilename(monitoring, version);
    const storagePath = `${monitoring.client_info_id}/${monitoring.id}/${crypto.randomUUID()}-${filename}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("monitoring-pdfs")
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;

    const contentHash = createHash("sha256").update(pdf).digest("hex");
    const { data: snapshotRow, error: snapshotError } = await supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .insert({
        monitoring_id: id,
        version_no: version,
        storage_bucket: "monitoring-pdfs",
        storage_path: storagePath,
        filename,
        content_hash: contentHash,
        content_snapshot: snapshot,
        created_by: actor.userId,
        created_by_name: actor.name,
      })
      .select("id,version_no,filename,content_hash,created_at")
      .single();
    if (snapshotError) throw snapshotError;

    const { error: updateError } = await supabaseAdmin
      .from("client_monitorings")
      .update({ status: "pdf_final", current_pdf_snapshot_id: snapshotRow.id })
      .eq("id", id);
    if (updateError) throw updateError;
    await recordMonitoringEvent({
      monitoringId: id,
      action: "pdf_create",
      actor,
      metadata: { snapshot_id: snapshotRow.id, version, content_hash: contentHash },
    });
    return NextResponse.json({ ok: true, data: snapshotRow });
  } catch (error) {
    const normalized = monitoringAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: normalized.message }, { status: normalized.status });
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
      .select("id,storage_bucket,storage_path,filename")
      .eq("id", snapshotId)
      .eq("monitoring_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!snapshot) {
      return NextResponse.json({ ok: false, error: "PDF履歴が見つかりません" }, { status: 404 });
    }
    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(snapshot.storage_bucket)
      .download(snapshot.storage_path);
    if (downloadError) throw downloadError;
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    const asciiName = `monitoring-${id}.pdf`;
    return new NextResponse(await blob.arrayBuffer(), {
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
