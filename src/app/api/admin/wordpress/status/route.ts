import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import {
  checkWordPressConnection,
  getWordPressHostname,
} from "@/lib/wordpress/server";
import { wordpressErrorResponse } from "../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  try {
    const connection = await checkWordPressConnection();
    return NextResponse.json({ ok: true, connected: true, ...connection });
  } catch (error) {
    const response = wordpressErrorResponse(error);
    const body = await response.json();
    return NextResponse.json(
      {
        ...body,
        connected: false,
        hostname: getWordPressHostname(),
      },
      { status: response.status }
    );
  }
}
