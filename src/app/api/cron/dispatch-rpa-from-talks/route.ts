//import { NextRequest } from "next/server";
import analyzeTalksAndDispatchToRPA from "@/lib/supabase/analyzeTalksAndDispatchToRPA";

export async function GET(): Promise<Response> {
  try {
    const result = await analyzeTalksAndDispatchToRPA();
    return Response.json({ success: true, result });
  } catch (error: unknown) {
    console.error("RPA dispatch error:", error);
    return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
