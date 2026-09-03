import { NextResponse } from "next/server";
import { WORDPRESS_PAGE_STATUSES, type WordPressPageInput } from "@/lib/wordpress/types";
import { WordPressApiError } from "@/lib/wordpress/server";

export function wordpressErrorResponse(error: unknown) {
  if (error instanceof WordPressApiError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { ok: false, error: "WordPress処理中に予期しないエラーが発生しました。" },
    { status: 500 }
  );
}

export function parsePageInput(body: unknown): WordPressPageInput {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new WordPressApiError("入力内容が正しくありません。", 400, "invalid_request");
  }
  const record = body as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const content = typeof record.content === "string" ? record.content : "";
  const slug = typeof record.slug === "string" ? record.slug.trim() : "";
  const status = typeof record.status === "string" ? record.status : "";

  if (!title || title.length > 300) {
    throw new WordPressApiError(
      "タイトルは1〜300文字で入力してください。",
      400,
      "invalid_title"
    );
  }
  if (slug.length > 200 || /[/?#\\]/.test(slug)) {
    throw new WordPressApiError(
      "slugは200文字以内で、/ ? # \\ を含めずに入力してください。",
      400,
      "invalid_slug"
    );
  }
  if (!WORDPRESS_PAGE_STATUSES.includes(status as WordPressPageInput["status"])) {
    throw new WordPressApiError(
      "statusはdraft、publish、privateのいずれかを指定してください。",
      400,
      "invalid_status"
    );
  }
  if (content.length > 5_000_000) {
    throw new WordPressApiError("本文が大きすぎます。", 413, "content_too_large");
  }

  return { title, content, slug, status: status as WordPressPageInput["status"] };
}

export function parsePageId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new WordPressApiError("固定ページIDが正しくありません。", 400, "invalid_page_id");
  }
  return id;
}
