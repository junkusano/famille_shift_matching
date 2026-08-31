import { getAccessToken } from "@/lib/getAccessToken";
import {
  buildRecoveredMentionText,
  sendLWBotMentionMessage,
  type MentionTarget,
} from "@/lib/lineworks/sendLWBotMentionMessage";
import { supabaseAdmin } from "@/lib/supabase/service";

const LW_BOT_NO =
  process.env.LINEWORKS_BOT_NO || process.env.WORKS_BOT_NO || process.env.LW_BOT_NO || "6807751";

const TARGET_SERVICE_CODES = [
  "居宅家事",
  "居宅身体",
  "重度訪問",
  "通院等介助",
  "同行援護",
  "行動援護",
] as const;

/**
 * シフトの service_code は請求区分ごとに短縮表記されることがある
 * （例: 家事 / 通院(伴う) / 同行(初任者等)）。移動支援は含めない。
 */
export function isTargetDisabilityServiceCode(value: string | null): boolean {
  const serviceCode = String(value ?? "").trim();
  if (!serviceCode || serviceCode.startsWith("移：")) return false;
  if ((TARGET_SERVICE_CODES as readonly string[]).includes(serviceCode)) return true;
  return /家事|居宅.*身体|^身体|重度|重訪|通院|同行|行動援護/.test(serviceCode);
}

export type ShogaiJukyushaRenewalClient = {
  id: string;
  kaipoke_cs_id: string;
  name: string | null;
  shogai_jukyusha_no: string | null;
  shogai_start_at: string | null;
  shogai_end_at: string | null;
  asigned_jisseki_staff: string | null;
  asigned_org: string | null;
};

type ShiftRow = { kaipoke_cs_id: string | null; service_code: string | null };
export type ShogaiJukyushaRenewalTarget = ShogaiJukyushaRenewalClient & {
  certificateIssue: "missing" | "expired";
  serviceCodes: string[];
};

export type FindShogaiJukyushaRenewalTargetsArgs = {
  expiryFrom?: string;
  expiryBefore: string;
  serviceMonthStart: string;
  serviceMonthEnd: string;
  targetKaipokeCsId?: string;
};

/**
 * 受給者証更新アラートとチーム成績で共用する対象判定。
 * 有効な障害福祉利用者のうち、受給者証情報が未登録、または指定期間に
 * 受給者証が切れ、判定月にも対象の障害福祉サービスを利用している人を返す。
 */
export async function findShogaiJukyushaRenewalTargets(
  args: FindShogaiJukyushaRenewalTargetsArgs,
): Promise<{ scannedClients: number; targets: ShogaiJukyushaRenewalTarget[] }> {
  let clientQuery = supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id,kaipoke_cs_id,name,shogai_jukyusha_no,shogai_start_at,shogai_end_at,asigned_jisseki_staff,asigned_org")
    .eq("is_active", true)
    .or(`shogai_end_at.is.null,shogai_end_at.lt.${args.expiryBefore}`)
    .eq("shogai_jukyusha_penalty_exempt", false);
  if (args.targetKaipokeCsId) clientQuery = clientQuery.eq("kaipoke_cs_id", args.targetKaipokeCsId);

  const { data: clientData, error: clientError } = await clientQuery;
  if (clientError) throw new Error(`recipient certificate lookup failed: ${clientError.message}`);
  const certificateIssueByClientId = new Map<string, "missing" | "expired">();
  const certificateIssueClients = ((clientData ?? []) as ShogaiJukyushaRenewalClient[]).filter((client) => {
    if (!client.shogai_end_at) {
      certificateIssueByClientId.set(client.kaipoke_cs_id, "missing");
      return true;
    }
    if (args.expiryFrom && client.shogai_end_at < args.expiryFrom) return false;
    certificateIssueByClientId.set(client.kaipoke_cs_id, "expired");
    return true;
  });
  if (!certificateIssueClients.length) return { scannedClients: 0, targets: [] };

  const { data: shiftData, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("kaipoke_cs_id,service_code")
    .in("kaipoke_cs_id", certificateIssueClients.map((client) => client.kaipoke_cs_id))
    .gte("shift_start_date", args.serviceMonthStart)
    .lt("shift_start_date", args.serviceMonthEnd);
  if (shiftError) throw new Error(`disability service shift lookup failed: ${shiftError.message}`);

  const serviceCodesByClient = new Map<string, Set<string>>();
  for (const shift of (shiftData ?? []) as ShiftRow[]) {
    const clientId = String(shift.kaipoke_cs_id ?? "").trim();
    const serviceCode = String(shift.service_code ?? "").trim();
    if (!clientId || !isTargetDisabilityServiceCode(serviceCode)) continue;
    const services = serviceCodesByClient.get(clientId) ?? new Set<string>();
    services.add(serviceCode);
    serviceCodesByClient.set(clientId, services);
  }

  return {
    scannedClients: certificateIssueClients.length,
    targets: certificateIssueClients.flatMap((client) => {
      const serviceCodes = Array.from(serviceCodesByClient.get(client.kaipoke_cs_id) ?? []);
      const certificateIssue = certificateIssueByClientId.get(client.kaipoke_cs_id);
      return serviceCodes.length > 0 && certificateIssue ? [{ ...client, certificateIssue, serviceCodes }] : [];
    }),
  };
}
type GroupRow = { group_id: string; group_name: string };
type StaffRow = {
  user_id: string | null;
  lw_userid: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
};
type OrgRow = { orgunitid: string; mgr_user_id: string | null };
type OrgExceptionRow = { orgunitid: string; user_id: string };
type ManagerRoleRow = { user_id: string; system_role: string | null; status: string | null };

export type ShogaiJukyushaRenewalAlertArgs = {
  /** YYYY-MM-DD. URLから指定して、特定の利用者だけ過去日付でテストできる。 */
  asOf?: string;
  targetKaipokeCsId?: string;
  forceDay15Rule?: boolean;
  dryRun?: boolean;
};

export type ShogaiJukyushaRenewalAlertResult = {
  asOf: string;
  targetMonth: string;
  skippedBecauseDay: boolean;
  scannedClients: number;
  targetClients: number;
  sentRooms: number;
  sentClients: number;
  clearedExemptions: number;
  errors: number;
  dryRun: boolean;
};

function jstYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

function assertYmd(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("asOf must be YYYY-MM-DD");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("asOf must be a valid date");
  }
  return value;
}

function addMonths(monthStart: string, count: number): string {
  const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return date.toISOString().slice(0, 10);
}

function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function displayDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function findClientGroupId(clientName: string, groups: GroupRow[]): string | null {
  const normalizedClientName = clientName.replace(/[\s　]+/g, "");
  const group = groups.find((item) => {
    const name = item.group_name.replace(/[\s　]+/g, "");
    return !/不使用|使わない|（つかわない）/.test(name) && name.includes("情報連携") && name.includes(normalizedClientName);
  });
  return group?.group_id ?? null;
}

async function loadChannelId(groupId: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(groupId);
  if (cached) return cached;
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("channel_id")
    .eq("group_id", groupId)
    .maybeSingle();
  if (error) throw new Error(`LINEWORKS channel lookup failed: ${error.message}`);
  const channelId = String(data?.channel_id ?? "").trim();
  if (!channelId) throw new Error(`LINEWORKS channel is not configured for group_id=${groupId}`);
  cache.set(groupId, channelId);
  return channelId;
}

export async function runShogaiJukyushaRenewalAlerts(
  args: ShogaiJukyushaRenewalAlertArgs = {},
): Promise<ShogaiJukyushaRenewalAlertResult> {
  const asOf = assertYmd(args.asOf ?? jstYmd());
  const currentMonthStart = monthStart(asOf);
  const previousMonthStart = addMonths(currentMonthStart, -1);
  const nextMonthStart = addMonths(currentMonthStart, 1);
  const day = Number(asOf.slice(8, 10));
  const dryRun = args.dryRun === true;

  // 有効期間が前々月以前の除外は、翌々月になった時点で自動的に外す。
  const { data: cleared, error: clearError } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .update({ shogai_jukyusha_penalty_exempt: false, shogai_jukyusha_penalty_exempt_at: null })
    .eq("shogai_jukyusha_penalty_exempt", true)
    .lt("shogai_end_at", previousMonthStart)
    .select("id");
  if (clearError) throw new Error(`failed to clear expired exemptions: ${clearError.message}`);

  const empty = (skippedBecauseDay: boolean): ShogaiJukyushaRenewalAlertResult => ({
    asOf,
    targetMonth: currentMonthStart.slice(0, 7),
    skippedBecauseDay,
    scannedClients: 0,
    targetClients: 0,
    sentRooms: 0,
    sentClients: 0,
    clearedExemptions: cleared?.length ?? 0,
    errors: 0,
    dryRun,
  });

  if (day < 15 && !args.forceDay15Rule) return empty(true);

  const renewalScan = await findShogaiJukyushaRenewalTargets({
    expiryFrom: previousMonthStart,
    expiryBefore: currentMonthStart,
    serviceMonthStart: currentMonthStart,
    serviceMonthEnd: nextMonthStart,
    targetKaipokeCsId: args.targetKaipokeCsId,
  });
  const targets = renewalScan.targets;
  if (!targets.length) return { ...empty(false), scannedClients: renewalScan.scannedClients };

  const targetOrgIds = Array.from(new Set(targets.map((client) => client.asigned_org).filter((id): id is string => Boolean(id))));
  const [{ data: groups, error: groupsError }, { data: orgRows, error: orgError }, { data: exceptionRows, error: exceptionError }] = await Promise.all([
    supabaseAdmin.from("groups_lw").select("group_id,group_name").eq("is_active", true).ilike("group_name", "%情報連携%").limit(5000),
    targetOrgIds.length > 0
      ? supabaseAdmin.from("orgs").select("orgunitid,mgr_user_id").in("orgunitid", targetOrgIds)
      : Promise.resolve({ data: [], error: null }),
    targetOrgIds.length > 0
      ? supabaseAdmin.from("user_org_exception").select("orgunitid,user_id").in("orgunitid", targetOrgIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (groupsError) throw new Error(`LINEWORKS group lookup failed: ${groupsError.message}`);
  if (orgError) throw new Error(`assigned organization lookup failed: ${orgError.message}`);
  if (exceptionError) throw new Error(`manager organization lookup failed: ${exceptionError.message}`);

  // user_org_exception を優先して担当組織に属するマネジャーを解決する。
  // orgs.mgr_user_id が設定されている場合は、その責任マネジャー1名に絞る。
  const exceptions = (exceptionRows ?? []) as OrgExceptionRow[];
  const exceptionUserIds = Array.from(new Set(exceptions.map((row) => row.user_id).filter(Boolean)));
  const { data: managerRoleRows, error: managerRoleError } = exceptionUserIds.length > 0
    ? await supabaseAdmin.from("users").select("user_id,system_role,status").in("user_id", exceptionUserIds).eq("system_role", "manager")
    : { data: [], error: null };
  if (managerRoleError) throw new Error(`manager role lookup failed: ${managerRoleError.message}`);

  const activeManagerIds = new Set(
    ((managerRoleRows ?? []) as ManagerRoleRow[])
      .filter((manager) => manager.status !== "removed_from_lineworks_kaipoke")
      .map((manager) => manager.user_id),
  );
  const fallbackManagerIdsByOrg = new Map<string, string[]>();
  for (const row of exceptions) {
    if (!activeManagerIds.has(row.user_id)) continue;
    fallbackManagerIdsByOrg.set(row.orgunitid, [...(fallbackManagerIdsByOrg.get(row.orgunitid) ?? []), row.user_id]);
  }
  const managerIdsByOrg = new Map<string, string[]>();
  for (const org of (orgRows ?? []) as OrgRow[]) {
    const designatedManagerId = String(org.mgr_user_id ?? "").trim();
    managerIdsByOrg.set(
      org.orgunitid,
      designatedManagerId && activeManagerIds.has(designatedManagerId)
        ? [designatedManagerId]
        : Array.from(new Set(fallbackManagerIdsByOrg.get(org.orgunitid) ?? [])),
    );
  }

  const staffAndManagerIds = Array.from(new Set([
    ...targets.map((client) => client.asigned_jisseki_staff).filter((id): id is string => Boolean(id)),
    ...Array.from(managerIdsByOrg.values()).flat(),
  ]));
  const { data: staffRows, error: staffError } = staffAndManagerIds.length > 0
    ? await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("user_id,lw_userid,last_name_kanji,first_name_kanji")
      .in("user_id", staffAndManagerIds)
    : { data: [], error: null };
  if (staffError) throw new Error(`staff lookup failed: ${staffError.message}`);

  const staffById = new Map(
    ((staffRows ?? []) as StaffRow[])
      .filter((staff) => staff.user_id)
      .map((staff) => [String(staff.user_id), staff]),
  );
  const channelCache = new Map<string, string>();
  const token = dryRun ? null : await getAccessToken();
  let sentRooms = 0;
  let sentClients = 0;
  let errors = 0;

  for (const client of targets) {
    try {
      const name = client.name?.trim();
      if (!name) throw new Error(`client name is empty: ${client.kaipoke_cs_id}`);
      const groupId = findClientGroupId(name, (groups ?? []) as GroupRow[]);
      if (!groupId) throw new Error(`利用者別「情報連携」グループが見つかりません: ${name}`);
      const channelId = await loadChannelId(groupId, channelCache);
      const mentionUserIds = Array.from(new Set([
        client.asigned_jisseki_staff,
        ...(managerIdsByOrg.get(client.asigned_org ?? "") ?? []),
      ].filter((id): id is string => Boolean(id))));
      const mentions: MentionTarget[] = mentionUserIds
        .map((userId) => {
          const staff = staffById.get(userId);
          const lwUserId = String(staff?.lw_userid ?? "").trim();
          const staffName = `${staff?.last_name_kanji ?? ""}${staff?.first_name_kanji ?? ""}`.trim();
          return lwUserId ? { userId: lwUserId, label: staffName || userId } : null;
        })
        .filter((mention): mention is MentionTarget => mention !== null);
      const mention = mentions.map((item) => `<m userId="${item.userId}">さん`).join("\n");
      const services = client.serviceCodes.join("・");
      const detailUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://myfamille.shi-on.net"}/portal/kaipoke-info-detail/${client.id}`;
      const certificateMessage = client.certificateIssue === "missing"
        ? `${name}様は、障害サービス受給者証の情報がカイポケに登録されていません。\n`
        : `${name}様は、先月（${displayDate(client.shogai_end_at ?? previousMonthStart)}）で障害サービス受給者証の有効期間が切れています。\n`;
      const message =
        `${mention ? `${mention}\n` : ""}【障害サービス受給者証の更新確認】\n` +
        certificateMessage +
        `当月も ${services} を実施しているため、マネジャーと相談のうえ、新しい受給者証の取得を進めてください。\n` +
        `取得後は、マネジャーが速やかにカイポケへ登録してください。カイポケへ登録されると、このアラートは自動で消えます。\n\n` +
        `月を超えても未登録のままの場合は、チーム成績に影響（減点）します。\n` +
        `${detailUrl}`;
      if (!dryRun && token) {
        await sendLWBotMentionMessage({
          botId: LW_BOT_NO,
          channelId,
          accessToken: token,
          mentions,
          buildText: (activeMentions, recoveryNotes) =>
            buildRecoveredMentionText(message, mentions, activeMentions, recoveryNotes),
        });
      }
      sentRooms += 1;
      sentClients += 1;
    } catch (error) {
      errors += 1;
      console.error("[shogai_jukyusha_renewal] LINEWORKS send failed", {
        kaipokeCsId: client.kaipoke_cs_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ...empty(false),
    scannedClients: renewalScan.scannedClients,
    targetClients: targets.length,
    sentRooms,
    sentClients,
    errors,
  };
}
