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

    if (!shift) {
      await createCloseRequest(spotOfferRequest, "shift_deleted", opts);
      closeCount++;
      continue;
    }

    const shouldCloseByStaff = false;

    if (shouldCloseByStaff) {
      await createCloseRequest(spotOfferRequest, "staff_confirmed", opts);
      closeCount++;
      continue;
    }

    const diffMinutes = 0;

    if (diffMinutes > 20) {
      await createManagerAlert(spotOfferRequest, shift, opts);
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

  const { error } = await supabase.from("wf_request").insert({
    request_type_id: SKIMABITO_JOB_EDIT_REQUEST_TYPE_ID,
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
  _shift: Record<string, unknown>,
  opts?: { dryRun?: boolean }
) {
  console.log("[spot-offer-sync-check] create manager alert", {
    shift_id: spotOfferRequest["shift_id"],
    dryRun: opts?.dryRun ?? false,
  });
}