import { notifyShiftChange } from "@/lib/lineworks/shiftChangeNotify";
import { supabaseAdmin } from "@/lib/supabase/service";
import {
  containsShiftCancellationIntent,
  parseShiftCancellationRequests,
  type ShiftCancellationRequest,
} from "@/lib/agent-playbooks/shiftCancellationParser";

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

type ShiftRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;
};

export type ShiftCancellationAgentResult = {
  handled: boolean;
  replyText?: string;
};

function normalizeTime(value: string | null) {
  return value?.slice(0, 5) ?? null;
}

function formatRequest(request: ShiftCancellationRequest) {
  const date = request.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日");
  if (!request.startTime) return date;
  return `${date} ${request.startTime}${request.endTime ? `～${request.endTime}` : ""}`;
}

function formatShift(shift: ShiftRow) {
  return `${shift.shift_start_date} ${normalizeTime(shift.shift_start_time) ?? "時刻不明"}～${normalizeTime(shift.shift_end_time) ?? "時刻不明"}（${shift.service_code ?? "サービス種別不明"}）`;
}

function normalizeAnswer(text: string) {
  return text
    .replace(/^\s*@すまーとアイさん(?:\s|　|さん)*/i, "")
    .replace(/[\s　、。！？!?,.]/g, "")
    .toLowerCase();
}

function isYes(text: string) {
  const normalized = normalizeAnswer(text);
  return /^(ok|ｏｋ|はい|了解|承認|実行|削除して|削除してください|お願いします)$/.test(normalized);
}

function isNo(text: string) {
  const normalized = normalizeAnswer(text);
  return /^(no|キャンセル|中止|やめて|やめます|取り消し|取消)$/.test(normalized);
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
  await supabaseAdmin.from("agent_sessions").update({ status: "expired" }).eq("id", session.id);
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
  const playbook = (data as Playbook[] | null)?.find((item) =>
    Array.isArray(item.allowed_actions)
    && item.allowed_actions.includes("shift.list")
    && item.allowed_actions.includes("shift.delete")
  );
  return playbook ?? null;
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

async function handleConfirmation(params: {
  session: AgentSession;
  playbook: Playbook;
  message: string;
  requesterLwUserid: string;
}): Promise<ShiftCancellationAgentResult> {
  if (params.session.status !== "awaiting_confirmation") return { handled: false };

  if (isNo(params.message)) {
    const runId = await createRun({
      playbookId: params.playbook.id,
      sessionId: params.session.id,
      status: "received",
      actionName: "shift.delete",
      inputSummary: { answer: "cancel" },
    });
    await finishSession(params.session.id, "cancelled");
    await updateRun(runId, {
      status: "skipped",
      decision_summary: { reason: "requester_cancelled" },
      finished_at: new Date().toISOString(),
    });
    return { handled: true, replyText: "シフトの削除を取り消しました。" };
  }

  if (!isYes(params.message)) {
    return {
      handled: true,
      replyText: "削除する場合は「OK」、取り消す場合は「キャンセル」と返信してください。",
    };
  }

  const pendingShifts = Array.isArray(params.session.pending_action?.shifts)
    ? params.session.pending_action.shifts as ShiftRow[]
    : [];
  const runId = await createRun({
    playbookId: params.playbook.id,
    sessionId: params.session.id,
    status: "matched",
    actionName: "shift.delete",
    inputSummary: { answer: "ok", shift_ids: pendingShifts.map((shift) => shift.shift_id) },
  });

  if (pendingShifts.length === 0) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, {
      status: "failed",
      error_code: "missing_pending_shifts",
      error_message: "確認待ちセッションに削除対象がありません。",
      finished_at: new Date().toISOString(),
    });
    return { handled: true, replyText: "削除対象を確認できませんでした。もう一度依頼してください。" };
  }

  const ids = pendingShifts.map((shift) => shift.shift_id);
  const { data: currentRows, error: currentError } = await supabaseAdmin
    .from("shift")
    .select("shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,service_code,staff_01_user_id")
    .in("shift_id", ids);
  if (currentError) throw currentError;

  const currentShifts = (currentRows ?? []) as ShiftRow[];
  const unchanged = pendingShifts.every((pending) => currentShifts.some((current) =>
    current.shift_id === pending.shift_id
    && current.kaipoke_cs_id === pending.kaipoke_cs_id
    && current.shift_start_date === pending.shift_start_date
    && normalizeTime(current.shift_start_time) === normalizeTime(pending.shift_start_time)
    && normalizeTime(current.shift_end_time) === normalizeTime(pending.shift_end_time)
  ));

  if (!unchanged || currentShifts.length !== pendingShifts.length) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, {
      status: "blocked",
      error_code: "shift_changed_after_confirmation",
      error_message: "確認後に削除対象の内容が変更されたか、削除済みです。",
      finished_at: new Date().toISOString(),
    });
    return { handled: true, replyText: "確認後にシフトの内容が変わったか、すでに削除されています。もう一度依頼してください。" };
  }

  const { data: requester } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("lw_userid", params.requesterLwUserid)
    .limit(1)
    .maybeSingle();
  const actorUserId = requester?.auth_user_id ? String(requester.auth_user_id) : `lineworks:${params.requesterLwUserid}`;
  const { error: deleteError } = await supabaseAdmin.rpc("shifts_delete_with_context", {
    p_shift_ids: ids,
    p_actor_user_id: actorUserId,
    p_request_path: "/api/webhook/agent-playbooks/shift-cancellation",
  });

  if (deleteError) {
    await finishSession(params.session.id, "failed");
    await updateRun(runId, {
      status: "failed",
      error_code: deleteError.code ?? "shift_delete_failed",
      error_message: deleteError.message,
      finished_at: new Date().toISOString(),
    });
    return { handled: true, replyText: "シフトを削除できませんでした。管理者へ確認してください。" };
  }

  await finishSession(params.session.id, "completed");
  await updateRun(runId, {
    status: "succeeded",
    output_summary: { deleted_shift_ids: ids },
    finished_at: new Date().toISOString(),
  });

  for (const shift of currentShifts) {
    try {
      await notifyShiftChange({
        action: "DELETE",
        requestPath: "/api/webhook/agent-playbooks/shift-cancellation",
        actorUserIdText: actorUserId,
        shift,
        deleteChangedCols: shift,
      });
    } catch (error) {
      console.warn("[shift cancellation agent] delete notification failed", error);
    }
  }

  return {
    handled: true,
    replyText: `次のシフトを削除しました。\n${currentShifts.map((shift) => `・${formatShift(shift)}`).join("\n")}`,
  };
}

async function findRequests(params: {
  channelId: string;
  playbook: Playbook;
  issuedAt: string;
  currentText: string;
  clarificationText?: string;
}) {
  const issuedAt = new Date(params.issuedAt);
  const referenceDate = Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt;
  const threshold = new Date(referenceDate.getTime() - params.playbook.context_minutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("msg_lw_log")
    .select("message,timestamp")
    .eq("channel_id", params.channelId)
    .eq("event_type", "message")
    .gte("timestamp", threshold)
    .lte("timestamp", referenceDate.toISOString())
    .order("timestamp", { ascending: false })
    .limit(params.playbook.context_message_limit);
  if (error) throw error;
  const texts = (data ?? []).reverse().map((row) => String(row.message ?? "")).filter(Boolean);
  if (params.currentText && !texts.includes(params.currentText)) texts.push(params.currentText);
  if (params.clarificationText) texts.push(`${params.clarificationText} シフト削除`);
  return parseShiftCancellationRequests(texts, referenceDate);
}

export async function handleShiftCancellationAgent(params: {
  eventType: string;
  message: string;
  channelId: string;
  requesterLwUserid: string | null;
  issuedAt: string;
  hasBotMention: boolean;
}): Promise<ShiftCancellationAgentResult> {
  if (params.eventType !== "message" || !params.requesterLwUserid || !params.message.trim()) return { handled: false };

  const activeSession = await getActiveSession(params.channelId, params.requesterLwUserid);
  const playbook = await getEnabledPlaybook(activeSession?.playbook_id);
  if (!playbook) return { handled: false };

  if (activeSession?.status === "awaiting_confirmation") {
    return handleConfirmation({
      session: activeSession,
      playbook,
      message: params.message,
      requesterLwUserid: params.requesterLwUserid,
    });
  }

  if (!activeSession && !params.hasBotMention) return { handled: false };
  if (!activeSession && !containsShiftCancellationIntent(params.message)) {
    const referenceDate = new Date(params.issuedAt);
    const threshold = new Date(referenceDate.getTime() - playbook.context_minutes * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("msg_lw_log")
      .select("message")
      .eq("channel_id", params.channelId)
      .eq("event_type", "message")
      .gte("timestamp", threshold)
      .order("timestamp", { ascending: false })
      .limit(playbook.context_message_limit);
    if (error) throw error;
    if (!(data ?? []).some((row) => containsShiftCancellationIntent(String(row.message ?? "")))) return { handled: false };
  }

  const requests = await findRequests({
    channelId: params.channelId,
    playbook,
    issuedAt: params.issuedAt,
    currentText: params.message,
    clarificationText: activeSession?.status === "awaiting_input" ? params.message : undefined,
  });
  const runId = await createRun({
    playbookId: playbook.id,
    sessionId: activeSession?.id,
    inputSummary: { channel_id: params.channelId, requests },
  });

  if (requests.length === 0) {
    const values = {
      playbook_id: playbook.id,
      channel_id: params.channelId,
      requester_lw_userid: params.requesterLwUserid,
      status: "awaiting_input",
      state: { reason: "date_missing" },
      source_message_ids: [],
      pending_action: null,
      expires_at: new Date(Date.now() + playbook.session_ttl_minutes * 60 * 1000).toISOString(),
    };
    let sessionId = activeSession?.id ?? null;
    if (sessionId) {
      const { error } = await supabaseAdmin.from("agent_sessions").update(values).eq("id", sessionId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseAdmin.from("agent_sessions").insert(values).select("id").single();
      if (error) throw error;
      sessionId = String(data.id);
    }
    await updateRun(runId, { session_id: sessionId, status: "awaiting_input", decision_summary: { reason: "date_missing" }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: "キャンセルするシフトの日付と開始時刻を教えてください。" };
  }

  return startRequest({ ...params, playbook, activeSession, requests, runId });
}

async function startRequest(params: {
  channelId: string;
  requesterLwUserid: string;
  playbook: Playbook;
  activeSession: AgentSession | null;
  requests: ShiftCancellationRequest[];
  runId: string;
}): Promise<ShiftCancellationAgentResult> {
  const { data: room, error: roomError } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_name,group_account,group_type")
    .eq("channel_id", params.channelId)
    .maybeSingle();
  if (roomError) throw roomError;
  const clientId = String(room?.group_account ?? "").trim();
  if (room?.group_type !== "利用者様情報連携グループ" || !/^\d{8}$/.test(clientId)) {
    await updateRun(params.runId, { status: "blocked", decision_summary: { reason: "client_room_not_resolved" }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: "この部屋から利用者様を特定できないため、シフトを確認できませんでした。" };
  }

  const dates = Array.from(new Set(params.requests.map((request) => request.date)));
  const { data: shiftData, error: shiftError } = await supabaseAdmin
    .from("shift")
    .select("shift_id,kaipoke_cs_id,shift_start_date,shift_start_time,shift_end_time,service_code,staff_01_user_id")
    .eq("kaipoke_cs_id", clientId)
    .in("shift_start_date", dates)
    .order("shift_start_date", { ascending: true })
    .order("shift_start_time", { ascending: true });
  if (shiftError) throw shiftError;

  const shifts = (shiftData ?? []) as ShiftRow[];
  const selected = new Map<number, ShiftRow>();
  const missing: ShiftCancellationRequest[] = [];
  const ambiguous: ShiftRow[] = [];
  for (const request of params.requests) {
    const matches = shifts.filter((shift) => shift.shift_start_date === request.date
      && (!request.startTime || normalizeTime(shift.shift_start_time) === request.startTime)
      && (!request.endTime || normalizeTime(shift.shift_end_time) === request.endTime));
    if (matches.length === 0) missing.push(request);
    else if (matches.length > 1) ambiguous.push(...matches);
    else selected.set(matches[0].shift_id, matches[0]);
  }

  const expiresAt = new Date(Date.now() + params.playbook.session_ttl_minutes * 60 * 1000).toISOString();
  if (ambiguous.length > 0) {
    const values = {
      playbook_id: params.playbook.id,
      channel_id: params.channelId,
      requester_lw_userid: params.requesterLwUserid,
      status: "awaiting_input",
      state: { requests: params.requests, client_id: clientId },
      source_message_ids: [],
      pending_action: null,
      expires_at: expiresAt,
    };
    const sessionResult = params.activeSession
      ? await supabaseAdmin.from("agent_sessions").update(values).eq("id", params.activeSession.id)
      : await supabaseAdmin.from("agent_sessions").insert(values);
    if (sessionResult.error) throw sessionResult.error;
    await updateRun(params.runId, {
      status: "awaiting_input",
      decision_summary: { reason: "multiple_shifts_matched", candidate_shift_ids: ambiguous.map((shift) => shift.shift_id) },
      finished_at: new Date().toISOString(),
    });
    return {
      handled: true,
      replyText: `複数のシフトが該当します。削除する日付と開始時刻を指定してください。\n${ambiguous.map((shift) => `・${formatShift(shift)}`).join("\n")}`,
    };
  }

  const targetShifts = Array.from(selected.values());
  if (targetShifts.length === 0) {
    if (params.activeSession) await finishSession(params.activeSession.id, "completed");
    await updateRun(params.runId, { status: "skipped", decision_summary: { reason: "shift_not_found", requests: params.requests }, finished_at: new Date().toISOString() });
    return { handled: true, replyText: `該当する登録済みシフトはありませんでした。\n${missing.map((request) => `・${formatRequest(request)}`).join("\n")}` };
  }

  const values = {
    playbook_id: params.playbook.id,
    channel_id: params.channelId,
    requester_lw_userid: params.requesterLwUserid,
    status: "awaiting_confirmation",
    state: { requests: params.requests, client_id: clientId, client_name: room?.group_name ?? null },
    source_message_ids: [],
    pending_action: { action: "shift.delete", shifts: targetShifts },
    expires_at: expiresAt,
  };
  let sessionId = params.activeSession?.id ?? null;
  if (sessionId) {
    const { error } = await supabaseAdmin.from("agent_sessions").update(values).eq("id", sessionId);
    if (error) throw error;
  } else {
    const { data, error } = await supabaseAdmin.from("agent_sessions").insert(values).select("id").single();
    if (error) throw error;
    sessionId = String(data.id);
  }
  await updateRun(params.runId, {
    session_id: sessionId,
    status: "awaiting_confirmation",
    action_name: "shift.delete",
    decision_summary: { target_shift_ids: targetShifts.map((shift) => shift.shift_id), missing_requests: missing },
    finished_at: new Date().toISOString(),
  });

  const missingText = missing.length > 0
    ? `\n次の日時は登録済みシフトが見つかりませんでした。\n${missing.map((request) => `・${formatRequest(request)}`).join("\n")}`
    : "";
  return {
    handled: true,
    replyText: `次のシフトを削除します。\n${targetShifts.map((shift) => `・${formatShift(shift)}`).join("\n")}${missingText}\n\nよろしければ${params.playbook.session_ttl_minutes}分以内に「OK」、取り消す場合は「キャンセル」と返信してください。`,
  };
}
