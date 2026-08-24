import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth/getUserFromBearer";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** β版利用者メニュー専用。サービスロールの一覧取得はmanager/adminに限定する。 */
export async function GET(request: NextRequest) {
  const { user } = await getUserFromBearer(request);
  if (!user) return NextResponse.json({ ok: false, error: "認証が必要です。" }, { status: 401 });

  const { data: operator, error: operatorError } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (operatorError) return NextResponse.json({ ok: false, error: operatorError.message }, { status: 500 });
  if (operator?.system_role !== "manager" && operator?.system_role !== "admin") {
    return NextResponse.json({ ok: false, error: "この機能はmanager/admin向けです。" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("cs_kaipoke_info")
    .select("id,kaipoke_cs_id,name,kana,asigned_org,asigned_jisseki_staff")
    .eq("is_active", true)
    .order("kana", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data: data ?? [] });
}
