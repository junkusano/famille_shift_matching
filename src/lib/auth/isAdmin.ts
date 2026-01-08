// src/lib/auth/isAdmin.ts
import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function isAdminByAuthUserId(
  _supabase: SupabaseClient,
  authUserId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) return false;

  const role = (data?.system_role ?? "").toString();
  const roles = new Set(["admin", "system_admin", "super_admin"]);
  return roles.has(role);
}

