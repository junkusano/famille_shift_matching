import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateRequestBody = {
  id?: unknown;
  offer_id?: unknown;
  work_weekday?: unknown;
  work_start_time?: unknown;
  work_end_time?: unknown;
  open_weekday?: unknown;
  open_time?: unknown;
  hourly_wage?: unknown;
  headcount?: unknown;
  environment?: unknown;
  is_enabled?: unknown;
};

const SELECT_COLUMNS = `
  id,
  setting_key,
  setting_name,
  offer_id,
  work_weekday,
  work_start_time,
  work_end_time,
  open_weekday,
  open_time,
  hourly_wage,
  headcount,
  environment,
  is_enabled,
  created_at,
  updated_at
`;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  const match = trimmed.match(
    /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );

  if (!match) {
    return null;
  }

  const [, hour, minute, second = "00"] = match;

  return `${hour}:${minute}:${second}`;
}

function parseWeekday(value: unknown): number | null {
  const weekday = Number(value);

  if (
    !Number.isInteger(weekday) ||
    weekday < 0 ||
    weekday > 6
  ) {
    return null;
  }

  return weekday;
}

function parsePositiveInteger(
  value: unknown
): number | null {
  const numberValue = Number(value);

  if (
    !Number.isInteger(numberValue) ||
    numberValue <= 0
  ) {
    return null;
  }

  return numberValue;
}

/**
 * タイミー求人設定一覧
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("taimee_job_settings")
      .select(SELECT_COLUMNS)
      .order("setting_name", {
        ascending: true,
      });

    if (error) {
      console.error(
        "[taimee-job-settings] GET failed",
        error
      );

      return json(
        {
          ok: false,
          message:
            "タイミー求人設定の取得に失敗しました。",
          detail: error.message,
        },
        500
      );
    }

    return json({
      ok: true,
      settings: data ?? [],
    });
  } catch (error) {
    console.error(
      "[taimee-job-settings] GET unexpected error",
      error
    );

    return json(
      {
        ok: false,
        message:
          "タイミー求人設定の取得中にエラーが発生しました。",
      },
      500
    );
  }
}

/**
 * タイミー求人設定更新
 */
export async function PATCH(req: NextRequest) {
  try {
    let body: UpdateRequestBody;

    try {
      body =
        (await req.json()) as UpdateRequestBody;
    } catch {
      return json(
        {
          ok: false,
          message:
            "リクエストのJSONが正しくありません。",
        },
        400
      );
    }

    const id =
      typeof body.id === "string"
        ? body.id.trim()
        : "";

    if (!isUuid(id)) {
      return json(
        {
          ok: false,
          message:
            "更新対象の設定IDが正しくありません。",
        },
        400
      );
    }

    const offerId =
      typeof body.offer_id === "string"
        ? body.offer_id.trim()
        : "";

    if (!isUuid(offerId)) {
      return json(
        {
          ok: false,
          message:
            "オファーIDにはUUIDを入力してください。",
        },
        400
      );
    }

    const workWeekday = parseWeekday(
      body.work_weekday
    );

    if (workWeekday === null) {
      return json(
        {
          ok: false,
          message:
            "開催曜日が正しくありません。",
        },
        400
      );
    }

    const openWeekday = parseWeekday(
      body.open_weekday
    );

    if (openWeekday === null) {
      return json(
        {
          ok: false,
          message:
            "オープン曜日が正しくありません。",
        },
        400
      );
    }

    const workStartTime = normalizeTime(
      body.work_start_time
    );

    if (!workStartTime) {
      return json(
        {
          ok: false,
          message:
            "求人開始時間が正しくありません。",
        },
        400
      );
    }

    const workEndTime = normalizeTime(
      body.work_end_time
    );

    if (!workEndTime) {
      return json(
        {
          ok: false,
          message:
            "求人終了時間が正しくありません。",
        },
        400
      );
    }

    if (workStartTime >= workEndTime) {
      return json(
        {
          ok: false,
          message:
            "求人終了時間は開始時間より後にしてください。",
        },
        400
      );
    }

    const openTime = normalizeTime(
      body.open_time
    );

    if (!openTime) {
      return json(
        {
          ok: false,
          message:
            "オープン時間が正しくありません。",
        },
        400
      );
    }

    const hourlyWage = parsePositiveInteger(
      body.hourly_wage
    );

    if (hourlyWage === null) {
      return json(
        {
          ok: false,
          message:
            "時給は1円以上の整数で入力してください。",
        },
        400
      );
    }

    const headcount = parsePositiveInteger(
      body.headcount
    );

    if (headcount === null) {
      return json(
        {
          ok: false,
          message:
            "募集人数は1人以上の整数で入力してください。",
        },
        400
      );
    }

    const environment =
      typeof body.environment === "string"
        ? body.environment.trim()
        : "";

    if (
      environment !== "test" &&
      environment !== "production"
    ) {
      return json(
        {
          ok: false,
          message:
            "実行環境はtestまたはproductionを指定してください。",
        },
        400
      );
    }

    if (
      typeof body.is_enabled !== "boolean"
    ) {
      return json(
        {
          ok: false,
          message:
            "有効状態が正しくありません。",
        },
        400
      );
    }

    const updateValues = {
      offer_id: offerId,
      work_weekday: workWeekday,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      open_weekday: openWeekday,
      open_time: openTime,
      hourly_wage: hourlyWage,
      headcount,
      environment,
      is_enabled: body.is_enabled,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("taimee_job_settings")
      .update(updateValues)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error(
        "[taimee-job-settings] PATCH failed",
        {
          id,
          error,
        }
      );

      return json(
        {
          ok: false,
          message:
            "タイミー求人設定の更新に失敗しました。",
          detail: error.message,
        },
        500
      );
    }

    if (!data) {
      return json(
        {
          ok: false,
          message:
            "更新対象の設定が見つかりません。",
        },
        404
      );
    }

    return json({
      ok: true,
      message: "設定を保存しました。",
      setting: data,
    });
  } catch (error) {
    console.error(
      "[taimee-job-settings] PATCH unexpected error",
      error
    );

    return json(
      {
        ok: false,
        message:
          "タイミー求人設定の更新中にエラーが発生しました。",
      },
      500
    );
  }
}