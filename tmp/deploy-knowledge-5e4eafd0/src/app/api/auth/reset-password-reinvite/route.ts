//api/auth/reset-password-reinvite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppBaseUrl } from "@/lib/env/getAppBaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function normalizedEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

const GENERIC_OK_MESSAGE =
  "該当するアカウントが存在する場合、メールを送信しました。メールをご確認ください。";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizedEmail(body?.email);

    if (!email) {
      return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
    }

    // 1) form_entries に該当メールがあるか
    const { data: entry, error: entryError } = await supabaseAdmin
      .from("form_entries")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (entryError || !entry?.id) {
      if (entryError) console.error("form_entries lookup error:", entryError);
      return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
    }

    // 2) users を確認
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_id, auth_user_id, entry_id, status")
      .eq("entry_id", entry.id)
      .maybeSingle();

    if (userError) {
      console.error("users lookup error:", userError);
      return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
    }

    const redirectTo = `${getAppBaseUrl()}/signup/complete`;

    // 3-A) 既存 auth_user_id がある → パスワード再設定メール
    if (userRow?.auth_user_id) {
      const { error: recoveryError } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo,
      });

      if (recoveryError) {
        console.error("resetPasswordForEmail error:", recoveryError);
      }

      return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
    }

    // 3-B) まだ auth_user_id がない → 初回設定メール
    const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.signUp({
      email,
      password: "DummyPass123!",
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signUpError) {
      console.error("signUp error:", signUpError);
      return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
    }

    if (signUpData.user?.id) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          auth_user_id: signUpData.user.id,
          status: "auth_mail_send",
        })
        .eq("entry_id", entry.id);

      if (updateError) {
        console.error("users update error:", updateError);
      }
    }

    return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
  } catch (error) {
    console.error("reset-password-reinvite unexpected error:", error);
    return NextResponse.json({ ok: true, message: GENERIC_OK_MESSAGE }, { status: 200 });
  }
}