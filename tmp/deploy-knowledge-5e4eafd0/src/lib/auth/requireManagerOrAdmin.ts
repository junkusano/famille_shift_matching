import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function requireManagerOrAdmin(request: NextRequest) {
  const { user } = await getUserFromBearer(request);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "認証が必要です。" },
      { status: 401 }
    );
  }

  const { data: operator, error } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "権限情報を確認できませんでした。" },
      { status: 500 }
    );
  }

  if (operator?.system_role !== "admin" && operator?.system_role !== "manager") {
    return NextResponse.json(
      { ok: false, error: "この機能はmanager/admin向けです。" },
      { status: 403 }
    );
  }

  return null;
}
