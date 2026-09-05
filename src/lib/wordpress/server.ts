import "server-only";

import type {
  WordPressEditorKind,
  WordPressPageDetail,
  WordPressPageInput,
  WordPressPageSummary,
} from "@/lib/wordpress/types";

const REQUEST_TIMEOUT_MS = 15_000;

type WordPressObject = Record<string, unknown>;

type WordPressFetchResult<T> = {
  data: T;
  response: Response;
};

export class WordPressApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status = 500, code: string | null = null) {
    super(message);
    this.name = "WordPressApiError";
    this.status = status;
    this.code = code;
  }
}

function getConfig() {
  const apiUrl = process.env.WORDPRESS_API_URL?.trim();
  const username = process.env.WORDPRESS_USERNAME?.trim();
  const appPassword = process.env.WORDPRESS_APP_PASSWORD?.trim();
  const missing = [
    !apiUrl && "WORDPRESS_API_URL",
    !username && "WORDPRESS_USERNAME",
    !appPassword && "WORDPRESS_APP_PASSWORD",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new WordPressApiError(
      `WordPress接続設定が不足しています（${missing.join(", ")}）。`,
      503,
      "wordpress_config_missing"
    );
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(apiUrl as string);
  } catch {
    throw new WordPressApiError(
      "WORDPRESS_API_URLの形式が正しくありません。",
      503,
      "wordpress_config_invalid"
    );
  }

  if (baseUrl.protocol !== "https:") {
    throw new WordPressApiError(
      "WORDPRESS_API_URLにはhttpsのURLを指定してください。",
      503,
      "wordpress_config_invalid"
    );
  }

  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";

  return {
    baseUrl,
    hostname: baseUrl.hostname,
    authorization: `Basic ${Buffer.from(`${username}:${appPassword}`).toString("base64")}`,
  };
}

function errorMessageFor(status: number, code: string | null, fallback: string) {
  if (status === 401 || code === "rest_not_logged_in") {
    return "WordPressの認証に失敗しました。ユーザー名とApplication Passwordを確認してください。";
  }
  if (status === 403 || code === "rest_forbidden_context" || code === "rest_cannot_edit") {
    return "WordPress連携ユーザーに固定ページを編集する権限がありません。";
  }
  if (status === 404) return "WordPressの固定ページが見つかりません。";
  if (status >= 500) return "WordPress側でエラーが発生しました。時間をおいて再度お試しください。";
  return fallback || "WordPress APIの呼び出しに失敗しました。";
}

async function wordpressFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<WordPressFetchResult<T>> {
  const config = getConfig();
  const url = new URL(path.replace(/^\//, ""), config.baseUrl);
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", config.authorization);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new WordPressApiError(
      "WordPressに接続できませんでした。URLとネットワーク状態を確認してください。",
      502,
      "wordpress_unreachable"
    );
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    if (!response.ok) {
      throw new WordPressApiError(
        errorMessageFor(response.status, null, "WordPressから不正な応答が返されました。"),
        response.status,
        null
      );
    }
  }

  if (!response.ok) {
    const body = isObject(data) ? data : {};
    const code = typeof body.code === "string" ? body.code : null;
    const upstreamMessage = typeof body.message === "string" ? body.message : "";
    throw new WordPressApiError(
      errorMessageFor(response.status, code, upstreamMessage),
      response.status,
      code
    );
  }

  return { data: data as T, response };
}

function isObject(value: unknown): value is WordPressObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function titleValue(value: unknown) {
  if (!isObject(value)) return "";
  return stringValue(value.raw) || stringValue(value.rendered);
}

function pageSummary(value: unknown): WordPressPageSummary {
  if (!isObject(value)) throw new WordPressApiError("WordPressのページ情報が不正です。", 502);
  return {
    id: Number(value.id),
    title: titleValue(value.title),
    slug: stringValue(value.slug),
    status: stringValue(value.status),
    modified: stringValue(value.modified),
    link: stringValue(value.link),
  };
}

function detectEditor(page: WordPressObject): {
  kind: WordPressEditorKind;
  editable: boolean;
  warning: string | null;
} {
  const content = isObject(page.content) ? page.content : {};
  const raw = stringValue(content.raw);
  const rendered = stringValue(content.rendered);
  const meta = isObject(page.meta) ? page.meta : {};
  const metaKeys = Object.keys(meta).join(" ");

  if (
    /(?:data-elementor|elementor-(?:page|section|widget|element))/i.test(rendered) ||
    /_elementor_/i.test(metaKeys)
  ) {
    return {
      kind: "elementor",
      editable: false,
      warning:
        "Elementorで作成された可能性があるため、MyFamilleからの本文更新を停止しています。WordPress管理画面で編集してください。",
    };
  }

  if (/(?:\[vc_|\[et_pb_|\[fusion_|fl-builder|bricks-element)/i.test(`${raw}\n${rendered}`)) {
    return {
      kind: "other-builder",
      editable: false,
      warning:
        "ページビルダー固有の構造を検出したため、レイアウト保護のためMyFamilleからの更新を停止しています。",
    };
  }

  if (/<!--\s*wp:/i.test(raw)) {
    return { kind: "gutenberg", editable: true, warning: null };
  }

  return {
    kind: "classic",
    editable: true,
    warning: /\[[a-z][^\]]*\]/i.test(raw)
      ? "本文にショートコードが含まれています。記号を変更すると表示が崩れる場合があります。"
      : null,
  };
}

function contentRaw(page: WordPressObject) {
  const content = isObject(page.content) ? page.content : {};
  return stringValue(content.raw);
}

export function getWordPressHostname() {
  try {
    return getConfig().hostname;
  } catch {
    const apiUrl = process.env.WORDPRESS_API_URL?.trim();
    if (!apiUrl) return null;
    try {
      return new URL(apiUrl).hostname;
    } catch {
      return null;
    }
  }
}

export async function checkWordPressConnection() {
  const { data } = await wordpressFetch<unknown>(
    "users/me?context=edit&_fields=id,name,capabilities"
  );
  if (!isObject(data)) {
    throw new WordPressApiError("WordPressの認証確認応答が不正です。", 502);
  }
  const capabilities = isObject(data.capabilities) ? data.capabilities : {};
  if (capabilities.edit_pages !== true) {
    throw new WordPressApiError(
      "WordPress連携ユーザーに固定ページを編集する権限がありません。",
      403,
      "wordpress_edit_pages_forbidden"
    );
  }
  return { hostname: getConfig().hostname };
}

export async function listWordPressPages(page: number, perPage: number) {
  const query = new URLSearchParams({
    context: "edit",
    page: String(page),
    per_page: String(perPage),
    orderby: "modified",
    order: "desc",
    _fields: "id,title,slug,status,modified,link",
  });
  const { data, response } = await wordpressFetch<unknown>(`pages?${query}`);
  if (!Array.isArray(data)) {
    throw new WordPressApiError("WordPressの固定ページ一覧応答が不正です。", 502);
  }
  return {
    pages: data.map(pageSummary),
    page,
    perPage,
    total: Number(response.headers.get("x-wp-total") ?? data.length),
    totalPages: Number(response.headers.get("x-wp-totalpages") ?? 1),
  };
}

export async function getWordPressPage(id: number): Promise<WordPressPageDetail> {
  const query = new URLSearchParams({
    context: "edit",
    _fields: "id,title,slug,status,modified,link,content,template,meta",
  });
  const { data } = await wordpressFetch<unknown>(`pages/${id}?${query}`);
  if (!isObject(data)) throw new WordPressApiError("WordPressのページ情報が不正です。", 502);
  const editor = detectEditor(data);
  return {
    ...pageSummary(data),
    content: contentRaw(data),
    editorKind: editor.kind,
    editable: editor.editable,
    editWarning: editor.warning,
  };
}

export async function updateWordPressPage(id: number, input: WordPressPageInput) {
  const current = await getWordPressPage(id);
  if (!current.editable) {
    throw new WordPressApiError(
      current.editWarning ?? "このページはMyFamilleから安全に更新できません。",
      409,
      "wordpress_page_builder_detected"
    );
  }
  const { data } = await wordpressFetch<unknown>(`pages/${id}?context=edit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isObject(data)) throw new WordPressApiError("WordPressの更新応答が不正です。", 502);
  return pageSummary(data);
}

export async function createWordPressPage(input: WordPressPageInput) {
  const { data } = await wordpressFetch<unknown>("pages?context=edit", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!isObject(data)) throw new WordPressApiError("WordPressの作成応答が不正です。", 502);
  return pageSummary(data);
}

export type WordPressUploadedMedia = {
  id: number;
  sourceUrl: string;
};

export async function uploadWordPressMedia(input: {
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
  altText: string;
}): Promise<WordPressUploadedMedia> {
  const filename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-") || "legacy-image";
  const { data } = await wordpressFetch<unknown>("media", {
    method: "POST",
    headers: {
      "Content-Type": input.contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: Buffer.from(input.bytes),
  });
  if (!isObject(data) || !Number.isSafeInteger(Number(data.id)) || !stringValue(data.source_url)) {
    throw new WordPressApiError("WordPressメディアのアップロード応答が不正です。", 502);
  }
  const id = Number(data.id);
  const altText = input.altText.trim();
  if (altText) {
    await wordpressFetch<unknown>(`media/${id}?context=edit`, {
      method: "POST",
      body: JSON.stringify({ alt_text: altText }),
    });
  }
  return { id, sourceUrl: stringValue(data.source_url) };
}

export async function assertWordPressMigrationDraftAvailable(slug: string) {
  const search = new URLSearchParams({
    context: "edit",
    slug,
    status: "any",
    per_page: "100",
    _fields: "id,title,slug,status,modified,link",
  });
  const { data: existing } = await wordpressFetch<unknown>(`pages?${search}`);
  if (Array.isArray(existing) && existing.some((page) => isObject(page) && stringValue(page.slug) === slug)) {
    throw new WordPressApiError(
      `slug「${slug}」の固定ページがすでに存在します。既存ページを確認してください。`,
      409,
      "wordpress_migration_draft_exists"
    );
  }
}

export async function createWordPressMigrationDraft(input: {
  title: string;
  slug: string;
  content: string;
  featuredMediaId?: number;
}) {
  await assertWordPressMigrationDraftAvailable(input.slug);
  const { data } = await wordpressFetch<unknown>("pages?context=edit", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      content: input.content,
      status: "draft",
      ...(input.featuredMediaId ? { featured_media: input.featuredMediaId } : {}),
    }),
  });
  if (!isObject(data)) throw new WordPressApiError("WordPress下書きの作成応答が不正です。", 502);
  return pageSummary(data);
}
