import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SKIMABITO_JOB_EDIT_TEMPLATE_ID =
  "fbd64ab4-a7a3-40b7-a718-61d6fac39525";

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

    //時間変更アラート
    const requestedStartTime = spotOfferRequest.shift_start_time;
    const currentStartTime = shift.shift_start_time;

    const diffMinutes = getTimeDiffMinutes(
      requestedStartTime,
      currentStartTime
    );

    const durationMinutes = getShiftDurationMinutes(
      shift.shift_start_time,
      shift.shift_end_time
    );

    const shouldUpdateStartTime = diffMinutes > 30;
    const shouldFixDuration =
      durationMinutes > 0 &&
      (durationMinutes <= 30 || durationMinutes > 360);

    if (shouldUpdateStartTime || shouldFixDuration) {
      await createUpdateJobTimeRequest(
        spotOfferRequest,
        shift,
        opts
      );

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
  spotOfferRequest: Record<string, unknown>,
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

  const { data: existingRequest, error: existingError } = await supabase
    .from("rpa_command_requests")
    .select("id")
    .eq("template_id", SKIMABITO_JOB_EDIT_TEMPLATE_ID)
    .eq("status", "approved")
    .contains("payload", {
      command: "close_job",
      shift_id: shiftId,
    })
    .maybeSingle();

  if (existingError) {
    console.error("[spot-offer-sync-check] wf_request duplicate check error", {
      shift_id: shiftId,
      reason,
      error: existingError,
    });
    throw existingError;
  }

  if (existingRequest) {
    console.log("[spot-offer-sync-check] close request already exists", {
      shift_id: shiftId,
      reason,
    });
    return;
  }

  const payload = {
    command: "close_job",
    reason,
    shift_id: shiftId,
    spot_offer_request: spotOfferRequest,
  };

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

  const { error } = await supabase.from("rpa_command_requests").insert({
    request_type_id: SKIMABITO_JOB_EDIT_TEMPLATE_ID,
    applicant_user_id: applicantUser.auth_user_id,
    status: "approved",
    payload,
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
  spotOfferRequest: Record<string, unknown>,
  shift: Record<string, unknown>,
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

  const payload = {
    command: "update_job_time",
    reason: "job_time_mismatch",
    shift_id: shiftId,

    requested_start_time: spotOfferRequest["shift_start_time"],
    current_start_time: shift["shift_start_time"],

    requested_end_time: spotOfferRequest["shift_end_time"],
    current_end_time: shift["shift_end_time"],

    new_start_time: shift["shift_start_time"],
    new_end_time: calculatedTime?.end_time ?? shift["shift_end_time"],
    new_break_minutes: calculatedTime?.break_minutes ?? 0,

    template_id: nearestTemplate?.core_id ?? null,
    template_start_at: nearestTemplate?.start_at ?? null,
    template_end_at: nearestTemplate?.end_at ?? null,
    template_duration_minutes: calculatedTime?.template_duration_minutes ?? null,
    new_break_start_time: calculatedTime?.break_start_time ?? null,
    new_break_end_time: calculatedTime?.break_end_time ?? null,

    spot_offer_request: spotOfferRequest,
    shift,
  };
  // ===========================
  // 申請者取得
  // ===========================
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

  // ===========================
  // wf_request登録
  // ===========================
  const { error } = await supabase.from("rpa_command_requests").insert({
    request_type_id: SKIMABITO_JOB_EDIT_TEMPLATE_ID,
    applicant_user_id: applicantUser.auth_user_id,
    status: "approved",
    payload,
  });

  if (error) {
    console.error(
      "[spot-offer-sync-check] manager alert insert error",
      error
    );
    throw error;
  }
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

async function shouldCloseTimeeByStaff(shift: Record<string, unknown>) {
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

function getTimeDiffMinutes(
  timeA: unknown,
  timeB: unknown
) {
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

function isShiftAtLeastTwoHoursLater(
  shiftDate: unknown,
  shiftTime: unknown
) {
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


function getShiftDurationMinutes(
  startTime: unknown,
  endTime: unknown
) {
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

async function findNearestSpotOfferTemplate(
  shift: Record<string, unknown>
) {
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
      const templateStartMinutes = timeToMinutes(
        String(template.start_at ?? "")
      );

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

function calculateJobTimeFromTemplate(
  shift: Record<string, unknown>,
  template: Record<string, unknown>
) {
  const shiftStartTime = shift["shift_start_time"];

  if (typeof shiftStartTime !== "string") {
    return null;
  }

  const startMinutes = timeToMinutes(shiftStartTime);
  const templateDurationMinutes = getShiftDurationMinutes(
    template["start_at"],
    template["end_at"]
  );

  if (startMinutes === null || templateDurationMinutes <= 0) {
    return null;
  }

  const breakMinutes = getBreakMinutes(templateDurationMinutes);

  const breakStartMinutes =
    breakMinutes > 0 ? startMinutes + templateDurationMinutes : null;

  const breakEndMinutes =
    breakStartMinutes !== null ? breakStartMinutes + breakMinutes : null;

  const endMinutes = startMinutes + templateDurationMinutes + breakMinutes;

  return {
    template_duration_minutes: templateDurationMinutes,
    end_time: minutesToTime(endMinutes),
    break_minutes: breakMinutes,
    break_start_time:
      breakStartMinutes !== null ? minutesToTime(breakStartMinutes) : null,
    break_end_time:
      breakEndMinutes !== null ? minutesToTime(breakEndMinutes) : null,
  };
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