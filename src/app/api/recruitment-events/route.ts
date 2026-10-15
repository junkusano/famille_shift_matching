import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";
import { journeyEventSchema } from "@/lib/recruitmentTracking";

const origins = new Set(["https://myfamille.shi-on.net", "https://shi-on.net", "https://www.shi-on.net"]);
export async function POST(req: NextRequest) {
  if (!origins.has(req.headers.get("origin") || "")) return new NextResponse(null, { status: 403 });
  if (Number(req.headers.get("content-length") || 0) > 1024) return new NextResponse(null, { status: 413 });
  try {
    const text = await req.text();
    if (text.length > 1024) return new NextResponse(null, { status: 413 });
    const parsed = journeyEventSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return new NextResponse(null, { status: 400 });
    const v = parsed.data;
    // Unique key deduplicates clicks, native validation events and retries.
    const { error } = await supabaseAdmin.from("recruitment_journey_events").upsert({ journey_id: v.journeyId, event: v.event, page: v.page, source: v.source, placement: v.placement }, { onConflict: "journey_id,event,page,placement", ignoreDuplicates: true });
    return new NextResponse(null, { status: error ? 503 : 204 });
  } catch { return new NextResponse(null, { status: 400 }); }
}
