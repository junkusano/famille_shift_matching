import { NextRequest, NextResponse } from "next/server";
import { isRpaTaimeeError, requireTaimeeRpaOperator } from "@/lib/rpa/taimee";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = Record<string, unknown>;

type Candidate = {
  title: string;
  workplace_summary: string;
  work_date: string;
  start_time: string;
  end_time: string;
  hourly_wage: number;
  commute_fee: number;
  headcount: 1;
  reason: string;
  taimee_listing_status: "not_listed";
};

const MERGEABLE_SERVICE_CODES = new Set([
  "家事", "身体", "身１生２・Ⅱ", "訪問型独自サービス１３", "通院(伴う)", "通院(伴ず)",
  "移：必要不可欠な外出", "移：必要不可欠な外出（片道支援）", "移：その他の外出", "同行(初任者等)", "新しいサービス",
]);

function jstDateString(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

function timeMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function normalizeTime(value: unknown): string | null {
  const minutes = timeMinutes(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function workplaceSummary(value: unknown): string | null {
  const address = text(value).replace(/[\s\u3000]+/g, "");
  if (!address) return null;
  const prefecture = address.match(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/)?.[0] ?? "";
  const municipality = address.slice(prefecture.length).match(/^(.+?[市区町村])/u)?.[1] ?? "";
  return [prefecture, municipality].filter(Boolean).join(" ") || null;
}

function templateReady(template: Row): boolean {
  const startMinutes = timeMinutes(template.start_at);
  const endMinutes = timeMinutes(template.end_at);
  return text(template.status) === "active"
    && Boolean(text(template.timee_offer_id))
    && Boolean(text(template.template_title))
    && Boolean(text(template.kaipoke_cs_id))
    && Boolean(text(template.meeting_place))
    && Boolean(text(template.meeting_place_banchi))
    && Boolean(text(template.matching_place_name))
    && Boolean(text(template.matching_msg))
    && normalizeTime(template.start_at) !== null
    && normalizeTime(template.end_at) !== null
    && startMinutes !== null
    && endMinutes !== null
    && endMinutes > startMinutes
    && positiveNumber(template.unit_amount) !== null
    && nonNegativeNumber(template.commute_fee) !== null
    && workplaceSummary(template.work_address ?? template.meeting_place) !== null;
}

function selectNearestTemplate(templates: Row[], startTime: string): Row | null {
  const targetMinutes = timeMinutes(startTime);
  if (targetMinutes === null) return null;
  return [...templates].filter(templateReady).sort((a, b) =>
    Math.abs((timeMinutes(a.start_at) ?? 0) - targetMinutes)
      - Math.abs((timeMinutes(b.start_at) ?? 0) - targetMinutes))[0] ?? null;
}

function templateDuration(template: Row): number {
  const start = timeMinutes(template.start_at) ?? 0;
  const end = timeMinutes(template.end_at) ?? start + 60;
  return Math.max(end - start, 60);
}

function plannedEnd(shift: Row, template: Row): string | null {
  const start = timeMinutes(shift.shift_start_time);
  const end = timeMinutes(shift.shift_end_time);
  const duration = start !== null && end !== null && end > start ? end - start : null;
  if (duration !== null && duration >= 60 && duration <= 360) return normalizeTime(shift.shift_end_time);
  const fallback = (start ?? 0) + templateDuration(template);
  if (fallback >= 24 * 60) return null;
  return `${String(Math.floor(fallback / 60)).padStart(2, "0")}:${String(fallback % 60).padStart(2, "0")}`;
}

function syntheticTestCandidates(targetDate: string): Candidate[] {
  return [{
    title: "訪問介護（テスト用）",
    workplace_summary: "愛知県 春日井市（テストデータ）",
    work_date: targetDate,
    start_time: "09:00",
    end_time: "10:30",
    hourly_wage: 1300,
    commute_fee: 200,
    headcount: 1,
    reason: "テスト表示用の架空候補です。実データ・掲載状態とは接続していません。",
    taimee_listing_status: "not_listed",
  }];
}

function testEnvironment(): boolean {
  // Preview・ローカル環境は固定の架空データだけを返し、実案件DBを読みません。
  return process.env.VERCEL_ENV !== "production" || process.env.NODE_ENV !== "production";
}

function candidateFor(shift: Row, template: Row, targetDate: string): Candidate | null {
  const start = normalizeTime(shift.shift_start_time);
  const end = plannedEnd(shift, template);
  const area = workplaceSummary(template.work_address ?? template.meeting_place);
  const wage = positiveNumber(template.unit_amount);
  const commute = nonNegativeNumber(template.commute_fee);
  const service = text(shift.service_code);
  if (!start || !end || !area || wage === null || commute === null || !service) return null;
  return {
    // テンプレート見出しや利用者名は画面に出さず、シフトのサービス区分から表示名を作ります。
    title: `訪問介護（${service}）`,
    workplace_summary: area,
    work_date: targetDate,
    start_time: start,
    end_time: end,
    hourly_wage: wage,
    commute_fee: commute,
    headcount: 1,
    reason: "管理者配置があり、既存の募集・確定・掲載記録がなく、有効なタイミー用テンプレートと勤務条件が揃っています。",
    taimee_listing_status: "not_listed",
  };
}

async function getCandidates(targetDate: string): Promise<Candidate[]> {
  const { data: shifts, error: shiftError } = await supabaseAdmin
    .from("shift_shift_record_view2")
    .select("shift_id, shift_start_date, shift_start_time, shift_end_time, kaipoke_cs_id, service_code, staff_01_user_id, staff_02_user_id")
    .eq("shift_start_date", targetDate);
  if (shiftError) throw shiftError;
  const shiftRows = (shifts ?? []) as unknown as Row[];
  if (!shiftRows.length) return [];

  const staffIds = [...new Set(shiftRows.flatMap((shift) => [shift.staff_01_user_id, shift.staff_02_user_id])
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  const roleByUser = new Map<string, string>();
  if (staffIds.length) {
    const { data: roles, error: roleError } = await supabaseAdmin
      .from("user_entry_united_view_single")
      .select("user_id, system_role")
      .in("user_id", staffIds);
    if (roleError) throw roleError;
    for (const role of roles ?? []) {
      if (typeof role.user_id === "string") roleByUser.set(role.user_id, String(role.system_role ?? ""));
    }
  }

  const shiftIds = shiftRows.map((shift) => shift.shift_id).filter((id): id is number => typeof id === "number");
  const { data: requests, error: requestError } = shiftIds.length
    ? await supabaseAdmin.from("spot_offer_request_table")
        .select("shift_id, status, taimee_job_id, recruitment_paused")
        .in("shift_id", shiftIds)
    : { data: [], error: null };
  if (requestError) throw requestError;
  const requestByShift = new Map<number, Row>((requests ?? []).flatMap((row) =>
    typeof row.shift_id === "number" ? [[row.shift_id, row as Row]] : []));

  const clientIds = [...new Set(shiftRows.map((shift) => shift.kaipoke_cs_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))];
  const { data: templates, error: templateError } = clientIds.length
    ? await supabaseAdmin.from("spot_offer_template_unified")
        .select("core_id, kaipoke_cs_id, template_title, work_address, meeting_place, meeting_place_banchi, matching_place_name, matching_msg, start_at, end_at, unit_amount, commute_fee, timee_offer_id, status")
        .in("kaipoke_cs_id", clientIds)
        .eq("status", "active")
    : { data: [], error: null };
  if (templateError) throw templateError;

  const templatesByClient = new Map<string, Row[]>();
  for (const template of templates ?? []) {
    if (typeof template.kaipoke_cs_id !== "string" || !templateReady(template as Row)) continue;
    const list = templatesByClient.get(template.kaipoke_cs_id) ?? [];
    list.push(template as Row);
    templatesByClient.set(template.kaipoke_cs_id, list);
  }

  const candidates: Candidate[] = [];
  const skippedShiftIds = new Set<number>();
  const orderedShifts = [...shiftRows].sort((a, b) =>
    (timeMinutes(a.shift_start_time) ?? 0) - (timeMinutes(b.shift_start_time) ?? 0));

  for (const shift of orderedShifts) {
    const shiftId = typeof shift.shift_id === "number" ? shift.shift_id : null;
    if (shiftId === null || skippedShiftIds.has(shiftId)) continue;

    const shiftRoleIds = [shift.staff_01_user_id, shift.staff_02_user_id]
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const hasManager = shiftRoleIds.some((id) => ["manager", "admin"].includes((roleByUser.get(id) ?? "").toLowerCase()));
    if (!hasManager) continue;

    const request = requestByShift.get(shiftId);
    // 共通募集状態は既存依頼・充足の重複防止にだけ使い、Timee掲載状態の表示には使いません。
    if (request?.status === "募集中" || request?.status === "確定" || request?.recruitment_paused === true) continue;
    // Timeeの掲載有無はTimee専用IDだけで判定します。
    if (typeof request?.taimee_job_id === "string" && request.taimee_job_id.trim()) continue;

    const clientId = typeof shift.kaipoke_cs_id === "string" ? shift.kaipoke_cs_id : "";
    const clientTemplates = templatesByClient.get(clientId) ?? [];
    const serviceCode = text(shift.service_code);
    const selectedTemplate = selectNearestTemplate(clientTemplates, text(shift.shift_start_time));
    if (!selectedTemplate) continue;

    const currentEnd = timeMinutes(shift.shift_end_time);
    let adjacent: Row | undefined;
    if (currentEnd !== null && MERGEABLE_SERVICE_CODES.has(serviceCode)) {
      adjacent = orderedShifts.find((other) => {
        if (other.shift_id === shiftId || skippedShiftIds.has(Number(other.shift_id))) return false;
        if (other.kaipoke_cs_id !== shift.kaipoke_cs_id || other.shift_start_date !== shift.shift_start_date) return false;
        if (!MERGEABLE_SERVICE_CODES.has(text(other.service_code))) return false;
        const nextStart = timeMinutes(other.shift_start_time);
        const gap = nextStart === null ? -1 : nextStart - currentEnd;
        return gap >= 0 && gap <= 120;
      });
    }

    const contiguous = adjacent && text(adjacent.shift_start_time) === text(shift.shift_end_time);
    const candidate = candidateFor(shift, selectedTemplate, targetDate);
    if (!candidate) continue;
    if (contiguous && adjacent) {
      const mergedEnd = normalizeTime(adjacent.shift_end_time);
      if (mergedEnd) candidate.end_time = mergedEnd;
      if (typeof adjacent.shift_id === "number") skippedShiftIds.add(adjacent.shift_id);
    } else if (adjacent && typeof adjacent.shift_id === "number") {
      // 連続でない2時間以内の次シフトは、現行自動化と同じく別募集しません。
      skippedShiftIds.add(adjacent.shift_id);
    }
    candidates.push(candidate);
  }

  return candidates;
}

export async function GET(request: NextRequest) {
  try {
    await requireTaimeeRpaOperator(request);
    const today = jstDateString();
    const requestedDate = request.nextUrl.searchParams.get("target_date") ?? addDays(today, 7);
    if (!isValidDate(requestedDate) || requestedDate < today) {
      return NextResponse.json({ ok: false, error: "未来の対象日を指定してください。" }, { status: 400 });
    }

    const isTest = testEnvironment();
    const candidates = isTest ? syntheticTestCandidates(requestedDate) : await getCandidates(requestedDate);
    return NextResponse.json({
      ok: true,
      read_only: true,
      data_mode: isTest ? "test_fixture" : "production",
      target_date: requestedDate,
      count: candidates.length,
      candidates,
    });
  } catch (error) {
    if (isRpaTaimeeError(error)) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    // DB errors may contain queried values; keep logs and response free of candidate details.
    console.error("[rpa/taimee/candidates] read failed");
    return NextResponse.json({ ok: false, error: "タイミー掲載候補を取得できませんでした。再読み込みしてください。" }, { status: 500 });
  }
}
