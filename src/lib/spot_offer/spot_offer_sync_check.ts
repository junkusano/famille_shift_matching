//lib/spot_offer/spot_offer_sync_check.ts
import { createClient } from "@supabase/supabase-js";
import { createRpaRequestDetails } from "@/lib/spot_offer/createRpaRequestDetails";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SKIMABITO_JOB_EDIT_TEMPLATE_ID =
  "fbd64ab4-a7a3-40b7-a718-61d6fac39525";
const SKIMABITO_JOB_CREATE_TEMPLATE_ID =
  "caf1a290-b9ac-4eeb-84eb-eb7fd9936c2f";

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

    const isDateChanged =
  spotOfferRequest.shift_start_date !== shift.shift_start_date;

if (isDateChanged) {
  await createCloseRequest(
    spotOfferRequest,
    "date_changed",
    opts
  );

  await createOpenRequest(
  shift,
  opts
);

  closeCount++;

  continue;
}

// 時間変更確認
// 終了時間の差は、短時間シフトを延長して募集しているケースがあるため無視する
// 開始時間が30分を超えて変わった場合は、
// 旧求人の取り下げ完了後に新しい求人を作成する
const startDiffMinutes = getTimeDiffMinutes(
  spotOfferRequest.shift_start_time,
  shift.shift_start_time
);

const shouldRecreateJob = startDiffMinutes > 30;

if (shouldRecreateJob) {
  const result = await handleTimeChangedRecreate(
    spotOfferRequest,
    shift,
    opts
  );

  if (result === "close_created") {
    closeCount++;
  }

  if (result === "create_created") {
    alertCount++;
  }

  continue;
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

type TimeChangedRecreateResult =
  | "close_created"
  | "waiting_close"
  | "create_created"
  | "already_created"
  | "close_failed";

async function handleTimeChangedRecreate(
  spotOfferRequest: JsonRecord,
  shift: JsonRecord,
  opts?: { dryRun?: boolean }
): Promise<TimeChangedRecreateResult> {
  const shiftId = spotOfferRequest["shift_id"];

  console.log("[spot-offer-sync-check] handle time changed recreate", {
    shift_id: shiftId,
    old_start_time: spotOfferRequest["shift_start_time"],
    new_start_time: shift["shift_start_time"],
    dryRun: opts?.dryRun ?? false,
  });

  /*
   * 同じシフトに対する最新の時間変更用close_jobを取得する。
   *
   * 重要：
   * close_jobがdoneになるまではcreate_jobを作成しない。
   */
  const { data: closeRequests, error: closeCheckError } = await supabase
    .from("rpa_command_requests")
    .select("id, status, created_at, request_details")
    .eq("request_details->>command", "close_job")
    .eq("request_details->>reason", "time_changed")
    .eq("request_details->>shift_id", String(shiftId))
    .order("created_at", { ascending: false })
    .limit(1);

  if (closeCheckError) {
    console.error(
      "[spot-offer-sync-check] time_changed close request check error",
      {
        shift_id: shiftId,
        error: closeCheckError,
      }
    );

    throw closeCheckError;
  }

  const latestCloseRequest = closeRequests?.[0] ?? null;

  /*
   * まだclose_jobが作られていない場合
   */
  if (!latestCloseRequest) {
    await createCloseRequest(
      spotOfferRequest,
      "time_changed",
      opts
    );

    return "close_created";
  }

  /*
   * close_jobがまだ処理中の場合
   */
  const waitingStatuses = [
    "waiting_approval",
    "approved",
    "running",
    "test_status",
  ];

  if (waitingStatuses.includes(latestCloseRequest.status)) {
    console.log(
      "[spot-offer-sync-check] waiting time_changed close request",
      {
        shift_id: shiftId,
        close_request_id: latestCloseRequest.id,
        status: latestCloseRequest.status,
      }
    );

    return "waiting_close";
  }

  /*
   * close_jobが失敗した場合は、新しい求人を作らない
   */
  if (latestCloseRequest.status !== "done") {
    console.warn(
      "[spot-offer-sync-check] close request is not completed",
      {
        shift_id: shiftId,
        close_request_id: latestCloseRequest.id,
        status: latestCloseRequest.status,
      }
    );

    return "close_failed";
  }

  /*
   * close_job完了後、同じclose_jobを起点にした
   * create_jobが既に存在するか確認する。
   */
  const { data: createRequests, error: createCheckError } = await supabase
    .from("rpa_command_requests")
    .select("id, status, created_at, request_details")
    .eq(
      "request_details->>recreate_source_close_request_id",
      String(latestCloseRequest.id)
    )
    .limit(1);

  if (createCheckError) {
    console.error(
      "[spot-offer-sync-check] recreate create request check error",
      {
        shift_id: shiftId,
        close_request_id: latestCloseRequest.id,
        error: createCheckError,
      }
    );

    throw createCheckError;
  }

  if (createRequests && createRequests.length > 0) {
    console.log(
      "[spot-offer-sync-check] recreate request already exists",
      {
        shift_id: shiftId,
        close_request_id: latestCloseRequest.id,
        create_request_id: createRequests[0].id,
        status: createRequests[0].status,
      }
    );

    return "already_created";
  }

  /*
   * close_jobがdoneで、create_jobがまだ存在しない場合だけ
   * 新しい求人作成リクエストを登録する。
   */
  await createOpenRequest(
    shift,
    opts,
    {
      reason: "time_changed",
      sourceCloseRequestId: latestCloseRequest.id,
    }
  );

  return "create_created";
}

async function createCloseRequest(
  spotOfferRequest: JsonRecord,
  reason:
    | "shift_deleted"
    | "staff_confirmed"
    | "date_changed"
    | "time_changed",
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
  created_from: "/api/cron/spot-offer-sync-check",

  command: "close_job",
  action: "withdraw_taimee_job",
  reason,

  // ========================================
  // 直下項目も削除せず保持する
  // ========================================
  shift_id: shiftId,
  core_id: spotOfferRequest["core_id"],
  kaipoke_cs_id: spotOfferRequest["kaipoke_cs_id"],
  taimee_job_id: spotOfferRequest["taimee_job_id"],

  template_title: spotOfferRequest["template_title"],
  shift_start_date: spotOfferRequest["shift_start_date"],
  shift_start_time: spotOfferRequest["shift_start_time"],
  shift_end_time: spotOfferRequest["shift_end_time"],

  requested_status: "募集なし",
  previous_status: spotOfferRequest["status"],

  // ========================================
  // SukimaTaimeeClose用
  // ========================================
  spot_offer_request: {
    id: spotOfferRequest["id"],
    shift_id: spotOfferRequest["shift_id"],
    core_id: spotOfferRequest["core_id"],
    kaipoke_cs_id: spotOfferRequest["kaipoke_cs_id"],
    taimee_job_id: spotOfferRequest["taimee_job_id"],
    status: spotOfferRequest["status"],
    start_at: spotOfferRequest["start_at"],
    end_at: spotOfferRequest["end_at"],
    template_title: spotOfferRequest["template_title"],
    shift_start_date: spotOfferRequest["shift_start_date"],
    shift_start_time: spotOfferRequest["shift_start_time"],
    shift_end_time: spotOfferRequest["shift_end_time"],
    unit_amount: spotOfferRequest["unit_amount"],
    commute_fee: spotOfferRequest["commute_fee"],
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

async function createOpenRequest(
  shift: JsonRecord,
  opts?: { dryRun?: boolean },
  recreateMeta?: {
    reason: "date_changed" | "time_changed";
    sourceCloseRequestId: string;
  }
) {
  const shiftId = shift["shift_id"];

  console.log("[spot-offer-sync-check] create open request", {
    shift_id: shiftId,
    dryRun: opts?.dryRun ?? false,
  });

  if (opts?.dryRun) {
    return;
  }

  const selectedTemplate = await findNearestSpotOfferTemplate(shift);

  if (!selectedTemplate) {
    console.warn("[spot-offer-sync-check] template not found", {
      shift_id: shiftId,
      kaipoke_cs_id: shift["kaipoke_cs_id"],
    });
    return;
  }

  const calculatedTime = calculateJobTimeFromTemplate(shift, selectedTemplate);

  const start = valueToString(shift["shift_start_time"]) ?? "";
  const end =
    calculatedTime?.end_time ??
    valueToString(shift["shift_end_time"]) ??
    "";

  const baseDetails = createRpaRequestDetails({
  selectedTemplate,
  form: { shift_id: shiftId },
  shift,
  shiftStartDate: shift["shift_start_date"],
  start,
  end,
  breakStart: calculatedTime?.break_start_time ?? null,
  breakEnd: calculatedTime?.break_end_time ?? null,
  userData: {
    user_id: "sync-check",
  },
  mergedShiftIds: [shiftId],
  mergedServiceCodes: [shift["service_code"] ?? null],
});

const details = {
  ...baseDetails,

  // Cron側で求人再作成を識別するための情報
  command: "create_job",
  shift_id: shiftId,

  recreate_reason: recreateMeta?.reason ?? null,

  recreate_source_close_request_id:
    recreateMeta?.sourceCloseRequestId ?? null,
};

  const applicantUser = await getApplicantUser();

  const { error: spotError } = await supabase
    .from("spot_offer_request_table")
    .upsert(
      {
        shift_id: shiftId,
        core_id: selectedTemplate["core_id"],
        template_title: selectedTemplate["template_title"] ?? null,
        kaipoke_cs_id: shift["kaipoke_cs_id"] ?? null,
        shift_start_date: shift["shift_start_date"],
        shift_start_time: start,
        shift_end_time: end,
        start_at: start,
        end_at: end,
        unit_amount: selectedTemplate["unit_amount"] ?? 1330,
        commute_fee: selectedTemplate["commute_fee"] ?? 200,
        status: "募集中",
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "shift_id",
      }
    );

  if (spotError) {
    console.error("[spot-offer-sync-check] spot offer upsert error", {
      shift_id: shiftId,
      error: spotError,
    });
    throw spotError;
  }

  const { error: rpaError } = await supabase
    .from("rpa_command_requests")
    .insert({
      template_id: SKIMABITO_JOB_CREATE_TEMPLATE_ID,
      requester_id: applicantUser.auth_user_id,
      approver_id: applicantUser.auth_user_id,
      approved_at: new Date().toISOString(),
      status: "approved",
      request_details: details,
    });

  if (rpaError) {
    console.error("[spot-offer-sync-check] create job request insert error", {
      shift_id: shiftId,
      error: rpaError,
    });
    throw rpaError;
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
