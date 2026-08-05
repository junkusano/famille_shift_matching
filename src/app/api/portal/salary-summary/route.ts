//src/app/api/portal/salary-summary/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SalaryShiftRow = {
  shift_id: number | string;
  shift_start_date: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  estimated_pay_amount: number | string | null;
};

type CancelStatusRow = {
  shift_id: number | string;
  cancel_value: string | number | null;
};

function getMonthRange(month: string) {
  const matched = month.match(/^(\d{4})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  const year = Number(matched[1]);
  const monthNumber = Number(matched[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    return null;
  }

  const startDate = `${year}-${String(monthNumber).padStart(2, "0")}-01`;

  const nextMonthDate = new Date(
    Date.UTC(year, monthNumber, 1),
  );

  const nextMonth = nextMonthDate.toISOString().slice(0, 10);

  return {
    startDate,
    nextMonth,
  };
}

function createShiftEndDate(
  shiftStartDate: string | null,
  shiftStartTime: string | null,
  shiftEndTime: string | null,
) {
  if (!shiftStartDate || !shiftEndTime) {
    return null;
  }

  const normalizedStartTime = shiftStartTime ?? "00:00:00";

  const startDate = new Date(
    `${shiftStartDate}T${normalizedStartTime}+09:00`,
  );

  let endDate = new Date(
    `${shiftStartDate}T${shiftEndTime}+09:00`,
  );

  if (
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    endDate.getTime() < startDate.getTime()
  ) {
    endDate = new Date(
      endDate.getTime() + 24 * 60 * 60 * 1000,
    );
  }

  return Number.isNaN(endDate.getTime()) ? null : endDate;
}

function isCancelled(value: string | number | null | undefined) {
  if (value == null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();

  return ![
    "",
    "0",
    "false",
    "なし",
    "未キャンセル",
  ].includes(normalized);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const formEntryId = searchParams.get("form_entry_id")?.trim() ?? "";
    const month = searchParams.get("month")?.trim() ?? "";

    if (!formEntryId) {
      return NextResponse.json(
        {
          error: "form_entry_id is required",
        },
        {
          status: 400,
        },
      );
    }

    const monthRange = getMonthRange(month);

    if (!monthRange) {
      return NextResponse.json(
        {
          error: "month must be YYYY-MM",
        },
        {
          status: 400,
        },
      );
    }

    /*
     * ポータルの form_entries.id から、
     * シフト側で使用されている user_id を取得します。
     */
    const { data: userEntry, error: userEntryError } =
      await supabaseAdmin
        .from("user_entry_united_view_single")
        .select("user_id")
        .eq("entry_id", formEntryId)
        .maybeSingle();

    if (userEntryError) {
      console.error(
        "[salary-summary] user lookup error:",
        userEntryError,
      );

      return NextResponse.json(
        {
          error: "職員情報の取得に失敗しました。",
        },
        {
          status: 500,
        },
      );
    }

    const userId = String(userEntry?.user_id ?? "").trim();

    if (!userId) {
      return NextResponse.json(
        {
          error: "シフト用のユーザーIDが見つかりません。",
        },
        {
          status: 404,
        },
      );
    }

    /*
     * 指定月のシフトを取得します。
     *
     * staff_02、staff_03は、attend_flgがtrueの場合だけ
     * 本人の勤務として扱います。
     */
    const { data: shiftData, error: shiftError } =
      await supabaseAdmin
        .from("shift_self_coordinate_card_view2")
        .select(
          [
            "shift_id",
            "shift_start_date",
            "shift_start_time",
            "shift_end_time",
            "staff_01_user_id",
            "staff_02_user_id",
            "staff_03_user_id",
            "staff_02_attend_flg",
            "staff_03_attend_flg",
            "estimated_pay_amount",
          ].join(","),
        )
        .gte(
          "shift_start_date",
          monthRange.startDate,
        )
        .lt(
          "shift_start_date",
          monthRange.nextMonth,
        );

    if (shiftError) {
      console.error(
        "[salary-summary] shift load error:",
        shiftError,
      );

      return NextResponse.json(
        {
          error: "シフト情報の取得に失敗しました。",
        },
        {
          status: 500,
        },
      );
    }

    const allShifts: SalaryShiftRow[] =
  (shiftData ?? []) as unknown as SalaryShiftRow[];

    const myShifts = allShifts.filter((shift) => {
      if (shift.staff_01_user_id === userId) {
        return true;
      }

      if (
        shift.staff_02_user_id === userId &&
        shift.staff_02_attend_flg === true
      ) {
        return true;
      }

      if (
        shift.staff_03_user_id === userId &&
        shift.staff_03_attend_flg === true
      ) {
        return true;
      }

      return false;
    });

    if (myShifts.length === 0) {
      return NextResponse.json({
        worked: 0,
        expected: 0,
      });
    }

    /*
     * キャンセル状態を取得します。
     */
    const shiftIds = myShifts.map((shift) =>
      String(shift.shift_id),
    );

    const { data: cancelData, error: cancelError } =
      await supabaseAdmin
        .from("shift_add_status_view")
        .select("shift_id, cancel_value")
        .in("shift_id", shiftIds);

    if (cancelError) {
      console.error(
        "[salary-summary] cancel status load error:",
        cancelError,
      );

      return NextResponse.json(
        {
          error: "キャンセル情報の取得に失敗しました。",
        },
        {
          status: 500,
        },
      );
    }

    const cancelMap = new Map<string, string | number | null>();

    for (const row of (cancelData ?? []) as CancelStatusRow[]) {
      cancelMap.set(
        String(row.shift_id),
        row.cancel_value,
      );
    }

    const activeShifts = myShifts.filter((shift) => {
      const cancelValue = cancelMap.get(
        String(shift.shift_id),
      );

      return !isCancelled(cancelValue);
    });

    /*
     * 今月見込み:
     * 指定月に入っている、キャンセルされていないシフトの合計
     */
    const expected = activeShifts.reduce(
      (sum, shift) => {
        const amount = Number(
          shift.estimated_pay_amount ?? 0,
        );

        return sum + (
          Number.isFinite(amount) ? amount : 0
        );
      },
      0,
    );

    /*
     * 勤務済み:
     * 終了日時が現在以前で、キャンセルされていないシフトの合計
     */
    const now = new Date();

    const worked = activeShifts.reduce(
      (sum, shift) => {
        const shiftEnd = createShiftEndDate(
          shift.shift_start_date,
          shift.shift_start_time,
          shift.shift_end_time,
        );

        if (!shiftEnd || shiftEnd.getTime() > now.getTime()) {
          return sum;
        }

        const amount = Number(
          shift.estimated_pay_amount ?? 0,
        );

        return sum + (
          Number.isFinite(amount) ? amount : 0
        );
      },
      0,
    );

    return NextResponse.json({
      worked: Math.round(worked),
      expected: Math.round(expected),
    });
  } catch (error: unknown) {
    console.error(
      "[salary-summary] unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error: "給与概算の取得中にエラーが発生しました。",
      },
      {
        status: 500,
      },
    );
  }
}