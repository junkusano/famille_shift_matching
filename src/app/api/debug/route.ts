// src/app/api/debug/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: sessionData, error: sessErr } =
    await supabase.auth.getSession();

  const { data: userData, error: userErr } =
    await supabase.auth.getUser();

  return NextResponse.json({
    sessionUserId: sessionData.session?.user?.id ?? null,
    hasAccessToken: !!sessionData.session?.access_token,
    userUserId: userData.user?.id ?? null,
    sessErr: sessErr?.message ?? null,
    userErr: userErr?.message ?? null,
  });
}
