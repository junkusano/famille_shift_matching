import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
        return NextResponse.json({ error: "ログイン情報が取得できません。" }, { status: 401 });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
        return NextResponse.json({ error: "ログイン情報が確認できません。" }, { status: 401 });
    }

    const authUserId = userData.user.id;

    const { data: userRow, error: userRowError } = await supabaseAdmin
        .from("users")
        .select("user_id")
        .eq("auth_user_id", authUserId)
        .maybeSingle();

    if (userRowError) {
        return NextResponse.json({ error: userRowError.message }, { status: 500 });
    }

    const employeeNo = userRow?.user_id;

    if (!employeeNo) {
        return NextResponse.json({ error: "従業員番号が取得できません。" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
        .from("user_notification_determination")
        .select("*")
        .eq("従業員番号", employeeNo)
        .order("変更日", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const availableDates = Array.from(
        new Set((data ?? []).map((r) => String(r["変更日"] ?? "")).filter(Boolean))
    );

    const targetDate = req.nextUrl.searchParams.get("date");
    const rows = targetDate
        ? (data ?? []).filter((r) => String(r["変更日"]) === targetDate)
        : data ?? [];

    return NextResponse.json({
        rows,
        availableDates,
    });
}