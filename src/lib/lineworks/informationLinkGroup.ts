import { getAccessToken } from "@/lib/getAccessToken";
import { fetchAllGroups, type LineworksGroup } from "@/lib/lineworks/fetchAllGroups";
import { supabaseAdmin } from "@/lib/supabase/service";

const API_BASE = "https://www.worksapis.com/v1.0";
const EXCLUDED_ORG_UNITS = new Set([
  "fb9bab81-5f4e-4725-2d34-05240f80a71a",
  "5b26013b-a3d4-42ab-266c-05cad5ab1c10",
]);

type EnsureCount = { added: number; already_exists: number; failed: string[] };

export type InformationLinkGroupResult = {
  lineworks_group: {
    status: "success" | "error";
    group_id: string | null;
    group_name: string;
    created: boolean;
    error?: string;
  };
  members: EnsureCount;
  group_masters: EnsureCount;
  service_support: {
    status: "resolved" | "missing";
    lw_userid: string | null;
  };
};

function normalizeClientName(name: string): string {
  return name.replace(/[\s\u3000]+/g, "").trim();
}

function domainId(): number {
  const raw = process.env.LINEWORKS_DOMAIN_ID ?? process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID ?? "";
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error("LINEWORKS_DOMAIN_ID is not configured");
  return value;
}

async function resolveTargetUsers() {
  const { data: exceptions, error: exceptionError } = await supabaseAdmin
    .from("user_org_exception")
    .select("user_id,orgunitid");
  if (exceptionError) throw exceptionError;

  const userIds = Array.from(
    new Set(
      (exceptions ?? [])
        .filter((row) => !EXCLUDED_ORG_UNITS.has(row.orgunitid))
        .map((row) => row.user_id)
        .filter(Boolean),
    ),
  );

  const resolved: Array<{ user_id: string; lw_userid: string }> = [];
  for (let index = 0; index < userIds.length; index += 100) {
    const batch = userIds.slice(index, index + 100);
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("user_id,lw_userid")
      .in("user_id", batch)
      .not("lw_userid", "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const lwUserId = typeof row.lw_userid === "string" ? row.lw_userid.trim() : "";
      if (lwUserId) resolved.push({ user_id: row.user_id, lw_userid: lwUserId });
    }
  }

  const { data: support, error: supportError } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id,lw_userid")
    .eq("user_id", "servicesuport")
    .not("lw_userid", "is", null)
    .maybeSingle();
  if (supportError) throw supportError;

  const supportLwUserId = typeof support?.lw_userid === "string" ? support.lw_userid.trim() : null;
  const memberIds = Array.from(new Set(resolved.map((row) => row.lw_userid)));
  const masterIds = Array.from(new Set([...memberIds, ...(supportLwUserId ? [supportLwUserId] : [])]));

  return { memberIds: masterIds, masterIds, supportLwUserId };
}

function findGroup(groups: LineworksGroup[], kaipokeCsId: string, exactName: string) {
  const suffix = `情報連携@${kaipokeCsId}`;
  return groups.find((group) => group.groupName === exactName)
    ?? groups.find((group) => group.groupName.replace(/[\s\u3000]+/g, "").endsWith(suffix));
}

async function findGroupByExternalKey(
  externalKey: string,
  token: string,
): Promise<LineworksGroup | null> {
  const url = new URL(`${API_BASE}/groups/externalKey:${encodeURIComponent(externalKey)}`);
  url.searchParams.set("domainId", String(domainId()));
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) return null;
  const body = (await response.json()) as { groupId?: unknown; groupName?: unknown };
  return typeof body.groupId === "string" && typeof body.groupName === "string"
    ? { groupId: body.groupId, groupName: body.groupName }
    : null;
}

async function createGroup(params: {
  token: string;
  name: string;
  externalKey: string;
  members: string[];
  masters: string[];
}): Promise<{ groupId: string | null; conflict: boolean }> {
  const response = await fetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      domainId: domainId(),
      groupName: params.name,
      groupExternalKey: params.externalKey,
      visible: true,
      serviceManageable: true,
      useMessage: true,
      useNote: true,
      useCalendar: true,
      useTask: true,
      useFolder: true,
      administrators: params.masters.map((userId) => ({ userId })),
      members: params.members.map((id) => ({ id, type: "USER" })),
    }),
  });

  if (response.status === 409) return { groupId: null, conflict: true };
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    console.error("[information-link-group] create failed", response.status, detail);
    throw new Error(`LINE WORKS group creation failed (${response.status})`);
  }

  const body = (await response.json().catch(() => ({}))) as { groupId?: string };
  return { groupId: body.groupId ?? null, conflict: false };
}

async function readExistingIds(
  groupId: string,
  collection: "members" | "administrators",
  token: string,
): Promise<Set<string> | null> {
  const ids = new Set<string>();
  let cursor = "";

  do {
    const url = new URL(`${API_BASE}/groups/${encodeURIComponent(groupId)}/${collection}`);
    url.searchParams.set("domainId", String(domainId()));
    url.searchParams.set("count", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const body = (await response.json()) as Record<string, unknown>;
    const rows = Array.isArray(body[collection]) ? body[collection] as Array<Record<string, unknown>> : [];
    for (const row of rows) {
      const id = row.userId ?? row.id;
      if (typeof id === "string" && id) ids.add(id);
    }
    const meta = body.responseMetaData as { nextCursor?: unknown } | undefined;
    cursor = typeof meta?.nextCursor === "string" ? meta.nextCursor : "";
  } while (cursor);

  return ids;
}

async function ensureUsers(params: {
  groupId: string;
  collection: "members" | "administrators";
  userIds: string[];
  token: string;
}): Promise<EnsureCount> {
  const result: EnsureCount = { added: 0, already_exists: 0, failed: [] };
  const existing = await readExistingIds(params.groupId, params.collection, params.token);

  for (const userId of params.userIds) {
    if (existing?.has(userId)) {
      result.already_exists += 1;
      continue;
    }

    const response = await fetch(
      `${API_BASE}/groups/${encodeURIComponent(params.groupId)}/${params.collection}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${params.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          params.collection === "members"
            ? { id: userId, type: "USER" }
            : { userId },
        ),
      },
    );

    if (response.ok) result.added += 1;
    else if (response.status === 409) result.already_exists += 1;
    else result.failed.push(userId);
  }

  return result;
}

export async function ensureInformationLinkGroup(
  kaipokeCsId: string,
  clientName: string,
): Promise<InformationLinkGroupResult> {
  const groupName = `${normalizeClientName(clientName)}様 情報連携@${kaipokeCsId}`;
  const externalKey = `kaipoke:${kaipokeCsId}`;
  const empty: EnsureCount = { added: 0, already_exists: 0, failed: [] };

  try {
    const token = await getAccessToken();
    const users = await resolveTargetUsers();
    let group = await findGroupByExternalKey(externalKey, token)
      ?? findGroup(await fetchAllGroups(), kaipokeCsId, groupName);
    let created = false;

    if (!group) {
      const creation = await createGroup({
        token,
        name: groupName,
        externalKey,
        members: users.memberIds,
        masters: users.masterIds,
      });
      created = !creation.conflict;
      if (creation.groupId) group = { groupId: creation.groupId, groupName };
      if (!group) {
        group = await findGroupByExternalKey(externalKey, token)
          ?? findGroup(await fetchAllGroups(), kaipokeCsId, groupName);
      }
    }

    if (!group) throw new Error("Created LINE WORKS group could not be resolved");

    const members = created
      ? { added: users.memberIds.length, already_exists: 0, failed: [] }
      : await ensureUsers({ groupId: group.groupId, collection: "members", userIds: users.memberIds, token });
    const masters = created
      ? { added: users.masterIds.length, already_exists: 0, failed: [] }
      : await ensureUsers({ groupId: group.groupId, collection: "administrators", userIds: users.masterIds, token });

    return {
      lineworks_group: {
        status: "success",
        group_id: group.groupId,
        group_name: group.groupName,
        created,
      },
      members,
      group_masters: masters,
      service_support: {
        status: users.supportLwUserId ? "resolved" : "missing",
        lw_userid: users.supportLwUserId,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "LINE WORKS processing failed";
    console.error("[information-link-group] ensure failed", message);
    return {
      lineworks_group: {
        status: "error",
        group_id: null,
        group_name: groupName,
        created: false,
        error: message,
      },
      members: { ...empty },
      group_masters: { ...empty },
      service_support: { status: "missing", lw_userid: null },
    };
  }
}
