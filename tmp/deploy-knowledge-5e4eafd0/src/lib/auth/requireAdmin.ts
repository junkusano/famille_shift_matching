import "server-only";

import type { User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

export type AdminActor = {
  authUser: User;
  userId: string | null;
};

export type AdminAuthResult =
  | { ok: true; actor: AdminActor }
  | { ok: false; response: NextResponse };

export async function authenticateAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const { user } = await getUserFromBearer(request);
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "認証が必要です。" },
        { status: 401 }
      ),
    };
  }

  const { data: operator, error } = await supabaseAdmin
    .from("users")
    .select("user_id,system_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "権限情報を確認できませんでした。" },
        { status: 500 }
      ),
    };
  }

  if (operator?.system_role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "この機能はadmin専用です。" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    actor: {
      authUser: user,
      userId: typeof operator.user_id === "string" ? operator.user_id : null,
    },
  };
}

export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  const result = await authenticateAdmin(request);
  return result.ok === true ? null : result.response;
}
