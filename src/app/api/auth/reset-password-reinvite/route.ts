//api/auth/reset-password-reinvite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
  "該当するアカウントが存在する場合、パスワード設定メールを送信しました。メールをご確認ください。";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizedEmail(body?.email);

    if (!email) {
      return NextResponse.json(
        {
          ok: true,
          message: GENERIC_OK_MESSAGE,
        },
        { status: 200 }
      );
    }

    // 1) entry を確認
    const { data: entry, error: entryError } = await supabaseAdmin
      .from("form_entries")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (entryError) {
      console.error("form_entries lookup error:", entryError);
      return NextResponse.json(
        { ok: true, message: GENERIC_OK_MESSAGE },
        { status: 200 }
      );
    }

    if (!entry?.id) {
      return NextResponse.json(
        { ok: true, message: GENERIC_OK_MESSAGE },
        { status: 200 }
      );
    }

    // 2) users を確認
    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .select("user_id, auth_user_id, entry_id")
      .eq("entry_id", entry.id)
      .maybeSingle();

    if (userError) {
      console.error("users lookup error:", userError);
      return NextResponse.json(
        { ok: true, message: GENERIC_OK_MESSAGE },
        { status: 200 }
      );
    }

    // 3) 既存 auth user があれば削除
    if (userRow?.auth_user_id) {
      const { error: deleteError } =
        await supabaseAdmin.auth.admin.deleteUser(userRow.auth_user_id);

      if (deleteError) {
        console.error("delete auth user error:", deleteError);
        // セキュア優先で外には出さない
        return NextResponse.json(
          { ok: true, message: GENERIC_OK_MESSAGE },
          { status: 200 }
        );
      }

      const { error: clearError } = await supabaseAdmin
        .from("users")
        .update({
          auth_user_id: null,
          status: "account_id_create",
        })
        .eq("entry_id", entry.id);

      if (clearError) {
        console.error("clear users auth_user_id error:", clearError);
        return NextResponse.json(
          { ok: true, message: GENERIC_OK_MESSAGE },
          { status: 200 }
        );
      }
    }

    // 4) 招待メールを再送
    const { data: signUpData, error: signUpError } =
      await supabaseAdmin.auth.signUp({
        email,
        password: "DummyPass123!",
        options: {
          emailRedirectTo: "https://myfamille.shi-on.net/signup/complete",
          data: {},
        },
      });

    if (signUpError) {
      console.error("signUp resend error:", signUpError);
      return NextResponse.json(
        { ok: true, message: GENERIC_OK_MESSAGE },
        { status: 200 }
      );
    }

    // 5) 新しい auth_user_id を users に保存
    if (signUpData.user?.id) {
      const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          auth_user_id: signUpData.user.id,
          status: "auth_mail_send",
        })
        .eq("entry_id", entry.id);

      if (updateError) {
        console.error("update users auth_user_id error:", updateError);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        message: GENERIC_OK_MESSAGE,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("reset-password-reinvite unexpected error:", error);
    return NextResponse.json(
      {
        ok: true,
        message: GENERIC_OK_MESSAGE,
      },
      { status: 200 }
    );
  }
}