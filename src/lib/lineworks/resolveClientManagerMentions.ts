import { supabaseAdmin } from "@/lib/supabase/service";
import type { MentionTarget } from "@/lib/lineworks/sendLWBotMentionMessage";

export type ClientManagerMentionRequest = {
  /** cs_kaipoke_info.kaipoke_cs_id */
  clientId: string;
  clientName?: string | null;
  shiftId?: number | string | null;
  /** 呼び出し元を識別するログ接頭辞。例: "[shift-staff-check]" */
  logPrefix?: string;
};

export type ClientManagerMentionResolution = {
  mentions: MentionTarget[];
  managerIds: string[];
  orgId: string | null;
  userOrgExceptionFound: boolean;
  reason: string | null;
};

type ClientRow = { id: string; kaipoke_cs_id: string; name: string; asigned_org: string | null };
type OrgRow = { orgunitid: string; mgr_user_id: string | null };
type ExceptionRow = { orgunitid: string; user_id: string };
type UserRow = {
  user_id: string;
  org_unit_id: string | null;
  system_role: string | null;
  status: string | null;
  lw_userid: string | null;
};

function logContext(request: ClientManagerMentionRequest, resolution: ClientManagerMentionResolution) {
  return {
    shiftId: request.shiftId ?? null,
    clientId: request.clientId,
    kaipokeCsId: request.clientId,
    clientName: request.clientName ?? null,
    orgId: resolution.orgId,
    userOrgExceptionFound: resolution.userOrgExceptionFound,
    reason: resolution.reason,
  };
}

/**
 * 利用者の担当managerを解決する共通処理。
 *
 * cs_kaipoke_info.asigned_org を担当組織として、orgs.mgr_user_id、
 * user_org_exception（例外所属）、通常所属 users.org_unit_id の順に候補を集める。
 * user_org_exception は複数件を許容し、.single() は使用しない。
 */
export async function resolveClientManagerMentions(
  request: ClientManagerMentionRequest,
): Promise<ClientManagerMentionResolution> {
  const logPrefix = request.logPrefix ?? "[client-manager-resolve]";
  const clientId = request.clientId.trim();
  const empty = (reason: string, orgId: string | null = null, userOrgExceptionFound = false) => ({
    mentions: [],
    managerIds: [],
    orgId,
    userOrgExceptionFound,
    reason,
  });

  if (!clientId) {
    const result = empty("kaipoke-cs-id-empty");
    console.warn(`${logPrefix}[manager-resolve-failed]`, logContext(request, result));
    return result;
  }

  try {
    const { data: clientRows, error: clientError } = await supabaseAdmin
      .from("cs_kaipoke_info")
      .select("id,kaipoke_cs_id,name,asigned_org")
      .eq("kaipoke_cs_id", clientId)
      .order("id")
      .limit(2);
    if (clientError) throw new Error(`cs_kaipoke_info query failed: ${clientError.message}`);

    const clients = (clientRows ?? []) as ClientRow[];
    if (clients.length === 0) {
      const result = empty("cs-kaipoke-info-not-found");
      console.warn(`${logPrefix}[manager-resolve-failed]`, logContext(request, result));
      return result;
    }

    const client = clients[0];
    const orgId = String(client.asigned_org ?? "").trim() || null;
    if (!orgId) {
      const result = empty("assigned-org-empty");
      console.warn(`${logPrefix}[manager-resolve-failed]`, logContext(request, result));
      return result;
    }

    const [{ data: orgRows, error: orgError }, { data: exceptionRows, error: exceptionError }, { data: directManagerRows, error: directManagerError }] = await Promise.all([
      supabaseAdmin.from("orgs").select("orgunitid,mgr_user_id").eq("orgunitid", orgId).limit(2),
      supabaseAdmin.from("user_org_exception").select("orgunitid,user_id").eq("orgunitid", orgId),
      supabaseAdmin.from("users").select("user_id,org_unit_id,system_role,status,lw_userid").eq("org_unit_id", orgId),
    ]);
    if (orgError) throw new Error(`orgs query failed: ${orgError.message}`);
    if (exceptionError) throw new Error(`user_org_exception query failed: ${exceptionError.message}`);
    if (directManagerError) throw new Error(`users direct-members query failed: ${directManagerError.message}`);

    const org = ((orgRows ?? []) as OrgRow[])[0] ?? null;
    const exceptions = (exceptionRows ?? []) as ExceptionRow[];
    const exceptionUserIds = exceptions.map((row) => String(row.user_id ?? "").trim()).filter(Boolean);
    const designatedManagerId = String(org?.mgr_user_id ?? "").trim();
    const candidateIds = Array.from(new Set([designatedManagerId, ...exceptionUserIds].filter(Boolean)));

    const { data: candidateRows, error: candidateError } = candidateIds.length > 0
      ? await supabaseAdmin
        .from("users")
        .select("user_id,org_unit_id,system_role,status,lw_userid")
        .in("user_id", candidateIds)
      : { data: [], error: null };
    if (candidateError) throw new Error(`users candidate query failed: ${candidateError.message}`);

    const allCandidateUsers = [
      ...((candidateRows ?? []) as UserRow[]),
      ...((directManagerRows ?? []) as UserRow[]),
    ];
    const activeManagers = new Map<string, UserRow>();
    for (const user of allCandidateUsers) {
      const userId = String(user.user_id ?? "").trim();
      const role = String(user.system_role ?? "").trim().toLowerCase();
      const status = String(user.status ?? "").trim().toLowerCase();
      if (!userId || role !== "manager" || status === "removed_from_lineworks_kaipoke") continue;
      activeManagers.set(userId, user);
    }

    const managerIds = Array.from(activeManagers.keys()).sort();
    const mentions = managerIds.flatMap((userId) => {
      const lwUserId = String(activeManagers.get(userId)?.lw_userid ?? "").trim();
      return lwUserId ? [{ userId: lwUserId, label: `担当チームmanager（${userId}）` }] : [];
    });
    const result: ClientManagerMentionResolution = {
      mentions,
      managerIds,
      orgId,
      userOrgExceptionFound: exceptions.length > 0,
      reason: mentions.length > 0
        ? null
        : managerIds.length > 0
          ? "manager-lineworks-id-missing"
          : org
            ? "active-manager-not-found"
            : "assigned-org-not-found",
    };

    if (result.reason) {
      console.warn(`${logPrefix}[manager-resolve-failed]`, logContext(request, result));
    } else {
      console.info(`${logPrefix}[manager-resolved]`, {
        ...logContext(request, result),
        managerIds: result.managerIds,
      });
    }
    return result;
  } catch (error) {
    const result = empty(`query-error: ${error instanceof Error ? error.message : String(error)}`);
    console.warn(`${logPrefix}[manager-resolve-failed]`, logContext(request, result));
    return result;
  }
}
