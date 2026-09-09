import "server-only";

import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/service";
import { sendFaximoFax } from "@/lib/faximo/client";
import { uploadBufferToGoogleDrive, downloadGoogleDriveFile } from "@/lib/google-drive/upload";
import { generateMonitoringWithAi } from "./ai";
import { recordMonitoringEvent } from "./audit";
import { effectiveOfficeNotice } from "./core";
import { loadMonitoringContext } from "./context";
import { renderMonitoringPdf, type MonitoringPdfSnapshot } from "./pdf";
import { getMonitoringGoals, monitoringFilename } from "./repository";
import { prepareMonitoringSignedPlan } from "./signed-plan";
import type { MonitoringActor } from "./auth";
import type { MonitoringContext, MonitoringRecord } from "@/types/monitoring";

const MONITORING_PDF_DRIVE_FOLDER_ID =
  process.env.MONITORING_PDF_DRIVE_FOLDER_ID?.trim() || "1vm98ZwiiE2H4RP1R918dYBNAusUdH3DS";

export type MonitoringBulkItem = {
  id: string;
  client_info_id: string;
  kaipoke_cs_id: string;
  client_name: string | null;
  orgunitid: string | null;
};

export type MonitoringBulkRun = {
  id: string;
  period_start: string;
  period_end: string;
  evaluation_date: string;
  event_template_id: string;
};

export type MonitoringBulkResult =
  | { status: "sent"; monitoringId: string; note: string }
  | { status: "task_created"; taskId: string; note: string }
  | { status: "skipped"; monitoringId: string; note: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function planFields(context: MonitoringContext) {
  if (context.signed_plan) {
    return {
      client_request: context.signed_plan.client_request,
      family_request: context.signed_plan.family_request,
      issues: context.signed_plan.issues,
    };
  }
  return {
    client_request: text(context.plan?.person_family_hope),
    family_request: text(context.plan?.family_request),
    issues: text(context.plan?.identified_needs) || text(context.plan?.assistance_goal),
  };
}

async function createUrgentTask(params: {
  templateId: string;
  item: MonitoringBulkItem;
  dueDate: string;
  reasons: string[];
}): Promise<string> {
  const { data: task, error: taskError } = await supabaseAdmin
    .from("event_tasks")
    .insert({
      template_id: params.templateId,
      kaipoke_cs_id: params.item.kaipoke_cs_id,
      orgunitid: params.item.orgunitid,
      due_date: params.dueDate,
      status: "open",
      memo: `早急に対応必要：${params.reasons.join("、")}`,
    })
    .select("id")
    .single();
  if (taskError) throw taskError;

  const { data: templateDocs, error: templateDocsError } = await supabaseAdmin
    .from("event_template_required_docs")
    .select("doc_type_id,memo,sort_order")
    .eq("template_id", params.templateId)
    .order("sort_order", { ascending: true });
  if (templateDocsError) throw templateDocsError;
  if ((templateDocs ?? []).length > 0) {
    const { error } = await supabaseAdmin.from("event_task_required_docs").insert(
      templateDocs.map((doc) => ({
        event_task_id: task.id,
        doc_type_id: doc.doc_type_id,
        memo: doc.memo ?? null,
        status: "pending",
      })),
    );
    if (error) throw error;
  }
  return task.id;
}

async function createPdf(params: {
  monitoring: MonitoringRecord;
  context: MonitoringContext;
  actor: MonitoringActor;
  runId: string;
}): Promise<{ snapshotId: string; filename: string }> {
  const [goals, versionResult] = await Promise.all([
    getMonitoringGoals(params.monitoring.id),
    supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .select("version_no")
      .eq("monitoring_id", params.monitoring.id)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (versionResult.error) throw versionResult.error;
  const version = Number(versionResult.data?.version_no ?? 0) + 1;
  const insurance = (params.context.client.insurance ?? {}) as Record<string, unknown>;
  const snapshot: MonitoringPdfSnapshot = {
    monitoring: {
      ...params.monitoring,
      office_notice: effectiveOfficeNotice(params.monitoring.office_notice, params.context.office_notice),
    },
    goals,
    context: {
      client_name: String(params.context.client.name ?? "利用者"),
      care_level: String(insurance.care_level ?? ""),
      office_name: "ファミーユヘルパーサービス愛知",
      destination_office: params.context.fax_target.office_name ?? "",
      care_manager_name: params.context.fax_target.contact_name ?? params.context.fax_target.office_name ?? "",
      team_contacts: params.context.team_contacts,
    },
  };
  const pdf = await renderMonitoringPdf(snapshot);
  const filename = monitoringFilename(params.monitoring, version, snapshot.context.client_name);
  const driveFile = await uploadBufferToGoogleDrive({
    buffer: pdf,
    filename,
    folderId: MONITORING_PDF_DRIVE_FOLDER_ID,
    mimeType: "application/pdf",
  });
  const contentHash = createHash("sha256").update(pdf).digest("hex");
  const { data: saved, error: savedError } = await supabaseAdmin
    .from("client_monitoring_pdf_snapshots")
    .insert({
      monitoring_id: params.monitoring.id,
      version_no: version,
      filename,
      content_hash: contentHash,
      content_snapshot: snapshot,
      drive_file_id: driveFile.fileId,
      drive_web_view_link: driveFile.webViewLink,
      drive_folder_id: MONITORING_PDF_DRIVE_FOLDER_ID,
      created_by: params.actor.userId,
      created_by_name: params.actor.name,
    })
    .select("id,filename")
    .single();
  if (savedError) throw savedError;
  const { error: monitoringError } = await supabaseAdmin
    .from("client_monitorings")
    .update({ status: "pdf_final", current_pdf_snapshot_id: saved.id })
    .eq("id", params.monitoring.id);
  if (monitoringError) throw monitoringError;
  await recordMonitoringEvent({
    monitoringId: params.monitoring.id,
    action: "pdf_create",
    actor: params.actor,
    metadata: { bulk_run_id: params.runId, snapshot_id: saved.id, version, content_hash: contentHash },
  });
  return { snapshotId: saved.id, filename: saved.filename };
}

async function sendFax(params: {
  monitoring: MonitoringRecord;
  context: MonitoringContext;
  snapshotId: string;
  filename: string;
  actor: MonitoringActor;
  runId: string;
}): Promise<void> {
  const target = params.context.fax_target;
  if (!target.fax_number) throw new Error("FAX番号が登録されていません");
  const processKey = `mn${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`.slice(0, 20);
  const batchId = crypto.randomUUID();
  const { data: history, error: historyError } = await supabaseAdmin
    .from("monitoring_fax_history")
    .insert({
      monitoring_id: params.monitoring.id,
      client_info_id: params.monitoring.client_info_id,
      kaipoke_cs_id: params.monitoring.kaipoke_cs_id,
      pdf_snapshot_id: params.snapshotId,
      sent_by: params.actor.userId,
      sent_by_name: params.actor.name,
      fax_number: target.fax_number,
      destination_name: target.office_name || "送信先名称未設定",
      contact_name: target.contact_name,
      status: "sending",
      process_key: processKey,
    })
    .select("id")
    .single();
  if (historyError) throw historyError;
  let accepted = false;
  try {
    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from("client_monitoring_pdf_snapshots")
      .select("drive_file_id")
      .eq("id", params.snapshotId)
      .single();
    if (snapshotError || !snapshot?.drive_file_id) throw new Error("送付用PDFが見つかりません");
    const pdf = await downloadGoogleDriveFile(snapshot.drive_file_id);
    const { error: faxLogError } = await supabaseAdmin.from("fax_log").insert({
      batch_id: batchId,
      process_key: processKey,
      fax_number: target.fax_number,
      office_name: target.office_name,
      fax_master_id: target.fax_id,
      subject: `モニタリング ${params.monitoring.period_start}～${params.monitoring.period_end}`.slice(0, 50),
      file_names: [params.filename],
      file_count: 1,
      recipient_count: 1,
      status: "requesting",
      status_message: "faximoSilverへ送信依頼中",
      requester_user_id: params.actor.userId,
      requester_user_name: params.actor.name,
      page_name: "/portal/admin/monitoring-office-notice",
      mail_to: process.env.FAXIMO_RESULT_EMAIL?.trim() || null,
      retry_count: 1,
    });
    if (faxLogError) throw faxLogError;
    const result = await sendFaximoFax({
      faxNumbers: [target.fax_number],
      attachments: [{ filename: params.filename, data: pdf }],
      subject: `モニタリング ${params.monitoring.period_start}～${params.monitoring.period_end}`.slice(0, 50),
      headerInfo: (params.context.office_name || "ファミーユ").slice(0, 80),
      retryCount: 1,
      resultEmail: process.env.FAXIMO_RESULT_EMAIL?.trim(),
      processKey,
    });
    accepted = true;
    const sentAt = result.accepttime || new Date().toISOString();
    const updates = await Promise.all([
      supabaseAdmin.from("monitoring_fax_history").update({
        status: "accepted", sent_at: sentAt, external_fax_id: result.idxcnt ?? null,
        process_key: result.processkey ?? processKey, faximo_result_code: result.result,
      }).eq("id", history.id),
      supabaseAdmin.from("fax_log").update({
        status: "accepted", status_message: "faximoSilverが送信依頼を受け付けました",
        faximo_result_code: result.result, faximo_request_id: result.idxcnt ?? null,
        accepted_at: sentAt, updated_at: new Date().toISOString(),
      }).eq("batch_id", batchId).eq("process_key", processKey),
      supabaseAdmin.from("client_monitorings").update({ status: "fax_sent" }).eq("id", params.monitoring.id),
    ]);
    for (const update of updates) if (update.error) throw new Error("FAX受付後の保存に失敗しました。再送せずFAX履歴を確認してください");
    await recordMonitoringEvent({
      monitoringId: params.monitoring.id,
      action: "fax_send",
      actor: params.actor,
      metadata: { bulk_run_id: params.runId, fax_history_id: history.id, snapshot_id: params.snapshotId },
    });
  } catch (error) {
    await supabaseAdmin.from("monitoring_fax_history").update({
      ...(accepted ? { status: "accepted" } : {}), error_message: error instanceof Error ? error.message : String(error),
    }).eq("id", history.id);
    await supabaseAdmin.from("fax_log").update({
      status: accepted ? "accepted" : "request_failed",
      status_message: accepted ? "FAX受付済み・保存状況の確認が必要" : "送付処理でエラー。受付状況を確認してください",
    }).eq("batch_id", batchId).eq("process_key", processKey);
    throw error;
  }
}

export async function processMonitoringBulkItem(params: {
  run: MonitoringBulkRun;
  item: MonitoringBulkItem;
  actor: MonitoringActor;
  accessToken: string;
}): Promise<MonitoringBulkResult> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("client_monitorings")
    .select("id")
    .eq("client_info_id", params.item.client_info_id)
    .eq("period_start", params.run.period_start)
    .eq("period_end", params.run.period_end)
    .eq("is_deleted", false)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { status: "skipped", monitoringId: existing.id, note: "対象期間のモニタリングを作成済みです。内容と送付状況は個別画面で確認してください" };

  // A resumed run may send on a later date than its original start date.
  params = { ...params, run: { ...params.run, evaluation_date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()) } };

  let signedPlan;
  try {
    signedPlan = await prepareMonitoringSignedPlan({
      kaipokeCsId: params.item.kaipoke_cs_id,
      periodEnd: params.run.period_end,
      accessToken: params.accessToken,
    });
  } catch (error) {
    const taskId = await createUrgentTask({
      templateId: params.run.event_template_id, item: params.item, dueDate: params.run.evaluation_date,
      reasons: [`署名済みプランのテキスト化・要約処理に失敗しました（${error instanceof Error ? error.message : String(error)}）`],
    });
    return { status: "task_created", taskId, note: "署名済みプランの準備エラー" };
  }

  const context = await loadMonitoringContext({
    clientInfoId: params.item.client_info_id,
    periodStart: params.run.period_start,
    periodEnd: params.run.period_end,
    evaluationDate: params.run.evaluation_date,
  });
  const reasons: string[] = [];
  if (!signedPlan) reasons.push("署名済みプランがありません");
  if (signedPlan && !signedPlan.ocr_ready) reasons.push("署名済みプランをテキスト化できません");
  if (signedPlan && !signedPlan.summary_ready) reasons.push("署名済みプランを要約できません");
  if (context.service_type_detected === "care_insurance" && context.goals.length === 0) reasons.push("援助目標を取得できません");
  if (context.visit_records.length === 0) reasons.push("対象月の訪問内容を確認できません");
  if (!context.service_type_detected) reasons.push("サービス種別を判定できません");
  if (!context.fax_target.fax_id || !context.fax_target.office_name) {
    reasons.push("担当ケアマネジャー・相談支援専門員が登録されていません");
  }
  if (!context.fax_target.fax_number) reasons.push("担当ケアマネジャー・相談支援専門員のFAX番号が登録されていません");
  else if (!/^\d{1,20}$/.test(context.fax_target.fax_number.replace(/[\s()-]/g, ""))) reasons.push("送付先のFAX番号が正しくありません");
  if (!context.team_contacts?.length) reasons.push("担当チームのマネジャー・アシスタントマネジャーを確認できません");
  else if (context.team_contacts.some(contact => !contact.phone)) reasons.push("担当チームのマネジャー・アシスタントマネジャーの電話番号が不足しています");
  if (reasons.length > 0) {
    const taskId = await createUrgentTask({
      templateId: params.run.event_template_id, item: params.item, dueDate: params.run.evaluation_date, reasons,
    });
    return { status: "task_created", taskId, note: reasons.join("、") };
  }

  const fields = planFields(context);
  const { data: created, error: createdError } = await supabaseAdmin
    .from("client_monitorings")
    .insert({
      client_info_id: params.item.client_info_id,
      kaipoke_cs_id: params.item.kaipoke_cs_id,
      service_type: context.service_type_detected,
      period_start: params.run.period_start,
      period_end: params.run.period_end,
      evaluation_date: params.run.evaluation_date,
      status: "draft",
      assessment_id: context.assessment ? String(context.assessment.assessment_id ?? "") || null : null,
      plan_id: context.plan ? String(context.plan.plan_id ?? "") || null : null,
      ...fields,
      office_notice: context.office_notice,
      created_by: params.actor.userId,
      created_by_name: params.actor.name,
    })
    .select("*")
    .single();
  if (createdError) throw createdError;
  const monitoring = created as MonitoringRecord;
  const linked = await supabaseAdmin.from("monitoring_bulk_run_items").update({ monitoring_id: monitoring.id }).eq("id", params.item.id);
  if (linked.error) throw linked.error;
  if (context.goals.length > 0) {
    const { error } = await supabaseAdmin.from("client_monitoring_goals").insert(
      context.goals.map((goal, index) => ({
        monitoring_id: monitoring.id, plan_goal_id: goal.goal_id, parent_plan_goal_id: goal.parent_goal_id,
        goal_type: goal.goal_type, goal_text: goal.goal_text, evaluation_start: goal.evaluation_start,
        evaluation_end: goal.evaluation_end, sort_order: index,
      })),
    );
    if (error) throw error;
  }
  await recordMonitoringEvent({ monitoringId: monitoring.id, action: "create", actor: params.actor, metadata: { bulk_run_id: params.run.id } });

  const generated = await generateMonitoringWithAi({ context, serviceType: monitoring.service_type });
  if (!generated.summary.trim()) throw new Error("生成結果のモニタリング本文が空欄です");
  const { error: generationError } = await supabaseAdmin.from("client_monitorings").update({
    ...fields, summary: generated.summary, notable_observations: generated.notable_observations,
    monitoring_json: { summary: generated.summary, notable_observations: generated.notable_observations, bulk_run_id: params.run.id },
    generated_by_ai: true, ai_model: generated.model, ai_generated_at: new Date().toISOString(), status: "ai_generated",
  }).eq("id", monitoring.id);
  if (generationError) throw generationError;
  const goals = await getMonitoringGoals(monitoring.id);
  for (const generatedGoal of generated.goals) {
    const goal = goals.find((row) => row.plan_goal_id === generatedGoal.goal_id);
    if (!goal) continue;
    const { error } = await supabaseAdmin.from("client_monitoring_goals").update({
      achievement_status: generatedGoal.achievement, evaluation_text: generatedGoal.evaluation,
      review_required: generatedGoal.review_required, review_content: generatedGoal.review_content,
      ai_evidence_json: generatedGoal.evidence_record_ids, generated_by_ai: true,
    }).eq("id", goal.id);
    if (error) throw error;
  }
  await recordMonitoringEvent({ monitoringId: monitoring.id, action: "ai_generate", actor: params.actor, metadata: { bulk_run_id: params.run.id, model: generated.model } });
  const { error: confirmError } = await supabaseAdmin.from("client_monitorings").update({
    status: "confirmed", confirmed_by: params.actor.userId, confirmed_by_name: params.actor.name,
    confirmed_at: new Date().toISOString(), current_pdf_snapshot_id: null,
  }).eq("id", monitoring.id);
  if (confirmError) throw confirmError;
  await recordMonitoringEvent({ monitoringId: monitoring.id, action: "confirm", actor: params.actor, metadata: { bulk_run_id: params.run.id } });
  const confirmedMonitoring = { ...monitoring, ...fields, summary: generated.summary, notable_observations: generated.notable_observations, monitoring_json: { bulk_run_id: params.run.id }, status: "confirmed" as const };
  const pdf = await createPdf({ monitoring: confirmedMonitoring, context, actor: params.actor, runId: params.run.id });
  await sendFax({ monitoring: confirmedMonitoring, context, snapshotId: pdf.snapshotId, filename: pdf.filename, actor: params.actor, runId: params.run.id });
  return { status: "sent", monitoringId: monitoring.id, note: "PDFを作成しFAX送付を受け付けました" };
}
