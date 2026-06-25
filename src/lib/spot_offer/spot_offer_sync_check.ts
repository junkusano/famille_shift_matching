import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SKIMABITO_JOB_EDIT_REQUEST_TYPE_ID =
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

const staff01UserId = shift["staff_01_user_id"];
const staff02UserId = shift["staff_02_user_id"];

const staff01IsManager = await isManagerStaff(staff01UserId);
const staff02IsManager = await isManagerStaff(staff02UserId);

const hasStaff01 = !!staff01UserId;
const hasStaff02 = !!staff02UserId;

// 単独シフト：staff_01 が manager/admin 以外ならクローズ
const shouldCloseSingleStaff =
  hasStaff01 &&
  !hasStaff02 &&
  !staff01IsManager;

// 二名介助：staff_01・staff_02 が両方 manager/admin 以外ならクローズ
const shouldCloseTwoStaff =
  hasStaff01 &&
  hasStaff02 &&
  !staff01IsManager &&
  !staff02IsManager;

const shouldCloseByStaff =
  shouldCloseSingleStaff || shouldCloseTwoStaff;

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

if (diffMinutes >= 30) {
  await createManagerAlert(
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
    .from("wf_request")
    .select("id")
    .eq("request_type_id", SKIMABITO_JOB_EDIT_REQUEST_TYPE_ID)
    .eq("status", "pending")
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

const { error } = await supabase.from("wf_request").insert({
  request_type_id: SKIMABITO_JOB_EDIT_REQUEST_TYPE_ID,
  applicant_user_id: applicantUser.auth_user_id,
  status: "pending",
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

async function createManagerAlert(
  spotOfferRequest: Record<string, unknown>,
  shift: Record<string, unknown>,
  opts?: { dryRun?: boolean }
) {
  const shiftId = spotOfferRequest["shift_id"];

  console.log("[spot-offer-sync-check] create manager alert", {
    shift_id: shiftId,
    dryRun: opts?.dryRun ?? false,
  });

  if (opts?.dryRun) {
    return;
  }

  const payload = {
    command: "manager_alert",
    reason: "start_time_changed",
    shift_id: shiftId,
    requested_start_time: spotOfferRequest["shift_start_time"],
    current_start_time: shift["shift_start_time"],
  };

  const { data: applicantUser, error: applicantUserError } = await supabase
    .from("user_entry_united_view_single")
    .select("auth_user_id")
    .eq("user_id", "junkusano")
    .eq("system_role", "admin")
    .not("auth_user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (applicantUserError) throw applicantUserError;
  if (!applicantUser?.auth_user_id) {
    throw new Error("applicant_user_id not found");
  }

  const { error } = await supabase.from("wf_request").insert({
    request_type_id: SKIMABITO_JOB_EDIT_REQUEST_TYPE_ID,
    applicant_user_id: applicantUser.auth_user_id,
    status: "pending",
    payload,
  });

  if (error) {
    console.error("[spot-offer-sync-check] manager alert insert error", error);
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
