import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { runGoogleMapsDistanceUpdate } from "@/lib/googleMapsDistance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorizedManual(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return { ok: true, userId: "cron" };
  const token = request.headers.get("x-supabase-access-token");
  if (!token) return { ok: false, userId: "" };
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return { ok: false, userId: "" };
  const { data: profile } = await supabaseAdmin.from("users").select("system_role").eq("auth_user_id", user.id).maybeSingle();
  return { ok: profile?.system_role === "admin" || profile?.system_role === "manager", userId: user.id };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runGoogleMapsDistanceUpdate("cron", "cron:google-maps-distance")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = await authorizedManual(request);
  if (!auth.ok) return NextResponse.json({ error: "管理者またはマネージャー権限が必要です" }, { status: 403 });
  try { return NextResponse.json(await runGoogleMapsDistanceUpdate("manual", auth.userId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 }); }
}
