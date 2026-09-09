import "server-only";

import { supabaseAdmin } from "@/lib/supabase/service";
import { fetchShiftShiftRecords } from "@/lib/shift/shift_shift_records";
import type {
  MonitoringContext,
  MonitoringFaxTarget,
  MonitoringServiceType,
  MonitoringSourceGoal,
  MonitoringTeamContact,
  MonitoringVisitRecord,
} from "@/types/monitoring";
import { detectMonitoringServiceType, monitoringContactWarnings } from "./core";
import { getMonitoringMonthlyNotice } from "./notices";
import { loadMonitoringSignedPlan } from "./signed-plan";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText || null;
}

function compactJson(value: unknown, maxChars = 30_000): unknown {
  if (value === null || value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= maxChars) return value;
    return {
      truncated: true,
      preview: serialized.slice(0, maxChars),
    };
  } catch {
    return String(value).slice(0, maxChars);
  }
}

function overlapsPeriod(plan: UnknownRecord, start: string, end: string): boolean {
  const planStart = nullableText(plan.plan_start_date);
  const planEnd = nullableText(plan.plan_end_date);
  return (!planStart || planStart <= end) && (!planEnd || planEnd >= start);
}

function hasMonitoringPlanContent(plan: UnknownRecord): boolean {
  return Boolean(
    text(plan.person_family_hope) ||
      text(plan.assistance_goal) ||
      text(plan.identified_needs),
  );
}
function planPeriod(plan: UnknownRecord | null): string | null {
  if (!plan) return null;
  const start = nullableText(plan.plan_start_date);
  const end = nullableText(plan.plan_end_date);
  if (!start && !end) return null;
  return `${start ?? "開始日未設定"} ～ ${end ?? "終了日未設定"}`;
}

async function loadGoals(planId: string | null): Promise<MonitoringSourceGoal[]> {
  if (!planId) return [];
  const { data: longRows, error: longError } = await supabaseAdmin
    .from("plan_long_term_goals")
    .select(
      "plan_long_term_goal_id,display_order,goal_start_date,goal_end_date,goal_text,active",
    )
    .eq("plan_id", planId)
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (longError) throw longError;

  const longGoals = (longRows ?? []) as UnknownRecord[];
  const longIds = longGoals.map((row) => text(row.plan_long_term_goal_id)).filter(Boolean);
  let shortGoals: UnknownRecord[] = [];
  if (longIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("plan_short_term_goals")
      .select(
        "plan_short_term_goal_id,plan_long_term_goal_id,display_order,goal_start_date,goal_end_date,goal_text,active",
      )
      .in("plan_long_term_goal_id", longIds)
      .eq("active", true)
      .order("display_order", { ascending: true });
    if (error) throw error;
    shortGoals = (data ?? []) as UnknownRecord[];
  }

  const result: MonitoringSourceGoal[] = [];
  for (const longGoal of longGoals) {
    const longId = text(longGoal.plan_long_term_goal_id);
    result.push({
      goal_id: longId,
      parent_goal_id: null,
      goal_type: "long_term",
      goal_text: text(longGoal.goal_text),
      evaluation_start: nullableText(longGoal.goal_start_date),
      evaluation_end: nullableText(longGoal.goal_end_date),
    });
    for (const shortGoal of shortGoals.filter(
      (goal) => text(goal.plan_long_term_goal_id) === longId,
    )) {
      result.push({
        goal_id: text(shortGoal.plan_short_term_goal_id),
        parent_goal_id: longId,
        goal_type: "short_term",
        goal_text: text(shortGoal.goal_text),
        evaluation_start: nullableText(shortGoal.goal_start_date),
        evaluation_end: nullableText(shortGoal.goal_end_date),
      });
    }
  }
  return result.filter((goal) => goal.goal_id && goal.goal_text);
}

async function loadPreviousMonitorings(
  kaipokeCsId: string,
  periodStart: string,
): Promise<UnknownRecord[]> {
  const { data, error } = await supabaseAdmin
    .from("client_monitorings")
    .select(
      "id,period_start,period_end,evaluation_date,status,summary,notable_observations,client_request,family_request,issues,office_notice",
    )
    .eq("kaipoke_cs_id", kaipokeCsId)
    .eq("is_deleted", false)
    .in("status", ["confirmed", "pdf_final", "fax_sent"])
    .lt("period_end", periodStart)
    .order("period_end", { ascending: false })
    .limit(3);
  if (error) throw error;

  const rows = (data ?? []) as UnknownRecord[];
  if (rows.length === 0) return [];
  const ids = rows.map((row) => text(row.id));
  const { data: goalRows, error: goalError } = await supabaseAdmin
    .from("client_monitoring_goals")
    .select(
      "monitoring_id,goal_type,goal_text,achievement_status,evaluation_text,review_required,review_content,sort_order",
    )
    .in("monitoring_id", ids)
    .order("sort_order", { ascending: true });
  if (goalError) throw goalError;
  const goals = (goalRows ?? []) as UnknownRecord[];

  return rows.map(
    (row): UnknownRecord => ({
      ...row,
      goals: goals.filter((goal) => text(goal.monitoring_id) === text(row.id)),
    }),
  );
}

async function loadMonitoringTeamContacts(orgId: string): Promise<MonitoringTeamContact[]> {
  if (!orgId) return [];

  const { data: directMemberRows, error: directMemberError } = await supabaseAdmin
    .from("users")
    .select("user_id")
    .eq("org_unit_id", orgId);
  if (directMemberError) throw directMemberError;

  const directMemberIds = (directMemberRows ?? [])
    .map((row) => text(row.user_id))
    .filter(Boolean);
  const [teamExceptionResult, directExceptionResult] = await Promise.all([
    supabaseAdmin
      .from("user_org_exception")
      .select("user_id,org_mgr_phone")
      .eq("orgunitid", orgId),
    directMemberIds.length > 0
      ? supabaseAdmin
          .from("user_org_exception")
          .select("user_id,orgunitid")
          .in("user_id", directMemberIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamExceptionResult.error) throw teamExceptionResult.error;
  if (directExceptionResult.error) throw directExceptionResult.error;

  const teamExceptionRows = (teamExceptionResult.data ?? []) as UnknownRecord[];
  const directExceptionRows = (directExceptionResult.data ?? []) as UnknownRecord[];
  const directMembersWithoutOtherTeamException = directMemberIds.filter((userId) =>
    !directExceptionRows.some((row) => text(row.user_id) === userId && text(row.orgunitid) !== orgId),
  );
  const memberIds = Array.from(
    new Set([
      ...directMembersWithoutOtherTeamException,
      ...teamExceptionRows.map((row) => text(row.user_id)).filter(Boolean),
    ]),
  );
  if (memberIds.length === 0) return [];

  const { data: memberRows, error: memberError } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id,last_name_kanji,first_name_kanji,system_role,position_id,status")
    .in("user_id", memberIds);
  if (memberError) throw memberError;

  const phoneByUserId = new Map(
    teamExceptionRows.map((row) => [text(row.user_id), nullableText(row.org_mgr_phone)]),
  );
  const serviceManagerPositionId = "39d94ef1-dff3-4cb0-8add-05e3e24812dd";
  return ((memberRows ?? []) as UnknownRecord[])
    .filter((row) => {
      const role = text(row.system_role).toLowerCase();
      const positionId = text(row.position_id);
      return text(row.status) !== "removed_from_lineworks_kaipoke" &&
        (role === "manager" || positionId === serviceManagerPositionId);
    })
    .map((row) => {
      const name = `${text(row.last_name_kanji)}${text(row.first_name_kanji)}`;
      return { name, phone: phoneByUserId.get(text(row.user_id)) ?? null };
    })
    .filter((contact) => contact.name && contact.name !== "草野淳")
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}
export async function loadMonitoringContext(params: {
  clientInfoId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<MonitoringContext> {
  const { clientInfoId, periodStart, periodEnd } = params;
  const { data: clientRow, error: clientError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select(
      "id,kaipoke_cs_id,name,kana,birth_yyyy_mm_dd,address,gender,phone_01,phone_02,service_kind,care_consultant,asigned_org,biko,shogai_start_at,shogai_end_at",
    )
    .eq("id", clientInfoId)
    .maybeSingle();
  if (clientError) throw clientError;
  if (!clientRow) throw new Error("利用者が見つかりません");

  const client = clientRow as UnknownRecord;
  const kaipokeCsId = text(client.kaipoke_cs_id);
  if (!kaipokeCsId) throw new Error("利用者のカイポケIDが登録されていません");

  const [assessmentResult, planResult, insuranceResult, supportResult, visits] =
    await Promise.all([
      supabaseAdmin
        .from("assessments_records")
        .select(
          "assessment_id,service_kind,assessed_on,author_name,content,meeting_minutes,created_at,updated_at",
        )
        .eq("kaipoke_cs_id", kaipokeCsId)
        .eq("is_deleted", false)
        .lte("assessed_on", periodEnd)
        .order("assessed_on", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("plans")
        .select(
          "plan_id,assessment_id,plan_document_kind,title,status,issued_on,plan_start_date,plan_end_date,person_family_hope,assistance_goal,identified_needs,health_status,medical_care_risks,home_activity_participation,remarks,weekly_plan_comment,content,updated_at",
        )
        .eq("kaipoke_cs_id", kaipokeCsId)
        .eq("is_deleted", false)
        .order("plan_start_date", { ascending: false, nullsFirst: false })
        .limit(20),
      supabaseAdmin
        .from("cm_kaipoke_insurance")
        .select(
          "kaipoke_insurance_id,apply_start,cert_status,care_level,cert_valid_start,cert_valid_end",
        )
        .eq("kaipoke_cs_id", kaipokeCsId)
        .order("apply_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("cm_kaipoke_support_office")
        .select(
          "apply_start,office_name,care_manager_name,support_center_name,contract_type",
        )
        .eq("kaipoke_cs_id", kaipokeCsId)
        .order("apply_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      fetchShiftShiftRecords(supabaseAdmin, {
        kaipokeCsId,
        fromDate: periodStart,
        toDate: periodEnd,
      }),
    ]);

  if (assessmentResult.error) throw assessmentResult.error;
  if (planResult.error) throw planResult.error;

  const plans = ((planResult.data ?? []) as UnknownRecord[]).filter((plan) =>
    overlapsPeriod(plan, periodStart, periodEnd),
  );
  const plan =
    plans.find(
      (candidate) =>
        text(candidate.status) === "active" && hasMonitoringPlanContent(candidate),
    ) ??
    plans.find(hasMonitoringPlanContent) ??
    plans.find((candidate) => text(candidate.status) === "active") ??
    plans[0] ??
    null;
  const planId = plan ? text(plan.plan_id) : null;
  const signedPlan = await loadMonitoringSignedPlan({ kaipokeCsId, periodEnd });
  const planGoals = await loadGoals(planId);
  const goals = planGoals.length > 0
    ? planGoals
    : signedPlan?.assistance_goal
      ? [{
          goal_id: `cs_doc:${signedPlan.cs_doc_id}:assistance`,
          parent_goal_id: null,
          goal_type: "assistance" as const,
          goal_text: signedPlan.assistance_goal,
          evaluation_start: signedPlan.document_date || null,
          evaluation_end: null,
        }]
      : [];

  const serviceTypeDetected = detectMonitoringServiceType(
    client.service_kind,
    plan?.plan_document_kind,
  );

  const evidenceRecords: MonitoringVisitRecord[] = visits
    .filter((row) => text(row.tokutei_comment))
    .slice(0, 500)
    .map((row) => ({
      evidence_id: String(row.record_id || row.shift_id),
      shift_id: row.shift_id,
      record_id: row.record_id,
      date: row.shift_start_date,
      start_time: row.shift_start_time,
      service_code: row.service_code,
      status: row.record_status,
      note: text(row.tokutei_comment).slice(0, 3_000),
    }));

  const previousMonitorings = await loadPreviousMonitorings(kaipokeCsId, periodStart);
  const careConsultantId = text(client.care_consultant);
  let faxTarget: MonitoringFaxTarget = {
    fax_id: careConsultantId || null,
    office_name: nullableText(asRecord(supportResult.data)?.office_name),
    contact_name: nullableText(asRecord(supportResult.data)?.care_manager_name),
    fax_number: null,
  };
  if (careConsultantId) {
    const { data: faxRow, error } = await supabaseAdmin
      .from("fax")
      .select("id,office_name,fax")
      .eq("id", careConsultantId)
      .maybeSingle();
    if (error) throw error;
    const faxRecord = asRecord(faxRow);
    faxTarget = {
      ...faxTarget,
      office_name: nullableText(faxRecord?.office_name) ?? faxTarget.office_name,
      fax_number: nullableText(faxRecord?.fax),
    };
  }

  const teamContacts = await loadMonitoringTeamContacts(text(client.asigned_org));
  const officeName = "ファミーユヘルパーサービス愛知";

  const monthlyNotice = serviceTypeDetected
    ? await getMonitoringMonthlyNotice({ serviceType: serviceTypeDetected, periodEnd })
    : null;
  const officeNotice = text(monthlyNotice?.body);

  const warnings: string[] = [];
  if (!assessmentResult.data) warnings.push("対象期間以前のアセスメントがありません");
  if (!plan) warnings.push("対象期間に有効なプランがありません");
  if (goals.length === 0) warnings.push("長期／短期目標がありません");
  if (evidenceRecords.length === 0) warnings.push("対象期間の訪問記録がありません");
  const hasRegisteredContact = Boolean(
    faxTarget.fax_id || faxTarget.contact_name || faxTarget.office_name,
  );
  warnings.push(
    ...monitoringContactWarnings({
      serviceType: serviceTypeDetected,
      hasContact: hasRegisteredContact,
      hasFax: Boolean(faxTarget.fax_number),
    }),
  );
  if (!serviceTypeDetected) warnings.push("サービス種別を自動判定できません");

  const insurance = asRecord(insuranceResult.data);
  const supportOffice = asRecord(supportResult.data);
  const safeClient: UnknownRecord = {
    id: client.id,
    kaipoke_cs_id: client.kaipoke_cs_id,
    name: client.name,
    kana: client.kana,
    birth_date: client.birth_yyyy_mm_dd,
    address: client.address,
    gender: client.gender,
    phone_01: client.phone_01,
    phone_02: client.phone_02,
    service_kind: client.service_kind,
    notes: client.biko,
    disability_service_start: client.shogai_start_at,
    disability_service_end: client.shogai_end_at,
    insurance: insurance
      ? {
          care_level: insurance.care_level,
          cert_status: insurance.cert_status,
          valid_start: insurance.cert_valid_start,
          valid_end: insurance.cert_valid_end,
        }
      : null,
    support_office: supportOffice,
  };

  const assessment = asRecord(assessmentResult.data);
  const safeAssessment = assessment
    ? {
        assessment_id: assessment.assessment_id,
        service_kind: assessment.service_kind,
        assessed_on: assessment.assessed_on,
        author_name: assessment.author_name,
        content: compactJson(assessment.content),
        meeting_minutes: text(assessment.meeting_minutes).slice(0, 12_000),
      }
    : null;
  const safePlan = plan
    ? {
        plan_id: plan.plan_id,
        assessment_id: plan.assessment_id,
        plan_document_kind: plan.plan_document_kind,
        title: plan.title,
        status: plan.status,
        issued_on: plan.issued_on,
        plan_start_date: plan.plan_start_date,
        plan_end_date: plan.plan_end_date,
        person_family_hope: signedPlan ? signedPlan.client_request : plan.person_family_hope,
        family_request: signedPlan ? signedPlan.family_request : "",
        assistance_goal: signedPlan ? signedPlan.assistance_goal : plan.assistance_goal,
        identified_needs: signedPlan ? signedPlan.issues : plan.identified_needs,
        signed_plan_cs_doc_id: signedPlan?.cs_doc_id ?? null,
        signed_plan_document_date: signedPlan?.document_date ?? null,
        health_status: plan.health_status,
        medical_care_risks: plan.medical_care_risks,
        home_activity_participation: plan.home_activity_participation,
        remarks: plan.remarks,
        weekly_plan_comment: plan.weekly_plan_comment,
        content: compactJson(plan.content, 20_000),
      }
    : null;

  return {
    client: safeClient,
    service_type_detected: serviceTypeDetected,
    assessment: safeAssessment,
    plan: safePlan,
    signed_plan: signedPlan,
    goals,
    visit_records: evidenceRecords,
    previous_monitorings: previousMonitorings,
    fax_target: faxTarget,
    team_contacts: teamContacts,
    office_name: officeName,
    office_notice: officeNotice,
    warnings,
    summary: {
      period_start: periodStart,
      period_end: periodEnd,
      plan_period: planPeriod(plan),
      visit_count: evidenceRecords.length,
      previous_monitoring_date: nullableText(previousMonitorings[0]?.evaluation_date),
      care_manager_name: faxTarget.contact_name ?? faxTarget.office_name,
      fax_number: faxTarget.fax_number,
    },
  };
}

export function buildStructuredAiInput(
  context: MonitoringContext,
  serviceType: MonitoringServiceType,
): Record<string, unknown> {
  return {
    client: context.client,
    assessment: context.assessment,
    plan: {
      ...(context.plan ?? {}),
      goals: context.goals,
    },
    monitoring_period: {
      start: context.summary.period_start,
      end: context.summary.period_end,
      service_type: serviceType,
    },
    visit_records: context.visit_records,
    previous_monitorings: context.previous_monitorings,
  };
}
