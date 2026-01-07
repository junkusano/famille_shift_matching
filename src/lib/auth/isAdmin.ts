// src/lib/auth/isAdmin.ts
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * user_entry_united_view_single.system_role を見て admin 判定する想定。
 * ※実際のロール文字列に合わせて roles を調整してください。
 */
export async function isAdminByAuthUserId(
  supabase: SupabaseClient,
  authUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) return false;
  const role = (data?.system_role ?? "").toString();

  const roles = new Set(["admin", "system_admin", "super_admin"]);
  return roles.has(role);
}
