import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";
import { MULTIPLE_SERVICE_PREFIX, timeToMinutes, toHm } from "@/lib/multiple-services";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Scope = "single" | "future";

type ShiftRow = {
  shift_id: number;
  shift_start_date: string;
  shift_start_time: string;
  shift_end_time: string;
  kaipoke_cs_id: string | null;
  service_code: string | null;
  required_staff_count: number | null;
  staff_01_user_id: string | null;
  staff_02_user_id: string | null;
  staff_03_user_id: string | null;
  staff_02_attend_flg: boolean | null;
  staff_03_attend_flg: boolean | null;
  head_shift_id: string | null;
};

type SaveBody = {
  shiftIds?: Array<number | string>;
  effectiveFrom?: string;
  scope?: Scope;
  groupId?: string | null;
};

type DeleteBody = {
  groupId?: string;
  effectiveFrom?: string;
  scope?: Scope;
  shiftIds?: Array<number | string>;
};

const SHIFT_SELECT = [
  "shift_id",
  "shift_start_date",
  "shift_start_time",
  "shift_end_time",
  "kaipoke_cs_id",
  "service_code",
  "required_staff_count",
  "staff_01_user_id",
  "staff_02_user_id",
  "staff_03_user_id",
  "staff_02_attend_flg",
  "staff_03_attend_flg",
  "head_shift_id",
].join(",");

function ymd(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function uniqueShiftIds(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  );
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00+09:00`).getDay();
}

function staffingSignature(shift: ShiftRow) {
  return [
    shift.staff_01_user_id ?? "",
    shift.staff_02_user_id ?? "",
    shift.staff_03_user_id ?? "",
    shift.staff_02_attend_flg === true ? "1" : "0",
    shift.staff_03_attend_flg === true ? "1" : "0",
  ].join("|");
}

function validateMembers(rows: ShiftRow[]) {
  if (rows.length < 2) return "複数サービスは2件以上のシフトを選択してください";
  if (new Set(rows.map((row) => row.shift_start_date)).size !== 1) {
    return "同じ日のシフトだけを複数サービスにできます";
  }
  if (new Set(rows.map(staffingSignature)).size !== 1) {
    return "担当構成が異なるシフトは同じ複数サービスにできません";
  }

  const sorted = [...rows].sort((a, b) => toHm(a.shift_start_time).localeCompare(toHm(b.shift_start_time)));
  for (let index = 1; index < sorted.length; index += 1) {
    const previousEnd = timeToMinutes(sorted[index - 1].shift_end_time);
    const currentStart = timeToMinutes(sorted[index].shift_start_time);
    const gap = currentStart - previousEnd;
    if (gap < 0) return "時間が重複しているシフトは同じ複数サービスにできません";
    if (gap > 120) return "前後のシフト間隔は2時間以内にしてください";
  }
  return null;
}

function samePattern(left: ShiftRow, right: ShiftRow) {
  return (
    left.kaipoke_cs_id === right.kaipoke_cs_id &&
    left.service_code === right.service_code &&
    toHm(left.shift_start_time) === toHm(right.shift_start_time) &&
    toHm(left.shift_end_time) === toHm(right.shift_end_time) &&
    Number(left.required_staff_count ?? 1) === Number(right.required_staff_count ?? 1)
  );
}

async function requireUser(req: NextRequest) {
  const auth = await getUserFromBearer(req);
  if (!auth.token || !auth.user?.id) return null;
  return auth.user;
}

async function rowsForIds(ids: number[]) {
  const { data, error } = await supabaseAdmin
    .from("shift")
    .select(SHIFT_SELECT)
    .in("shift_id", ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as ShiftRow[];
}

async function futureRowsForPattern(member: ShiftRow, effectiveFrom: string) {
  let query = supabaseAdmin
    .from("shift")
    .select(SHIFT_SELECT)
    .gte("shift_start_date", effectiveFrom)
    .eq("kaipoke_cs_id", member.kaipoke_cs_id)
    .eq("shift_start_time", member.shift_start_time)
    .eq("shift_end_time", member.shift_end_time)
    .eq("required_staff_count", member.required_staff_count ?? 1)
    .order("shift_start_date", { ascending: true });

  query = member.service_code == null
    ? query.is("service_code", null)
    : query.eq("service_code", member.service_code);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const targetWeekday = weekday(member.shift_start_date);
  return ((data ?? []) as ShiftRow[]).filter((row) => weekday(row.shift_start_date) === targetWeekday);
}

async function updateWeeklyTemplates(members: ShiftRow[], groupId: string | null) {
  for (const member of members) {
    let query = supabaseAdmin
      .from("shift_weekly_template")
      .update({ multiple_service_group_id: groupId })
      .eq("weekday", weekday(member.shift_start_date))
      .eq("kaipoke_cs_id", member.kaipoke_cs_id)
      .eq("start_time", member.shift_start_time)
      .eq("end_time", member.shift_end_time)
      .eq("required_staff_count", member.required_staff_count ?? 1);

    query = member.service_code == null
      ? query.is("service_code", null)
      : query.eq("service_code", member.service_code);

    const { error } = await query;
    if (error) throw new Error(error.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireUser(req))) {
      return NextResponse.json({ ok: false, error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await req.json()) as SaveBody;
    const shiftIds = uniqueShiftIds(body.shiftIds);
    const rows = await rowsForIds(shiftIds);
    if (rows.length !== shiftIds.length) {
      return NextResponse.json({ ok: false, error: "選択したシフトの一部が見つかりません" }, { status: 404 });
    }

    const validationError = validateMembers(rows);
    if (validationError) {
      return NextResponse.json({ ok: false, error: validationError }, { status: 400 });
    }

    const effectiveFrom = ymd(body.effectiveFrom) ? body.effectiveFrom : rows[0].shift_start_date;
    const scope: Scope = body.scope === "single" ? "single" : "future";
    const existingGroup = typeof body.groupId === "string" && body.groupId.startsWith(MULTIPLE_SERVICE_PREFIX)
      ? body.groupId
      : null;
    const groupId = existingGroup ?? `${MULTIPLE_SERVICE_PREFIX}${crypto.randomUUID()}`;
    const selectedConflict = rows.find(
      (row) => row.head_shift_id && row.head_shift_id !== existingGroup,
    );
    if (selectedConflict) {
      return NextResponse.json(
        { ok: false, error: "別のグループに登録済みのシフトが含まれています。先にその構成を編集してください" },
        { status: 409 },
      );
    }

    if (scope === "single") {
      const { error } = await supabaseAdmin
        .from("shift")
        .update({ head_shift_id: groupId })
        .in("shift_id", shiftIds);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, groupId, affectedDates: 1, affectedShifts: shiftIds.length });
    }

    const patternRows = await Promise.all(rows.map((row) => futureRowsForPattern(row, effectiveFrom)));
    const rowsByDate = new Map<string, ShiftRow[]>();

    for (const pattern of patternRows) {
      for (const row of pattern) {
        const current = rowsByDate.get(row.shift_start_date) ?? [];
        current.push(row);
        rowsByDate.set(row.shift_start_date, current);
      }
    }

    const completeOccurrences = Array.from(rowsByDate.entries())
      .filter(([, occurrenceRows]) =>
        rows.every((member) => occurrenceRows.some((candidate) => samePattern(member, candidate))),
      )
      .map(([date, occurrenceRows]) => ({
        date,
        rows: rows.map((member) => occurrenceRows.find((candidate) => samePattern(member, candidate))!),
      }));

    if (completeOccurrences.length === 0) {
      return NextResponse.json(
        { ok: false, error: "変更日以降に同じ曜日・時間構成のシフトが見つかりません" },
        { status: 404 },
      );
    }

    const futureConflict = completeOccurrences
      .flatMap((occurrence) => occurrence.rows)
      .find((row) => row.head_shift_id && row.head_shift_id !== existingGroup);
    if (futureConflict) {
      return NextResponse.json(
        {
          ok: false,
          error: `${futureConflict.shift_start_date}に別グループ登録済みのシフトがあります。その日以降の構成を確認してください`,
        },
        { status: 409 },
      );
    }

    const futureShiftIds = Array.from(
      new Set(completeOccurrences.flatMap((occurrence) => occurrence.rows.map((row) => row.shift_id))),
    );

    if (existingGroup) {
      const [{ error: clearShiftError }, { error: clearTemplateError }] = await Promise.all([
        supabaseAdmin
          .from("shift")
          .update({ head_shift_id: null })
          .eq("head_shift_id", existingGroup)
          .gte("shift_start_date", effectiveFrom),
        supabaseAdmin
          .from("shift_weekly_template")
          .update({ multiple_service_group_id: null })
          .eq("multiple_service_group_id", existingGroup),
      ]);
      if (clearShiftError) throw new Error(clearShiftError.message);
      if (clearTemplateError) throw new Error(clearTemplateError.message);
    }

    const { error: updateError } = await supabaseAdmin
      .from("shift")
      .update({ head_shift_id: groupId })
      .in("shift_id", futureShiftIds);
    if (updateError) throw new Error(updateError.message);

    await updateWeeklyTemplates(rows, groupId);

    return NextResponse.json({
      ok: true,
      groupId,
      affectedDates: completeOccurrences.length,
      affectedShifts: futureShiftIds.length,
    });
  } catch (error) {
    console.error("[multiple-services][save]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "複数サービスを保存できませんでした" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireUser(req))) {
      return NextResponse.json({ ok: false, error: "ログインが必要です" }, { status: 401 });
    }

    const body = (await req.json()) as DeleteBody;
    const groupId = typeof body.groupId === "string" ? body.groupId : "";
    if (!groupId.startsWith(MULTIPLE_SERVICE_PREFIX)) {
      return NextResponse.json({ ok: false, error: "複数サービス識別子が不正です" }, { status: 400 });
    }

    const scope: Scope = body.scope === "single" ? "single" : "future";
    if (scope === "single") {
      const shiftIds = uniqueShiftIds(body.shiftIds);
      if (!shiftIds.length) {
        return NextResponse.json({ ok: false, error: "解除するシフトがありません" }, { status: 400 });
      }
      const { error } = await supabaseAdmin
        .from("shift")
        .update({ head_shift_id: null })
        .eq("head_shift_id", groupId)
        .in("shift_id", shiftIds);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (!ymd(body.effectiveFrom)) {
      return NextResponse.json({ ok: false, error: "変更日を指定してください" }, { status: 400 });
    }

    const groupRows = await rowsForIds(
      uniqueShiftIds(body.shiftIds),
    );
    const { error: shiftError } = await supabaseAdmin
      .from("shift")
      .update({ head_shift_id: null })
      .eq("head_shift_id", groupId)
      .gte("shift_start_date", body.effectiveFrom);
    if (shiftError) throw new Error(shiftError.message);

    if (groupRows.length) {
      await updateWeeklyTemplates(groupRows, null);
    } else {
      const { error: templateError } = await supabaseAdmin
        .from("shift_weekly_template")
        .update({ multiple_service_group_id: null })
        .eq("multiple_service_group_id", groupId);
      if (templateError) throw new Error(templateError.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[multiple-services][delete]", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "複数サービスを解除できませんでした" },
      { status: 500 },
    );
  }
}
