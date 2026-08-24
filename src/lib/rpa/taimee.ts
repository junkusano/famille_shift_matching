import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/service";

export type TaimeeSmsStatus = "unsent" | "sent" | "failed" | "duplicate" | "skipped" | "phone_not_found";

export class RpaTaimeeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function requireTaimeeRpaOperator(request?: Request): Promise<void> {
  const authorization = request?.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  // 通常操作はCookie、RPAはログイン済み画面から渡される短期Bearerを使う。
  // いずれもSupabaseで検証し、認証情報自体は保存しない。
  // Bearerは既存の管理APIと同じく、Supabase Adminクライアントで検証する。
  // 匿名クライアント経由だと、本番環境で拡張機能から渡されたJWTが401になる場合がある。
  const { data, error } = bearer
    ? await supabaseAdmin.auth.getUser(bearer)
    : await createRouteHandlerClient({ cookies }).auth.getUser();
  if (error || !data.user) throw new RpaTaimeeError("ログインしてください", 401);

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!["admin", "manager"].includes((staff?.system_role ?? "").toLowerCase())) {
    throw new RpaTaimeeError("この操作を実行する権限がありません", 403);
  }
}

export function nullableText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function normalizePhone(value: unknown): string | null {
  const raw = nullableText(value, 40);
  if (!raw) return null;
  const phone = raw.replace(/\D/g, "");
  return /^0[789]0\d{8}$/.test(phone) ? phone : null;
}

export function splitWorkerName(name: string): { lastName: string; firstName: string | null } {
  const parts = name.trim().split(/[\s\u3000]+/).filter(Boolean);
  return { lastName: parts[0] ?? name, firstName: parts.slice(1).join(" ") || null };
}

export function workMonth(workDate: string): string {
  return `${workDate.slice(0, 7)}-01`;
}

export function workDatePhrase(workDate: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const today = formatter.format(new Date()).replace(/\//g, "-");
  return today === workDate ? "本日は" : "先日は";
}

export function renderRecruitmentTemplate(template: string, workDate: string): string {
  return template.replaceAll("{{work_date_phrase}}", workDatePhrase(workDate));
}

export function isRpaTaimeeError(error: unknown): error is RpaTaimeeError {
  return error instanceof RpaTaimeeError;
}
