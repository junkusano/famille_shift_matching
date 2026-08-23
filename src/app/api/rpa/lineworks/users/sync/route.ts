import { NextRequest, NextResponse } from "next/server";

import { requireApiKey } from "@/lib/cm/rpa/auth";
import { fetchAllLineworksUsers } from "@/lib/lineworks/fetchAllUsers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  try {
    const users = await fetchAllLineworksUsers();
    if (users.length === 0) {
      throw new Error("LINE WORKS returned no users");
    }

    const rows = users.map((user) => {
      const email = user.email ?? "";
      const userId = email.includes("@") ? email.split("@")[0] : "";
      return {
        user_id: userId,
        lw_userid: user.userId ?? "",
        email,
        department: user.organizations?.[0]?.organizationName ?? "",
        position: user.organizations?.[0]?.orgUnits?.[0]?.positionName ?? "",
        level: user.organizations?.[0]?.levelName ?? "",
        nickname: user.nickName ?? "",
        full_name: `${user.userName?.lastName ?? ""} ${user.userName?.firstName ?? ""}`.trim(),
        updated_at: new Date().toISOString(),
      };
    });
    if (rows.some((row) => !row.user_id || !row.lw_userid)) {
      throw new Error("LINE WORKS returned a user without a sync identifier");
    }

    const { error: deleteError } = await supabaseAdmin
      .from("users_lw_temp")
      .delete()
      .not("user_id", "is", null);
    if (deleteError) throw deleteError;

    const { error: upsertError } = await supabaseAdmin
      .from("users_lw_temp")
      .upsert(rows, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    console.info("[rpa/lineworks/users/sync] completed", {
      count: rows.length,
    });
    return NextResponse.json({ ok: true, count: rows.length });
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
