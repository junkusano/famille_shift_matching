// src/app/api/cron/open-unqualified-taimee-jobs/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_NAME = "open-unqualified-taimee-jobs";

const CREATED_FROM =
  "/api/cron/open-unqualified-taimee-jobs";

const REQUESTER_ID =
  "7ed354ed-5363-4721-a056-e58c39f8f9d7";

const APPROVER_ID =
  "7ed354ed-5363-4721-a056-e58c39f8f9d7";

const JOB_SETTING_KEY = "unqualified_taimee";

type TaimeeJobSetting = {
  id: string;
  setting_key: string;
  setting_name: string;
  offer_id: string;
  work_weekday: number;
  work_start_time: string;
  work_end_time: string;
  open_weekday: number;
  open_time: string;
  hourly_wage: number;
  headcount: number;
  environment: string;
  is_enabled: boolean;
};

async function getJobSetting(): Promise<TaimeeJobSetting> {
  const { data, error } = await supabaseAdmin
    .from("taimee_job_settings")
    .select("*")
    .eq("setting_key", JOB_SETTING_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("タイミー求人設定が見つかりません。");
  }

  return data as TaimeeJobSetting;
}

type JsonRecord = Record<string, unknown>;

type RpaRequestRow = {
  id: string;
  template_id: string | null;
  status: string | null;
  created_at: string | null;
  request_details: JsonRecord | null;
};

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      `[${CRON_NAME}] CRON_SECRET is not configured`
    );

    return false;
  }

  const authorization =
    req.headers.get("authorization");

  return authorization === `Bearer ${cronSecret}`;
}

function getJstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }
  );

  const parts = formatter.formatToParts(date);

  const getValue = (
    type: Intl.DateTimeFormatPartTypes
  ) =>
    parts.find((part) => part.type === type)
      ?.value ?? "";

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(getValue("year")),
    month: Number(getValue("month")),
    day: Number(getValue("day")),
    weekday:
      weekdayMap[getValue("weekday")] ?? -1,
  };
}

function getJstDateWithOffset(
  daysToAdd: number
): string {
  const parts = getJstDateParts();

  const date = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day
    )
  );

  date.setUTCDate(
    date.getUTCDate() + daysToAdd
  );

  return date.toISOString().slice(0, 10);
}

function getTodayJst(): string {
  return getJstDateWithOffset(0);
}

function getTomorrowJst(): string {
  return getJstDateWithOffset(1);
}

/**
 * 日曜日～木曜日だけ通常実行します。
 *
 * 日曜日 → 月曜日分
 * 月曜日 → 火曜日分
 * 火曜日 → 水曜日分
 * 水曜日 → 木曜日分
 * 木曜日 → 金曜日分
 */
function isExecutionDayJst(): boolean {
  const { weekday } = getJstDateParts();

  return weekday >= 0 && weekday <= 4;
}

function isRecord(
  value: unknown
): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function isSameRequest(
  row: RpaRequestRow,
  targetDate: string,
  setting: TaimeeJobSetting
): boolean {
  if (!isRecord(row.request_details)) {
    return false;
  }

  const details = row.request_details;

  const action = toText(details["action"]);
  const command = toText(details["command"]);
  const requestTargetDate =
    toText(details["target_date"]);
  const templateId = row.template_id ?? "";

  return (
    action === "create_taimee_job" &&
    command === "create_job" &&
    requestTargetDate === targetDate &&
    templateId === setting.offer_id
  );
}

async function findExistingRequest(
  targetDate: string,
  setting: TaimeeJobSetting
): Promise<RpaRequestRow | null> {
  const createdAfter = new Date();

  createdAfter.setUTCDate(
    createdAfter.getUTCDate() - 7
  );

  const { data, error } =
    await supabaseAdmin
      .from("rpa_command_requests")
      .select(
        "id, template_id, status, created_at, request_details"
      )
      .in("status", [
        "waiting_approval",
        "approved",
        "running",
        "done",
      ])
      .gte(
        "created_at",
        createdAfter.toISOString()
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(500);

  if (error) {
    throw new Error(
      `既存リクエストの確認に失敗しました: ${error.message}`
    );
  }

const rows =
  (data ?? []) as RpaRequestRow[];

return (
  rows.find((row) =>
    isSameRequest(
      row,
      targetDate,
      setting
    )
  ) ?? null
);
}

async function createRpaRequest(
  targetDate: string,
  setting: TaimeeJobSetting
): Promise<RpaRequestRow> {
  const requestedAt = new Date().toISOString();

  const requestDetails = {
    action: "create_taimee_job",
    command: "create_job",

    target_date: targetDate,
    shift_start_date: targetDate,
    shift_start_time: setting.work_start_time,
    shift_end_time: setting.work_end_time,

    hourly_wage: setting.hourly_wage,
    headcount: setting.headcount,
    execution_mode: setting.environment,
    job_setting_key: setting.setting_key,
    job_setting_id: setting.id,

    template_name: setting.setting_name,
    requester_user_id: "junkusano",
    created_from: CREATED_FROM,
    requested_at: requestedAt,
  };

  const { data, error } = await supabaseAdmin
    .from("rpa_command_requests")
    .insert({
      template_id: setting.offer_id,
      requester_id: REQUESTER_ID,
      approver_id: APPROVER_ID,
      status: "approved",
      approved_at: requestedAt,
      request_details: requestDetails,
    })
    .select(
      "id, template_id, status, created_at, request_details"
    )
    .single();

  if (error) {
    throw new Error(
      `RPAリクエストの作成に失敗しました: ${error.message}`
    );
  }

  return data as RpaRequestRow;
}

export async function GET(
  req: NextRequest
) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const setting = await getJobSetting();

if (!setting.is_enabled) {
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "setting_disabled",
  });
}

    const todayJst = getTodayJst();
    const targetDate = getTomorrowJst();

    const force =
      req.nextUrl.searchParams.get("force") ===
      "true";

    console.log(`[${CRON_NAME}] start`, {
      todayJst,
      targetDate,
      force,
    });

    if (!force && !isExecutionDayJst()) {
      console.log(
        `[${CRON_NAME}] skipped: not execution day`
      );

      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_execution_day",
        todayJst,
        targetDate,
      });
    }

    const existingRequest =
      await findExistingRequest(
  targetDate,
  setting
);

    if (existingRequest) {
      console.log(
        `[${CRON_NAME}] skipped: duplicate`,
        {
          id: existingRequest.id,
          status: existingRequest.status,
          targetDate,
        }
      );

      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "duplicate_request",
        targetDate,
        existingRequest: {
          id: existingRequest.id,
          status: existingRequest.status,
          createdAt:
            existingRequest.created_at,
        },
      });
    }

    const createdRequest =
  await createRpaRequest(
    targetDate,
    setting
  );

console.log(
  `[${CRON_NAME}] request created`,
  {
    id: createdRequest.id,
    status: createdRequest.status,
    targetDate,
    settingKey: setting.setting_key,
    templateName: setting.setting_name,
    shiftStartTime:
      setting.work_start_time,
    shiftEndTime:
      setting.work_end_time,
    hourlyWage:
      setting.hourly_wage,
    headcount:
      setting.headcount,
    executionMode:
      setting.environment,
  }
);

return NextResponse.json({
  ok: true,
  skipped: false,
  message:
    "翌日分のタイミー募集RPAリクエストを作成しました。",
  targetDate,
  settingKey: setting.setting_key,
  templateName: setting.setting_name,
  shiftStartTime:
    setting.work_start_time,
  shiftEndTime:
    setting.work_end_time,
  hourlyWage:
    setting.hourly_wage,
  headcount:
    setting.headcount,
  executionMode:
    setting.environment,
  request: {
    id: createdRequest.id,
    status: createdRequest.status,
    createdAt:
      createdRequest.created_at,
  },
});

  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "不明なエラーが発生しました。";

    console.error(
      `[${CRON_NAME}] failed`,
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}