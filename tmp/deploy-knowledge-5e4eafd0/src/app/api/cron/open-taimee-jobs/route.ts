import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CRON_NAME = "open-taimee-jobs";

const CREATED_FROM =
  "/api/cron/open-taimee-jobs";

const REQUESTER_ID =
  "7ed354ed-5363-4721-a056-e58c39f8f9d7";

const APPROVER_ID =
  "7ed354ed-5363-4721-a056-e58c39f8f9d7";

type JsonRecord = Record<string, unknown>;

type TaimeeJobSetting = {
  id: string;
  setting_key: string;
  setting_name: string;
  offer_id: string;
  work_start_time: string;
  work_end_time: string;
  hourly_wage: number;
  headcount: number;
  environment: string;
  is_enabled: boolean;
};

type TaimeeJobSchedule = {
  id: string;
  job_setting_id: string;
  schedule_name: string;
  open_weekday: number;
  open_time: string;
  work_weekday: number;
  is_enabled: boolean;
  setting: TaimeeJobSetting;
};

type RpaRequestRow = {
  id: string;
  template_id: string | null;
  status: string | null;
  created_at: string | null;
  request_details: JsonRecord | null;
};

type ProcessResult = {
  scheduleId: string;
  scheduleName: string;
  settingKey: string;
  settingName: string;
  targetDate: string;
  status:
    | "created"
    | "duplicate"
    | "skipped"
    | "failed";
  requestId?: string;
  message?: string;
};

function json(
  body: unknown,
  status = 200
) {
  return NextResponse.json(body, {
    status,
  });
}

function isAuthorized(
  req: NextRequest
): boolean {
  const cronSecret =
    process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    console.error(
      `[${CRON_NAME}] CRON_SECRET is not configured`
    );

    return false;
  }

  const authorization =
    req.headers.get("authorization");

  return (
    authorization ===
    `Bearer ${cronSecret}`
  );
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

function toText(
  value: unknown
): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function normalizeTime(
  value: string
): string {
  return value.slice(0, 5);
}

function getJstNowParts(
  date = new Date()
) {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(date);

  const getValue = (
    type: Intl.DateTimeFormatPartTypes
  ) =>
    parts.find(
      (part) => part.type === type
    )?.value ?? "";

  const weekdayMap: Record<
    string,
    number
  > = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const year = Number(
    getValue("year")
  );

  const month = Number(
    getValue("month")
  );

  const day = Number(
    getValue("day")
  );

  const hour = Number(
    getValue("hour")
  );

  const minute = Number(
    getValue("minute")
  );

  const weekday =
    weekdayMap[
      getValue("weekday")
    ] ?? -1;

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    time: `${String(
      hour
    ).padStart(2, "0")}:${String(
      minute
    ).padStart(2, "0")}`,
    date: `${String(
      year
    ).padStart(4, "0")}-${String(
      month
    ).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`,
  };
}

function getTargetDate(
  current: ReturnType<
    typeof getJstNowParts
  >,
  workWeekday: number
): string {
  let daysToAdd =
    (workWeekday -
      current.weekday +
      7) %
    7;

  /*
   * 同じ曜日を指定した場合は、
   * 次週の同じ曜日とします。
   */
  if (daysToAdd === 0) {
    daysToAdd = 7;
  }

  const date = new Date(
    Date.UTC(
      current.year,
      current.month - 1,
      current.day
    )
  );

  date.setUTCDate(
    date.getUTCDate() +
      daysToAdd
  );

  return date
    .toISOString()
    .slice(0, 10);
}

async function getMatchingSchedules(
  weekday: number,
  currentTime: string
): Promise<
  TaimeeJobSchedule[]
> {
  const { data, error } =
    await supabaseAdmin
      .from(
        "taimee_job_schedules"
      )
      .select(
        `
          id,
          job_setting_id,
          schedule_name,
          open_weekday,
          open_time,
          work_weekday,
          is_enabled,
          setting:taimee_job_settings!inner (
            id,
            setting_key,
            setting_name,
            offer_id,
            work_start_time,
            work_end_time,
            hourly_wage,
            headcount,
            environment,
            is_enabled
          )
        `
      )
      .eq("is_enabled", true)
      .eq(
        "open_weekday",
        weekday
      )
      .eq(
        "taimee_job_settings.is_enabled",
        true
      );

  if (error) {
    throw new Error(
      `求人スケジュールの取得に失敗しました: ${error.message}`
    );
  }

  const rows =
    (data ?? []) as unknown as
      TaimeeJobSchedule[];

  return rows.filter(
    (schedule) =>
      normalizeTime(
        schedule.open_time
      ) === currentTime
  );
}

function isSameRequest(
  row: RpaRequestRow,
  setting: TaimeeJobSetting,
  targetDate: string
): boolean {
  if (
    !isRecord(
      row.request_details
    )
  ) {
    return false;
  }

  const details =
    row.request_details;

  return (
    row.template_id ===
      setting.offer_id &&
    toText(details.action) ===
      "create_taimee_job" &&
    toText(details.command) ===
      "create_job" &&
    toText(
      details.target_date
    ) === targetDate &&
    toText(
      details.job_setting_key
    ) === setting.setting_key
  );
}

async function findExistingRequest(
  setting: TaimeeJobSetting,
  targetDate: string
): Promise<
  RpaRequestRow | null
> {
  const createdAfter =
    new Date();

  createdAfter.setUTCDate(
    createdAfter.getUTCDate() -
      14
  );

  const { data, error } =
    await supabaseAdmin
      .from(
        "rpa_command_requests"
      )
      .select(
        `
          id,
          template_id,
          status,
          created_at,
          request_details
        `
      )
      .eq(
        "template_id",
        setting.offer_id
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
        setting,
        targetDate
      )
    ) ?? null
  );
}

async function createRpaRequest(
  schedule: TaimeeJobSchedule,
  targetDate: string
): Promise<RpaRequestRow> {
  const setting =
    schedule.setting;

  const requestedAt =
    new Date().toISOString();

  const requestDetails = {
    action:
      "create_taimee_job",
    command: "create_job",

    target_date: targetDate,
    shift_start_date:
      targetDate,
    shift_start_time:
      setting.work_start_time,
    shift_end_time:
      setting.work_end_time,

    hourly_wage:
      setting.hourly_wage,
    headcount:
      setting.headcount,

    execution_mode:
      setting.environment,

    job_setting_id:
      setting.id,
    job_setting_key:
      setting.setting_key,

    schedule_id:
      schedule.id,
    schedule_name:
      schedule.schedule_name,

    template_name:
      setting.setting_name,

    requester_user_id:
      "junkusano",

    created_from:
      CREATED_FROM,
    requested_at:
      requestedAt,
  };

  const { data, error } =
    await supabaseAdmin
      .from(
        "rpa_command_requests"
      )
      .insert({
        template_id:
          setting.offer_id,
        requester_id:
          REQUESTER_ID,
        approver_id:
          APPROVER_ID,
        status: "approved",
        approved_at:
          requestedAt,
        request_details:
          requestDetails,
      })
      .select(
        `
          id,
          template_id,
          status,
          created_at,
          request_details
        `
      )
      .single();

  if (error) {
    throw new Error(
      `RPAリクエストの作成に失敗しました: ${error.message}`
    );
  }

  return data as RpaRequestRow;
}

async function processSchedule(
  schedule: TaimeeJobSchedule,
  current: ReturnType<
    typeof getJstNowParts
  >
): Promise<ProcessResult> {
  const setting =
    schedule.setting;

  const targetDate =
    getTargetDate(
      current,
      schedule.work_weekday
    );

  try {
    const existing =
      await findExistingRequest(
        setting,
        targetDate
      );

    if (existing) {
      console.log(
        `[${CRON_NAME}] duplicate`,
        {
          scheduleId:
            schedule.id,
          settingKey:
            setting.setting_key,
          targetDate,
          existingRequestId:
            existing.id,
          existingStatus:
            existing.status,
        }
      );

      return {
        scheduleId:
          schedule.id,
        scheduleName:
          schedule.schedule_name,
        settingKey:
          setting.setting_key,
        settingName:
          setting.setting_name,
        targetDate,
        status: "duplicate",
        requestId: existing.id,
        message:
          "同じ開催日のRPAリクエストが既に存在します。",
      };
    }

    const created =
      await createRpaRequest(
        schedule,
        targetDate
      );

    console.log(
      `[${CRON_NAME}] created`,
      {
        scheduleId:
          schedule.id,
        settingKey:
          setting.setting_key,
        targetDate,
        requestId:
          created.id,
      }
    );

    return {
      scheduleId:
        schedule.id,
      scheduleName:
        schedule.schedule_name,
      settingKey:
        setting.setting_key,
      settingName:
        setting.setting_name,
      targetDate,
      status: "created",
      requestId: created.id,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "不明なエラーが発生しました。";

    console.error(
      `[${CRON_NAME}] schedule failed`,
      {
        scheduleId:
          schedule.id,
        settingKey:
          setting.setting_key,
        targetDate,
        error,
      }
    );

    return {
      scheduleId:
        schedule.id,
      scheduleName:
        schedule.schedule_name,
      settingKey:
        setting.setting_key,
      settingName:
        setting.setting_name,
      targetDate,
      status: "failed",
      message,
    };
  }
}

export async function GET(
  req: NextRequest
) {
  try {
    if (!isAuthorized(req)) {
      return json(
        {
          ok: false,
          error: "Unauthorized",
        },
        401
      );
    }

    const current =
      getJstNowParts();

    const force =
      req.nextUrl.searchParams.get(
        "force"
      ) === "true";

    const forceWeekdayText =
      req.nextUrl.searchParams.get(
        "weekday"
      );

    const forceTime =
      req.nextUrl.searchParams.get(
        "time"
      );

    const targetWeekday =
      force &&
      forceWeekdayText !== null
        ? Number(
            forceWeekdayText
          )
        : current.weekday;

    const targetTime =
      force && forceTime
        ? forceTime.slice(0, 5)
        : current.time;

    if (
      !Number.isInteger(
        targetWeekday
      ) ||
      targetWeekday < 0 ||
      targetWeekday > 6
    ) {
      return json(
        {
          ok: false,
          error:
            "weekdayは0から6で指定してください。",
        },
        400
      );
    }

    if (
      !/^\d{2}:\d{2}$/.test(
        targetTime
      )
    ) {
      return json(
        {
          ok: false,
          error:
            "timeはHH:mm形式で指定してください。",
        },
        400
      );
    }

    console.log(
      `[${CRON_NAME}] start`,
      {
        currentJstDate:
          current.date,
        currentJstWeekday:
          current.weekday,
        currentJstTime:
          current.time,
        targetWeekday,
        targetTime,
        force,
      }
    );

    const schedules =
      await getMatchingSchedules(
        targetWeekday,
        targetTime
      );

    if (
      schedules.length === 0
    ) {
      return json({
        ok: true,
        skipped: true,
        reason:
          "no_matching_schedule",
        currentJst: {
          date: current.date,
          weekday:
            current.weekday,
          time: current.time,
        },
        matchedWeekday:
          targetWeekday,
        matchedTime:
          targetTime,
        results: [],
      });
    }

    const results =
      await Promise.all(
        schedules.map(
          (schedule) =>
            processSchedule(
              schedule,
              current
            )
        )
      );

    const createdCount =
      results.filter(
        (result) =>
          result.status ===
          "created"
      ).length;

    const duplicateCount =
      results.filter(
        (result) =>
          result.status ===
          "duplicate"
      ).length;

    const failedCount =
      results.filter(
        (result) =>
          result.status ===
          "failed"
      ).length;

    return json(
      {
        ok: failedCount === 0,
        skipped: false,
        currentJst: {
          date: current.date,
          weekday:
            current.weekday,
          time: current.time,
        },
        matchedWeekday:
          targetWeekday,
        matchedTime:
          targetTime,
        summary: {
          matched:
            schedules.length,
          created:
            createdCount,
          duplicate:
            duplicateCount,
          failed:
            failedCount,
        },
        results,
      },
      failedCount > 0
        ? 500
        : 200
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "不明なエラーが発生しました。";

    console.error(
      `[${CRON_NAME}] failed`,
      error
    );

    return json(
      {
        ok: false,
        error: message,
      },
      500
    );
  }
}