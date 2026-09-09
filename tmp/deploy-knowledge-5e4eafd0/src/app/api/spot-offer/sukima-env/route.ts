import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

const GROUP_KEY = "sukima";

async function requireManager(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("UNAUTHORIZED");

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) throw new Error("UNAUTHORIZED");

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("users")
    .select("system_role")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (staffError) throw staffError;
  if (!["admin", "manager"].includes((staff?.system_role ?? "").toLowerCase())) {
    throw new Error("FORBIDDEN");
  }
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "設定の取得に失敗しました";
  const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
  const userMessage = message === "UNAUTHORIZED"
    ? "ログインしてください"
    : message === "FORBIDDEN"
      ? "この操作を実行する権限がありません"
      : message;
  console.error("[spot-offer/sukima-env] failed", error);
  return NextResponse.json({ ok: false, error: userMessage }, { status });
}

export async function GET(req: NextRequest) {
  try {
    await requireManager(req);
    const { data, error } = await supabaseAdmin
      .from("env_variables")
      .select("group_key,key_name,value")
      .eq("group_key", GROUP_KEY)
      .order("key_name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, variables: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireManager(req);
    const body = await req.json() as { variables?: unknown };
    if (!Array.isArray(body.variables) || body.variables.length > 100) {
      return NextResponse.json({ ok: false, error: "設定値の形式が不正です" }, { status: 400 });
    }

    const variables = body.variables.map((item) => {
      if (!item || typeof item !== "object") throw new Error("設定値の形式が不正です");
      const row = item as { key_name?: unknown; value?: unknown };
      if (typeof row.key_name !== "string" || !row.key_name.trim() || typeof row.value !== "string") {
        throw new Error("設定値の形式が不正です");
      }
      if (row.key_name.length > 200 || row.value.length > 10000) {
        throw new Error("設定値が長すぎます");
      }
      return {
        group_key: GROUP_KEY,
        key_name: row.key_name.trim(),
        value: row.value,
        updated_at: new Date().toISOString(),
      };
    });

    if (variables.length > 0) {
      const { error } = await supabaseAdmin
        .from("env_variables")
        .upsert(variables, { onConflict: "group_key,key_name" });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
