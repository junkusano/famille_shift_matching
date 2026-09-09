import "server-only";

import type { NextRequest } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

const MANAGE_ROLES = new Set([
  "admin",
  "system_admin",
  "super_admin",
  "manager",
  "senior_care_manager",
]);

export class MonitoringAuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "MonitoringAuthError";
  }
}

export type MonitoringActor = {
  authUserId: string;
  userId: string;
  email: string | undefined;
  name: string;
  role: string;
  canManage: boolean;
};

export async function requireMonitoringActor(
  request: NextRequest,
  options: { manage?: boolean } = {},
): Promise<MonitoringActor> {
  const { user } = await getUserFromBearer(request);
  if (!user) throw new MonitoringAuthError("認証が必要です", 401);

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("user_id,system_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error || !data?.user_id) {
    throw new MonitoringAuthError("利用者情報を確認できません", 403);
  }

  const role = String(data.system_role ?? "").trim().toLowerCase();
  const canManage = MANAGE_ROLES.has(role);
  if (options.manage && !canManage) {
    throw new MonitoringAuthError(
      "モニタリングの生成・確定・PDF作成・FAX送信を行う権限がありません",
      403,
    );
  }

  const metadataName = [
    user.user_metadata?.last_name_kanji,
    user.user_metadata?.first_name_kanji,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    authUserId: user.id,
    userId: String(data.user_id),
    email: user.email,
    name: metadataName || user.user_metadata?.full_name || user.email || String(data.user_id),
    role,
    canManage,
  };
}

export function monitoringAuthErrorResponse(error: unknown): { message: string; status: number } {
  if (error instanceof MonitoringAuthError) {
    return { message: error.message, status: error.status };
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    status: 500,
  };
}
