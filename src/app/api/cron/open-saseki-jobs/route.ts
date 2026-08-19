import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_NAME = "open-saseki-jobs";
const CREATED_FROM = "/api/cron/open-saseki-jobs";
const ACTION = "create_saseki_job";
const COMMAND = "create_job";
const REQUESTER_ID = "7ed354ed-5363-4721-a056-e58c39f8f9d7";
const APPROVER_ID = REQUESTER_ID;

type JsonRecord = Record<string, unknown>;

type ShiftRow = {
  shift_id: number;
  kaipoke_cs_id: string | null;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  service_code: string | null;
};

type TemplateRow = JsonRecord & {
  core_id: string;
  kaipoke_cs_id: string | null;
  kaiteku_offer_id: string | null;
  ucare_offer_id: string | null;
  required_licenses: string[] | null;
  requires_license: boolean | null;
};

type RequestRow = {
  id: string;
  status: string;
  created_at: string | null;
  request_details: JsonRecord;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function jstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdays[values.weekday] ?? -1,
  };
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return value.toISOString().slice(0, 10);
}

function getTargetWeek() {
  const now = jstDateParts();
  const today = `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`;
  // 実行日の属する週の次々週。月曜始まりで、実行日から概ね2週間後。
  const monday = addDays(today, -now.weekday + 14);
  return { today, start: monday, end: addDays(monday, 6) };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isSasekiTemplate(template: TemplateRow) {
  const licenses = (template.required_licenses ?? []).map(text).join(" ");
  const label = [template.internal_label, template.template_title, template.work_description]
    .map(text)
    .join(" ");
  return /サ責|サービス提供責任者|サービス提供責任者等/.test(`${licenses} ${label}`);
}

function platformOfferIds(template: TemplateRow) {
  return [
    { platform: "kaiteku", offerId: text(template.kaiteku_offer_id) },
    { platform: "ucare", offerId: text(template.ucare_offer_id) },
  ].filter((item) => item.offerId);
}

async function findExistingRequests(start: string, end: string) {
  const { data, error } = await supabaseAdmin
    .from("rpa_command_requests")
    .select("id, status, created_at, request_details")
    .in("status", ["waiting_approval", "approved", "running", "done"])
    // 対象週は未来日なので、shift の日付を created_at の条件に使わない。
    // 期間条件は request_details の target_week_* を下の JS 側で確認する。
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`既存RPAリクエストの確認に失敗しました: ${error.message}`);
  return ((data ?? []) as RequestRow[]).filter((row) => {
    const details = row.request_details ?? {};
    return details.action === ACTION &&
      details.target_week_start === start &&
      details.target_week_end === end;
  });
}

async function createRequest(
  shift: ShiftRow,
  template: TemplateRow,
  platform: "kaiteku" | "ucare",
  offerId: string,
  targetWeek: { start: string; end: string },
) {
  const requestedAt = new Date().toISOString();
  const details: JsonRecord = {
    action: ACTION,
    command: COMMAND,
    platform,
    offer_id: offerId,
    core_id: template.core_id,
    kaipoke_cs_id: shift.kaipoke_cs_id,
    shift_id: shift.shift_id,
    shift_start_date: shift.shift_start_date,
    shift_start_time: shift.shift_start_time,
    shift_end_time: shift.shift_end_time,
    service_code: shift.service_code,
    target_week_start: targetWeek.start,
    target_week_end: targetWeek.end,
    template_title: template.template_title ?? null,
    work_description: template.work_description ?? null,
    work_address: template.work_address ?? null,
    salary: template.salary ?? null,
    required_licenses: template.required_licenses ?? null,
    created_from: CREATED_FROM,
    requested_at: requestedAt,
    requester_user_id: "junkusano",
  };

  const { data, error } = await supabaseAdmin
    .from("rpa_command_requests")
    .insert({
      template_id: null,
      requester_id: REQUESTER_ID,
      approver_id: APPROVER_ID,
      status: "waiting_approval",
      requested_at: requestedAt,
      request_details: details,
    })
    .select("id, status, created_at, request_details")
    .single();
  if (error) throw new Error(`RPAリクエストの作成に失敗しました: ${error.message}`);
  return data as RequestRow;
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    if (!isAuthorized(req)) return json({ ok: false, error: "Unauthorized" }, 401);

    const targetWeek = getTargetWeek();
    const dryRun = req.nextUrl.searchParams.get("dry_run") === "true";

    const { data: shifts, error: shiftError } = await supabaseAdmin
      .from("shift")
      .select("shift_id, kaipoke_cs_id, shift_start_date, shift_start_time, shift_end_time, service_code")
      .gte("shift_start_date", targetWeek.start)
      .lte("shift_start_date", targetWeek.end)
      .order("shift_start_date")
      .order("shift_start_time");
    if (shiftError) throw new Error(`対象シフトの取得に失敗しました: ${shiftError.message}`);

    const { data: rawTemplates, error: templateError } = await supabaseAdmin
      .from("spot_offer_template_unified")
      .select("*");
    if (templateError) throw new Error(`求人テンプレートの取得に失敗しました: ${templateError.message}`);

    const templates = (rawTemplates ?? []) as TemplateRow[];
    const candidates = templates.filter((template) =>
      template.requires_license !== false && isSasekiTemplate(template) && platformOfferIds(template).length > 0
    );
    const existing = await findExistingRequests(targetWeek.start, targetWeek.end);
    const existingKeys = new Set(existing.map((row) => {
      const d = row.request_details ?? {};
      return `${d.shift_id}|${d.platform}|${d.offer_id}`;
    }));
    const results: Array<JsonRecord> = [];

    for (const shift of (shifts ?? []) as ShiftRow[]) {
      const matching = candidates.filter((template) => template.kaipoke_cs_id === shift.kaipoke_cs_id);
      for (const template of matching) {
        for (const { platform, offerId } of platformOfferIds(template)) {
          const key = `${shift.shift_id}|${platform}|${offerId}`;
          if (existingKeys.has(key)) {
            results.push({ shift_id: shift.shift_id, platform, offer_id: offerId, action: "skipped", reason: "duplicate" });
            continue;
          }
          if (dryRun) {
            results.push({ shift_id: shift.shift_id, platform, offer_id: offerId, action: "dry_run" });
            continue;
          }
          const request = await createRequest(shift, template, platform as "kaiteku" | "ucare", offerId, targetWeek);
          existingKeys.add(key);
          results.push({ shift_id: shift.shift_id, platform, offer_id: offerId, action: "created", request_id: request.id, status: request.status });
        }
      }
    }

    return json({ ok: true, dry_run: dryRun, target_week: targetWeek, shift_count: shifts?.length ?? 0, candidate_template_count: candidates.length, results, started_at: startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${CRON_NAME}] failed`, error);
    return json({ ok: false, error: message, started_at: startedAt }, 500);
  }
}
