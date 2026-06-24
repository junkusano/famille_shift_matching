import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function runSpotOfferSyncCheck(
  opts?: {
    dryRun?: boolean;
  }
) {
  console.log("[spot-offer-sync-check] start");

  let closeCount = 0;
  let alertCount = 0;

  const { data: spotOfferRequests, error } = await supabase
    .from("spot_offer_request_table")
    .select("*")
    .in("status", ["募集中", "確定"]);

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

    // シフト削除チェック
    if (!shift) {
      await createCloseRequest(spotOfferRequest, "shift_deleted", opts);

      closeCount++;
      continue;
    }

    // スタッフ確定チェック：あとで条件を作る
    const shouldCloseByStaff = false;

    if (shouldCloseByStaff) {
      await createCloseRequest(spotOfferRequest, "staff_confirmed", opts);

      closeCount++;
      continue;
    }

    // 時間変更チェック：あとで差分計算を作る
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
  console.log("[spot-offer-sync-check] create close request", {
    shift_id: spotOfferRequest["shift_id"],
    reason,
    dryRun: opts?.dryRun ?? false,
  });
}

  // 次にここへ wf_request insert を入れる


async function createManagerAlert(
  spotOfferRequest: Record<string, unknown>,
  _shift: Record<string, unknown>,
  opts?: { dryRun?: boolean }
) {
  console.log("[spot-offer-sync-check] create manager alert", {
    shift_id: spotOfferRequest.shift_id,
    dryRun: opts?.dryRun ?? false,
  });

  // 次にここへ manager alert insert を入れる
}