import { timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runDuePublicNotices } from "@/lib/knowledge-automation/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const expected = Buffer.from(process.env.CRON_SECRET || "");
  const received = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  if (!expected.length || expected.length !== received.length || !timingSafeEqual(expected, received)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json({ ok: true, results: await runDuePublicNotices() }); }
  catch { return NextResponse.json({ ok: false, error: "お知らせの定時実行に失敗しました。" }, { status: 500 }); }
}
