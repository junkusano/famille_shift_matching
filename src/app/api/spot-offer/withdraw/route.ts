import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const WITHDRAW_RPA_TEMPLATE_ID = "fbd64ab4-a7a3-40b7-a718-61d6fac39525";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const shiftId = body.shift_id;

  if (!shiftId) {
    return NextResponse.json(
      { ok: false, error: "shift_id is required" },
      { status: 400 }
    );
  }

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

  const { data: spotOffer, error: spotOfferError } = await supabaseAdmin
    .from("spot_offer_request_table")
    .select("*")
    .eq("shift_id", shiftId)
    .maybeSingle();

  if (spotOfferError) {
    return NextResponse.json(
      { ok: false, error: spotOfferError.message },
      { status: 500 }
    );
  }

  if (!spotOffer) {
    return NextResponse.json(
      { ok: false, error: "対象のスポット募集データがありません" },
      { status: 404 }
    );
  }

  if (!spotOffer.taimee_job_id) {
    return NextResponse.json(
      { ok: false, error: "taimee_job_id がありません" },
      { status: 400 }
    );
  }

  const requestDetails = {
  created_from: "/portal/roster/daily",

  // PADが処理種別を判定するため
  command: "close_job",

  // アプリ側の識別用
  action: "withdraw_taimee_job",

  shift_id: spotOffer.shift_id,
  core_id: spotOffer.core_id,
  taimee_job_id: spotOffer.taimee_job_id,

  kaipoke_cs_id: spotOffer.kaipoke_cs_id,
  template_title: spotOffer.template_title,
  shift_start_date: spotOffer.shift_start_date,
  shift_start_time: spotOffer.shift_start_time,
  shift_end_time: spotOffer.shift_end_time,

  requested_status: "募集なし",
  previous_status: spotOffer.status,
};

  const { error: rpaError } = await supabaseAdmin
    .from("rpa_command_requests")
    .insert({
      template_id: WITHDRAW_RPA_TEMPLATE_ID,
      requester_id: requesterAuthUserId,
      approver_id: approverAuthUserId,
      status: "approved",
      request_details: requestDetails,
    });

  if (rpaError) {
    return NextResponse.json(
      { ok: false, error: rpaError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    shift_id: shiftId,
    taimee_job_id: spotOffer.taimee_job_id,
    message: "タイミー取り下げ用RPAリクエストを作成しました",
  });
}