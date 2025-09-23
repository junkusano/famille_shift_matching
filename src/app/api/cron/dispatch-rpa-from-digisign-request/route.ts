//api/cron/dispatch-rpa-from-digisign-request
import { NextRequest, NextResponse } from "next/server";
import {
  dispatchLineworksPdfToRPA,
  dispatchCareManagerDigisign,
} from "@/lib/supabase/analyzeDigisignRequest";
import { supabaseAdmin as supabase } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 簡易認証（CRON / 手動叩き用） */
function ok(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return true;
  const bearer = req.headers.get("authorization") || "";
  if (bearer === `Bearer ${secret}`) return true;
  const q = new URL(req.url).searchParams.get("secret");
  return q === secret;
}

export async function GET(req: NextRequest) {
  if (!ok(req)) return new NextResponse("forbidden", { status: 403 });

  const url = new URL(req.url);
  const caremgr = url.searchParams.get("caremgr") === "1";
  const dry = url.searchParams.get("dry") === "1";
  const debug = url.searchParams.get("debug") === "1";
  const pageSize = Number(url.searchParams.get("pageSize") ?? 5000);

  const since = url.searchParams.get("since") ?? undefined;
  const until = url.searchParams.get("until") ?? undefined;
  const channelId = url.searchParams.get("channelId") ?? undefined;
  const templateId = url.searchParams.get("templateId") ?? undefined;

  try {
    // DRY/DEBUG：拾えるか事前確認
    if (dry || debug) {
      const useChannel =
        caremgr && !channelId
          ? "fe94ddd0-f600-cc3b-b6f4-73f05019f0a2"
          : channelId ?? "a134fad8-e459-4ea3-169d-be6f5c0a6aad";

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const useSince = since ?? oneDayAgo;
      const useUntil = until ?? now.toISOString();

      const { data, error } = await supabase
        .from("msg_lw_log")
        .select("id,timestamp,user_id,channel_id,file_id,status")
        .eq("channel_id", useChannel)
        .not("file_id", "is", null)
        .eq("status", 0)
        .gte("timestamp", useSince)
        .lte("timestamp", useUntil)
        .limit(pageSize);

      if (error) {
        console.error("DRY select error:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      const sample = (data ?? []).slice(0, 10);
      console.log("[DRY] rows:", (data ?? []).length, "window:", useSince, "→", useUntil, "channel:", useChannel);

      return NextResponse.json({
        ok: true,
        mode: "dry",
        count: (data ?? []).length,
        window: { since: useSince, until: useUntil },
        channelId: useChannel,
        sample,
      });
    }

    // 本実行：caremgr=1 なら自動マップ。指定があれば指定優先。
    const res =
      caremgr && !channelId && !templateId
        ? await dispatchCareManagerDigisign({ since, until, pageSize })
        : await dispatchLineworksPdfToRPA({ since, until, channelId, templateId, pageSize });

    console.log("[RUN] result:", res);
    return NextResponse.json({ ok: true, ...res });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("handler error:", msg);
    return new NextResponse(`error: ${msg}`, { status: 500 });
  }
}

export const POST = GET;
