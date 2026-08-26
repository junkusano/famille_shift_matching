import "server-only";

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export async function getRecordingTranscriptAuthUserId(
  request: NextRequest,
): Promise<string | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (token) {
    const auth = await supabaseAdmin.auth.getUser(token);
    return auth.data.user?.id ?? null;
  }

  // auth-helpers 0.10は同期Cookie APIを前提としているため、Next.js 15では
  // cookie storeを先にawaitし、同期アクセサとして渡す。
  const cookieStore = await cookies();
  const context = { cookies: () => cookieStore } as unknown as Parameters<
    typeof createRouteHandlerClient
  >[0];
  const auth = await createRouteHandlerClient(context).auth.getUser();
  return auth.data.user?.id ?? null;
}
