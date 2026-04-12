//api/dialogflow/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

type PendingRow = {
  id: string;
  session_key: string;
  channel_id: string;
  requester_lw_userid: string | null;
  requester_user_id: string | null;
  target_kaipoke_cs_id: string | null;
  target_shift_id: number | null;
  intent_name: string | null;
  status: string;

  shift_date: string | null;
  start_time: string | null;
  end_time: string | null;
  service_code: string | null;

  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;

  required_staff_count: number | null;
  two_person_work_flg: boolean | null;

  support_type: string | null; // two_person_care / accompany
  is_judo_ido: boolean | null;
  judo_ido: string | null; // "0130" など
  staff_02_role: string | null; // second_caregiver / companion
  staff_03_role: string | null;

  source_message: string | null;
  last_message: string | null;
  confirm_summary: string | null;
  inferred_service_code: string | null;
  inferred_service_reason: string | null;
  mentioned_lw_userids: string[] | null;
  raw_event: unknown;
  raw_dialogflow: unknown;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

type ResolvedStaff = {
  requesterUserId: string | null;
  mentionResolvedUserIds: string[];
  mentionPrimaryUserId: string | null;
};

type DialogflowParams = Record<string, unknown>;

type ResolvedTarget =
  | {
      kind: "client";
      kaipoke_cs_id: string;
      client_name: string | null;
      group_account: string;
    }
  | {
      kind: "staff";
      kaipoke_cs_id: null;
      client_name: null;
      group_account: string;
    }
  | null;

type ShiftRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_date: string | null;
  shift_end_time: string | null;
  service_code: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  required_staff_count: number | null;
  two_person_work_flg: boolean | null;
  staff_01_role_code: string | null;
  staff_02_role_code: string | null;
  staff_03_role_code: string | null;
  judo_ido: string | null;
};

function jsonText(text: string, extraSessionParams?: Record<string, unknown>) {
  return NextResponse.json({
    fulfillment_response: {
      messages: [{ text: { text: [text] } }],
    },
    ...(extraSessionParams
      ? {
          sessionInfo: {
            parameters: extraSessionParams,
          },
        }
      : {}),
  });
}

function normalizeString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s === "null" || s === "undefined" || s === "不明") return null;
  return s;
}

function normalizeBoolean(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = normalizeString(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;
  return null;
}

function normalizeDate(v: unknown): string | null {
  const s = normalizeString(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function normalizeTime(v: unknown): string | null {
  const s = normalizeString(v);
  if (!s) return null;

  const dt = s.match(/T(\d{2}:\d{2})/);
  if (dt) return dt[1];

  const t = s.match(/^(\d{1,2}):(\d{2})/);
  if (t) {
    const hh = String(Number(t[1])).padStart(2, "0");
    return `${hh}:${t[2]}`;
  }

  return null;
}

function hhmmToCompact(v: string | null): string {
  if (!v) return "0000";
  return v.replace(":", "");
}

function compactToDisplayHHMM(v: string | null): string {
  if (!v || v === "0000") return "なし";
  if (/^\d{4}$/.test(v)) return `${v.slice(0, 2)}:${v.slice(2, 4)}`;
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  return v;
}

function normalizeDurationToHHMM(v: unknown): string | null {
  if (v === null || v === undefined) return null;

  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;

    const amount = Number(obj.amount ?? NaN);
    const unit = normalizeString(obj.unit)?.toLowerCase();
    if (!Number.isNaN(amount) && unit) {
      if (unit.includes("hour")) {
        const mins = Math.round(amount * 60);
        const hh = String(Math.floor(mins / 60)).padStart(2, "0");
        const mm = String(mins % 60).padStart(2, "0");
        return `${hh}:${mm}`;
      }
      if (unit.includes("min")) {
        const mins = Math.round(amount);
        const hh = String(Math.floor(mins / 60)).padStart(2, "0");
        const mm = String(mins % 60).padStart(2, "0");
        return `${hh}:${mm}`;
      }
    }
  }

  const s = normalizeString(v);
  if (!s) return null;

  // PT2H / PT1H30M / PT90M
  const isoHours = s.match(/(\d+)H/);
  const isoMins = s.match(/(\d+)M/);
  if (s.startsWith("PT")) {
    const hh = isoHours ? Number(isoHours[1]) : 0;
    const mm = isoMins ? Number(isoMins[1]) : 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  // 02:00
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(":");
    return `${String(Number(h)).padStart(2, "0")}:${m}`;
  }

  // 2時間半 / 1時間30分 / 90分 / 2時間
  const hourMatch = s.match(/(\d+)\s*時間/);
  const minMatch = s.match(/(\d+)\s*分/);
  const hasHalf = s.includes("半");

  if (hourMatch || minMatch || hasHalf) {
    let hh = hourMatch ? Number(hourMatch[1]) : 0;
    let mm = minMatch ? Number(minMatch[1]) : 0;
    if (hasHalf && !minMatch) mm += 30;
    hh += Math.floor(mm / 60);
    mm = mm % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => normalizeString(x))
      .filter((x): x is string => !!x);
  }
  const one = normalizeString(v);
  return one ? [one] : [];
}

function buildSessionKey(channelId: string, requesterLwUserid: string | null) {
  return `${channelId}::${requesterLwUserid ?? "unknown"}`;
}

function requiredMissing(p: {
  targetKaipokeCsId: string | null;
  shiftDate: string | null;
  startTime: string | null;
  endTime: string | null;
  serviceCode: string | null;
  staff01UserId: string | null;
}) {
  const missing: string[] = [];
  if (!p.targetKaipokeCsId) missing.push("利用者");
  if (!p.shiftDate) missing.push("日付");
  if (!p.startTime) missing.push("開始時刻");
  if (!p.endTime) missing.push("終了時刻");
  if (!p.serviceCode) missing.push("サービス種別");
  if (!p.staff01UserId) missing.push("担当者");
  return missing;
}

function supportTypeLabel(v: string | null) {
  if (v === "two_person_care") return "2人介助";
  if (v === "accompany") return "同行";
  return "通常";
}

function buildRolesFromSupportType(supportType: string | null) {
  if (supportType === "two_person_care") {
    return {
      staff02Role: "second_caregiver",
      staff03Role: null as string | null,
      baseRequiredCount: 2,
      twoPersonWorkFlg: true,
    };
  }

  if (supportType === "accompany") {
    return {
      staff02Role: "companion",
      staff03Role: null as string | null,
      baseRequiredCount: 1,
      twoPersonWorkFlg: false,
    };
  }

  return {
    staff02Role: null as string | null,
    staff03Role: null as string | null,
    baseRequiredCount: 1,
    twoPersonWorkFlg: false,
  };
}

async function resolveTargetFromChannel(channelId: string): Promise<ResolvedTarget> {
  const { data, error } = await supabaseAdmin
    .from("group_lw_channel_view")
    .select("group_id, group_name, group_account, group_type, channel_id")
    .eq("channel_id", channelId)
    .maybeSingle();

  if (error || !data?.group_account) return null;

  const groupAccount = String(data.group_account);

  const { data: csRow } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("kaipoke_cs_id, name")
    .eq("kaipoke_cs_id", groupAccount)
    .maybeSingle();

  if (csRow?.kaipoke_cs_id) {
    return {
      kind: "client",
      kaipoke_cs_id: csRow.kaipoke_cs_id,
      client_name: (csRow as { name?: string | null }).name ?? null,
      group_account: groupAccount,
    };
  }

  return {
    kind: "staff",
    kaipoke_cs_id: null,
    client_name: null,
    group_account: groupAccount,
  };
}

async function resolveUserIdFromLwUserid(lwUserid: string | null): Promise<string | null> {
  if (!lwUserid) return null;

  const { data, error } = await supabaseAdmin
    .from("user_entry_united_view_single")
    .select("user_id, lw_userid")
    .eq("lw_userid", lwUserid)
    .maybeSingle();

  if (error || !data?.user_id) return null;
  return String(data.user_id);
}

async function resolveStaffUsers(params: {
  requesterLwUserid: string | null;
  mentionLwUserids: string[];
}): Promise<ResolvedStaff> {
  const mentionResolvedUserIds: string[] = [];

  for (const lwUserid of params.mentionLwUserids.slice(0, 3)) {
    const resolved = await resolveUserIdFromLwUserid(lwUserid);
    if (resolved) mentionResolvedUserIds.push(resolved);
  }

  const requesterUserId = await resolveUserIdFromLwUserid(params.requesterLwUserid);

  return {
    requesterUserId,
    mentionResolvedUserIds,
    mentionPrimaryUserId: mentionResolvedUserIds[0] ?? null,
  };
}

async function getPendingBySessionKey(sessionKey: string): Promise<PendingRow | null> {
  const { data, error } = await supabaseAdmin
    .from("dialogflow_pending_shift_requests")
    .select("*")
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (error) {
    console.error("[dialogflow webhook] getPendingBySessionKey error", error);
    return null;
  }

  return (data as PendingRow | null) ?? null;
}

async function upsertPendingBase(params: {
  sessionKey: string;
  channelId: string;
  requesterLwUserid: string | null;
  requesterUserId: string | null;
  targetKaipokeCsId: string | null;
  mentionLwUserids: string[];
  sourceMessage: string | null;
  rawDialogflow: unknown;
}) {
  const payload = {
    session_key: params.sessionKey,
    channel_id: params.channelId,
    requester_lw_userid: params.requesterLwUserid,
    requester_user_id: params.requesterUserId,
    target_kaipoke_cs_id: params.targetKaipokeCsId,
    mentioned_lw_userids: params.mentionLwUserids,
    last_message: params.sourceMessage,
    source_message: params.sourceMessage,
    raw_dialogflow: params.rawDialogflow,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("dialogflow_pending_shift_requests")
    .upsert(payload, { onConflict: "session_key" })
    .select("*")
    .single();

  if (error) {
    console.error("[dialogflow webhook] upsertPendingBase error", error);
    throw error;
  }

  return data as PendingRow;
}

async function patchPending(sessionKey: string, patch: Record<string, unknown>): Promise<PendingRow> {
  const { data, error } = await supabaseAdmin
    .from("dialogflow_pending_shift_requests")
    .update(patch)
    .eq("session_key", sessionKey)
    .select("*")
    .single();

  if (error) {
    console.error("[dialogflow webhook] patchPending error", error);
    throw error;
  }

  return data as PendingRow;
}

async function inferServiceCode(params: {
  kaipokeCsId: string;
  shiftDate: string;
  startTime: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("shift")
    .select("service_code, shift_start_date, shift_start_time")
    .eq("kaipoke_cs_id", params.kaipokeCsId)
    .not("service_code", "is", null)
    .order("shift_start_date", { ascending: false })
    .order("shift_start_time", { ascending: true })
    .limit(60);

  if (error || !data?.length) return null;

  const startTime = params.startTime.slice(0, 5);

  const exact = data.find((row) => {
    const t = normalizeTime((row as { shift_start_time?: string | null }).shift_start_time ?? null);
    return t === startTime && !!(row as { service_code?: string | null }).service_code;
  });

  if (exact) {
    return {
      service_code: String((exact as { service_code: string }).service_code),
      reason: "過去の同時間帯シフトから推定",
    };
  }

  const latest = data.find((row) => !!(row as { service_code?: string | null }).service_code);
  if (!latest) return null;

  return {
    service_code: String((latest as { service_code: string }).service_code),
    reason: "直近シフトから推定",
  };
}

async function serviceCodeExists(serviceCode: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("shift_service_code")
    .select("service_code")
    .eq("service_code", serviceCode)
    .maybeSingle();

  if (error) return false;
  return !!data?.service_code;
}

async function findShiftByExactKey(params: {
  kaipokeCsId: string | null;
  shiftDate: string | null;
  startTime: string | null;
}): Promise<ShiftRow | null> {
  if (!params.kaipokeCsId || !params.shiftDate || !params.startTime) return null;

  const { data, error } = await supabaseAdmin
    .from("shift")
    .select("*")
    .eq("kaipoke_cs_id", params.kaipokeCsId)
    .eq("shift_start_date", params.shiftDate)
    .eq("shift_start_time", `${params.startTime}:00`)
    .maybeSingle();

  if (!error && data) return data as ShiftRow;

  const { data: data2, error: error2 } = await supabaseAdmin
    .from("shift")
    .select("*")
    .eq("kaipoke_cs_id", params.kaipokeCsId)
    .eq("shift_start_date", params.shiftDate)
    .eq("shift_start_time", params.startTime)
    .maybeSingle();

  if (error2 || !data2) return null;
  return data2 as ShiftRow;
}

async function loadTargetShiftFromPending(pending: PendingRow): Promise<ShiftRow | null> {
  if (pending.target_shift_id) {
    const { data, error } = await supabaseAdmin
      .from("shift")
      .select("*")
      .eq("shift_id", pending.target_shift_id)
      .maybeSingle();

    if (!error && data) return data as ShiftRow;
  }

  return await findShiftByExactKey({
    kaipokeCsId: pending.target_kaipoke_cs_id,
    shiftDate: pending.shift_date,
    startTime: pending.start_time,
  });
}

function extractIntentName(body: Record<string, unknown>): string | null {
  const fulfillmentInfo = body.fulfillmentInfo as Record<string, unknown> | undefined;
  const intentInfo = body.intentInfo as Record<string, unknown> | undefined;

  const tag = normalizeString(fulfillmentInfo?.tag);
  if (tag) return tag;

  const displayName = normalizeString(intentInfo?.displayName);
  if (displayName) return displayName;

  const lastMatchedIntent = normalizeString(intentInfo?.lastMatchedIntent);
  if (lastMatchedIntent) return lastMatchedIntent;

  return null;
}

function extractOriginalText(body: Record<string, unknown>): string | null {
  const texts: string[] = [];

  const text = normalizeString((body as Record<string, unknown>)?.text);
  if (text) texts.push(text);

  const transcript = normalizeString((body as Record<string, unknown>)?.transcript);
  if (transcript) texts.push(transcript);

  const payload = (body.payload ?? body.originalDetectIntentRequest) as Record<string, unknown> | undefined;
  if (payload) {
    const pt = normalizeString(payload.text);
    if (pt) texts.push(pt);
  }

  return texts[0] ?? null;
}

function applyStaffChangeByPosition(params: {
  pending: PendingRow;
  newUserId: string | null;
  staffPosition: string | null;
}) {
  let staff01 = params.pending.staff_01_user_id;
  let staff02 = params.pending.staff_02_user_id;
  let staff03 = params.pending.staff_03_user_id;

  if (params.newUserId) {
    if (params.staffPosition === "second") {
      staff02 = params.newUserId;
    } else if (params.staffPosition === "third") {
      staff03 = params.newUserId;
    } else {
      staff01 = params.newUserId;
    }
  }

  return { staff01, staff02, staff03 };
}

async function buildConfirmSummary(pending: PendingRow) {
  const supportLabel = supportTypeLabel(pending.support_type);
  const judoText = pending.is_judo_ido ? `あり (${compactToDisplayHHMM(pending.judo_ido)})` : "なし";

  const staffLines = [
    `主担当: ${pending.staff_01_user_id ?? "未指定"}`,
    pending.staff_02_user_id
      ? `2人目: ${pending.staff_02_user_id}${pending.staff_02_role ? ` (${pending.staff_02_role})` : ""}`
      : null,
    pending.staff_03_user_id
      ? `3人目: ${pending.staff_03_user_id}${pending.staff_03_role ? ` (${pending.staff_03_role})` : ""}`
      : null,
  ].filter(Boolean);

  const reasonLine =
    pending.inferred_service_code && pending.inferred_service_reason
      ? `\nサービス推定根拠: ${pending.inferred_service_reason}`
      : "";

  return [
    "確認です。",
    `利用者: ${pending.target_kaipoke_cs_id ?? "未指定"}`,
    `日付: ${pending.shift_date ?? "未指定"}`,
    `時間: ${pending.start_time ?? "未指定"}-${pending.end_time ?? "未指定"}`,
    `サービスコード: ${pending.service_code ?? "未指定"}`,
    `体制: ${supportLabel}`,
    `必要人数: ${pending.required_staff_count ?? 1}`,
    `重度移動: ${judoText}`,
    ...staffLines,
    reasonLine ? reasonLine.trimStart() : null,
    "この内容でよいですか？",
  ]
    .filter(Boolean)
    .join("\n");
}

async function finalizeToConfirm(sessionKey: string, patched: PendingRow, messagePrefix?: string) {
  const missing = requiredMissing({
    targetKaipokeCsId: patched.target_kaipoke_cs_id,
    shiftDate: patched.shift_date,
    startTime: patched.start_time,
    endTime: patched.end_time,
    serviceCode: patched.service_code,
    staff01UserId: patched.staff_01_user_id,
  });

  if (missing.length > 0) {
    const extra =
      !patched.service_code && patched.inferred_service_code
        ? `\n参考: サービスコードは ${patched.inferred_service_code} を候補にしています。`
        : "";

    const prefix = messagePrefix ? `${messagePrefix}\n` : "";
    return jsonText(`${prefix}不足項目があります: ${missing.join("、")} を教えてください。${extra}`);
  }

  const summary = await buildConfirmSummary(patched);
  await patchPending(sessionKey, {
    status: "confirming",
    confirm_summary: summary,
  });

  return jsonText(messagePrefix ? `${messagePrefix}\n${summary}` : summary);
}

async function handleCreateShift(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
  resolvedTarget: ResolvedTarget;
  resolvedStaff: ResolvedStaff;
}) {
  const p = params.dialogflowParams;

  const shiftDate = normalizeDate(p.shift_date) ?? params.pending.shift_date ?? null;
  const startTime =
    normalizeTime(p.start_time) ??
    normalizeTime(p.date_time) ??
    params.pending.start_time ??
    null;
  const endTime = normalizeTime(p.end_time) ?? params.pending.end_time ?? null;

  let serviceCode = normalizeString(p.service_code) ?? params.pending.service_code ?? null;

  const supportType = normalizeString(p.support_type) ?? params.pending.support_type ?? null;
  const supportCfg = buildRolesFromSupportType(supportType);

  const isJudoIdo =
    normalizeBoolean(p.is_judo_ido) ??
    params.pending.is_judo_ido ??
    false;

  const normalizedJudo = normalizeDurationToHHMM(p.judo_ido_time);
  const judoIdo = isJudoIdo
    ? hhmmToCompact(normalizedJudo ?? compactToDisplayHHMM(params.pending.judo_ido))
    : "0000";

  const staffPosition = normalizeString(p.staff_position);
  const mentionedUser = params.resolvedStaff.mentionPrimaryUserId ?? params.resolvedStaff.requesterUserId ?? null;
  const changed = applyStaffChangeByPosition({
    pending: params.pending,
    newUserId: mentionedUser,
    staffPosition,
  });

  const staff01 = changed.staff01 ?? params.pending.staff_01_user_id ?? params.resolvedStaff.requesterUserId ?? null;
  const staff02 = changed.staff02 ?? params.pending.staff_02_user_id ?? null;
  const staff03 = changed.staff03 ?? params.pending.staff_03_user_id ?? null;

  let inferredServiceCode: string | null = params.pending.inferred_service_code ?? null;
  let inferredServiceReason: string | null = params.pending.inferred_service_reason ?? null;

  if (!serviceCode && params.resolvedTarget?.kaipoke_cs_id && shiftDate && startTime) {
    const inferred = await inferServiceCode({
      kaipokeCsId: params.resolvedTarget.kaipoke_cs_id,
      shiftDate,
      startTime,
    });
    if (inferred?.service_code) {
      serviceCode = inferred.service_code;
      inferredServiceCode = inferred.service_code;
      inferredServiceReason = inferred.reason;
    }
  }

  if (serviceCode) {
    const exists = await serviceCodeExists(serviceCode);
    if (!exists) {
      serviceCode = null;
    }
  }

  const requiredStaffCount = Math.max(
    supportCfg.baseRequiredCount,
    staff03 ? 3 : staff02 ? 2 : 1
  );

  const patched = await patchPending(params.sessionKey, {
    intent_name: "create_shift",
    status: "collecting",
    target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    service_code: serviceCode,

    staff_01_user_id: staff01,
    staff_02_user_id: staff02,
    staff_03_user_id: staff03,
    staff_02_attend_flg: !!staff02,
    staff_03_attend_flg: !!staff03,

    support_type: supportType,
    required_staff_count: requiredStaffCount,
    two_person_work_flg: supportCfg.twoPersonWorkFlg || !!staff03,
    is_judo_ido: isJudoIdo,
    judo_ido: judoIdo,
    staff_02_role: staff02 ? supportCfg.staff02Role : null,
    staff_03_role: staff03 ? "third_staff" : null,

    inferred_service_code: inferredServiceCode,
    inferred_service_reason: inferredServiceReason,
  });

  if (isJudoIdo && (!normalizedJudo && (!patched.judo_ido || patched.judo_ido === "0000"))) {
    return jsonText("重度移動の時間を教えてください。例: 2時間、1時間半、90分");
  }

  return await finalizeToConfirm(params.sessionKey, patched);
}

async function handleCorrectStaff(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
  resolvedStaff: ResolvedStaff;
}) {
  const staffPosition = normalizeString(params.dialogflowParams.staff_position);
  const newUserId = params.resolvedStaff.mentionPrimaryUserId ?? params.resolvedStaff.requesterUserId ?? null;

  const changed = applyStaffChangeByPosition({
    pending: params.pending,
    newUserId,
    staffPosition,
  });

  const requiredStaffCount = Math.max(
    params.pending.support_type === "two_person_care" ? 2 : 1,
    changed.staff03 ? 3 : changed.staff02 ? 2 : changed.staff01 ? 1 : 0
  );

  const patched = await patchPending(params.sessionKey, {
    staff_01_user_id: changed.staff01,
    staff_02_user_id: changed.staff02,
    staff_03_user_id: changed.staff03,
    staff_02_attend_flg: !!changed.staff02,
    staff_03_attend_flg: !!changed.staff03,
    required_staff_count: requiredStaffCount,
    status: "collecting",
  });

  return await finalizeToConfirm(params.sessionKey, patched, "担当者を変更しました。");
}

async function handleSetSecondStaff(params: {
  sessionKey: string;
  pending: PendingRow;
  resolvedStaff: ResolvedStaff;
}) {
  const secondUserId = params.resolvedStaff.mentionPrimaryUserId;
  if (!secondUserId) {
    return jsonText("2人目のスタッフ名を認識できませんでした。もう一度お願いします。");
  }

  const staff02Role =
    params.pending.support_type === "accompany" ? "companion" : "second_caregiver";

  const patched = await patchPending(params.sessionKey, {
    staff_02_user_id: secondUserId,
    staff_02_attend_flg: true,
    staff_02_role: staff02Role,
    required_staff_count: Math.max(params.pending.required_staff_count ?? 1, 2),
    status: "collecting",
  });

  return await finalizeToConfirm(params.sessionKey, patched, "2人目を設定しました。");
}

async function handleSetThirdStaff(params: {
  sessionKey: string;
  pending: PendingRow;
  resolvedStaff: ResolvedStaff;
}) {
  const thirdUserId = params.resolvedStaff.mentionPrimaryUserId;
  if (!thirdUserId) {
    return jsonText("3人目のスタッフ名を認識できませんでした。もう一度お願いします。");
  }

  const patched = await patchPending(params.sessionKey, {
    staff_03_user_id: thirdUserId,
    staff_03_attend_flg: true,
    staff_03_role: "third_staff",
    required_staff_count: 3,
    status: "collecting",
  });

  return await finalizeToConfirm(params.sessionKey, patched, "3人目を設定しました。");
}

async function handleSetSupportStructure(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
}) {
  const supportType = normalizeString(params.dialogflowParams.support_type);
  if (!supportType) {
    return jsonText("体制を認識できませんでした。2人介助 か 同行 で教えてください。");
  }

  const cfg = buildRolesFromSupportType(supportType);

  const patched = await patchPending(params.sessionKey, {
    support_type: supportType,
    required_staff_count: Math.max(cfg.baseRequiredCount, params.pending.staff_03_user_id ? 3 : params.pending.staff_02_user_id ? 2 : 1),
    two_person_work_flg: cfg.twoPersonWorkFlg || !!params.pending.staff_03_user_id,
    staff_02_role: params.pending.staff_02_user_id ? cfg.staff02Role : null,
    status: "collecting",
  });

  return await finalizeToConfirm(
    params.sessionKey,
    patched,
    `体制を ${supportTypeLabel(supportType)} に設定しました。`
  );
}

async function handleCorrectTime(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
}) {
  const shiftDate = normalizeDate(params.dialogflowParams.shift_date) ?? params.pending.shift_date ?? null;
  const startTime =
    normalizeTime(params.dialogflowParams.start_time) ??
    normalizeTime(params.dialogflowParams.date_time) ??
    params.pending.start_time ??
    null;
  const endTime =
    normalizeTime(params.dialogflowParams.end_time) ??
    params.pending.end_time ??
    null;

  const patched = await patchPending(params.sessionKey, {
    shift_date: shiftDate,
    start_time: startTime,
    end_time: endTime,
    target_shift_id: null,
    status: "collecting",
  });

  return await finalizeToConfirm(params.sessionKey, patched, "日時を変更しました。");
}

async function handleCorrectServiceCode(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
}) {
  const serviceCode = normalizeString(params.dialogflowParams.service_code);

  if (!serviceCode) {
    return jsonText("サービスコードを認識できませんでした。サービスコードを教えてください。");
  }

  const exists = await serviceCodeExists(serviceCode);
  if (!exists) {
    return jsonText(`サービスコード ${serviceCode} は見つかりませんでした。正しいサービスコードを教えてください。`);
  }

  const patched = await patchPending(params.sessionKey, {
    service_code: serviceCode,
    status: "collecting",
  });

  return await finalizeToConfirm(params.sessionKey, patched, "サービスコードを変更しました。");
}

async function ensureTargetShiftForOperation(sessionKey: string, pending: PendingRow) {
  const targetShift = await loadTargetShiftFromPending(pending);
  if (!targetShift) {
    return {
      ok: false as const,
      response: jsonText("対象シフトを特定できませんでした。日付と開始時刻をもう一度教えてください。"),
    };
  }

  const patched = await patchPending(sessionKey, {
    target_shift_id: targetShift.shift_id,
    shift_date: normalizeDate(targetShift.shift_start_date),
    start_time: normalizeTime(targetShift.shift_start_time),
    end_time: normalizeTime(targetShift.shift_end_time),
    service_code: targetShift.service_code,
    staff_01_user_id: targetShift.staff_01_user_id,
    staff_02_user_id: targetShift.staff_02_user_id,
    staff_03_user_id: targetShift.staff_03_user_id,
    staff_02_attend_flg: !!targetShift.staff_02_attend_flg,
    staff_03_attend_flg: !!targetShift.staff_03_attend_flg,
    required_staff_count: targetShift.required_staff_count ?? 1,
    two_person_work_flg: !!targetShift.two_person_work_flg,
    judo_ido: targetShift.judo_ido ?? "0000",
  });

  return {
    ok: true as const,
    patched,
    targetShift,
  };
}

async function handleUpdateShift(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
  resolvedTarget: ResolvedTarget;
  resolvedStaff: ResolvedStaff;
}) {
  const p = params.dialogflowParams;

  const targetDate = normalizeDate(p.shift_date) ?? params.pending.shift_date ?? null;
  const targetStart = normalizeTime(p.start_time) ?? normalizeTime(p.date_time) ?? params.pending.start_time ?? null;

  let pending0 = params.pending;
  if (!pending0.target_shift_id) {
    pending0 = await patchPending(params.sessionKey, {
      intent_name: "update_shift",
      target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
      shift_date: targetDate,
      start_time: targetStart,
      status: "collecting",
    });
  }

  const ensured = await ensureTargetShiftForOperation(params.sessionKey, pending0);
  if (!ensured.ok) return ensured.response;

  const current = ensured.patched;
  const staffPosition = normalizeString(p.staff_position);
  const newMentioned = params.resolvedStaff.mentionPrimaryUserId;
  const changed = newMentioned
    ? applyStaffChangeByPosition({
        pending: current,
        newUserId: newMentioned,
        staffPosition,
      })
    : {
        staff01: current.staff_01_user_id,
        staff02: current.staff_02_user_id,
        staff03: current.staff_03_user_id,
      };

  const newShiftDate = normalizeDate(p.new_shift_date) ?? normalizeDate(p.shift_date) ?? current.shift_date;
  const newStartTime = normalizeTime(p.new_start_time) ?? normalizeTime(p.start_time) ?? current.start_time;
  const newEndTime = normalizeTime(p.new_end_time) ?? normalizeTime(p.end_time) ?? current.end_time;

  const serviceCodeCandidate = normalizeString(p.service_code) ?? current.service_code;
  const serviceCodeExistsFlg = serviceCodeCandidate ? await serviceCodeExists(serviceCodeCandidate) : false;
  const finalServiceCode = serviceCodeCandidate && serviceCodeExistsFlg ? serviceCodeCandidate : current.service_code;

  const supportType = normalizeString(p.support_type) ?? current.support_type;
  const supportCfg = buildRolesFromSupportType(supportType);

  const isJudoIdo = normalizeBoolean(p.is_judo_ido) ?? current.is_judo_ido ?? false;
  const judoHHMM = normalizeDurationToHHMM(p.judo_ido_time);
  const finalJudo = isJudoIdo
    ? hhmmToCompact(judoHHMM ?? compactToDisplayHHMM(current.judo_ido))
    : "0000";

  const patched = await patchPending(params.sessionKey, {
    intent_name: "update_shift",
    status: "confirming",
    support_type: supportType,
    shift_date: newShiftDate,
    start_time: newStartTime,
    end_time: newEndTime,
    service_code: finalServiceCode,
    staff_01_user_id: changed.staff01,
    staff_02_user_id: changed.staff02,
    staff_03_user_id: changed.staff03,
    staff_02_attend_flg: !!changed.staff02,
    staff_03_attend_flg: !!changed.staff03,
    required_staff_count: Math.max(
      supportCfg.baseRequiredCount,
      changed.staff03 ? 3 : changed.staff02 ? 2 : 1
    ),
    two_person_work_flg: supportCfg.twoPersonWorkFlg || !!changed.staff03,
    is_judo_ido: isJudoIdo,
    judo_ido: finalJudo,
    staff_02_role: changed.staff02 ? supportCfg.staff02Role : null,
    staff_03_role: changed.staff03 ? "third_staff" : null,
  });

  const summary = [
    "対象シフトを更新します。",
    `shift_id: ${patched.target_shift_id ?? "未特定"}`,
    `日付: ${patched.shift_date ?? "未指定"}`,
    `時間: ${patched.start_time ?? "未指定"}-${patched.end_time ?? "未指定"}`,
    `サービスコード: ${patched.service_code ?? "未指定"}`,
    `体制: ${supportTypeLabel(patched.support_type)}`,
    `主担当: ${patched.staff_01_user_id ?? "未指定"}`,
    patched.staff_02_user_id ? `2人目: ${patched.staff_02_user_id}` : null,
    patched.staff_03_user_id ? `3人目: ${patched.staff_03_user_id}` : null,
    `重度移動: ${patched.is_judo_ido ? compactToDisplayHHMM(patched.judo_ido) : "なし"}`,
    "この内容で更新しますか？",
  ]
    .filter(Boolean)
    .join("\n");

  await patchPending(params.sessionKey, {
    status: "confirming",
    confirm_summary: summary,
  });

  return jsonText(summary);
}

async function handleDeleteShift(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
  resolvedTarget: ResolvedTarget;
}) {
  const shiftDate = normalizeDate(params.dialogflowParams.shift_date) ?? params.pending.shift_date ?? null;
  const startTime =
    normalizeTime(params.dialogflowParams.start_time) ??
    normalizeTime(params.dialogflowParams.date_time) ??
    params.pending.start_time ??
    null;

  const base = await patchPending(params.sessionKey, {
    intent_name: "delete_shift",
    target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
    shift_date: shiftDate,
    start_time: startTime,
    status: "collecting",
  });

  const ensured = await ensureTargetShiftForOperation(params.sessionKey, base);
  if (!ensured.ok) return ensured.response;

  const patched = ensured.patched;
  const summary = [
    "このシフトを削除します。",
    `shift_id: ${patched.target_shift_id ?? "未特定"}`,
    `日付: ${patched.shift_date ?? "未指定"}`,
    `時間: ${patched.start_time ?? "未指定"}-${patched.end_time ?? "未指定"}`,
    `サービスコード: ${patched.service_code ?? "未指定"}`,
    "この内容で削除しますか？",
  ].join("\n");

  await patchPending(params.sessionKey, {
    status: "confirming",
    confirm_summary: summary,
  });

  return jsonText(summary);
}

async function handleStaffUnavailable(params: {
  sessionKey: string;
  pending: PendingRow;
  dialogflowParams: DialogflowParams;
  resolvedTarget: ResolvedTarget;
  resolvedStaff: ResolvedStaff;
}) {
  const shiftDate = normalizeDate(params.dialogflowParams.shift_date) ?? params.pending.shift_date ?? null;
  const startTime =
    normalizeTime(params.dialogflowParams.start_time) ??
    normalizeTime(params.dialogflowParams.date_time) ??
    params.pending.start_time ??
    null;

  const base = await patchPending(params.sessionKey, {
    intent_name: "staff_unavailable",
    target_kaipoke_cs_id: params.resolvedTarget?.kaipoke_cs_id ?? params.pending.target_kaipoke_cs_id,
    shift_date: shiftDate,
    start_time: startTime,
    status: "collecting",
  });

  const ensured = await ensureTargetShiftForOperation(params.sessionKey, base);
  if (!ensured.ok) return ensured.response;

  const targetShift = ensured.targetShift;
  const requesterUserId = params.resolvedStaff.requesterUserId;

  let staffPosition: "primary" | "second" | "third" | null = null;
  if (requesterUserId && targetShift.staff_01_user_id === requesterUserId) staffPosition = "primary";
  if (requesterUserId && targetShift.staff_02_user_id === requesterUserId) staffPosition = "second";
  if (requesterUserId && targetShift.staff_03_user_id === requesterUserId) staffPosition = "third";

  const summary = [
    "担当不可として記録します。",
    `shift_id: ${targetShift.shift_id}`,
    `日付: ${normalizeDate(targetShift.shift_start_date) ?? "未指定"}`,
    `時間: ${normalizeTime(targetShift.shift_start_time) ?? "未指定"}-${normalizeTime(targetShift.shift_end_time) ?? "未指定"}`,
    `申告者: ${requesterUserId ?? "未特定"}`,
    `該当ポジション: ${staffPosition ?? "未特定"}`,
    "この処理ではサービス自体は削除しません。",
    "この内容でよいですか？",
  ].join("\n");

  const patched = await patchPending(params.sessionKey, {
    intent_name: "staff_unavailable",
    target_shift_id: targetShift.shift_id,
    confirm_summary: summary,
    status: "confirming",
  });

  return jsonText(patched.confirm_summary ?? summary);
}

async function handleConfirmYes(params: { sessionKey: string; pending: PendingRow }) {
  const pending = params.pending;

  if (pending.intent_name === "create_shift") {
    const missing = requiredMissing({
      targetKaipokeCsId: pending.target_kaipoke_cs_id,
      shiftDate: pending.shift_date,
      startTime: pending.start_time,
      endTime: pending.end_time,
      serviceCode: pending.service_code,
      staff01UserId: pending.staff_01_user_id,
    });

    if (missing.length > 0) {
      return jsonText(`まだ不足があります: ${missing.join("、")} を教えてください。`);
    }

    const insertPayload = {
      kaipoke_cs_id: pending.target_kaipoke_cs_id,
      shift_start_date: pending.shift_date,
      shift_start_time: pending.start_time,
      shift_end_date: pending.shift_date,
      shift_end_time: pending.end_time,
      service_code: pending.service_code,
      staff_01_user_id: pending.staff_01_user_id,
      staff_02_user_id: pending.staff_02_user_id,
      staff_03_user_id: pending.staff_03_user_id,
      staff_02_attend_flg: !!pending.staff_02_attend_flg,
      staff_03_attend_flg: !!pending.staff_03_attend_flg,
      required_staff_count: pending.required_staff_count ?? 1,
      two_person_work_flg: !!pending.two_person_work_flg,
      staff_01_role_code: "primary",
      staff_02_role_code: pending.staff_02_role,
      staff_03_role_code: pending.staff_03_role,
      judo_ido: pending.judo_ido ?? "0000",
    };

    const { data, error } = await supabaseAdmin
      .from("shift")
      .insert(insertPayload)
      .select("shift_id")
      .single();

    if (error) {
      console.error("[dialogflow webhook] shift insert error", error);
      return jsonText(`登録に失敗しました。${error.message}`);
    }

    await patchPending(params.sessionKey, {
      status: "completed",
      target_shift_id: data?.shift_id ?? null,
    });

    return jsonText(`登録しました。shift_id=${data?.shift_id ?? "不明"}`);
  }

  if (pending.intent_name === "update_shift") {
    const targetShift = await loadTargetShiftFromPending(pending);
    if (!targetShift) {
      return jsonText("更新対象シフトを特定できませんでした。");
    }

    const updatePayload = {
      shift_start_date: pending.shift_date,
      shift_start_time: pending.start_time,
      shift_end_date: pending.shift_date,
      shift_end_time: pending.end_time,
      service_code: pending.service_code,
      staff_01_user_id: pending.staff_01_user_id,
      staff_02_user_id: pending.staff_02_user_id,
      staff_03_user_id: pending.staff_03_user_id,
      staff_02_attend_flg: !!pending.staff_02_attend_flg,
      staff_03_attend_flg: !!pending.staff_03_attend_flg,
      required_staff_count: pending.required_staff_count ?? 1,
      two_person_work_flg: !!pending.two_person_work_flg,
      staff_01_role_code: "primary",
      staff_02_role_code: pending.staff_02_role,
      staff_03_role_code: pending.staff_03_role,
      judo_ido: pending.judo_ido ?? "0000",
    };

    const { error } = await supabaseAdmin
      .from("shift")
      .update(updatePayload)
      .eq("shift_id", targetShift.shift_id);

    if (error) {
      console.error("[dialogflow webhook] shift update error", error);
      return jsonText(`更新に失敗しました。${error.message}`);
    }

    await patchPending(params.sessionKey, {
      status: "completed",
    });

    return jsonText(`更新しました。shift_id=${targetShift.shift_id}`);
  }

  if (pending.intent_name === "delete_shift") {
    const targetShift = await loadTargetShiftFromPending(pending);
    if (!targetShift) {
      return jsonText("削除対象シフトを特定できませんでした。");
    }

    const { error } = await supabaseAdmin
      .from("shift")
      .delete()
      .eq("shift_id", targetShift.shift_id);

    if (error) {
      console.error("[dialogflow webhook] shift delete error", error);
      return jsonText(`削除に失敗しました。${error.message}`);
    }

    await patchPending(params.sessionKey, {
      status: "completed",
    });

    return jsonText(`削除しました。shift_id=${targetShift.shift_id}`);
  }

  if (pending.intent_name === "staff_unavailable") {
    const targetShift = await loadTargetShiftFromPending(pending);
    if (!targetShift) {
      return jsonText("対象シフトを特定できませんでした。");
    }

    const requesterUserId = pending.requester_user_id;
    let patch: Record<string, unknown> = {};

    if (requesterUserId && targetShift.staff_01_user_id === requesterUserId) {
      patch = {
        staff_01_user_id: null,
      };
    } else if (requesterUserId && targetShift.staff_02_user_id === requesterUserId) {
      patch = {
        staff_02_user_id: null,
        staff_02_attend_flg: false,
      };
    } else if (requesterUserId && targetShift.staff_03_user_id === requesterUserId) {
      patch = {
        staff_03_user_id: null,
        staff_03_attend_flg: false,
      };
    } else {
      return jsonText("申告者が対象シフトの担当者として見つかりませんでした。");
    }

    const { error } = await supabaseAdmin
      .from("shift")
      .update(patch)
      .eq("shift_id", targetShift.shift_id);

    if (error) {
      console.error("[dialogflow webhook] staff unavailable update error", error);
      return jsonText(`担当不可の反映に失敗しました。${error.message}`);
    }

    await patchPending(params.sessionKey, {
      status: "completed",
    });

    return jsonText(`担当不可として反映しました。shift_id=${targetShift.shift_id}`);
  }

  return jsonText("現在、確定できる処理がありません。");
}

async function handleConfirmNo(params: { sessionKey: string }) {
  await patchPending(params.sessionKey, {
    status: "cancelled",
  });

  return jsonText("この依頼は取り消しました。");
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get("x-dialogflow-secret");
    if (secret !== process.env.DIALOGFLOW_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const intentName = extractIntentName(body);
    const dialogflowParams = ((body.sessionInfo as Record<string, unknown> | undefined)?.parameters ?? {}) as DialogflowParams;

    const channelId = normalizeString(dialogflowParams.channel_id);
    const requesterLwUserid = normalizeString(dialogflowParams.requester_lw_userid);
    const mentionLwUserids = asStringArray(dialogflowParams.mention_lw_userids);
    const sourceMessage =
      normalizeString(dialogflowParams.original_message) ??
      extractOriginalText(body);

    if (!channelId) {
      return jsonText("channel_id が取得できませんでした。");
    }

    const sessionKey = buildSessionKey(channelId, requesterLwUserid);
    const resolvedTarget = await resolveTargetFromChannel(channelId);
    const resolvedStaff = await resolveStaffUsers({
      requesterLwUserid,
      mentionLwUserids,
    });

    const currentPending = await getPendingBySessionKey(sessionKey);

    const pending = currentPending
      ? await patchPending(sessionKey, {
          last_message: sourceMessage,
          raw_dialogflow: body,
          mentioned_lw_userids: mentionLwUserids,
        })
      : await upsertPendingBase({
          sessionKey,
          channelId,
          requesterLwUserid,
          requesterUserId: resolvedStaff.requesterUserId,
          targetKaipokeCsId: resolvedTarget?.kaipoke_cs_id ?? null,
          mentionLwUserids,
          sourceMessage,
          rawDialogflow: body,
        });

    if (!resolvedTarget?.kaipoke_cs_id) {
      return jsonText("このグループから利用者を特定できませんでした。");
    }

    switch (intentName) {
      case "create_shift":
        return await handleCreateShift({
          sessionKey,
          pending,
          dialogflowParams,
          resolvedTarget,
          resolvedStaff,
        });

      case "update_shift":
        return await handleUpdateShift({
          sessionKey,
          pending,
          dialogflowParams,
          resolvedTarget,
          resolvedStaff,
        });

      case "delete_shift":
        return await handleDeleteShift({
          sessionKey,
          pending,
          dialogflowParams,
          resolvedTarget,
        });

      case "staff_unavailable":
        return await handleStaffUnavailable({
          sessionKey,
          pending,
          dialogflowParams,
          resolvedTarget,
          resolvedStaff,
        });

      case "correct_staff":
        return await handleCorrectStaff({
          sessionKey,
          pending,
          dialogflowParams,
          resolvedStaff,
        });

      case "correct_time":
        return await handleCorrectTime({
          sessionKey,
          pending,
          dialogflowParams,
        });

      case "correct_service_code":
        return await handleCorrectServiceCode({
          sessionKey,
          pending,
          dialogflowParams,
        });

      case "set_second_staff":
        return await handleSetSecondStaff({
          sessionKey,
          pending,
          resolvedStaff,
        });

      case "set_third_staff":
        return await handleSetThirdStaff({
          sessionKey,
          pending,
          resolvedStaff,
        });

      case "set_support_structure":
        return await handleSetSupportStructure({
          sessionKey,
          pending,
          dialogflowParams,
        });

      case "confirm_yes":
        return await handleConfirmYes({
          sessionKey,
          pending,
        });

      case "confirm_no":
        return await handleConfirmNo({
          sessionKey,
        });

      default:
        return jsonText(
          "内容を理解できませんでした。シフト追加・修正・削除・担当変更・確認のいずれかとして入力してください。"
        );
    }
  } catch (error) {
    console.error("[dialogflow webhook] unexpected error", error);
    return jsonText("処理中にエラーが発生しました。");
  }
}