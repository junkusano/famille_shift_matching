//lib/spot_offer/spot_offer_sync_check.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SKIMABITO_JOB_EDIT_TEMPLATE_ID =
  "fbd64ab4-a7a3-40b7-a718-61d6fac39525";

type JsonRecord = Record<string, unknown>;

export async function runSpotOfferSyncCheck(opts?: { dryRun?: boolean }) {
  console.log("[spot-offer-sync-check] start");

  let closeCount = 0;
  let alertCount = 0;

  const today = new Date().toISOString().slice(0, 10);

  const { data: spotOfferRequests, error } = await supabase
    .from("spot_offer_request_table")
    .select("*")
    .in("status", ["募集中", "確定"])
    .gte("shift_start_date", today)
    .limit(200);

  if (error) {
    console.error(
      "[spot-offer-sync-check] spot_offer_request_table fetch error",
      error
    );
    throw error;
  }

  console.log(
    `[spot-offer-sync-check] target records=${spotOfferRequests?.length ?? 0}`
  );

  for (const spotOfferRequest of spotOfferRequests ?? []) {
    const { data: shift, error: shiftError } = await supabase
      .from("shift")
      .select("*")
      .eq("shift_id", spotOfferRequest.shift_id)
      .maybeSingle();

    if (shiftError) {
      console.error("[spot-offer-sync-check] shift fetch error", {
        shift_id: spotOfferRequest.shift_id,
        error: shiftError,
      });
      continue;
    }

    // =========================
    // シフト開始2時間以内は対象外
    // =========================
    const shouldCheckByTime = shift
      ? isShiftAtLeastTwoHoursLater(
          shift["shift_start_date"],
          shift["shift_start_time"]
        )
      : isShiftAtLeastTwoHoursLater(
          spotOfferRequest.shift_start_date,
          spotOfferRequest.shift_start_time
        );

    if (!shouldCheckByTime) {
      continue;
    }

    if (!shift) {
      await createCloseRequest(spotOfferRequest, "shift_deleted", opts);
      closeCount++;
      continue;
    }

    const shouldCloseByStaff = await shouldCloseTimeeByStaff(shift);

    if (shouldCloseByStaff) {
      await createCloseRequest(spotOfferRequest, "staff_confirmed", opts);
      closeCount++;
      continue;
    }

    // 時間変更アラート
    // 終了時間の差は、短時間シフトを延長して募集しているケースがあるため無視する
    // 開始時間が30分以上変わった場合だけRPAリクエストを作成する
    const startDiffMinutes = getTimeDiffMinutes(
      spotOfferRequest.shift_start_time,
      shift.shift_start_time
    );

    const shouldUpdateJobTime = startDiffMinutes > 30;

    if (shouldUpdateJobTime) {
      await createUpdateJobTimeRequest(spotOfferRequest, shift, opts);
      alertCount++;
    }
  }

  console.log(
    `[spot-offer-sync-check] close=${closeCount} alert=${alertCount}`
  );

  console.log("[spot-offer-sync-check] completed");

  return {
    ok: true,
    targetCount: spotOfferRequests?.length ?? 0,
    closeCount,
    alertCount,
  };
}

async function createCloseRequest(
  spotOfferRequest: JsonRecord,
  reason: "shift_deleted" | "staff_confirmed",
  opts?: { dryRun?: boolean }
) {
  const shiftId = spotOfferRequest["shift_id"];

  console.log("[spot-offer-sync-check] create close request", {
    shift_id: shiftId,
    reason,
    dryRun: opts?.dryRun ?? false,
  });

  if (opts?.dryRun) {
    return;
  }

  const payload = {
    command: "close_job",
    reason,
    shift_id: shiftId,
    spot_offer_request: {
      id: spotOfferRequest["id"],
      shift_id: spotOfferRequest["shift_id"],
      taimee_job_id: spotOfferRequest["taimee_job_id"],
      status: spotOfferRequest["status"],
      start_at: spotOfferRequest["start_at"],
      end_at: spotOfferRequest["end_at"],
      template_title: spotOfferRequest["template_title"],
      shift_start_date: spotOfferRequest["shift_start_date"],
      shift_start_time: spotOfferRequest["shift_start_time"],
      shift_end_time: spotOfferRequest["shift_end_time"],
    },
  };

  const applicantUser = await getApplicantUser();

  const { error } = await supabase.from("rpa_command_requests").insert({
    template_id: SKIMABITO_JOB_EDIT_TEMPLATE_ID,
    requester_id: applicantUser.auth_user_id,
    approver_id: applicantUser.auth_user_id,
    approved_at: new Date().toISOString(),
    status: "approved",
    request_details: payload,
  });

  if (error) {
    console.error("[spot-offer-sync-check] wf_request insert error", {
      shift_id: shiftId,
      reason,
      error,
    });
    throw error;
  }
}

async function createUpdateJobTimeRequest(
  spotOfferRequest: JsonRecord,
  shift: JsonRecord,
  opts?: { dryRun?: boolean }
) {
  const shiftId = spotOfferRequest["shift_id"];

  console.log("[spot-offer-sync-check] create update job time request", {
    shift_id: shiftId,
    dryRun: opts?.dryRun ?? false,
  });

  if (opts?.dryRun) {
    return;
  }

  const nearestTemplate = await findNearestSpotOfferTemplate(shift);

  const calculatedTime = nearestTemplate
    ? calculateJobTimeFromTemplate(shift, nearestTemplate)
    : null;

  const newStartTime = valueToString(shift["shift_start_time"]);
  const newEndTime =
    calculatedTime?.end_time ?? valueToString(shift["shift_end_time"]);

  const newBreakStartTime = calculatedTime?.break_start_time ?? null;
  const newBreakEndTime = calculatedTime?.break_end_time ?? null;
  const newBreakMinutes = calculatedTime?.break_minutes ?? 0;
  const templateDurationMinutes =
    calculatedTime?.template_duration_minutes ??
    getShiftDurationMinutes(shift["shift_start_time"], shift["shift_end_time"]);

  const payload = {
  reason: "job_time_mismatch",
  command: "update_job_time",

  shift_id: shift.shift_id,
  kaipoke_cs_id: shift.kaipoke_cs_id,
  taimee_job_id: spotOfferRequest.taimee_job_id,

  old_shift: {
    start_date: spotOfferRequest.shift_start_date,
    start_time: spotOfferRequest.shift_start_time,
    end_date: spotOfferRequest.shift_start_date,
    end_time: spotOfferRequest.shift_end_time,
  },

  new_shift: {
    start_date: shift.shift_start_date,
    start_time: newStartTime,
    end_date: shift.shift_end_date,
    end_time: newEndTime,
  },

  break: {
    start_time: newBreakStartTime,
    end_time: newBreakEndTime,
    minutes: newBreakMinutes,
  },

  template_duration_minutes: templateDurationMinutes,
};

  const applicantUser = await getApplicantUser();

  const { error } = await supabase.from("rpa_command_requests").insert({
    template_id: SKIMABITO_JOB_EDIT_TEMPLATE_ID,
    requester_id: applicantUser.auth_user_id,
    approver_id: applicantUser.auth_user_id,
    approved_at: new Date().toISOString(),
    status: "test_status",
    request_details: payload,
  });

  if (error) {
    console.error("[spot-offer-sync-check] manager alert insert error", error);
    throw error;
  }
}

async function getApplicantUser() {
  const { data: applicantUser, error: applicantUserError } = await supabase
    .from("user_entry_united_view_single")
    .select("auth_user_id")
    .eq("user_id", "junkusano")
    .eq("system_role", "admin")
    .not("auth_user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (applicantUserError) {
    throw applicantUserError;
  }

  if (!applicantUser?.auth_user_id) {
    throw new Error("applicant_user_id not found");
  }

  return applicantUser;
}

async function isManagerStaff(userId: unknown) {
  if (!userId || typeof userId !== "string") {
    return false;
  }

  const { data, error } = await supabase
    .from("user_entry_united_view_single")
    .select("system_role")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[spot-offer-sync-check] manager check error", {
      user_id: userId,
      error,
    });
    throw error;
  }

  return data?.system_role === "manager" || data?.system_role === "admin";
}

async function shouldCloseTimeeByStaff(shift: JsonRecord) {
  const staff01UserId = shift["staff_01_user_id"];
  const staff02UserId = shift["staff_02_user_id"];
  const staff03UserId = shift["staff_03_user_id"];

  const staff02AttendFlg = shift["staff_02_attend_flg"] === true;
  const staff03AttendFlg = shift["staff_03_attend_flg"] === true;

  const staff01IsManager = await isManagerStaff(staff01UserId);
  const staff02IsManager = await isManagerStaff(staff02UserId);
  const staff03IsManager = await isManagerStaff(staff03UserId);

  if (staff01IsManager) {
    return false;
  }

  if (staff02IsManager && !staff02AttendFlg) {
    return false;
  }

  if (staff03IsManager && !staff03AttendFlg) {
    return false;
  }

  return true;
}

function getTimeDiffMinutes(timeA: unknown, timeB: unknown) {
  if (typeof timeA !== "string" || typeof timeB !== "string") {
    return 0;
  }

  const [aHour, aMinute] = timeA.split(":").map(Number);
  const [bHour, bMinute] = timeB.split(":").map(Number);

  if (
    Number.isNaN(aHour) ||
    Number.isNaN(aMinute) ||
    Number.isNaN(bHour) ||
    Number.isNaN(bMinute)
  ) {
    return 0;
  }

  const aTotalMinutes = aHour * 60 + aMinute;
  const bTotalMinutes = bHour * 60 + bMinute;

  return Math.abs(aTotalMinutes - bTotalMinutes);
}

function isShiftAtLeastTwoHoursLater(shiftDate: unknown, shiftTime: unknown) {
  if (typeof shiftDate !== "string" || typeof shiftTime !== "string") {
    return false;
  }

  const shiftDateTime = new Date(
    `${shiftDate}T${shiftTime.slice(0, 5)}:00+09:00`
  );

  if (Number.isNaN(shiftDateTime.getTime())) {
    return false;
  }

  const twoHoursLater = new Date(Date.now() + 2 * 60 * 60 * 1000);

  return shiftDateTime >= twoHoursLater;
}

function getShiftDurationMinutes(startTime: unknown, endTime: unknown) {
  if (typeof startTime !== "string" || typeof endTime !== "string") {
    return 0;
  }

  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === null || end === null) {
    return 0;
  }

  return end >= start ? end - start : end + 24 * 60 - start;
}

function timeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
}

function minutesToTime(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function getBreakMinutes(durationMinutes: number) {
  if (durationMinutes > 8 * 60) {
    return 60;
  }

  if (durationMinutes > 6 * 60) {
    return 45;
  }

  return 0;
}

async function findNearestSpotOfferTemplate(shift: JsonRecord) {
  const kaipokeCsId = shift["kaipoke_cs_id"];
  const shiftStartTime = shift["shift_start_time"];

  if (
    typeof kaipokeCsId !== "string" ||
    typeof shiftStartTime !== "string"
  ) {
    return null;
  }

  const { data, error } = await supabase
    .from("spot_offer_template_unified")
    .select("*")
    .eq("kaipoke_cs_id", kaipokeCsId);

  if (error) {
    console.error("[spot-offer-sync-check] template fetch error", {
      kaipoke_cs_id: kaipokeCsId,
      error,
    });
    throw error;
  }

  const shiftStartMinutes = timeToMinutes(shiftStartTime);

  if (shiftStartMinutes === null || !data?.length) {
    return null;
  }

  return data
    .map((template) => {
      const templateStartMinutes = timeToMinutes(String(template.start_at ?? ""));

      return {
        template,
        diff:
          templateStartMinutes === null
            ? Number.MAX_SAFE_INTEGER
            : Math.abs(templateStartMinutes - shiftStartMinutes),
      };
    })
    .sort((a, b) => a.diff - b.diff)[0].template;
}

function calculateJobTimeFromTemplate(shift: JsonRecord, template: JsonRecord) {
  const shiftStartDate = valueToString(shift["shift_start_date"]);
  const shiftStartTime = valueToString(shift["shift_start_time"]);

  if (!shiftStartTime) {
    return null;
  }

  const startMinutes = timeToMinutes(shiftStartTime);

  const templateDurationMinutes = Number(
    template["duration_minutes"] ?? template["duration"] ?? 0
  );

  if (startMinutes === null || templateDurationMinutes <= 0) {
    return null;
  }

  const breakMinutes = getBreakMinutes(templateDurationMinutes);

  const breakStartMinutes =
    breakMinutes > 0 ? startMinutes + 6 * 60 : null;

  const breakEndMinutes =
    breakStartMinutes !== null ? breakStartMinutes + breakMinutes : null;

  const endMinutes = startMinutes + templateDurationMinutes + breakMinutes;

  return {
    template_duration_minutes: templateDurationMinutes,
    end_date: shiftStartDate,
    end_time: minutesToTime(endMinutes),
    break_minutes: breakMinutes,
    break_start_time:
      breakStartMinutes !== null ? minutesToTime(breakStartMinutes) : null,
    break_end_time:
      breakEndMinutes !== null ? minutesToTime(breakEndMinutes) : null,
  };
}

function valueToString(value: unknown) {
  return typeof value === "string" ? value : null;
}
