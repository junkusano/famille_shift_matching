import { notifyShiftChange } from "@/lib/lineworks/shiftChangeNotify";
import { supabaseAdmin } from "@/lib/supabase/service";
import { containsShiftCancellationIntent, parseShiftDateTimeRequests, parseShiftTimeRange } from "@/lib/agent-playbooks/shiftCancellationParser";

type Playbook = {
  id: string;
  allowed_actions: unknown;
  context_message_limit: number;
  context_minutes: number;
  session_ttl_minutes: number;
};

type AgentSession = {
  id: string;
  playbook_id: string | null;
  status: string;
  pending_action: Record<string, unknown> | null;
  expires_at: string;
};

type Staff = {
  user_id: string;
  lw_userid: string | null;
  last_name_kanji: string | null;
  first_name_kanji: string | null;
};

type PreviousShift = {
  shift_id: number;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  required_staff_count: number;
  two_person_work_flg: boolean;
  staff_01_role_code: string | null;
  staff_02_role_code: string | null;
  staff_03_role_code: string | null;
};

type ShiftDraft = {
  kaipokeCsId: string | null;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceCode: string | null;
  staffUserIds: string[];
  staff02Attend: boolean;
  staff03Attend: boolean;
  requiredStaffCount: number;
  twoPersonWork: boolean;
  staff01RoleCode: string | null;
  staff02RoleCode: string | null;
  staff03RoleCode: string | null;
  referenceShiftId: number | null;
  referenceShiftDate: string | null;
  inferredFields: string[];
};

export type ShiftCreationAgentResult = { handled: boolean; replyText?: string };

const SHIFT_SELECT = "shift_id,shift_start_date,shift_start_time,shift_end_time,service_code,staff_01_user_id,staff_02_user_id,staff_03_user_id,staff_02_attend_flg,staff_03_attend_flg,required_staff_count,two_person_work_flg,staff_01_role_code,staff_02_role_code,staff_03_role_code";

export function containsShiftCreationIntent(text: string) {
  const normalized = text.replace(/[\s　]/g, "");
  if (/(キャンセル|中止|取消|取り消|削除)/.test(normalized)) return false;
  return /(シフト|支援|サービス|訪問)/.test(normalized)
    && /(追加|登録|作成|入れて|入れたい|組んで|お願いします|お願い)/.test(normalized);
}

function normalizeTime(value: string | null) {
  return value?.slice(0, 5) ?? null;
}

function toHms(value: string) {
  return `${value}:00`;
}

function normalizeAnswer(text: string) {
  return text
    .replace(/^\s*@すまーとアイさん(?:\s|　|さん)*/i, "")
    .replace(/[\s　、。！？!?,.]/g, "")
    .toLowerCase();
}

function isYes(text: string) {
  return /^(ok|ｏｋ|はい|了解|承認|実行|追加して|追加してください|お願いします)$/.test(normalizeAnswer(text));
}

function isNo(text: string) {
  return /^(no|キャンセル|中止|やめて|やめます|取り消し|取消)$/.test(normalizeAnswer(text));
}

function emptyDraft(): ShiftDraft {
  return {
    kaipokeCsId: null,
    date: null,
    startTime: null,
    endTime: null,
    serviceCode: null,
    staffUserIds: [],
    staff02Attend: false,
    staff03Attend: false,
    requiredStaffCount: 1,
    twoPersonWork: false,
    staff01RoleCode: null,
    staff02RoleCode: null,
    staff03RoleCode: null,
    referenceShiftId: null,
    referenceShiftDate: null,
    inferredFields: [],
  };
}

function storedDraft(session: AgentSession | null): ShiftDraft {
  const value = session?.pending_action?.shift;
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyDraft();
  return { ...emptyDraft(), ...(value as Partial<ShiftDraft>) };
}

async function getActiveSession(channelId: string, requesterLwUserid: string) {
  const { data, error } = await supabaseAdmin
    .from("agent_sessions")
    .select("id,playbook_id,status,pending_action,expires_at")
    .eq("channel_id", channelId)
    .eq("requester_lw_userid", requesterLwUserid)
    .in("status", ["active", "awaiting_input", "awaiting_confirmation"])
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const session = data as AgentSession;
  if (new Date(session.expires_at).getTime() > Date.now()) return session;
  const { error: expireError } = await supabaseAdmin.from("agent_sessions").update({ status: "expired" }).eq("id", session.id);
  if (expireError) throw expireError;
  return null;
}

async function getEnabledPlaybook(id?: string | null): Promise<Playbook | null> {
  let query = supabaseAdmin
    .from("agent_playbooks")
    .select("id,allowed_actions,context_message_limit,context_minutes,session_ttl_minutes")
    .eq("category", "shift")
    .eq("room_scope", "client_room")
    .eq("trigger_mode", "lineworks_mention")
    .eq("execution_mode", "native_agent")
    .eq("is_enabled", true);
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("sort_order", { ascending: true }).limit(20);
  if (error) throw error;
  return (data as Playbook[] | null)?.find((item) =>
    Array.isArray(item.allowed_actions)
    && item.allowed_actions.includes("shift.list")
    && item.allowed_actions.includes("shift.create")
  ) ?? null;
}

async function getInitialMessages(params: {
  channelId: string;
  message: string;
  issuedAt: string;
  playbook: Playbook;
}) {
  const referenceDate = new Date(params.issuedAt);
  const safeReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;
  const threshold = new Date(safeReferenceDate.getTime() - params.playbook.context_minutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("msg_lw_log")
    .select("message")
    .eq("channel_id", params.channelId)
    .eq("event_type", "message")
    .gte("timestamp", threshold)
    .order("timestamp", { ascending: false })
    .limit(params.playbook.context_message_limit);
  if (error) throw error;

  const messages = (data ?? [])
    .map((row) => String(row.message ?? "").trim())
    .filter(Boolean)
    .reverse();
  if (messages.at(-1) !== params.message.trim()) messages.push(params.message.trim());

  let creationIntentIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (containsShiftCancellationIntent(messages[index])) return null;
    if (containsShiftCreationIntent(messages[index])) {
      creationIntentIndex = index;
      break;
    }
  }
  return creationIntentIndex >= 0 ? messages.slice(creationIntentIndex) : null;
}

async function createRun(params: {
  playbookId: string;
  sessionId?: string | null;
  status?: string;
  actionName?: string | null;
  inputSummary?: Record<string, unknown>;
}) {
  const { data, error } = await supabaseAdmin.from("agent_runs").insert({
    playbook_id: params.playbookId,
    session_id: params.sessionId ?? null,
    trigger_source: "lineworks_mention",
    status: params.status ?? "received",
    action_name: params.actionName ?? null,
    input_summary: params.inputSummary ?? {},
  }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function updateRun(runId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("agent_runs").update(values).eq("id", runId);
  if (error) throw error;
}

async function finishSession(sessionId: string, status: "completed" | "cancelled" | "failed") {
  const { error } = await supabaseAdmin.from("agent_sessions").update({
    status,
    completed_at: new Date().toISOString(),
    expires_at: new Date().toISOString(),
  }).eq("id", sessionId);
  if (error) throw error;
}

async function saveSession(params: {
  session: AgentSession | null;
  playbook: Playbook;
  channelId: string;
  requesterLwUserid: string;
  status: "awaiting_input" | "awaiting_confirmation";
  draft: ShiftDraft;
}) {
  const values = {
    playbook_id: params.playbook.id,
    channel_id: params.channelId,
    requester_lw_userid: params.requesterLwUserid,
    status: params.status,
    state: { reference_shift_id: params.draft.referenceShiftId, inferred_fields: params.draft.inferredFields },
    source_message_ids: [],
    pending_action: { action: "shift.create", shift: params.draft },
    expires_at: new Date(Date.now() + params.playbook.session_ttl_minutes * 60 * 1000).toISOString(),
  };
  if (params.session) {
    const { error } = await supabaseAdmin.from("agent_sessions").update(values).eq("id", params.session.id);
    if (error) throw error;
    return params.session.id;
  }
  const { data, error } = await supabaseAdmin.from("agent_sessions").insert(values).select("id").single();
  if (error) throw error;
  return String(data.id);
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function minutes(value: string | null) {
  const normalized = normalizeTime(value);
  if (!normalized) return null;
  const [hour, minute] = normalized.split(":").map(Number);
  return hour * 60 + minute;
}

function endTimeUsingPreviousDuration(startTime: string, previous: PreviousShift) {
  const previousStart = minutes(previous.shift_start_time);
  const previousEnd = minutes(previous.shift_end_time);
  const currentStart = minutes(startTime);
  if (previousStart === null || previousEnd === null || currentStart === null || previousEnd <= previousStart) return null;
  const end = currentStart + previousEnd - previousStart;
  if (end >= 24 * 60) return null;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

async function getPreviousShift(clientId: string, targetDate: string): Promise<PreviousShift | null> {
  const { data, error } = await supabaseAdmin
    .from("shift")
    .select(SHIFT_SELECT)
    .eq("kaipoke_cs_id", clientId)
    .lt("shift_start_date", targetDate)
    .order("shift_start_date", { ascending: false })
    .order("shift_start_time", { ascending: false })
    .limit(60);
  if (error) throw error;
  const shifts = (data ?? []) as PreviousShift[];
  return shifts.find((shift) => shift.shift_start_date && weekday(shift.shift_start_date) === weekday(targetDate))
    ?? shifts[0]
    ?? null;
}

async function getActiveStaff(): Promise<Staff[]> {
  const { data, error } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id,lw_userid,last_name_kanji,first_name_kanji")
    .eq("status", "lineworks_kaipoke_joined")
    .not("user_id", "is", null)
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    user_id: String(row.user_id),
    lw_userid: row.lw_userid ? String(row.lw_userid) : null,
    last_name_kanji: row.last_name_kanji ? String(row.last_name_kanji) : null,
    first_name_kanji: row.first_name_kanji ? String(row.first_name_kanji) : null,
  }));
}

function resolveStaff(text: string, mentionedLwUserids: string[], staff: Staff[]) {
  const mentioned = staff.filter((item) => item.lw_userid && mentionedLwUserids.includes(item.lw_userid));
  if (mentioned.length > 0) return { userIds: Array.from(new Set(mentioned.map((item) => item.user_id))).slice(0, 3), ambiguous: false };

  const compact = text.replace(/[\s　]/g, "");
  const fullNameMatches = staff.filter((item) => {
    const fullName = `${item.last_name_kanji ?? ""}${item.first_name_kanji ?? ""}`;
    return fullName.length >= 2 && compact.includes(fullName);
  });
  if (fullNameMatches.length > 0) {
    return { userIds: Array.from(new Set(fullNameMatches.map((item) => item.user_id))).slice(0, 3), ambiguous: false };
  }

  const matchingSurnames = Array.from(new Set(staff
    .map((item) => item.last_name_kanji)
    .filter((name): name is string => !!name && compact.includes(name))));
  if (matchingSurnames.length !== 1) return { userIds: [], ambiguous: matchingSurnames.length > 1 };
  const surnameStaff = staff.filter((item) => item.last_name_kanji === matchingSurnames[0]);
  return surnameStaff.length === 1
    ? { userIds: [surnameStaff[0].user_id], ambiguous: false }
    : { userIds: [], ambiguous: true };
}

async function resolveServiceCode(text: string) {
  const { data, error } = await supabaseAdmin
    .from("shift_service_code")
    .select("service_code")
    .not("service_code", "is", null)
    .limit(1000);
  if (error) throw error;
  const compact = text.replace(/[\s　]/g, "");
  return (data ?? [])
    .map((row) => String(row.service_code ?? ""))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((code) => compact.includes(code.replace(/[\s　]/g, ""))) ?? null;
}

async function staffNames(userIds: string[]) {
  if (userIds.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id,last_name_kanji,first_name_kanji")
    .in("user_id", userIds);
  if (error) throw error;
  const names = new Map((data ?? []).map((row) => [
    String(row.user_id),
    `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}` || String(row.user_id),
  ]));
  return userIds.map((id) => names.get(id) ?? id);
}

async function buildReply(draft: ShiftDraft, intro = "次の内容でシフトを追加します。") {
  const names = await staffNames(draft.staffUserIds);
  const inferred = draft.inferredFields.length > 0
    ? `\n前回のシフトを参考に提案した項目：${draft.inferredFields.join("・")}（参照：${draft.referenceShiftDate ?? "日付不明"}）`
    : "";
  return `${intro}\n・日付：${draft.date}\n・時間：${draft.startTime}～${draft.endTime}\n・担当者：${names.join("、")}\n・サービスコード：${draft.serviceCode}${inferred}`;
}

async function resolveDraft(params: {
  messages: string[];
  issuedAt: string;
  mentionedLwUserids: string[];
  base: ShiftDraft;
  clientId: string;
}) {
  const referenceDate = new Date(params.issuedAt);
  const parsedDates = parseShiftDateTimeRequests(params.messages, Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate);
  const parsedTime = [...params.messages]
    .reverse()
    .map((message) => parseShiftTimeRange(message))
    .find((time) => time.startTime) ?? { startTime: null, endTime: null };
  const combinedText = params.messages.join("\n");
  const staff = await getActiveStaff();
  const explicitStaff = resolveStaff(combinedText, params.mentionedLwUserids, staff);
  const explicitService = await resolveServiceCode(combinedText);
  const draft: ShiftDraft = {
    ...params.base,
    kaipokeCsId: params.clientId,
    inferredFields: [...params.base.inferredFields],
  };

  if (parsedDates.length === 1) draft.date = parsedDates[0].date;
  if (parsedTime.startTime) {
    draft.startTime = parsedTime.startTime;
    if (!parsedTime.endTime && params.base.inferredFields.includes("時間")) {
      draft.endTime = null;
    }
  }
  if (parsedTime.endTime) draft.endTime = parsedTime.endTime;
  if (explicitService) draft.serviceCode = explicitService;
  if (explicitStaff.userIds.length > 0) {
    draft.staffUserIds = explicitStaff.userIds;
    draft.requiredStaffCount = explicitStaff.userIds.length;
    draft.twoPersonWork = explicitStaff.userIds.length >= 2;
    draft.staff02Attend = explicitStaff.userIds.length >= 2;
    draft.staff03Attend = explicitStaff.userIds.length >= 3;
    draft.staff01RoleCode = null;
    draft.staff02RoleCode = null;
    draft.staff03RoleCode = null;
  }

  const explicitlyProvided = new Set<string>();
  if (parsedTime.startTime) explicitlyProvided.add("時間");
  if (explicitService) explicitlyProvided.add("サービスコード");
  if (explicitStaff.userIds.length > 0) explicitlyProvided.add("担当者");
  draft.inferredFields = draft.inferredFields.filter((field) => !explicitlyProvided.has(field));

  let previous: PreviousShift | null = null;
  if (draft.date) previous = await getPreviousShift(params.clientId, draft.date);
  if (previous) {
    if (!draft.startTime) {
      draft.startTime = normalizeTime(previous.shift_start_time);
      draft.inferredFields.push("時間");
    }
    if (!draft.endTime) {
      draft.endTime = draft.startTime && parsedTime.startTime
        ? endTimeUsingPreviousDuration(draft.startTime, previous)
        : normalizeTime(previous.shift_end_time);
      draft.inferredFields.push("時間");
    }
    if (!draft.serviceCode && previous.service_code) {
      draft.serviceCode = previous.service_code;
      draft.inferredFields.push("サービスコード");
    }
    if (draft.staffUserIds.length === 0 && previous.staff_01_user_id) {
      draft.staffUserIds = [previous.staff_01_user_id, previous.staff_02_user_id, previous.staff_03_user_id]
        .filter((id): id is string => !!id);
      draft.staff02Attend = !!previous.staff_02_attend_flg;
      draft.staff03Attend = !!previous.staff_03_attend_flg;
      draft.requiredStaffCount = previous.required_staff_count;
      draft.twoPersonWork = previous.two_person_work_flg;
      draft.staff01RoleCode = previous.staff_01_role_code;
      draft.staff02RoleCode = previous.staff_02_role_code;
      draft.staff03RoleCode = previous.staff_03_role_code;
      draft.inferredFields.push("担当者");
    }
    draft.referenceShiftId = previous.shift_id;
    draft.referenceShiftDate = previous.shift_start_date;
  }
  draft.inferredFields = Array.from(new Set(draft.inferredFields));

  const missing: string[] = [];
  if (!draft.date) missing.push("日付");
  if (!draft.startTime || !draft.endTime) missing.push("開始・終了時刻");
  if (draft.startTime && draft.endTime && (minutes(draft.endTime) ?? 0) <= (minutes(draft.startTime) ?? 0)) {
    missing.push("終了時刻（開始時刻より後）");
  }
  if (draft.staffUserIds.length === 0 || draft.requiredStaffCount > draft.staffUserIds.length) missing.push("担当者");
  if (!draft.serviceCode) missing.push("サービスコード");
  return { draft, missing, multipleDates: parsedDates.length > 1, ambiguousStaff: explicitStaff.ambiguous };
}

async function confirmCreate(params: {
  session: AgentSession;
  playbook: Playbook;
  requesterLwUserid: string;
}) : Promise<ShiftCreationAgentResult> {
  const draft = storedDraft(params.session);
  const runId = await createRun({
    playbookId: params.playbook.id,
    sessionId: params.session.id,
    status: "matched",
    actionName: "shift.create",
    inputSummary: { answer: "ok", draft },
  });
  if (!draft.kaipokeCsId || !draft.date || !draft.startTime || !draft.endTime || !draft.serviceCode || draft.staffUserIds.length === 0) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, { status: "failed", error_code: "incomplete_shift", finished_at: new Date().toISOString() });
    return { handled: true, replyText: "登録内容が不足しています。もう一度依頼してください。" };
  }

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from("shift")
    .select("shift_id")
    .eq("kaipoke_cs_id", draft.kaipokeCsId)
    .eq("shift_start_date", draft.date)
    .eq("shift_start_time", toHms(draft.startTime))
    .limit(1)
    .maybeSingle();
  if (duplicateError) throw duplicateError;
  if (duplicate) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, {
      status: "blocked",
      error_code: "duplicate_shift",
      decision_summary: { existing_shift_id: duplicate.shift_id },
      finished_at: new Date().toISOString(),
    });
    return { handled: true, replyText: "同じ利用者様・日付・開始時刻のシフトがすでに登録されています。追加は行いませんでした。" };
  }

  const { data: requester } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("lw_userid", params.requesterLwUserid)
    .limit(1)
    .maybeSingle();
  const actorUserId = requester?.auth_user_id ? String(requester.auth_user_id) : `lineworks:${params.requesterLwUserid}`;
  const row = {
    kaipoke_cs_id: draft.kaipokeCsId,
    shift_start_date: draft.date,
    shift_end_date: draft.date,
    shift_start_time: toHms(draft.startTime),
    shift_end_time: toHms(draft.endTime),
    service_code: draft.serviceCode,
    staff_01_user_id: draft.staffUserIds[0] ?? null,
    staff_02_user_id: draft.staffUserIds[1] ?? null,
    staff_03_user_id: draft.staffUserIds[2] ?? null,
    staff_02_attend_flg: draft.staff02Attend,
    staff_03_attend_flg: draft.staff03Attend,
    required_staff_count: draft.requiredStaffCount,
    two_person_work_flg: draft.twoPersonWork,
    staff_01_role_code: draft.staff01RoleCode,
    staff_02_role_code: draft.staff02RoleCode,
    staff_03_role_code: draft.staff03RoleCode,
    judo_ido: null,
    tokutei_comment: null,
  };
  const { data, error } = await supabaseAdmin.rpc("shift_insert_with_context", {
    p_row: row,
    p_actor_user_id: actorUserId,
    p_request_path: "/api/webhook/agent-playbooks/shift-creation",
  });
  if (error) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, { status: "failed", error_code: error.code ?? "shift_create_failed", error_message: error.message, finished_at: new Date().toISOString() });
    return { handled: true, replyText: "シフトを追加できませんでした。管理者へ確認してください。" };
  }
  const shiftId = (data as { shift_id?: number } | null)?.shift_id ?? (typeof data === "number" ? data : null);
  if (!shiftId) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, { status: "failed", error_code: "missing_created_shift_id", finished_at: new Date().toISOString() });
    return { handled: true, replyText: "シフトの登録結果を確認できませんでした。管理者へ確認してください。" };
  }

  await finishSession(params.session.id, "completed");
  await updateRun(runId, { status: "succeeded", output_summary: { created_shift_id: shiftId }, finished_at: new Date().toISOString() });
  try {
    await notifyShiftChange({
      action: "INSERT",
      requestPath: "/api/webhook/agent-playbooks/shift-creation",
      actorUserIdText: actorUserId,
      shift: {
        shift_id: shiftId,
        kaipoke_cs_id: draft.kaipokeCsId,
        shift_start_date: draft.date,
        shift_start_time: toHms(draft.startTime),
        shift_end_time: toHms(draft.endTime),
        staff_01_user_id: draft.staffUserIds[0] ?? null,
      },
    });
  } catch (notifyError) {
    console.warn("[shift creation agent] insert notification failed", notifyError);
  }
  return { handled: true, replyText: `シフトを追加しました。（シフトID：${shiftId}）\n${await buildReply(draft, "登録内容：")}` };
}

export async function handleShiftCreationAgent(params: {
  eventType: string;
  message: string;
  channelId: string;
  requesterLwUserid: string | null;
  issuedAt: string;
  hasBotMention: boolean;
  mentionedLwUserids: string[];
}): Promise<ShiftCreationAgentResult> {
  if (params.eventType !== "message" || !params.requesterLwUserid || !params.message.trim()) return { handled: false };
  const session = await getActiveSession(params.channelId, params.requesterLwUserid);
  const playbook = await getEnabledPlaybook(session?.playbook_id);
  if (!playbook) return { handled: false };
  if (!session && !params.hasBotMention) return { handled: false };
  const messages = session
    ? [params.message]
    : await getInitialMessages({
      channelId: params.channelId,
      message: params.message,
      issuedAt: params.issuedAt,
      playbook,
    });
  if (!messages) return { handled: false };

  if (session?.status === "awaiting_confirmation") {
    if (isNo(params.message)) {
      const runId = await createRun({ playbookId: playbook.id, sessionId: session.id, actionName: "shift.create", inputSummary: { answer: "cancel" } });
      await finishSession(session.id, "cancelled");
      await updateRun(runId, { status: "skipped", decision_summary: { reason: "requester_cancelled" }, finished_at: new Date().toISOString() });
      return { handled: true, replyText: "シフトの追加を取り消しました。" };
    }
    if (isYes(params.message)) return confirmCreate({ session, playbook, requesterLwUserid: params.requesterLwUserid });
  }

  const { data: room, error: roomError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_name,group_account,group_type")
    .eq("channel_id", params.channelId)
    .maybeSingle();
  if (roomError) throw roomError;
  const clientId = String(room?.group_account ?? "").trim();
  if (room?.group_type !== "利用者様情報連携グループ" || !/^\d{8}$/.test(clientId)) {
    return { handled: true, replyText: "この部屋から利用者様を特定できないため、シフトを追加できません。" };
  }

  const runId = await createRun({
    playbookId: playbook.id,
    sessionId: session?.id,
    inputSummary: { channel_id: params.channelId, message: params.message },
  });
  const resolved = await resolveDraft({
    messages,
    issuedAt: params.issuedAt,
    mentionedLwUserids: params.mentionedLwUserids,
    base: storedDraft(session),
    clientId,
  });

  if (resolved.multipleDates) {
    const sessionId = await saveSession({ session, playbook, channelId: params.channelId, requesterLwUserid: params.requesterLwUserid, status: "awaiting_input", draft: resolved.draft });
    await updateRun(runId, { session_id: sessionId, status: "awaiting_input", decision_summary: { reason: "multiple_dates" }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: "一度に追加するシフトの日付を1日だけ指定してください。" };
  }

  if (resolved.ambiguousStaff) {
    const sessionId = await saveSession({ session, playbook, channelId: params.channelId, requesterLwUserid: params.requesterLwUserid, status: "awaiting_input", draft: resolved.draft });
    await updateRun(runId, { session_id: sessionId, status: "awaiting_input", decision_summary: { reason: "ambiguous_staff" }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: "担当者を一意に特定できませんでした。担当者のフルネーム、または担当者へのメンションを送ってください。" };
  }

  if (resolved.missing.length > 0) {
    const sessionId = await saveSession({ session, playbook, channelId: params.channelId, requesterLwUserid: params.requesterLwUserid, status: "awaiting_input", draft: resolved.draft });
    await updateRun(runId, { session_id: sessionId, status: "awaiting_input", decision_summary: { reason: "required_fields_missing", fields: resolved.missing }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: `次の項目を特定できませんでした：${resolved.missing.join("、")}。内容を返信してください。` };
  }

  const sessionId = await saveSession({ session, playbook, channelId: params.channelId, requesterLwUserid: params.requesterLwUserid, status: "awaiting_confirmation", draft: resolved.draft });
  await updateRun(runId, {
    session_id: sessionId,
    status: "awaiting_confirmation",
    action_name: "shift.create",
    decision_summary: { draft: resolved.draft },
    finished_at: new Date().toISOString(),
  });
  return {
    handled: true,
    replyText: `${await buildReply(resolved.draft)}\n\nよろしければ${playbook.session_ttl_minutes}分以内に「OK」、修正する場合は内容を返信し、取り消す場合は「キャンセル」と返信してください。`,
  };
}
