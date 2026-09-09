import "server-only";

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import {
  LEGACY_HOME_URL,
  type DownloadedLegacyImage,
  type LegacyContentBlock,
  type LegacyHomeAnalysis,
  type LegacyHeroImage,
  type LegacyImage,
  type LegacyLink,
} from "@/lib/site-migration/types";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const OLD_SITE_HOSTS = new Set(["www.shi-on.net", "shi-on.net"]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const GOOGLE_MAP_HOSTS = new Set(["www.google.com", "google.com"]);

export class LegacySiteMigrationError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message);
    this.name = "LegacySiteMigrationError";
  }
}

function cleanText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveHttpUrl(value: string | undefined, baseUrl: string) {
  if (!value) return null;
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function resolveLinkUrl(value: string | undefined, baseUrl: string) {
  if (!value) return null;
  if (/^(mailto:|tel:)/i.test(value)) return value;
  return resolveHttpUrl(value, baseUrl)?.toString() ?? null;
}

function isOldSiteUrl(value: string) {
  try {
    return OLD_SITE_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Google Mapsの公式埋め込みURLだけを許可する。 */
function isGoogleMapsEmbedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_MAP_HOSTS.has(url.hostname) && url.pathname.startsWith("/maps/embed");
  } catch {
    return false;
  }
}

function backgroundImageUrl(value: string | undefined, baseUrl: string) {
  const match = value?.match(/background-image\s*:\s*url\(\s*["']?([^"')]+)["']?\s*\)/i);
  return match ? resolveHttpUrl(match[1], baseUrl)?.toString() ?? null : null;
}

function positiveDimension(value: string | undefined, fallback: number) {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) && number > 0 && number <= 2_000 ? number : fallback;
}

function inlineHtml($: cheerio.CheerioAPI, nodes: AnyNode[], baseUrl: string): string {
  return nodes
    .map((node) => {
      if (node.type === "text") return escapeHtml((node as Text).data);
      if (node.type !== "tag") return "";
      const element = node as Element;
      const tag = element.name.toLowerCase();
      if (tag === "br") return "<br>";
      const content = inlineHtml($, $(element).contents().toArray(), baseUrl);
      if (["strong", "b", "em", "i", "u", "s", "del", "mark", "code"].includes(tag)) {
        return `<${tag}>${content}</${tag}>`;
      }
      if (tag === "a") {
        const href = resolveLinkUrl($(element).attr("href"), baseUrl);
        return href ? `<a href="${escapeHtml(href)}">${content}</a>` : content;
      }
      return content;
    })
    .join("");
}

function youTubeVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] ?? null;
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] ?? null;
      return url.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function isCta($: cheerio.CheerioAPI, element: Element) {
  const className = $(element).attr("class") ?? "";
  const parentClass = $(element).parent().attr("class") ?? "";
  const text = cleanText($(element).text());
  return /(?:button|btn|cta)/i.test(`${className} ${parentClass}`) || /お問い合わせ|エントリー|応募/.test(text);
}

function makeImageFilename(sourceUrl: string, contentType: string) {
  const pathname = new URL(sourceUrl).pathname;
  const candidate = pathname.split("/").filter(Boolean).pop()?.replace(/[^a-zA-Z0-9._-]/g, "-") ?? "legacy-image";
  if (/\.(?:jpe?g|png|gif|webp)$/i.test(candidate)) return candidate;
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return `${candidate}.${extension}`;
}

function addWarning(warnings: Set<string>, value: string) {
  if (warnings.size < 20) warnings.add(value);
}

/** 現行トップを安全な意味単位へ抽出する。HTML/CSS/スクリプトは移植しない。 */
export async function fetchAndAnalyzeLegacyHome(): Promise<LegacyHomeAnalysis> {
  let response: Response;
  try {
    response = await fetch(LEGACY_HOME_URL, {
      headers: { "User-Agent": "MyFamille-site-migration/1.0" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LegacySiteMigrationError("現行サイトを取得できませんでした。", 502);
  }
  if (!response.ok || !isOldSiteUrl(response.url)) {
    throw new LegacySiteMigrationError("現行サイトを取得できませんでした。", 502);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const sourceUrl = response.url;
  const root = $("main").first().length
    ? $("main").first().clone()
    : $("article").first().length
      ? $("article").first().clone()
      : $("body").first().clone();
  root.find("script,style,noscript,nav,header,footer,form,template").remove();

  const blocks: LegacyContentBlock[] = [];
  const links: LegacyLink[] = [];
  const images: LegacyImage[] = [];
  const heroImages: LegacyHeroImage[] = [];
  const warnings = new Set<string>();
  const seenImages = new Set<string>();
  const seenHeroImages = new Set<string>();
  const seenLinks = new Set<string>();

  const addLink = (element: Element) => {
    const href = resolveLinkUrl($(element).attr("href"), sourceUrl);
    const text = cleanText($(element).text());
    if (!href || !text) return;
    const link = { text, href, internal: isOldSiteUrl(href) };
    const key = `${link.text}\n${link.href}`;
    if (!seenLinks.has(key)) {
      links.push(link);
      seenLinks.add(key);
    }
  };

  const visit = (node: AnyNode) => {
    if (blocks.length >= 250 || node.type !== "tag") return;
    const element = node as Element;
    const tag = element.name.toLowerCase();
    if (["script", "style", "noscript", "svg", "nav", "header", "footer", "form"].includes(tag)) return;

    const backgroundImage = backgroundImageUrl($(element).attr("style"), sourceUrl);
    if (backgroundImage && isOldSiteUrl(backgroundImage)) {
      const className = $(element).attr("class") ?? "";
      const device: LegacyHeroImage["device"] = /(?:sp|mobile)/i.test(className) ? "mobile" : "desktop";
      const image: LegacyHeroImage = {
        sourceUrl: backgroundImage,
        alt: "ファミーユ トップページ メインビジュアル",
        usage: `メインビジュアル（${device === "desktop" ? "PC" : "スマートフォン"}）`,
        device,
      };
      if (!seenImages.has(backgroundImage)) {
        images.push(image);
        seenImages.add(backgroundImage);
      }
      if (!seenHeroImages.has(backgroundImage)) {
        heroImages.push(image);
        seenHeroImages.add(backgroundImage);
      }
    }

    if (tag === "section" || tag === "div") {
      const directText = cleanText(
        $(element)
          .contents()
          .filter((_, child) => child.type === "text")
          .text()
      );
      if (directText) {
        blocks.push({ kind: "paragraph", html: escapeHtml(directText), text: directText });
      }
    }

    if (/^h[1-6]$/.test(tag)) {
      const text = cleanText($(element).text());
      if (text) blocks.push({ kind: "heading", level: Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6, text });
      return;
    }
    if (tag === "p") {
      const text = cleanText($(element).text());
      if (text) {
        blocks.push({ kind: "paragraph", html: inlineHtml($, $(element).contents().toArray(), sourceUrl), text });
      }
      $(element).find("a[href]").each((_, anchor) => addLink(anchor));
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items = $(element)
        .children("li")
        .map((_, item) => {
          const text = cleanText($(item).text());
          return text
            ? { html: inlineHtml($, $(item).contents().toArray(), sourceUrl), text }
            : null;
        })
        .get()
        .filter((item): item is { html: string; text: string } => item !== null);
      if (items.length) blocks.push({ kind: "list", ordered: tag === "ol", items });
      $(element).find("a[href]").each((_, anchor) => addLink(anchor));
      return;
    }
    if (tag === "img") {
      const source = resolveHttpUrl($(element).attr("src"), sourceUrl)?.toString();
      if (!source) return;
      if (!isOldSiteUrl(source)) {
        addWarning(warnings, "外部ホストの画像は安全のため移植対象から除外しました。");
        return;
      }
      const image = { sourceUrl: source, alt: cleanText($(element).attr("alt") ?? ""), usage: "本文" };
      if (!seenImages.has(source)) {
        images.push(image);
        seenImages.add(source);
      }
      blocks.push({ kind: "image", ...image });
      return;
    }
    if (tag === "iframe") {
      const source = resolveHttpUrl($(element).attr("src"), sourceUrl)?.toString();
      const videoId = source ? youTubeVideoId(source) : null;
      if (source && videoId) blocks.push({ kind: "youtube", url: source, videoId });
      else if (source && isGoogleMapsEmbedUrl(source)) {
        blocks.push({
          kind: "google-map",
          url: source,
          title: cleanText($(element).attr("title") ?? "Google Map"),
          width: positiveDimension($(element).attr("width"), 600),
          height: positiveDimension($(element).attr("height"), 450),
        });
      } else addWarning(warnings, "YouTube・Google Maps以外のiframeは安全のため移植対象から除外しました。");
      return;
    }
    if (tag === "a") {
      addLink(element);
      const href = resolveLinkUrl($(element).attr("href"), sourceUrl);
      const text = cleanText($(element).text());
      if (href && text && isCta($, element)) {
        blocks.push({ kind: "cta", text, href });
        return;
      }
    }
    $(element).contents().each((_, child) => visit(child));
  };

  root.contents().each((_, node) => visit(node));

  if (!blocks.some((block) => block.kind === "heading" && block.level === 1)) {
    addWarning(warnings, "H1を抽出できませんでした。ページタイトルを確認してください。");
  }
  if (heroImages.length === 0) {
    addWarning(warnings, "メインビジュアルのCSS背景画像を抽出できませんでした。");
  }
  addWarning(warnings, "ナビゲーション、フッター、スクリプト、スタイルは移植しません。");

  const pageTitle = cleanText($("title").first().text());
  const h1 = blocks.find((block): block is Extract<LegacyContentBlock, { kind: "heading" }> => block.kind === "heading" && block.level === 1)?.text ?? "";
  const internalLinks = links.filter((link) => link.internal);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ pageTitle, blocks, images, heroImages, internalLinks }))
    .digest("hex");

  return {
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    pageTitle,
    h1,
    blocks,
    images,
    heroImages,
    links,
    internalLinks,
    warnings: [...warnings],
    fingerprint,
  };
}

/** 旧サイト本体の画像だけを取得する。外部画像・大きすぎる画像は拒否する。 */
export async function downloadLegacyImage(sourceUrl: string): Promise<DownloadedLegacyImage> {
  if (!isOldSiteUrl(sourceUrl)) {
    throw new LegacySiteMigrationError("旧サイト以外の画像は移植できません。", 400);
  }
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: { "User-Agent": "MyFamille-site-migration/1.0" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LegacySiteMigrationError("画像を取得できませんでした。", 502);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
  const length = Number(response.headers.get("content-length") ?? 0);
  if (!response.ok || !isOldSiteUrl(response.url) || !ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new LegacySiteMigrationError("安全に取得できない画像が含まれています。", 422);
  }
  if (length > MAX_IMAGE_BYTES) {
    throw new LegacySiteMigrationError("10MBを超える画像は移植できません。", 422);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new LegacySiteMigrationError("10MBを超える画像は移植できません。", 422);
  }
  return {
    sourceUrl: response.url,
    filename: makeImageFilename(response.url, contentType),
    contentType,
    bytes,
  };
}
