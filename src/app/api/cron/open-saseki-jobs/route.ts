import { NextRequest, NextResponse } from "next/server";
import { assertCronAuth } from "@/lib/cron/auth";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_NAME = "open-saseki-jobs";
const REQUESTER_ID = "7ed354ed-5363-4721-a056-e58c39f8f9d7";
const APPROVER_ID = REQUESTER_ID;
const ACTION = "auto-open-saseki-jobs";
const SETTING_KEY = "saseki";
const OFFICE_NAME = "ファミーユヘルパーサービス愛知（金山）";
const TEMPLATE_NAME = "サービス提供責任者 急成長の訪問介護のオペレーションリーダー";
const ACTIVE_STATUSES = ["waiting_approval", "approved", "running", "done"];

type JsonRecord = Record<string, unknown>;
type SasekiTemplate = { core_id: string; kaiteku_offer_id: string | null; ucare_offer_id: string | null };
type RpaRequest = { id: string; status: string; request_details: JsonRecord | null };

function json(body: unknown, status = 200) { return NextResponse.json(body, { status }); }

function formatJstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

function getTargetWeek(now = new Date()) {
  const today = formatJstDate(now);
  const dateIn14Days = addDays(today, 14);
  const weekday = new Date(`${dateIn14Days}T12:00:00Z`).getUTCDay();
  const targetWeekFrom = addDays(dateIn14Days, weekday === 0 ? -6 : 1 - weekday);
  const targetDates = Array.from({ length: 7 }, (_, index) => addDays(targetWeekFrom, index));
  return { targetWeekFrom, targetWeekTo: targetDates[6], targetDates };
}

function makeOperationKey(provider: "kaitek" | "ucare", targetWeekFrom: string) {
  return `auto-open-saseki:${provider}:${targetWeekFrom}:${SETTING_KEY}`;
}

async function getTemplate(): Promise<SasekiTemplate | null> {
  const { data, error } = await supabaseAdmin.from("spot_offer_template_unified")
    .select("core_id, kaiteku_offer_id, ucare_offer_id")
    .eq("template_title", TEMPLATE_NAME)
    .eq("matching_place_name", OFFICE_NAME)
    .maybeSingle();
  if (error) throw new Error(`サ責候補テンプレートの取得に失敗しました: ${error.message}`);
  return data as SasekiTemplate | null;
}

async function findExisting(operationKey: string): Promise<RpaRequest | null> {
  const { data, error } = await supabaseAdmin.from("rpa_command_requests")
    .select("id, status, request_details")
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`既存RPAリクエストの確認に失敗しました: ${error.message}`);
  return ((data ?? []) as RpaRequest[]).find((row) => row.request_details?.operationKey === operationKey) ?? null;
}

async function createRequest(provider: "kaitek" | "ucare", recruitingId: string, targetWeek: ReturnType<typeof getTargetWeek>) {
  const requestedAt = new Date().toISOString();
  const operationKey = makeOperationKey(provider, targetWeek.targetWeekFrom);
  const status = process.env.SASEKI_RPA_AUTO_APPROVE === "1" ? "approved" : "waiting_approval";
  const requestDetails = {
    action: ACTION, provider, operationKey,
    targetWeekFrom: targetWeek.targetWeekFrom, targetWeekTo: targetWeek.targetWeekTo,
    targetDates: targetWeek.targetDates, officeName: OFFICE_NAME, templateName: TEMPLATE_NAME,
    recruitingId, visibility: "general",
  };
  const resultDetails = {
    provider, operationKey, requestedDates: targetWeek.targetDates,
    completedDates: [], failedDates: [], issuedIds: [], published: false, completedAt: null,
  };
  const { data, error } = await supabaseAdmin.from("rpa_command_requests").insert({
    template_id: null, requester_id: REQUESTER_ID, approver_id: APPROVER_ID,
    status, approved_at: status === "approved" ? requestedAt : null, requested_at: requestedAt,
    request_details: requestDetails, result_details: resultDetails,
  }).select("id, status").single();
  if (error) throw new Error(`${provider}のRPAリクエスト作成に失敗しました: ${error.message}`);
  return data;
}

export async function GET(req: NextRequest) {
  const startedAt = new Date().toISOString();
  try {
    assertCronAuth(req);
    if (process.env.SASEKI_RPA_ENABLED !== "1") return json({ ok: true, skipped: true, reason: "SASEKI_RPA_ENABLED is not 1" });

    const dryRun = ["1", "true"].includes(req.nextUrl.searchParams.get("dry_run") ?? "");
    const targetWeek = getTargetWeek();
    const template = await getTemplate();
    const plans = [
      {
        provider: "kaitek" as const,
        recruitingId: process.env.SASEKI_KAITEKU_RECRUITING_ID?.trim() || template?.kaiteku_offer_id || "",
      },
      {
        provider: "ucare" as const,
        recruitingId: process.env.SASEKI_UCARE_RECRUITING_ID?.trim() || template?.ucare_offer_id || "",
      },
    ];
    const results: JsonRecord[] = [];
    for (const plan of plans) {
      const operationKey = makeOperationKey(plan.provider, targetWeek.targetWeekFrom);
      if (!plan.recruitingId) {
        results.push({ provider: plan.provider, operationKey, action: "skipped", reason: "recruiting_id_not_configured" });
        continue;
      }
      const existing = await findExisting(operationKey);
      if (existing) { results.push({ provider: plan.provider, operationKey, action: "skipped", reason: "duplicate", requestId: existing.id, status: existing.status }); continue; }
      if (dryRun) { results.push({ provider: plan.provider, operationKey, action: "dry_run", status: process.env.SASEKI_RPA_AUTO_APPROVE === "1" ? "approved" : "waiting_approval" }); continue; }
      const created = await createRequest(plan.provider, plan.recruitingId, targetWeek);
      results.push({ provider: plan.provider, operationKey, action: "created", requestId: created.id, status: created.status });
    }
    return json({ ok: true, dryRun, targetWeek, results, published: false, startedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "Unauthorized") return json({ ok: false, error: message }, 401);
    console.error(`[${CRON_NAME}] failed`, error);
    return json({ ok: false, error: message, startedAt }, 500);
  }
}
