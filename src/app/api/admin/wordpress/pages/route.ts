import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrAdmin } from "@/lib/auth/requireManagerOrAdmin";
import { createWordPressPage, listWordPressPages } from "@/lib/wordpress/server";
import { parsePageInput, wordpressErrorResponse } from "../route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, Number(request.nextUrl.searchParams.get("perPage") ?? 20) || 20)
  );
  try {
    const result = await listWordPressPages(page, perPage);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return wordpressErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const authError = await requireManagerOrAdmin(request);
  if (authError) return authError;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json(
      { ok: false, error: "Content-Typeはapplication/jsonを指定してください。" },
      { status: 415 }
    );
  }
  try {
    const input = parsePageInput(await request.json());
    const page = await createWordPressPage(input);
    return NextResponse.json(
      { ok: true, message: "固定ページを作成しました。", page },
      { status: 201 }
    );
  } catch (error) {
    return wordpressErrorResponse(error);
  }
}
