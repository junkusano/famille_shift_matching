import OpenAI from "openai";
import { z } from "zod";
import { getAccessToken } from "@/lib/getAccessToken";
import { sendLWBotMessage } from "@/lib/lineworks/sendLWBotMessage";
import { OPENAI_PROFILES } from "@/lib/openaiProfiles";
import { supabaseAdmin } from "@/lib/supabase/service";

const PLAYBOOK_NAME = "草野対応案件のマネジャーアラート";
const ACTION_NAME = "lineworks.send_manager_risk_alert";
const MANAGER_CHANNEL_ID = "99142491";
const KUSANO_USER_ID = "junkusano";
const EXCLUDED_CHANNEL_IDS = new Set(["135380569"]);
const EXCLUDED_GROUP_IDS = new Set(["a03bd56b-0433-2139-ec9f-c8fee15cebeb"]);

const CATEGORY_LABELS = {
  complaint_trouble: "苦情・トラブル",
  service_quality: "サービス品質",
  kusano_instruction_unanswered: "草野代表の指示が未回答・未完了",
  legal_compliance: "法律・コンプライアンス",
  cost_efficiency: "コスト・効率化",
  administrative_confirmation: "行政確認が必要な事項",
} as const;

const riskAlertSchema = z.object({
  alerts: z.array(z.object({
    trigger_message_id: z.number().int().positive(),
    category: z.enum([
      "complaint_trouble",
      "service_quality",
      "kusano_instruction_unanswered",
      "legal_compliance",
      "cost_efficiency",
      "administrative_confirmation",
    ]),
    incident: z.string().trim().min(1).max(800),
    involved_people: z.array(z.string().trim().min(1).max(100)).max(15),
    impact: z.string().trim().min(1).max(800),
    prevention: z.string().trim().min(1).max(1_000),
    confidence: z.enum(["high", "medium"]),
  })).max(10),
});

type RiskAlert = z.infer<typeof riskAlertSchema>["alerts"][number];

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
};

type Room = {
  channelId: string;
  groupId: string;
  groupName: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  content: string | null;
  importance: number;
  updated_at: string;
  concept_level: number | null;
};

type ChannelPacket = {
  room: Room;
  focusMessageIds: number[];
  messages: Array<{
    id: number;
    timestamp: string;
    senderId: string;
    senderName: string;
    text: string;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item ?? "")).filter(Boolean) : [];
}

function chunks<T>(values: T[], size = 200) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => (
    values.slice(index * size, (index + 1) * size)
  ));
}

function toMillis(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function cleanText(value: string | null) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").trim();
}

function isBotAlert(text: string) {
  return /【草野対応案件アラート】|メンション付きの依頼事項に、\d+分以上対応がありません/.test(text);
}

export function isPotentialRiskMessage(log: MessageLog, kusanoLwUserId: string) {
  const text = cleanText(log.message).replace(/\s+/g, " ");
  if (text.length < 6 || isBotAlert(text)) return false;
  if (log.user_id === kusanoLwUserId
    && /(?:してください|して下さい|お願いします|確認|対応|修正|作成|変更|削除|追加|報告|連絡|調べ|進め|止め|やって)/.test(text)) {
    return true;
  }
  if (/(?:苦情|クレーム|トラブル|事故|問題|不満|怒って|揉め|もめ|拒否|不備|漏れ|ミス|間違|放置|ヒヤリハット)/.test(text)) return true;
  if (/(?:法律|法令|違反|コンプライアンス|虐待|不正|虚偽|個人情報|漏えい|漏洩|行政指導|監査)/.test(text)) return true;
  if (/(?:コスト|費用|高額|赤字|損失|無駄|効率|非効率|残業|工数|採算|収支)/.test(text)) return true;
  const administration = /(?:行政|市役所|区役所|役所|自治体|指定権者|運営指導|請求可否|算定|サービス内容)/.test(text);
  const needsConfirmation = /(?:確認|適切|必要|どう|よい|良い|可能|不可|問い合わせ|照会|[?？])/.test(text);
  if (administration && needsConfirmation) return true;
  const serviceOrBackoffice = /(?:品質|サービス|支援|対応|訪問|ヘルパー|バックオフィス|事務|請求|給与|シフト|記録)/.test(text);
  const qualityProblem = /(?:問題|不備|悪い|遅い|遅れ|遅延|ミス|間違|漏れ|未実施|未回答|未対応|できていない|できてない|不適切|不十分|放置|改善)/.test(text);
  return serviceOrBackoffice && qualityProblem;
}

async function getEnabledPlaybook(): Promise<Playbook | null> {
  const { data, error } = await supabaseAdmin
    .from("agent_playbooks")
    .select("id,context_message_limit,context_minutes,session_ttl_minutes,allowed_actions")
    .eq("name", PLAYBOOK_NAME)
    .eq("is_enabled", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const playbook = data as Playbook;
  return Array.isArray(playbook.allowed_actions) && playbook.allowed_actions.includes(ACTION_NAME)
    ? playbook
    : null;
}

async function getRecentLogs(contextMinutes: number, now: Date): Promise<MessageLog[]> {
  const since = new Date(now.getTime() - contextMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("msg_lw_log")
    .select("id,timestamp,user_id,channel_id,message")
    .eq("event_type", "message")
    .gte("timestamp", since)
    .lte("timestamp", now.toISOString())
    .order("timestamp", { ascending: true })
    .limit(5_000);
  if (error) throw error;
  return (data ?? []) as MessageLog[];
}

async function getRoomMap(channelIds: string[]) {
  const uniqueIds = [...new Set(channelIds.filter(Boolean))];
  const infoRows: Array<{ group_id: string | null; channel_id: string | null; channel_id_secondary: string | null }> = [];
  for (const chunk of chunks(uniqueIds)) {
    const [primary, secondary] = await Promise.all([
      supabaseAdmin.from("group_lw_channel_info").select("group_id,channel_id,channel_id_secondary").in("channel_id", chunk),
      supabaseAdmin.from("group_lw_channel_info").select("group_id,channel_id,channel_id_secondary").in("channel_id_secondary", chunk),
    ]);
    if (primary.error) throw primary.error;
    if (secondary.error) throw secondary.error;
    infoRows.push(...(primary.data ?? []), ...(secondary.data ?? []));
  }
  const groupIds = [...new Set(infoRows.map((row) => String(row.group_id ?? "")).filter(Boolean))];
  const nameByGroupId = new Map<string, string>();
  for (const chunk of chunks(groupIds)) {
    const { data, error } = await supabaseAdmin
      .from("group_lw_channel_view")
      .select("group_id,group_name")
      .in("group_id", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const groupId = String(row.group_id ?? "");
      const groupName = String(row.group_name ?? "").trim();
      if (groupId && groupName) nameByGroupId.set(groupId, groupName);
    }
  }
  const result = new Map<string, Room>();
  for (const row of infoRows) {
    const groupId = String(row.group_id ?? "");
    const groupName = nameByGroupId.get(groupId) ?? "";
    for (const channelId of [row.channel_id, row.channel_id_secondary].map((value) => String(value ?? "")).filter(Boolean)) {
      result.set(channelId, { channelId, groupId, groupName });
    }
  }
  return result;
}

function isEligibleRoom(room: Room | undefined) {
  return Boolean(room
    && room.groupName
    && !EXCLUDED_CHANNEL_IDS.has(room.channelId)
    && !EXCLUDED_GROUP_IDS.has(room.groupId)
    && !room.groupName.includes("【特秘】"));
}

export async function getKusanoLwUserId() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("lw_userid")
    .eq("user_id", KUSANO_USER_ID)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const lwUserId = String(data?.lw_userid ?? "").trim();
  if (!lwUserId) throw new Error("草野代表のLINE WORKSメンションIDを取得できませんでした。");
  return lwUserId;
}

async function getUserNames(userIds: string[], kusanoLwUserId: string) {
  const names = new Map<string, string>([[kusanoLwUserId, "草野淳"]]);
  for (const chunk of chunks([...new Set(userIds.filter(Boolean))])) {
    const { data, error } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("lw_userid,last_name_kanji,first_name_kanji")
      .in("lw_userid", chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      const userId = String(row.lw_userid ?? "");
      const name = `${row.last_name_kanji ?? ""}${row.first_name_kanji ?? ""}`.trim();
      if (userId && name) names.set(userId, name);
    }
  }
  return names;
}

async function getProcessedMessageIds(playbookId: string, since: string) {
  const { data, error } = await supabaseAdmin
    .from("agent_runs")
    .select("output_summary")
    .eq("playbook_id", playbookId)
    .eq("action_name", ACTION_NAME)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1_000);
  if (error) throw error;
  return new Set((data ?? []).flatMap((row) => stringArray(asRecord(row.output_summary).processed_message_ids).map(Number)));
}

async function loadKnowledge(): Promise<KnowledgeItem[]> {
  const select = "id,title,summary,content,importance,updated_at,concept_level";
  const [kusano, key] = await Promise.all([
    supabaseAdmin.from("knowledge_items")
      .select(`${select},primary_source:knowledge_sources!inner(source_key)`)
      .eq("primary_source.source_key", "kusano-thought-log")
      .eq("is_current", true)
      .eq("contains_personal_data", false)
      .in("review_status", ["needs_review", "approved"])
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(40),
    supabaseAdmin.from("knowledge_items")
      .select(select)
      .eq("concept_level", 1)
      .eq("is_current", true)
      .eq("contains_personal_data", false)
      .in("review_status", ["needs_review", "approved"])
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(40),
  ]);
  if (kusano.error) throw kusano.error;
  if (key.error) throw key.error;
  const byId = new Map<string, KnowledgeItem>();
  for (const row of [...(key.data ?? []), ...(kusano.data ?? [])]) {
    const item = row as unknown as KnowledgeItem;
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].slice(0, 30);
}

function buildPackets(params: {
  logs: MessageLog[];
  focusLogs: MessageLog[];
  rooms: Map<string, Room>;
  names: Map<string, string>;
  contextMessageLimit: number;
}) {
  const focusByChannel = new Map<string, MessageLog[]>();
  for (const log of params.focusLogs) {
    if (!log.channel_id) continue;
    const list = focusByChannel.get(log.channel_id) ?? [];
    list.push(log);
    focusByChannel.set(log.channel_id, list);
  }
  const packets: ChannelPacket[] = [];
  for (const [channelId, focus] of focusByChannel) {
    const room = params.rooms.get(channelId);
    if (!room) continue;
    const messages = params.logs
      .filter((log) => log.channel_id === channelId && cleanText(log.message) && !isBotAlert(cleanText(log.message)))
      .slice(-params.contextMessageLimit)
      .map((log) => ({
        id: log.id,
        timestamp: log.timestamp,
        senderId: String(log.user_id ?? "unknown"),
        senderName: params.names.get(String(log.user_id ?? "")) ?? String(log.user_id ?? "不明"),
        text: cleanText(log.message).slice(0, 1_500),
      }));
    packets.push({ room, focusMessageIds: focus.map((log) => log.id), messages });
  }
  return packets;
}

function reasoningEffort(value: string): "low" | "medium" | "high" {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}

async function analyzePackets(packets: ChannelPacket[], knowledge: KnowledgeItem[], kusanoLwUserId: string) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.create({
    model: OPENAI_PROFILES.standard.model,
    reasoning: { effort: reasoningEffort(OPENAI_PROFILES.standard.reasoning) },
    store: false,
    max_output_tokens: 6_000,
    instructions: [
      "あなたは障害福祉事業を運営するファミーユグループの経営リスク確認担当です。",
      "LINE WORKS会話から、草野代表が把握し、判断・指示・介入する必要性が高い具体的案件だけを抽出します。単なる可能性、雑談、通常連絡、お礼、既に解決した事項は出しません。",
      "対象分類は、苦情・トラブル、サービス品質（バックオフィス案件を含む）、草野代表の直接指示が10分以上未回答・未完了、法律・コンプライアンスの疑い、コスト・効率化の懸念、サービス内容の適否など行政確認が必要な事項です。",
      `草野代表の直接指示はsenderIdが${kusanoLwUserId}の発言だけです。後続会話で回答・着手・完了が確認できれば対象外です。`,
      "trigger_message_idは各roomのfocusMessageIdsにあるIDだけを使います。同じ案件は1件にまとめ、確度が低い案件は出しません。",
      "関与者は会話に明記された人だけを氏名で列挙し、メンション記法を使いません。責任や違反を断定せず、会話で確認できる事実と疑いを分けます。",
      "incident、impact、preventionは、提供された草野ナレッジ・キーナレッジの判断原則を踏まえます。ナレッジにない事実、法律要件、人物情報を作りません。",
      "preventionには、事実確認、責任者、期限、記録、標準化、再確認のうち案件に必要な具体策を簡潔に入れます。日本語で出力します。",
    ].join("\n"),
    input: JSON.stringify({
      knowledge: knowledge.map((item) => ({
        id: item.id,
        title: item.title,
        summary: item.summary,
        detail: cleanText(item.content).slice(0, 700),
        importance: item.importance,
        conceptLevel: item.concept_level,
      })),
      rooms: packets.map((packet) => ({
        channelId: packet.room.channelId,
        groupName: packet.room.groupName,
        focusMessageIds: packet.focusMessageIds,
        messages: packet.messages,
      })),
    }),
    text: {
      format: {
        type: "json_schema",
        name: "manager_risk_alerts",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["alerts"],
          properties: {
            alerts: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["trigger_message_id", "category", "incident", "involved_people", "impact", "prevention", "confidence"],
                properties: {
                  trigger_message_id: { type: "integer" },
                  category: { type: "string", enum: Object.keys(CATEGORY_LABELS) },
                  incident: { type: "string" },
                  involved_people: { type: "array", maxItems: 15, items: { type: "string" } },
                  impact: { type: "string" },
                  prevention: { type: "string" },
                  confidence: { type: "string", enum: ["high", "medium"] },
                },
              },
            },
          },
        },
      },
    },
  });
  if (response.status === "incomplete") throw new Error("リスク案件のAI判定が途中で終了しました。");
  if (!response.output_text?.trim()) throw new Error("リスク案件のAI判定結果が空でした。");
  return riskAlertSchema.parse(JSON.parse(response.output_text)).alerts;
}

function formatJst(timestamp: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestamp));
}

export function alertText(alert: RiskAlert, room: Room, trigger: MessageLog, kusanoLwUserId: string) {
  const people = alert.involved_people.length > 0 ? alert.involved_people.join("、") : "会話上で特定できず";
  return [
    `<m userId="${kusanoLwUserId}">代表`,
    "【草野対応案件アラート】",
    `分類：${CATEGORY_LABELS[alert.category]}`,
    `検出時刻：${formatJst(trigger.timestamp)}`,
    "",
    "① どんなことが、どのグループで起きているか",
    `グループ名：${room.groupName}`,
    alert.incident,
    "",
    "② 関与している人",
    people,
    "",
    "③ 考えられる影響",
    alert.impact,
    "",
    "④ とるべき再発防止",
    alert.prevention,
  ].join("\n");
}

async function createRun(playbookId: string, focusMessageIds: number[], packets: ChannelPacket[], knowledge: KnowledgeItem[]) {
  const { data, error } = await supabaseAdmin.from("agent_runs").insert({
    playbook_id: playbookId,
    trigger_source: "scheduled",
    status: "matched",
    action_name: ACTION_NAME,
    input_summary: {
      focus_message_ids: focusMessageIds,
      source_channel_ids: packets.map((packet) => packet.room.channelId),
      knowledge_item_ids: knowledge.map((item) => item.id),
    },
    decision_summary: { rule_type: "manager_risk_alert" },
  }).select("id").single();
  if (error) throw error;
  return String(data.id);
}

async function updateRun(runId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("agent_runs").update(values).eq("id", runId);
  if (error) throw error;
}

export async function runManagerRiskAlerts(options: { now?: Date; dryRun?: boolean } = {}) {
  const now = options.now ?? new Date();
  console.log("[manager-risk-alert] started", { now: now.toISOString(), dryRun: Boolean(options.dryRun) });
  const playbook = await getEnabledPlaybook();
  if (!playbook) {
    console.log("[manager-risk-alert] skipped: enabled playbook/action not found");
    return { ok: true, skipped: true, reason: "enabled_playbook_not_found" };
  }

  const contextMinutes = Math.max(playbook.context_minutes, playbook.session_ttl_minutes);
  const [kusanoLwUserId, recentLogs, processed] = await Promise.all([
    getKusanoLwUserId(),
    getRecentLogs(contextMinutes, now),
    getProcessedMessageIds(playbook.id, new Date(now.getTime() - 24 * 60 * 60_000).toISOString()),
  ]);
  const roomMap = await getRoomMap(recentLogs.flatMap((log) => log.channel_id ? [log.channel_id] : []));
  const eligibleLogs = recentLogs.filter((log) => Boolean(log.channel_id && isEligibleRoom(roomMap.get(log.channel_id))));
  const cutoff = now.getTime() - playbook.session_ttl_minutes * 60_000;
  const focusLogs = eligibleLogs.filter((log) => (
    toMillis(log.timestamp) <= cutoff
    && !processed.has(log.id)
    && isPotentialRiskMessage(log, kusanoLwUserId)
  ));
  if (focusLogs.length === 0) {
    console.log("[manager-risk-alert] completed: no candidate messages", { recent: recentLogs.length, eligible: eligibleLogs.length });
    return { ok: true, candidates: 0, alerts: 0, sent: 0 };
  }

  const names = await getUserNames(
    eligibleLogs.flatMap((log) => log.user_id ? [log.user_id] : []),
    kusanoLwUserId,
  );
  const packets = buildPackets({
    logs: eligibleLogs,
    focusLogs,
    rooms: roomMap,
    names,
    contextMessageLimit: playbook.context_message_limit,
  });
  const knowledge = await loadKnowledge();
  const focusIds = new Set(focusLogs.map((log) => log.id));
  const triggerById = new Map(focusLogs.map((log) => [log.id, log]));
  const roomByTriggerId = new Map<number, Room>();
  for (const packet of packets) {
    for (const messageId of packet.focusMessageIds) roomByTriggerId.set(messageId, packet.room);
  }

  let runId: string | null = null;
  if (!options.dryRun) runId = await createRun(playbook.id, [...focusIds], packets, knowledge);
  let alerts: RiskAlert[];
  try {
    alerts = (await analyzePackets(packets, knowledge, kusanoLwUserId))
      .filter((alert) => focusIds.has(alert.trigger_message_id))
      .filter((alert, index, values) => values.findIndex((item) => item.trigger_message_id === alert.trigger_message_id) === index);
  } catch (error) {
    if (runId) {
      await updateRun(runId, {
        status: "failed",
        error_code: "manager_risk_analysis_failed",
        error_message: error instanceof Error ? error.message : String(error),
        finished_at: new Date().toISOString(),
      });
    }
    throw error;
  }

  console.log("[manager-risk-alert] analyzed", {
    recent: recentLogs.length,
    eligible: eligibleLogs.length,
    candidates: focusLogs.length,
    packets: packets.length,
    knowledge: knowledge.length,
    alerts: alerts.length,
  });
  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      candidates: focusLogs.length,
      alerts: alerts.length,
      sent: 0,
      results: alerts.map((alert) => ({
        triggerMessageId: alert.trigger_message_id,
        category: alert.category,
        groupName: roomByTriggerId.get(alert.trigger_message_id)?.groupName ?? null,
      })),
    };
  }

  const accessToken = alerts.length > 0 ? await getAccessToken() : null;
  const failedTriggerIds = new Set<number>();
  const sentAlerts: Array<{ triggerMessageId: number; category: string; groupName: string }> = [];
  const failures: Array<{ triggerMessageId: number; error: string }> = [];
  for (const alert of alerts) {
    const trigger = triggerById.get(alert.trigger_message_id);
    const room = roomByTriggerId.get(alert.trigger_message_id);
    if (!trigger || !room || !accessToken) continue;
    try {
      await sendLWBotMessage(MANAGER_CHANNEL_ID, alertText(alert, room, trigger, kusanoLwUserId), accessToken);
      sentAlerts.push({ triggerMessageId: alert.trigger_message_id, category: alert.category, groupName: room.groupName });
    } catch (error) {
      failedTriggerIds.add(alert.trigger_message_id);
      failures.push({
        triggerMessageId: alert.trigger_message_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const processedMessageIds = [...focusIds].filter((id) => !failedTriggerIds.has(id));
  if (runId) {
    await updateRun(runId, {
      status: failures.length > 0 ? "failed" : "succeeded",
      decision_summary: { rule_type: "manager_risk_alert", alert_count: alerts.length },
      output_summary: { processed_message_ids: processedMessageIds, sent_alerts: sentAlerts },
      error_code: failures.length > 0 ? "manager_risk_send_failed" : null,
      error_message: failures.map((failure) => failure.error).join("\n") || null,
      finished_at: new Date().toISOString(),
    });
  }
  console.log("[manager-risk-alert] completed", { candidates: focusLogs.length, alerts: alerts.length, sent: sentAlerts.length, failures: failures.length });
  return { ok: failures.length === 0, candidates: focusLogs.length, alerts: alerts.length, sent: sentAlerts.length, failures };
}
