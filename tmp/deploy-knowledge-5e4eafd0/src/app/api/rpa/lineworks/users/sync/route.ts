import { NextRequest, NextResponse } from "next/server";

import { requireApiKey } from "@/lib/cm/rpa/auth";
import { fetchAllLineworksUsers } from "@/lib/lineworks/fetchAllUsers";
import { saveUsersLWTemp } from "@/lib/supabase/saveUsersLwTemp";

export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  try {
    const users = await fetchAllLineworksUsers();
    await saveUsersLWTemp(users, { replace: true });

    console.info("[rpa/lineworks/users/sync] completed", {
      count: users.length,
    });
    return NextResponse.json({ ok: true, count: users.length });
  } catch (error) {
    console.error("[rpa/lineworks/users/sync] failed", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "LINE WORKS user sync failed" },
      { status: 500 }
    );
  }
}
