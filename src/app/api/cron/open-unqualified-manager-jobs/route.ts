import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * タイミー募集（無資格マネージャー）
 */
const RPA_COMMAND_TEMPLATE_ID =
  "160b2b7f-f816-4713-bc76-f89fec654911";

/**
 * 求人の固定条件
 */
const JOB_START_TIME = "11:00:00";
const JOB_END_TIME = "13:00:00";
const HEADCOUNT = 3;

/**
 * RPAリクエスト内で使用する識別子
 *
 * PAD側では、この値で通常のタイミー募集と切り分けます。
 */
const ACTION = "open_unqualified_manager_job";
const COMMAND = "create_job";
const JOB_TYPE = "unqualified_manager";
const EXECUTION_MODE = "test";

/**
 * このCron APIの識別子
 */
const CREATED_FROM =
  "/api/cron/open-unqualified-manager-jobs";

/**
 * JSONレスポンス
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

/**
 * YYYY-MM-DD形式に変換します。
 *
 * UTC日時から日付を切り出すのではなく、
 * 日本時間として受け取った年月日を明示的に組み立てます。
 */
function formatDate(
  year: number,
  month: number,
  day: number
): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

/**
 * 現在の日本時間を取得します。
 */
function getNowJstParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

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
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekdayMap[values.weekday] ?? -1,
  };
}

/**
 * 日付に指定日数を加算します。
 *
 * UTCの正午を基準にすることで、
 * タイムゾーン境界による日付ずれを避けます。
 */
function addDaysToDate(
  year: number,
  month: number,
  day: number,
  daysToAdd: number
) {
  const date = new Date(
    Date.UTC(year, month - 1, day + daysToAdd, 12, 0, 0)
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * Cron実行日に対する次回開催日を返します。
 *
 * 月曜日に実行:
 *   3日後の木曜日
 *
 * 木曜日に実行:
 *   4日後の月曜日
 */
function getNextEventDate() {
  const nowJst = getNowJstParts();

  let daysToAdd: number;

  if (nowJst.weekday === 1) {
    // 月曜日 → 次の木曜日
    daysToAdd = 3;
  } else if (nowJst.weekday === 4) {
    // 木曜日 → 次の月曜日
    daysToAdd = 4;
  } else {
    return {
      ok: false as const,
      reason: "not_target_weekday",
      nowJst,
    };
  }

  const nextDate = addDaysToDate(
    nowJst.year,
    nowJst.month,
    nowJst.day,
    daysToAdd
  );

  return {
    ok: true as const,
    nowJst,
    shiftStartDate: formatDate(
      nextDate.year,
      nextDate.month,
      nextDate.day
    ),
  };
}

/**
 * Cron認証
 *
 * Vercel Cronは、CRON_SECRETが設定されている場合、
 * Authorization: Bearer <CRON_SECRET>
 * を付与して呼び出します。
 *
 * 開発環境ではCRON_SECRET未設定でも実行可能です。
 */
function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = req.headers.get("authorization");

  return authorization === `Bearer ${cronSecret}`;
}

/**
 * request_details内の文字列をPostgRESTのJSON検索で使うため、
 * ダブルクォートなどを安全にします。
 */


/**
 * 同一開催日のリクエストが既に存在するか確認します。
 *
 * pending:
 *   PAD処理待ち
 *
 * processing:
 *   PAD処理中
 *
 * done:
 *   処理完了済み
 *
 * testで失敗したリクエストを再実行できるように、
 * failedは重複判定から除外しています。
 */
async function findExistingRequest(
  shiftStartDate: string
) {
  

  const { data, error } = await supabaseAdmin
    .from("rpa_command_requests")
    .select("id, status, created_at, request_details")

    .eq(
      "rpa_command_template_id",
      RPA_COMMAND_TEMPLATE_ID
    )
    .in("status", ["pending", "processing", "done"])
    .contains("request_details", {
  action: ACTION,
  shift_start_date: shiftStartDate,
  shift_start_time: JOB_START_TIME,
  shift_end_time: JOB_END_TIME,
})
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `既存RPAリクエストの確認に失敗しました: ${error.message}`
    );
  }

  return data;
}

/**
 * RPAリクエストを作成します。
 */
async function createRpaRequest(
  shiftStartDate: string
) {
  const requestDetails = {
    action: ACTION,
    command: COMMAND,

    /**
     * 現在はテスト実行です。
     *
     * PAD側でこの値を確認し、
     * テスト用の処理に分岐してください。
     *
     * 本番移行時は "production" などに変更します。
     */
    execution_mode: EXECUTION_MODE,

    /**
     * PAD側の処理切り分け用
     */
    job_type: JOB_TYPE,

    /**
     * 募集人数
     *
     * PAD側では固定値を使用せず、
     * このheadcountをタイミーの募集人数へ設定します。
     */
    headcount: HEADCOUNT,
    headcount_type: "fixed_cron_headcount",
    headcount_source:
      "open_unqualified_manager_jobs_cron",

    shift_start_date: shiftStartDate,
    shift_start_time: JOB_START_TIME,
    shift_end_time: JOB_END_TIME,

    created_from: CREATED_FROM,

    /**
     * 調査用情報
     */
    requested_at: new Date().toISOString(),
    timezone: "Asia/Tokyo",
  };

  const { data, error } = await supabaseAdmin
    .from("rpa_command_requests")
    .insert({
      rpa_command_template_id:
        RPA_COMMAND_TEMPLATE_ID,

      /**
       * DB側のstatusはpendingにします。
       *
       * ここをtestにすると、PADがpendingのみを
       * 取得している場合に処理されません。
       */
      status: "pending",

      request_details: requestDetails,
    })
    .select(
  "id, status, created_at, rpa_command_template_id, request_details"
)
    .single();

  if (error) {
    throw new Error(
      `RPAリクエストの作成に失敗しました: ${error.message}`
    );
  }

  return data;
}

/**
 * Cron本体
 */
async function handler(req: NextRequest) {
  const startedAt = new Date().toISOString();

  console.info("[open-unqualified-manager-jobs] start", {
    startedAt,
  });

  try {
    if (!isAuthorized(req)) {
      console.warn(
        "[open-unqualified-manager-jobs] unauthorized"
      );

      return json(
        {
          ok: false,
          message: "Unauthorized",
        },
        401
      );
    }

    const nextEvent = getNextEventDate();

    /**
     * vercel.jsonでは月・木のみ実行しますが、
     * 手動実行や設定ミスに備えてAPI側でも曜日を確認します。
     */
    if (!nextEvent.ok) {
      console.info(
        "[open-unqualified-manager-jobs] skipped",
        {
          reason: nextEvent.reason,
          nowJst: nextEvent.nowJst,
        }
      );

      return json({
        ok: true,
        skipped: true,
        reason: nextEvent.reason,
        message:
          "本日は対象曜日ではないため、処理をスキップしました。",
        now_jst: nextEvent.nowJst,
      });
    }

    const { nowJst, shiftStartDate } = nextEvent;

    console.info(
      "[open-unqualified-manager-jobs] target",
      {
        nowJst,
        shiftStartDate,
        shiftStartTime: JOB_START_TIME,
        shiftEndTime: JOB_END_TIME,
        headcount: HEADCOUNT,
        executionMode: EXECUTION_MODE,
      }
    );

    /**
     * 重複登録防止
     */
    const existingRequest =
      await findExistingRequest(shiftStartDate);

    if (existingRequest) {
      console.info(
        "[open-unqualified-manager-jobs] duplicate skipped",
        {
          existingRequestId:
            existingRequest.id,
          existingStatus:
            existingRequest.status,
          shiftStartDate,
        }
      );

      return json({
        ok: true,
        skipped: true,
        reason: "already_exists",
        message:
          "同じ開催日のRPAリクエストが既に存在するため、作成をスキップしました。",
        target: {
          shift_start_date: shiftStartDate,
          shift_start_time: JOB_START_TIME,
          shift_end_time: JOB_END_TIME,
          headcount: HEADCOUNT,
        },
        existing_request: {
          id: existingRequest.id,
          status: existingRequest.status,
          created_at:
            existingRequest.created_at,
        },
      });
    }

    const createdRequest =
      await createRpaRequest(shiftStartDate);

    console.info(
      "[open-unqualified-manager-jobs] created",
      {
        requestId: createdRequest.id,
        status: createdRequest.status,
        shiftStartDate,
      }
    );

    return json({
      ok: true,
      skipped: false,
      message:
        "タイミー募集用のRPAリクエストを作成しました。",
      request: createdRequest,
      target: {
        shift_start_date: shiftStartDate,
        shift_start_time: JOB_START_TIME,
        shift_end_time: JOB_END_TIME,
        headcount: HEADCOUNT,
        execution_mode: EXECUTION_MODE,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "不明なエラーが発生しました。";

    console.error(
      "[open-unqualified-manager-jobs] failed",
      error
    );

    return json(
      {
        ok: false,
        message,
        started_at: startedAt,
        failed_at: new Date().toISOString(),
      },
      500
    );
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}