import { getAccessToken } from "@/lib/getAccessToken";
import { supabaseAdmin } from "@/lib/supabase/service";

const BOT_ID = "6807751";
const MANAGER_CHANNEL_ID = "99142491";
const TARGET_GROUP_TYPE = "利用者様情報連携グループ";

type Playbook = {
  id: string;
  context_message_limit: number;
  context_minutes: number;
  session_ttl_minutes: number;
  allowed_actions: unknown;
};

type MessageLog = {
  id: number;
  timestamp: string;
  user_id: string | null;
  channel_id: string | null;
  message: string | null;
  mention_lw_userids: unknown;
  raw_event: unknown;
};

type DirectoryUser = {
  lwUserId: string;
  name: string;
};

type MentionTarget = {
  userId: string;
  label: string;
};

type Candidate = {
  request: MessageLog;
  mentionAll: boolean;
  targets: MentionTarget[];
  context: Array<{
    timestamp: string;
    senderId: string;
    senderIsRequester: boolean;
    eligibleResponder: boolean;
    text: string;
  }>;
};

type AiDecision = {
  requestId: number;
  isRequest: boolean;
  hasResponse: boolean;
  reason: string;
};

type SentAtByDestination = Record<string, string>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function messageText(log: MessageLog) {
  const rawText = asRecord(asRecord(log.raw_event).content).text;
  return String(log.message ?? rawText ?? "").trim();
}

function extractStructuredMentionIds(log: MessageLog) {
  const ids = new Set(asStringArray(log.mention_lw_userids));
  const rawMentions = asRecord(log.raw_event).content;
  const mentions = asRecord(rawMentions).mentions;
  if (Array.isArray(mentions)) {
    for (const mention of mentions) {
      const value = asRecord(mention);
      const id = String(value.userId ?? value.userid ?? value.user_id ?? value.mentionedUserId ?? "").trim();
      if (id) ids.add(id);
    }
  }
  for (const match of messageText(log).matchAll(/<m\s+[^>]*userId=["']([^"']+)["'][^>]*>/gi)) {
    if (match[1]) ids.add(match[1].trim());
  }
  for (const id of [...ids]) {
    if (id.toLowerCase() === "all") ids.delete(id);
  }
  if (log.user_id) ids.delete(log.user_id);
  return ids;
}

function hasAllMention(text: string) {
  return /<m\s+[^>]*(?:userNo|userId)=["']all["'][^>]*>|[@＠]all(?:\s|　|<|$)/i.test(text);
}

export function resolveMentionTargets(log: MessageLog, directory: DirectoryUser[]) {
  const text = messageText(log);
  const byId = new Map(directory.map((user) => [user.lwUserId, user]));
  const ids = extractStructuredMentionIds(log);

  const names = [...directory]
    .filter((user) => user.name)
    .sort((a, b) => b.name.length - a.name.length);
  for (const user of names) {
    if (text.includes(`@${user.name}`) || text.includes(`＠${user.name}`)) ids.add(user.lwUserId);
  }

  const targets = [...ids].map((userId) => ({
    userId,
    label: byId.get(userId)?.name ?? userId,
  }));
  return { mentionAll: hasAllMention(text), targets };
}

function toMillis(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function getEnabledPlaybook(): Promise<Playbook | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_playbooks")
    .select("id,context_message_limit,context_minutes,session_ttl_minutes,allowed_actions")
    .eq("name", "依頼事項未対応のアラート")
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const playbook = data as Playbook;
  return Array.isArray(playbook.allowed_actions)
    && playbook.allowed_actions.includes("lineworks.send_unhandled_reminder")
    ? playbook
    : null;
}

async function getDirectory(): Promise<DirectoryUser[]> {
  const { data, error } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("lw_userid,last_name_kanji,first_name_kanji")
    .not("lw_userid", "is", null)
    .limit(3000);
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const lwUserId = String(row.lw_userid ?? "").trim();
    if (!lwUserId) return [];
    return [{
      lwUserId,
      name: `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim(),
    }];
  });
}

async function getTargetChannelIds(channelIds: string[]) {
  const uniqueIds = [...new Set(channelIds.filter(Boolean))];
  const chunks = Array.from({ length: Math.ceil(uniqueIds.length / 200) }, (_, index) => (
    uniqueIds.slice(index * 200, (index + 1) * 200)
  ));
  const results = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await supabaseAdmin
      .from("group_lw_channel_view")
      .select("channel_id")
      .eq("group_type", TARGET_GROUP_TYPE)
      .in("channel_id", chunk);
    if (error) throw error;
    return data ?? [];
  }));
  return new Set(results.flat().map((row) => String(row.channel_id ?? "").trim()).filter(Boolean));
}

async function getRecentLogs(contextMinutes: number, now: Date): Promise<MessageLog[]> {
  const since = new Date(now.getTime() - contextMinutes * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("msg_lw_log")
    .select("id,timestamp,user_id,channel_id,message,mention_lw_userids,raw_event")
    .eq("event_type", "message")
    .gte("timestamp", since)
    .lte("timestamp", now.toISOString())
    .order("timestamp", { ascending: true })
    .limit(3000);
  if (error) throw error;
  return (data ?? []) as MessageLog[];
}

function buildCandidates(params: {
  logs: MessageLog[];
  directory: DirectoryUser[];
  delayMinutes: number;
  contextMessageLimit: number;
  now: Date;
}) {
  const cutoff = params.now.getTime() - params.delayMinutes * 60 * 1000;
  const logsByChannel = new Map<string, MessageLog[]>();
  for (const log of params.logs) {
    if (!log.channel_id) continue;
    const list = logsByChannel.get(log.channel_id) ?? [];
    list.push(log);
    logsByChannel.set(log.channel_id, list);
  }

  const candidates: Candidate[] = [];
  for (const request of params.logs) {
    if (!request.channel_id || toMillis(request.timestamp) > cutoff) continue;
    const resolved = resolveMentionTargets(request, params.directory);
    if (!resolved.mentionAll && resolved.targets.length === 0) continue;
    const targetIds = new Set(resolved.targets.map((target) => target.userId));
    const subsequent = (logsByChannel.get(request.channel_id) ?? [])
      .filter((log) => toMillis(log.timestamp) > toMillis(request.timestamp))
      .slice(0, params.contextMessageLimit)
      .map((log) => ({
        timestamp: log.timestamp,
        senderId: String(log.user_id ?? ""),
        senderIsRequester: Boolean(log.user_id && log.user_id === request.user_id),
        eligibleResponder: resolved.mentionAll
          ? Boolean(log.user_id)
          : Boolean(log.user_id && targetIds.has(log.user_id)),
        text: messageText(log).slice(0, 1000),
      }));
    candidates.push({ request, ...resolved, context: subsequent });
  }
  return candidates;
}

function isRequestText(text: string) {
  const normalized = text
    .replace(/<m\s+[^>]*>/gi, " ")
    .replace(/<\/m>/gi, " ")
    .replace(/[@＠][^\s　、。,，:：\n]+\s*さん?/g, " ")
    .replace(/[\s　]+/g, " ")
    .trim();
  if (normalized.length < 3) return false;
  if (/^[!！。,.、]*(ありがとう(?:ございます|ございました)?|ありがとうございました|助かりました|感謝します|お疲れ様です|承知しました|了解しました)[!！。,.、]*$/.test(normalized)) {
    return false;
  }
  if (/コメント(?:に|にも)入れてお(?:く|きます|きました)/.test(normalized)) {
    return false;
  }
  return /[?？]|(?:して|を|ご)(?:ください|下さい|ほしい|欲しい)|お願い(?:します|いたします|致します|できますか)|よろしくお願い|(?:できます|出来ます|よいです|良いです|いかがです|どうです|どうなりました|どうすれば|どうしたら|分かります|わかります)(?:か|でしょうか)|教えて|確認(?:して|をお願い|いただけ)|対応(?:して|をお願い|いただけ)|回答(?:して|をお願い|いただけ)|返信(?:して|をお願い|いただけ)|連絡(?:して|をお願い|いただけ)|判断(?:して|をお願い|いただけ)/.test(normalized);
}

function classifyCandidates(candidates: Candidate[]): AiDecision[] {
  return candidates.map((candidate) => {
    const isRequest = isRequestText(messageText(candidate.request));
    const response = candidate.context.find((message) => {
      if (!message.eligibleResponder || message.text.trim().length === 0) return false;
      if (!message.senderIsRequester) return true;
      return /(承知|了解|確認(?:しました|できました|済み)|対応(?:しました|済み)|回答|解決|完了|大丈夫|可能|不可|難しい|あります|ありません|埋まって|聞きました|分かりました|わかりました|手配|不要|キャンセル)/.test(message.text);
    });
    return {
      requestId: candidate.request.id,
      isRequest,
      hasResponse: Boolean(response),
      reason: !isRequest
        ? "回答・確認・作業を求める表現がないため依頼対象外"
        : response
          ? `メンション対象者から${formatJst(response.timestamp)}に投稿あり`
          : "メンション対象者からの投稿なし",
    };
  });
}

function sentAtMapFromRuns(runs: Array<{ output_summary: unknown }>) {
  const byRequest = new Map<number, SentAtByDestination>();
  for (const run of runs) {
    const output = asRecord(run.output_summary);
    const requestId = Number(output.request_message_id);
    if (!Number.isInteger(requestId)) continue;
    const sent = asRecord(output.sent_at_by_destination);
    const current = byRequest.get(requestId) ?? {};
    for (const [destination, timestamp] of Object.entries(sent)) {
      const value = String(timestamp ?? "");
      if (toMillis(value) > toMillis(current[destination] ?? "")) current[destination] = value;
    }
    byRequest.set(requestId, current);
  }
  return byRequest;
}

async function getRecentSends(playbookId: string, since: string) {
  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .select("output_summary")
    .eq("playbook_id", playbookId)
    .eq("action_name", "lineworks.send_unhandled_reminder")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return sentAtMapFromRuns((data ?? []) as Array<{ output_summary: unknown }>);
}

async function getChannelNames(channelIds: string[]) {
  if (channelIds.length === 0) return new Map<string, string>();
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("channel_id,group_name")
    .in("channel_id", channelIds);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [
    String(row.channel_id),
    String(row.group_name ?? row.channel_id),
  ]));
}

async function getManagerMemberIds(accessToken: string) {
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_info")
    .select("group_id")
    .or(`channel_id.eq.${MANAGER_CHANNEL_ID},channel_id_secondary.eq.${MANAGER_CHANNEL_ID}`)
    .maybeSingle();
  if (error) throw error;
  const groupId = String(data?.group_id ?? "").trim();
  const domainId = process.env.NEXT_PUBLIC_LINEWORKS_DOMAIN_ID?.trim();
  if (!groupId || !domainId) return new Set<string>();
  const response = await fetch(
    `https://www.worksapis.com/v1.0/groups/${encodeURIComponent(groupId)}/members?domainId=${encodeURIComponent(domainId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`マネジャーグループのメンバー取得に失敗しました: ${response.status}`);
  const body = asRecord(await response.json());
  const members = Array.isArray(body.members) ? body.members : [];
  return new Set(members.flatMap((member) => {
    const value = asRecord(member);
    return String(value.type ?? "").toUpperCase() === "USER" && value.id
      ? [String(value.id)]
      : [];
  }));
}

function formatJst(timestamp: string) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function mentionLine(params: {
  candidate: Candidate;
  destination: string;
  managerMemberIds: Set<string>;
}) {
  if (params.candidate.mentionAll) {
    return params.destination === params.candidate.request.channel_id
      ? '<m userId="all">'
      : "";
  }
  const targets = params.destination === MANAGER_CHANNEL_ID
    ? params.candidate.targets.filter((target) => params.managerMemberIds.has(target.userId))
    : params.candidate.targets;
  return targets.map((target) => `<m userId="${target.userId}">さん`).join(" ");
}

function buildAlertText(params: {
  candidate: Candidate;
  destination: string;
  sourceName: string;
  managerMemberIds: Set<string>;
  delayMinutes: number;
}) {
  const mention = mentionLine(params);
  const source = params.destination === MANAGER_CHANNEL_ID && params.candidate.request.channel_id !== MANAGER_CHANNEL_ID
    ? `\n・発生した部屋：${params.sourceName}`
    : "";
  const text = messageText(params.candidate.request).replace(/\s+/g, " ").slice(0, 700);
  return `${mention ? `${mention}\n` : ""}⚠️ メンション付きの依頼事項に、${params.delayMinutes}分以上対応がありません。${source}\n・依頼時刻：${formatJst(params.candidate.request.timestamp)}\n・依頼内容：${text}\n\nメンションされた方のどなたかが、発生した部屋で返答してください。`;
}

async function sendMessage(channelId: string, text: string, accessToken: string) {
  const response = await fetch(
    `https://www.worksapis.com/v1.0/bots/${BOT_ID}/channels/${encodeURIComponent(channelId)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: { type: "text", text } }),
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LINE WORKS通知失敗 channel=${channelId} status=${response.status} ${detail}`.trim());
  }
}

async function createRun(playbookId: string, candidate: Candidate, decision: AiDecision) {
  const { data, error } = await supabaseAdmin.from("agent_runs").insert({
    playbook_id: playbookId,
    trigger_source: "lineworks_mention",
    status: "received",
    action_name: "lineworks.send_unhandled_reminder",
    input_summary: {
      request_message_id: candidate.request.id,
      source_channel_id: candidate.request.channel_id,
      mentioned_user_ids: candidate.targets.map((target) => target.userId),
      mention_all: candidate.mentionAll,
    },
    decision_summary: {
      is_request: decision.isRequest,
      has_response: decision.hasResponse,
      reason: decision.reason,
    },
  }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function updateRun(runId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("agent_runs").update(values).eq("id", runId);
  if (error) throw error;
}

export async function runUnhandledRequestAlerts(options: { now?: Date; dryRun?: boolean } = {}) {
  const now = options.now ?? new Date();
  console.log("[unhandled-request-alert] started", { now: now.toISOString() });
  const playbook = await getEnabledPlaybook();
  if (!playbook) {
    console.log("[unhandled-request-alert] skipped: enabled playbook/action not found");
    return { ok: true, skipped: true, reason: "enabled_playbook_not_found" };
  }

  const contextMinutes = Math.max(playbook.context_minutes, playbook.session_ttl_minutes);
  const [directory, recentLogs, recentSends] = await Promise.all([
    getDirectory(),
    getRecentLogs(contextMinutes, now),
    getRecentSends(playbook.id, new Date(now.getTime() - contextMinutes * 60 * 1000).toISOString()),
  ]);
  const targetChannelIds = await getTargetChannelIds(recentLogs.flatMap((log) => log.channel_id ? [log.channel_id] : []));
  const logs = recentLogs.filter((log) => Boolean(log.channel_id && targetChannelIds.has(log.channel_id)));
  const candidates = buildCandidates({
    logs,
    directory,
    delayMinutes: playbook.session_ttl_minutes,
    contextMessageLimit: playbook.context_message_limit,
    now,
  });
  const cooldownMs = playbook.session_ttl_minutes * 60 * 1000;
  const dueCandidates = candidates.filter((candidate) => {
    const sourceChannelId = candidate.request.channel_id;
    if (!sourceChannelId) return false;
    const previous = recentSends.get(candidate.request.id) ?? {};
    return [...new Set([sourceChannelId, MANAGER_CHANNEL_ID])]
      .some((channelId) => now.getTime() - toMillis(previous[channelId] ?? "") >= cooldownMs);
  });
  console.log("[unhandled-request-alert] candidates", {
    logs: logs.length,
    candidates: candidates.length,
    dueCandidates: dueCandidates.length,
  });
  const decisions = classifyCandidates(dueCandidates);
  const decisionById = new Map(decisions.map((decision) => [decision.requestId, decision]));
  const pending = dueCandidates.filter((candidate) => {
    const decision = decisionById.get(candidate.request.id);
    return decision?.isRequest === true && decision.hasResponse === false;
  });
  if (pending.length === 0) {
    console.log("[unhandled-request-alert] completed: no unhandled requests");
    return { ok: true, candidates: candidates.length, unhandled: 0, sent: 0 };
  }

  if (options.dryRun) {
    console.log("[unhandled-request-alert] dry run completed", { candidates: candidates.length, unhandled: pending.length });
    return {
      ok: true,
      dryRun: true,
      candidates: candidates.length,
      unhandled: pending.length,
      sent: 0,
      requests: pending.map((candidate) => ({
        requestMessageId: candidate.request.id,
        sourceChannelId: candidate.request.channel_id,
        mentionedUserCount: candidate.targets.length,
        mentionAll: candidate.mentionAll,
      })),
    };
  }

  const accessToken = await getAccessToken();
  const channelNames = await getChannelNames([...new Set(pending.map((candidate) => candidate.request.channel_id).filter((id): id is string => !!id))]);
  let managerMemberIds = new Set<string>();
  try {
    managerMemberIds = await getManagerMemberIds(accessToken);
  } catch (error) {
    console.warn("[unhandled-request-alert] manager members unavailable; sending manager alert without mentions", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let sent = 0;
  const failures: Array<{ requestId: number; channelId: string; error: string }> = [];
  for (const candidate of pending) {
    const sourceChannelId = candidate.request.channel_id;
    if (!sourceChannelId) continue;
    const decision = decisionById.get(candidate.request.id)!;
    const previous = recentSends.get(candidate.request.id) ?? {};
    const destinations = [...new Set([sourceChannelId, MANAGER_CHANNEL_ID])]
      .filter((channelId) => now.getTime() - toMillis(previous[channelId] ?? "") >= cooldownMs);
    if (destinations.length === 0) continue;

    const runId = await createRun(playbook.id, candidate, decision);
    const sentAtByDestination: SentAtByDestination = {};
    for (const destination of destinations) {
      try {
        await sendMessage(destination, buildAlertText({
          candidate,
          destination,
          sourceName: channelNames.get(sourceChannelId) ?? sourceChannelId,
          managerMemberIds,
          delayMinutes: playbook.session_ttl_minutes,
        }), accessToken);
        sentAtByDestination[destination] = new Date().toISOString();
        sent += 1;
        await updateRun(runId, {
          output_summary: { request_message_id: candidate.request.id, sent_at_by_destination: sentAtByDestination },
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push({ requestId: candidate.request.id, channelId: destination, error: detail });
        console.error("[unhandled-request-alert] send failed", { requestId: candidate.request.id, destination, error: detail });
      }
    }
    await updateRun(runId, {
      status: failures.some((failure) => failure.requestId === candidate.request.id) ? "failed" : "succeeded",
      output_summary: { request_message_id: candidate.request.id, sent_at_by_destination: sentAtByDestination },
      error_code: failures.some((failure) => failure.requestId === candidate.request.id) ? "lineworks_send_failed" : null,
      error_message: failures.filter((failure) => failure.requestId === candidate.request.id).map((failure) => failure.error).join("\n") || null,
      finished_at: new Date().toISOString(),
    });
  }

  console.log("[unhandled-request-alert] completed", { candidates: candidates.length, unhandled: pending.length, sent, failures: failures.length });
  return { ok: failures.length === 0, candidates: candidates.length, unhandled: pending.length, sent, failures };
}
