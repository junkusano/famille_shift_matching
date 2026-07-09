import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const statusLabel: Record<string, string> = {
  submitted: "申請中",
  approved: "承認済み",
  rejected: "差戻し",
  paid: "支払済み",
  cancelled: "取消",
};

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URaL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError) throw authError;
    if (!user) {
      return NextResponse.json({ ok: false, error: "user not found" }, { status: 401 });
    }

    const { data: loginUser, error: userError } = await supabase
      .from("users")
      .select("user_id, system_role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!loginUser?.user_id) {
      return NextResponse.json({ ok: false, error: "login user not found" }, { status: 404 });
    }

    const normalizedRole = String(loginUser.system_role ?? "").trim().toUpperCase();

    const canViewAll =
      normalizedRole === "MANAGER" ||
      normalizedRole === "ADMIN";
    let appQuery = supabase
      .from("user_advance_payment_applications")
      .select(`
        id,
        application_no,
        user_id,
        employee_name,
        department,
        base_amount,
        available_amount,
        amount,
        deduction_rate,
        deduction_reasons,
        desired_payment_date,
        status,
        rejected_reason,
        paid_at,
        created_at,
        shift_ids

      `)
      .order("created_at", { ascending: false });

    if (!canViewAll) {
      appQuery = appQuery.eq("user_id", loginUser.user_id);
    }

    const { data: appsData, error: appsError } = await appQuery;
    if (appsError) throw appsError;

   const applicantUserIds = Array.from(
  new Set((appsData ?? []).map((app) => app.user_id).filter(Boolean))
);

let applicantNameMap = new Map<string, string>();

if (applicantUserIds.length > 0) {
  const { data: applicantEntries, error: applicantEntriesError } = await supabase
    .from("form_entries")
    .select("user_id, last_name_kanji, first_name_kanji")
    .in("user_id", applicantUserIds);

  if (applicantEntriesError) {
    console.error("applicantEntriesError", applicantEntriesError);
  } else {
    applicantNameMap = new Map(
      (applicantEntries ?? []).map((entry) => [
        entry.user_id,
        `${entry.last_name_kanji ?? ""} ${entry.first_name_kanji ?? ""}`.trim(),
      ])
    );
  }
}

    const rows = (appsData ?? []).map((app) => {
  const feeAmount = 200;

  const baseAmount =
    app.base_amount === null || app.base_amount === undefined
      ? null
      : Number(app.base_amount);

  const availableAmount =
    app.available_amount === null || app.available_amount === undefined
      ? null
      : Number(app.available_amount);

  const totalDeductionAmount =
    baseAmount === null || availableAmount === null
      ? null
      : Math.max(baseAmount - availableAmount + feeAmount, 0);

  const transferAmount =
    availableAmount === null
      ? null
      : Math.max(availableAmount - feeAmount, 0);

  return {
    shift_id: Array.isArray(app.shift_ids) ? app.shift_ids.join(",") : "",
    shift_start_date: String(app.created_at ?? "").slice(0, 10),
    shift_start_time: "",
    shift_end_time: "",
    client_name: "-",
    staff_user_ids: app.user_id ? [app.user_id] : [],
    staff_names: [],
    application_no: app.application_no ?? null,
    application_status: app.status ?? "",
    application_status_label: statusLabel[app.status ?? ""] ?? app.status ?? "",
    applicant_name:
  app.employee_name ??
  applicantNameMap.get(app.user_id) ??
  app.user_id ??
  "-",

    base_amount: baseAmount,
    available_amount: availableAmount,
    amount: app.amount === null || app.amount === undefined ? null : Number(app.amount),
    total_deduction_amount: totalDeductionAmount,
    transfer_amount: transferAmount,

    desired_payment_date: app.desired_payment_date ?? null,
    applied_at: app.created_at ?? null,
    rejected_reason: app.rejected_reason ?? null,
    deduction_reasons: Array.isArray(app.deduction_reasons) ? app.deduction_reasons : [],
    deduction_rate:
      app.deduction_rate === null || app.deduction_rate === undefined
        ? null
        : Number(app.deduction_rate),
  };
});

return NextResponse.json({
  ok: true,
  user_id: loginUser.user_id,
  role: loginUser.system_role,
  canViewAll,
  count: rows.length,
  rows,
});


  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}