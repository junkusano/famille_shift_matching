import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { createRpaRequestDetails } from "@/lib/spot_offer/createRpaRequestDetails";

export const dynamic = "force-dynamic";

const RPA_TEMPLATE_ID = "caf1a290-b9ac-4eeb-84eb-eb7fd9936c2f";
const MIN_SHIFT_WORK_MINUTES = 60;
const MAX_SHIFT_WORK_MINUTES = 360;

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(time: string | null | undefined) {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function addMinutesToTime(time: string, minutes: number) {
  const base = timeToMinutes(time);
  const total = base + minutes;
  const h = Math.floor(total / 60).toString().padStart(2, "0");
  const m = (total % 60).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

function getDurationMinutes(
  template: Record<string, unknown>
) {
  const durationMinutes = template["duration_minutes"];
  if (durationMinutes != null) return Number(durationMinutes);

  const duration = template["duration"];
  if (duration != null) return Number(duration);

  const start = timeToMinutes(
    typeof template["start_at"] === "string" ? template["start_at"] : ""
  );

  const end = timeToMinutes(
    typeof template["end_at"] === "string" ? template["end_at"] : ""
  );

  return Math.max(end - start, 60);
}

function getShiftDurationMinutes(shift: Record<string, unknown>) {
  const start = timeToMinutes(
    typeof shift["shift_start_time"] === "string" ? shift["shift_start_time"] : ""
  );

  const end = timeToMinutes(
    typeof shift["shift_end_time"] === "string" ? shift["shift_end_time"] : ""
  );

  if (end <= start) return null;

  return end - start;
}

function selectNearestTemplate(
  templates: Record<string, unknown>[],
  shiftStartTime: string
) {
  const shiftMinutes = timeToMinutes(shiftStartTime);

  return [...templates].sort((a, b) => {
  const startA =
    typeof a["start_at"] === "string" ? a["start_at"] : "";

  const startB =
    typeof b["start_at"] === "string" ? b["start_at"] : "";

  const diffA = Math.abs(timeToMinutes(startA) - shiftMinutes);
  const diffB = Math.abs(timeToMinutes(startB) - shiftMinutes);

  return diffA - diffB;
})[0];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const dryRun = searchParams.get("dry_run") === "true";
  const targetDate =
    searchParams.get("target_date") ?? toDateString(addDays(new Date(), 7));

  const requesterAuthUserId = process.env.AUTO_RPA_REQUESTER_AUTH_USER_ID;
  const approverAuthUserId = process.env.AUTO_RPA_APPROVER_AUTH_USER_ID;


    if (!requesterAuthUserId || !approverAuthUserId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AUTO_RPA_REQUESTER_AUTH_USER_ID と AUTO_RPA_APPROVER_AUTH_USER_ID を環境変数に設定してください",
        },
        { status: 500 }
      );
    }

  const { data: shifts, error: shiftError } = await supabaseAdmin
    .from("shift_shift_record_view2")
    .select("*")
    .eq("shift_start_date", targetDate);

  if (shiftError) {
    return NextResponse.json(
      { ok: false, error: shiftError.message },
      { status: 500 }
    );
  }

const results: Array<Record<string, unknown>> = [];
const skippedShiftReasons = new Map<number, string>();

const MERGEABLE_SERVICE_CODES = [
  "家事",
  "身体",
  "身１生２・Ⅱ",
  "訪問型独自サービス１３",
  "通院(伴う)",
  "通院(伴ず)",
  "移：必要不可欠な外出",
  "移：必要不可欠な外出（片道支援）",
  "移：その他の外出",
  "同行(初任者等)",
  "新しいサービス",
];

for (const shift of shifts ?? []) {
  const skipReason = skippedShiftReasons.get(Number(shift.shift_id));

  if (skipReason) {
    results.push({
      shift_id: shift.shift_id,
      action: "skipped",
      reason: skipReason,
    });
    continue;
  }

  try {
      const staffUserIds = [
  shift.staff_01_user_id,
  shift.staff_02_user_id,
].filter((userId): userId is string => typeof userId === "string" && userId.length > 0);

const { data: staffRoles, error: staffRoleError } = await supabaseAdmin
  .from("user_entry_united_view_single")
  .select("user_id, system_role")
  .in("user_id", staffUserIds);

if (staffRoleError) throw staffRoleError;

const hasManager = (staffRoles ?? []).some(
  (staff) => staff.system_role === "manager" || staff.system_role === "admin"
);

      if (!hasManager) {
        results.push({
          shift_id: shift.shift_id,
          action: "skipped",
          reason: "manager/admin が入っていない",
        });
        continue;
      }

      const { data: existing } = await supabaseAdmin
        .from("spot_offer_request_table")
        .select("shift_id,status,taimee_job_id")
        .eq("shift_id", shift.shift_id)
        .maybeSingle();

      if (
        existing?.status === "募集中" ||
        existing?.status === "確定" ||
        existing?.taimee_job_id
      ) {
        results.push({
          shift_id: shift.shift_id,
          action: "skipped",
          reason: "既に募集済みまたは確定済み",
          status: existing.status,
        });
        continue;
      }

      const { data: templates, error: templateError } = await supabaseAdmin
        .from("spot_offer_template_unified")
        .select("*")
        .eq("kaipoke_cs_id", shift.kaipoke_cs_id);

      if (templateError) throw templateError;

      if (!templates || templates.length === 0) {
        results.push({
          shift_id: shift.shift_id,
          action: "skipped",
          reason: "テンプレートなし",
        });
        continue;
      }

      const selectedTemplate = selectNearestTemplate(
        templates,
        shift.shift_start_time
      );

      const start = shift.shift_start_time;

const nextShiftWithinTwoHours = (shifts ?? [])
  .filter((candidate) =>
    candidate.shift_id !== shift.shift_id &&
    candidate.kaipoke_cs_id === shift.kaipoke_cs_id &&
    candidate.shift_start_date === shift.shift_start_date &&
    MERGEABLE_SERVICE_CODES.includes(String(shift.service_code)) &&
    MERGEABLE_SERVICE_CODES.includes(String(candidate.service_code))
  )
  .sort((a, b) =>
    timeToMinutes(String(a.shift_start_time ?? "")) -
    timeToMinutes(String(b.shift_start_time ?? ""))
  )
  .find((candidate) => {
    const currentEndMinutes = timeToMinutes(String(shift.shift_end_time ?? ""));
    const nextStartMinutes = timeToMinutes(String(candidate.shift_start_time ?? ""));
    const gapMinutes = nextStartMinutes - currentEndMinutes;

    return gapMinutes >= 0 && gapMinutes <= 120;
  });

const nextShift =
  nextShiftWithinTwoHours &&
  nextShiftWithinTwoHours.shift_start_time === shift.shift_end_time
    ? nextShiftWithinTwoHours
    : null;

const canMergeConsecutiveShift = Boolean(nextShift);

const shouldSkipNextShiftWithinTwoHours =
  Boolean(nextShiftWithinTwoHours) && !nextShift;

const shiftDurationMinutes = getShiftDurationMinutes(shift);
const shouldUseShiftEnd =
  shiftDurationMinutes != null &&
  shiftDurationMinutes >= MIN_SHIFT_WORK_MINUTES &&
  shiftDurationMinutes <= MAX_SHIFT_WORK_MINUTES &&
  typeof shift.shift_end_time === "string";

const durationMinutes = shouldUseShiftEnd
  ? shiftDurationMinutes
  : getDurationMinutes(selectedTemplate);

const end =
  canMergeConsecutiveShift && typeof nextShift?.shift_end_time === "string"
    ? nextShift.shift_end_time
    : shouldUseShiftEnd
      ? shift.shift_end_time
      : addMinutesToTime(start, durationMinutes);

const mergedShiftIds = canMergeConsecutiveShift && nextShift
  ? [shift.shift_id, nextShift.shift_id]
  : [shift.shift_id];

const mergedServiceCodes = canMergeConsecutiveShift && nextShift
  ? [shift.service_code, nextShift.service_code]
  : [shift.service_code];

      const breakStart =
  typeof selectedTemplate["break_start_time"] === "string"
    ? selectedTemplate["break_start_time"]
    : typeof selectedTemplate["break_start"] === "string"
      ? selectedTemplate["break_start"]
      : null;

const breakEnd =
  typeof selectedTemplate["break_end_time"] === "string"
    ? selectedTemplate["break_end_time"]
    : typeof selectedTemplate["break_end"] === "string"
      ? selectedTemplate["break_end"]
      : null;

      const details = createRpaRequestDetails({
  selectedTemplate,
  form: { shift_id: shift.shift_id },
  shift,
  shiftStartDate: shift.shift_start_date,
  start,
  end,
  breakStart:
  typeof breakStart === "string" ? breakStart : null,

  breakEnd:
  typeof breakEnd === "string" ? breakEnd : null,
  userData: {
    user_id: "cron",
  },
  mergedShiftIds,
  mergedServiceCodes,
});

      const spotOfferPayload = {
        shift_id: shift.shift_id,
        core_id: selectedTemplate.core_id,
        template_title: selectedTemplate.template_title ?? null,
        kaipoke_cs_id: shift.kaipoke_cs_id ?? null,
        shift_start_date: shift.shift_start_date,
        shift_start_time: start,
        shift_end_time: end,
        start_at: start,
        end_at: end,
        unit_amount: selectedTemplate.unit_amount ?? 1330,
        commute_fee: selectedTemplate.commute_fee ?? 200,
        status: "募集中",
        updated_at: new Date().toISOString(),
      };

    if (!dryRun) {
  const { error: spotError } = await supabaseAdmin
    .from("spot_offer_request_table")
    .upsert(spotOfferPayload, {
      onConflict: "shift_id",
    });

  if (spotError) throw spotError;

  const { error: rpaError } = await supabaseAdmin
    .from("rpa_command_requests")
    .insert({
      template_id: RPA_TEMPLATE_ID,
      requester_id: requesterAuthUserId,
      approver_id: approverAuthUserId,
      status: "approved",
      request_details: details,
    });

  if (rpaError) throw rpaError;
}

if (canMergeConsecutiveShift && nextShift) {
  skippedShiftReasons.set(
    Number(nextShift.shift_id),
    "連続シフトとして前の募集に統合済み"
  );
}

if (shouldSkipNextShiftWithinTwoHours && nextShiftWithinTwoHours) {
  skippedShiftReasons.set(
    Number(nextShiftWithinTwoHours.shift_id),
    "同一利用者で前シフト終了から2時間以内のため募集対象外"
  );
}

results.push({
  shift_id: shift.shift_id,
  action: dryRun ? "dry_run_created" : "created",
  template_title: selectedTemplate.template_title,
  shift_start_time: start,
  shift_end_time: end,
  merged_shift_ids: mergedShiftIds,
  merged_service_codes: mergedServiceCodes,
  is_merged_shift: mergedShiftIds.length > 1,
});

} catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    results.push({
      shift_id: shift.shift_id,
      action: "error",
      error: message,
    });
  }
}

return NextResponse.json({
  ok: true,
  dry_run: dryRun,
  target_date: targetDate,
  total: shifts?.length ?? 0,
  results,
});
}
