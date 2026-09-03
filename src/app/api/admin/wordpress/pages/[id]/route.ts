import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { getWordPressPage, updateWordPressPage } from "@/lib/wordpress/server";
import {
  parsePageId,
  parsePageInput,
  wordpressErrorResponse,
} from "../../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  try {
    const page = await getWordPressPage(parsePageId((await context.params).id));
    return NextResponse.json({ ok: true, page });
  } catch (error) {
    return wordpressErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json(
      { ok: false, error: "Content-Typeはapplication/jsonを指定してください。" },
      { status: 415 }
    );
  }
  try {
    const id = parsePageId((await context.params).id);
    const input = parsePageInput(await request.json());
    const page = await updateWordPressPage(id, input);
    return NextResponse.json({ ok: true, message: "固定ページを更新しました。", page });
  } catch (error) {
    return wordpressErrorResponse(error);
  }
}
