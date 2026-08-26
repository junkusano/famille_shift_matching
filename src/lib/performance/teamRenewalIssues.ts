import { supabaseAdmin } from "@/lib/supabase/service";
import {
  findShogaiJukyushaRenewalTargets,
  isTargetDisabilityServiceCode,
} from "@/lib/disability/shogaiJukyushaRenewalAlert";

export type TeamRenewalIssue = {
  id: string;
  clientId: string;
  kaipokeCsId: string;
  clientName: string | null;
  teamId: string;
  targetDate: string;
  reasons: string[];
};

type ClientRow = {
  id: string;
  kaipoke_cs_id: string;
  name: string | null;
  asigned_org: string | null;
};

type PlanRow = {
  plan_id: string;
  kaipoke_cs_id: string;
  plan_document_kind: string;
  plan_end_date: string | null;
  version_no: number;
  updated_at: string;
};

type ShortGoalRow = {
  plan_short_term_goal_id: string;
  plan_long_term_goal_id: string;
  goal_end_date: string | null;
};

type LongGoalRow = {
  plan_long_term_goal_id: string;
  plan_id: string;
};

function newestPlan(left: PlanRow, right: PlanRow): PlanRow {
  const leftEnd = left.plan_end_date ?? "";
  const rightEnd = right.plan_end_date ?? "";
  if (leftEnd !== rightEnd) return leftEnd > rightEnd ? left : right;
  if (left.version_no !== right.version_no) return left.version_no > right.version_no ? left : right;
  return left.updated_at >= right.updated_at ? left : right;
}

/**
 * チーム成績の「前月受給者証入力・プラン更新」対象を返す。
 * 受給者証はLINE WORKSアラートと同じ対象サービス・除外判定を再利用する。
 * プランはMyFamilleの正本テーブル上で、利用者・書類種別ごとの最新版だけを評価し、
 * activeな短期目標だけを期限判定する。
 */
export async function findTeamRenewalIssues(args: {
  targetMonth: string;
  nextMonthStart: string;
  graceCutoff: string;
}): Promise<TeamRenewalIssue[]> {
  const certificateScan = await findShogaiJukyushaRenewalTargets({
    expiryBefore: args.graceCutoff,
    serviceMonthStart: args.targetMonth,
    serviceMonthEnd: args.nextMonthStart,
  });

  const { data: shiftRows, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("kaipoke_cs_id,service_code")
    .gte("shift_start_date", args.targetMonth)
    .lt("shift_start_date", args.nextMonthStart)
    .not("kaipoke_cs_id", "is", null);
  if (shiftError) throw new Error(`team renewal shift lookup failed: ${shiftError.message}`);

  const disabilityClientIds = Array.from(new Set(
    (shiftRows ?? [])
      .filter((row) => isTargetDisabilityServiceCode(row.service_code))
      .map((row) => String(row.kaipoke_cs_id ?? "").trim())
      .filter(Boolean),
  ));
  if (disabilityClientIds.length === 0 && certificateScan.targets.length === 0) return [];

  const { data: clientRows, error: clientError } = disabilityClientIds.length > 0
    ? await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id,kaipoke_cs_id,name,asigned_org")
      .eq("is_active", true)
      .in("kaipoke_cs_id", disabilityClientIds)
    : { data: [], error: null };
  if (clientError) throw new Error(`team renewal client lookup failed: ${clientError.message}`);

  const clients = (clientRows ?? []) as ClientRow[];
  const clientByKaipokeId = new Map(clients.map((client) => [client.kaipoke_cs_id, client]));
  const issueByClientId = new Map<string, TeamRenewalIssue>();

  const addIssue = (client: ClientRow, date: string, reason: string) => {
    if (!client.asigned_org) return;
    const current = issueByClientId.get(client.id) ?? {
      id: `renewal:${client.id}`,
      clientId: client.id,
      kaipokeCsId: client.kaipoke_cs_id,
      clientName: client.name,
      teamId: client.asigned_org,
      targetDate: date,
      reasons: [],
    };
    if (date && (!current.targetDate || date < current.targetDate)) current.targetDate = date;
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
    issueByClientId.set(client.id, current);
  };

  for (const target of certificateScan.targets) {
    if (!target.asigned_org) continue;
    addIssue(
      {
        id: target.id,
        kaipoke_cs_id: target.kaipoke_cs_id,
        name: target.name,
        asigned_org: target.asigned_org,
      },
      target.shogai_end_at ?? "",
      `障害福祉受給者証の期限切れ（${target.shogai_end_at ?? "期限不明"}）`,
    );
  }

  if (clients.length === 0) return Array.from(issueByClientId.values());

  const { data: planRows, error: planError } = await supabaseAdmin
    .from("plans")
    .select("plan_id,kaipoke_cs_id,plan_document_kind,plan_end_date,version_no,updated_at")
    .in("kaipoke_cs_id", clients.map((client) => client.kaipoke_cs_id))
    .eq("is_deleted", false);
  if (planError) throw new Error(`team renewal plan lookup failed: ${planError.message}`);

  const latestPlanByKind = new Map<string, PlanRow>();
  for (const row of (planRows ?? []) as PlanRow[]) {
    const key = `${row.kaipoke_cs_id}\u0000${row.plan_document_kind}`;
    const current = latestPlanByKind.get(key);
    latestPlanByKind.set(key, current ? newestPlan(current, row) : row);
  }
  const latestPlans = Array.from(latestPlanByKind.values());
  for (const plan of latestPlans) {
    if (!plan.plan_end_date || plan.plan_end_date >= args.graceCutoff) continue;
    const client = clientByKaipokeId.get(plan.kaipoke_cs_id);
    if (client) addIssue(client, plan.plan_end_date, `プラン期限切れ（${plan.plan_end_date}）`);
  }

  if (latestPlans.length > 0) {
    const planIds = latestPlans.map((plan) => plan.plan_id);
    const { data: longGoalRows, error: longGoalError } = await supabaseAdmin
      .from("plan_long_term_goals")
      .select("plan_long_term_goal_id,plan_id")
      .in("plan_id", planIds)
      .eq("active", true);
    if (longGoalError) throw new Error(`team renewal long goal lookup failed: ${longGoalError.message}`);

    const longGoals = (longGoalRows ?? []) as LongGoalRow[];
    const planIdByLongGoalId = new Map(longGoals.map((goal) => [goal.plan_long_term_goal_id, goal.plan_id]));
    if (longGoals.length > 0) {
      const { data: shortGoalRows, error: shortGoalError } = await supabaseAdmin
        .from("plan_short_term_goals")
        .select("plan_short_term_goal_id,plan_long_term_goal_id,goal_end_date")
        .in("plan_long_term_goal_id", longGoals.map((goal) => goal.plan_long_term_goal_id))
        .eq("active", true)
        .lt("goal_end_date", args.graceCutoff);
      if (shortGoalError) throw new Error(`team renewal short goal lookup failed: ${shortGoalError.message}`);

      const planById = new Map(latestPlans.map((plan) => [plan.plan_id, plan]));
      for (const goal of (shortGoalRows ?? []) as ShortGoalRow[]) {
        if (!goal.goal_end_date) continue;
        const planId = planIdByLongGoalId.get(goal.plan_long_term_goal_id);
        const plan = planId ? planById.get(planId) : null;
        const client = plan ? clientByKaipokeId.get(plan.kaipoke_cs_id) : null;
        if (client) addIssue(client, goal.goal_end_date, `短期目標期限切れ（${goal.goal_end_date}）`);
      }
    }
  }

  return Array.from(issueByClientId.values());
}
