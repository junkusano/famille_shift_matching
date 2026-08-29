import "server-only";

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/service";

export type RecordingTranscriptPortal = "helper" | "caremanager";
export type RecordingTranscriptStatus =
  | "not_requested"
  | "processing"
  | "completed"
  | "failed";

export type RecordingTranscriptParticipant = {
  id?: string;
  kind?: "staff" | "other" | string;
  label?: string;
  staffUserId?: string | null;
  [key: string]: unknown;
};

export type RecordingTranscriptListRow = {
  id: string;
  is_secret: boolean;
  recorder_user_id: string;
  recorder_email: string | null;
  recorder_name: string;
  client_id: string | null;
  client_name: string | null;
  context_id: string | null;
  context_name: string | null;
  recorded_at: string;
  duration_millis: number;
  file_name: string;
  file_size_bytes: number;
  transcript_status: string;
  transcribed_at: string | null;
  created_at: string;
  participants: unknown;
};

export type RecordingTranscriptDetail = RecordingTranscriptListRow & {
  local_recording_id: string;
  transcript_raw: string | null;
  updated_at: string;
};

export type RecordingTranscriptFilters = {
  dateFrom?: string | null;
  dateTo?: string | null;
  recorderUserId?: string | null;
  clientName?: string | null;
  clientId?: string | null;
  contextName?: string | null;
  status?: string | null;
  keyword?: string | null;
};

export type RecordingTranscriptQuery = RecordingTranscriptFilters & {
  page?: number;
  perPage?: number;
};

export type RecordingTranscriptRecorderOption = {
  value: string;
  label: string;
  email: string | null;
};

export type RecordingTranscriptsPageData = {
  rows: RecordingTranscriptListRow[];
  recorderOptions: RecordingTranscriptRecorderOption[];
  totalCount: number;
  page: number;
  perPage: number;
};

type UserDirectoryRow = {
  auth_user_id: string;
  user_id: string;
  service_type: string | null;
};

type FormEntryNameRow = {
  auth_uid: string | null;
  email: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
};

type ViewerProfile = {
  auth_user_id: string | null;
  service_type: string | null;
  system_role: string | null;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set<RecordingTranscriptStatus>([
  "not_requested",
  "processing",
  "completed",
  "failed",
]);

const TARGET_SERVICE_TYPES: Record<RecordingTranscriptPortal, readonly string[]> = {
  helper: ["houmon_kaigo", "both"],
  caremanager: ["kyotaku", "both"],
};

export class RecordingTranscriptAccessError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403) {
    super(message);
    this.name = "RecordingTranscriptAccessError";
    this.status = status;
  }
}

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function toJstDayStart(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00+09:00`).toISOString();
}

function toNextJstDayStart(dateOnly: string): string {
  const start = new Date(`${dateOnly}T00:00:00+09:00`);
  start.setUTCDate(start.getUTCDate() + 1);
  return start.toISOString();
}

function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*");
}

function quotePostgrestValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildKeywordFilter(keyword: string): string {
  const pattern = quotePostgrestValue(`*${escapeLikePattern(keyword)}*`);
  return ["client_name", "context_name", "recorder_email", "transcript_raw"]
    .map((column) => `${column}.ilike.${pattern}`)
    .join(",");
}

function fullName(entry: FormEntryNameRow | undefined, fallback: string): string {
  const name = [entry?.last_name_kanji, entry?.first_name_kanji]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ");
  return name || fallback;
}

export function isRecordingTranscriptPortal(value: string | null): value is RecordingTranscriptPortal {
  return value === "helper" || value === "caremanager";
}

export async function getCurrentAuthUserId(): Promise<string> {
  const auth = createServerComponentClient({ cookies });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) {
    throw new RecordingTranscriptAccessError("ログインしてください", 401);
  }
  return data.user.id;
}

export async function requireRecordingTranscriptPortalAccess(
  authUserId: string,
  portal: RecordingTranscriptPortal,
): Promise<ViewerProfile> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("auth_user_id, service_type, system_role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error || !data) {
    throw new RecordingTranscriptAccessError("ユーザー情報を確認できません", 403);
  }

  const profile = data as ViewerProfile;
  if (!TARGET_SERVICE_TYPES[portal].includes(profile.service_type ?? "")) {
    throw new RecordingTranscriptAccessError("このサービスの閲覧権限がありません", 403);
  }

  // 訪問介護側では、既存 cs_docs と同じ「利用者管理」権限を踏襲する。
  if (
    portal === "helper" &&
    !["admin", "manager"].includes((profile.system_role ?? "").toLowerCase())
  ) {
    throw new RecordingTranscriptAccessError("このページの閲覧権限がありません", 403);
  }

  return profile;
}

async function getRecorderDirectory(portal: RecordingTranscriptPortal): Promise<{
  users: UserDirectoryRow[];
  names: Map<string, FormEntryNameRow>;
}> {
  const { data: users, error: usersError } = await supabaseAdmin
    .from("users")
    .select("auth_user_id, user_id, service_type")
    .in("service_type", [...TARGET_SERVICE_TYPES[portal]])
    .not("auth_user_id", "is", null);

  if (usersError) {
    throw new Error(`録音者の所属情報を取得できません: ${usersError.message}`);
  }

  const directoryUsers = (users ?? []).filter(
    (user): user is UserDirectoryRow => typeof user.auth_user_id === "string",
  );
  const authUserIds = directoryUsers.map((user) => user.auth_user_id);
  const names = new Map<string, FormEntryNameRow>();

  if (authUserIds.length > 0) {
    const { data: entries, error: entriesError } = await supabaseAdmin
      .from("form_entries")
      .select("auth_uid, email, last_name_kanji, first_name_kanji")
      .in("auth_uid", authUserIds);

    if (entriesError) {
      throw new Error(`録音者名を取得できません: ${entriesError.message}`);
    }

    for (const entry of (entries ?? []) as FormEntryNameRow[]) {
      if (entry.auth_uid && !names.has(entry.auth_uid)) names.set(entry.auth_uid, entry);
    }
  }

  return { users: directoryUsers, names };
}

function withRecorderName<T extends { recorder_user_id: string; recorder_email: string | null }>(
  row: T,
  usersByAuthId: Map<string, UserDirectoryRow>,
  names: Map<string, FormEntryNameRow>,
): T & { recorder_name: string } {
  const directoryUser = usersByAuthId.get(row.recorder_user_id);
  const fallback = row.recorder_email || directoryUser?.user_id || "氏名未設定";
  return { ...row, recorder_name: fullName(names.get(row.recorder_user_id), fallback) };
}

export async function getRecordingTranscriptsPageData(
  authUserId: string,
  portal: RecordingTranscriptPortal,
  params: RecordingTranscriptQuery = {},
): Promise<RecordingTranscriptsPageData> {
  await requireRecordingTranscriptPortalAccess(authUserId, portal);
  const { users, names } = await getRecorderDirectory(portal);
  const recorderIds = users.map((user) => user.auth_user_id);
  const usersByAuthId = new Map(users.map((user) => [user.auth_user_id, user]));

  const page = Number.isFinite(params.page) && (params.page ?? 0) > 0 ? Math.floor(params.page!) : 1;
  const requestedPerPage =
    Number.isFinite(params.perPage) && (params.perPage ?? 0) > 0
      ? Math.floor(params.perPage!)
      : 50;
  const perPage = Math.min(requestedPerPage, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const recorderOptions = users
    .map((user) => {
      const entry = names.get(user.auth_user_id);
      const label = fullName(entry, user.user_id);
      return {
        value: user.auth_user_id,
        label,
        email: entry?.email ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  if (recorderIds.length === 0) {
    return { rows: [], recorderOptions, totalCount: 0, page, perPage };
  }

  let query = supabaseAdmin
    .from("recording_transcripts")
    .select(
      "id, is_secret, recorder_user_id, recorder_email, client_id, client_name, context_id, context_name, recorded_at, duration_millis, file_name, file_size_bytes, transcript_status, transcribed_at, created_at, participants",
      { count: "exact" },
    )
    .in("recorder_user_id", recorderIds);

  const dateFrom = clean(params.dateFrom);
  const dateTo = clean(params.dateTo);
  const recorderUserId = clean(params.recorderUserId);
  const clientName = clean(params.clientName);
  const clientId = clean(params.clientId);
  const contextName = clean(params.contextName);
  const status = clean(params.status) as RecordingTranscriptStatus;
  const keyword = clean(params.keyword);

  if (isValidDateOnly(dateFrom)) query = query.gte("recorded_at", toJstDayStart(dateFrom));
  if (isValidDateOnly(dateTo)) query = query.lt("recorded_at", toNextJstDayStart(dateTo));
  if (recorderUserId && recorderIds.includes(recorderUserId)) {
    query = query.eq("recorder_user_id", recorderUserId);
  }
  if (clientName) query = query.ilike("client_name", `%${escapeLikePattern(clientName)}%`);
  if (clientId) query = query.ilike("client_id", `%${escapeLikePattern(clientId)}%`);
  if (contextName) query = query.ilike("context_name", `%${escapeLikePattern(contextName)}%`);
  if (VALID_STATUSES.has(status)) query = query.eq("transcript_status", status);
  if (keyword) {
    // 検索語と公開範囲を一つの論理式にし、シークレット条件が検索時に外れないようにする。
    const search = buildKeywordFilter(keyword);
    query = query.or(
      `and(is_secret.eq.false,or(${search})),and(recorder_user_id.eq.${authUserId},or(${search}))`,
    );
  } else {
    query = query.or(`is_secret.eq.false,recorder_user_id.eq.${authUserId}`);
  }

  const { data, error, count } = await query
    .order("recorded_at", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(`文字起こし一覧を取得できません: ${error.message}`);

  const rows = (data ?? []).map((row) =>
    withRecorderName(row as Omit<RecordingTranscriptListRow, "recorder_name">, usersByAuthId, names),
  );

  return {
    rows,
    recorderOptions,
    totalCount: count ?? 0,
    page,
    perPage,
  };
}

export async function getRecordingTranscriptDetail(
  authUserId: string,
  portal: RecordingTranscriptPortal,
  id: string,
): Promise<RecordingTranscriptDetail | null> {
  await requireRecordingTranscriptPortalAccess(authUserId, portal);
  if (!UUID_RE.test(id)) return null;

  const { users, names } = await getRecorderDirectory(portal);
  const recorderIds = users.map((user) => user.auth_user_id);
  if (recorderIds.length === 0) return null;

  const { data, error } = await supabaseAdmin
    .from("recording_transcripts")
    .select(
      "id, local_recording_id, is_secret, recorder_user_id, recorder_email, client_id, client_name, context_id, context_name, recorded_at, duration_millis, file_name, file_size_bytes, transcript_status, transcript_raw, transcribed_at, created_at, updated_at, participants",
    )
    .eq("id", id)
    .in("recorder_user_id", recorderIds)
    // IDを直接指定しても、他人のシークレット録音は取得させない。
    .or(`is_secret.eq.false,recorder_user_id.eq.${authUserId}`)
    .maybeSingle();

  if (error) throw new Error(`文字起こし詳細を取得できません: ${error.message}`);
  if (!data) return null;

  const usersByAuthId = new Map(users.map((user) => [user.auth_user_id, user]));
  return withRecorderName(
    data as Omit<RecordingTranscriptDetail, "recorder_name">,
    usersByAuthId,
    names,
  );
}
