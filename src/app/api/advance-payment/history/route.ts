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
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
      .select("user_id, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (userError) throw userError;
    if (!loginUser?.user_id) {
      return NextResponse.json({ ok: false, error: "login user not found" }, { status: 404 });
    }

    const normalizedRole = String(loginUser.role ?? "").trim().toUpperCase();

    const canViewAll =
      normalizedRole === "MANAGER" ||
      normalizedRole === "ADMIN" ||
      normalizedRole === "FULL";

    let appQuery = supabase
      .from("user_advance_payment_applications")
      .select(`
        id,
        application_no,
        user_id,
        employee_name,
        department,
        amount,
        desired_payment_date,
        status,
        rejected_reason,
        paid_at,
        created_at,
        shift_ids,
        deduction_rate,
        deduction_reasons
      `)
      .order("created_at", { ascending: false });

    if (!canViewAll) {
      appQuery = appQuery.eq("user_id", loginUser.user_id);
    }

    const { data: appsData, error: appsError } = await appQuery;
    if (appsError) throw appsError;

    const rows = (appsData ?? []).map((app) => ({
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
      applicant_name: app.employee_name ?? app.user_id ?? "-",
      amount: app.amount === null || app.amount === undefined ? null : Number(app.amount),
      desired_payment_date: app.desired_payment_date ?? null,
      applied_at: app.created_at ?? null,
      rejected_reason: app.rejected_reason ?? null,
      deduction_reasons: Array.isArray(app.deduction_reasons) ? app.deduction_reasons : [],
      deduction_rate:
        app.deduction_rate === null || app.deduction_rate === undefined
          ? null
          : Number(app.deduction_rate),
    }));

    return NextResponse.json({
      ok: true,
      user_id: loginUser.user_id,
      role: loginUser.role,
      canViewAll,
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