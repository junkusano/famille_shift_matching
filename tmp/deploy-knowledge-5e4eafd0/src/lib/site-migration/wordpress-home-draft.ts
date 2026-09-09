import "server-only";

import {
  assertWordPressMigrationDraftAvailable,
  createWordPressMigrationDraft,
  uploadWordPressMedia,
} from "@/lib/wordpress/server";
import { downloadLegacyImage, fetchAndAnalyzeLegacyHome } from "@/lib/site-migration/legacy-home";
import type { LegacyContentBlock, LegacyHomeAnalysis } from "@/lib/site-migration/types";
import {
  WORDPRESS_MIGRATION_DRAFT_SLUG,
  WORDPRESS_MIGRATION_DRAFT_TITLE,
} from "@/lib/site-migration/types";

type UploadedImage = { id: number; sourceUrl: string };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function blockHtml(block: LegacyContentBlock, images: Map<string, UploadedImage>) {
  if (block.kind === "heading") {
    const attributes = block.level === 2 ? "" : ` {\"level\":${block.level}}`;
    return `<!-- wp:heading${attributes} -->\n<h${block.level}>${escapeHtml(block.text)}</h${block.level}>\n<!-- /wp:heading -->`;
  }
  if (block.kind === "paragraph") {
    return `<!-- wp:paragraph -->\n<p>${block.html}</p>\n<!-- /wp:paragraph -->`;
  }
  if (block.kind === "list") {
    const tag = block.ordered ? "ol" : "ul";
    const attributes = block.ordered ? " {\"ordered\":true}" : "";
    const items = block.items.map((item) => `<li>${item.html}</li>`).join("");
    return `<!-- wp:list${attributes} -->\n<${tag}>${items}</${tag}>\n<!-- /wp:list -->`;
  }
  if (block.kind === "image") {
    const image = images.get(block.sourceUrl);
    if (!image) return "";
    const alt = escapeHtml(block.alt);
    return `<!-- wp:image {\"id\":${image.id},\"sizeSlug\":\"large\",\"linkDestination\":\"none\"} -->\n<figure class=\"wp-block-image size-large\"><img src=\"${escapeHtml(image.sourceUrl)}\" alt=\"${alt}\" class=\"wp-image-${image.id}\"/></figure>\n<!-- /wp:image -->`;
  }
  if (block.kind === "cta") {
    return `<!-- wp:buttons -->\n<div class=\"wp-block-buttons\"><div class=\"wp-block-button\"><a class=\"wp-block-button__link wp-element-button\" href=\"${escapeHtml(block.href)}\">${escapeHtml(block.text)}</a></div></div>\n<!-- /wp:buttons -->`;
  }
  if (block.kind === "youtube") {
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(block.videoId)}`;
    return `<!-- wp:embed {\"url\":\"${url}\",\"type\":\"video\",\"providerNameSlug\":\"youtube\",\"responsive\":true} -->\n<figure class=\"wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube\"><div class=\"wp-block-embed__wrapper\">${url}</div></figure>\n<!-- /wp:embed -->`;
  }
  return `<!-- wp:html -->\n<iframe src=\"${escapeHtml(block.url)}\" title=\"${escapeHtml(block.title)}\" width=\"${block.width}\" height=\"${block.height}\" style=\"border:0;max-width:100%;\" loading=\"lazy\" referrerpolicy=\"no-referrer-when-downgrade\" allowfullscreen></iframe>\n<!-- /wp:html -->`;
}

function heroBlockHtml(analysis: LegacyHomeAnalysis, images: Map<string, UploadedImage>) {
  const hero = analysis.heroImages.find((image) => image.device === "desktop") ?? analysis.heroImages[0];
  if (!hero) return "";
  const image = images.get(hero.sourceUrl);
  if (!image) return "";
  const attributes = JSON.stringify({
    url: image.sourceUrl,
    id: image.id,
    dimRatio: 0,
    minHeight: 520,
    minHeightUnit: "px",
    isDark: false,
    sizeSlug: "full",
  });
  return `<!-- wp:cover ${attributes} -->\n<div class=\"wp-block-cover is-light\" style=\"min-height:520px\"><span aria-hidden=\"true\" class=\"wp-block-cover__background has-background-dim-0 has-background-dim\"></span><img class=\"wp-block-cover__image-background wp-image-${image.id} size-full\" alt=\"${escapeHtml(hero.alt)}\" src=\"${escapeHtml(image.sourceUrl)}\" data-object-fit=\"cover\"/><div class=\"wp-block-cover__inner-container is-layout-constrained wp-block-cover-is-layout-constrained\"></div></div>\n<!-- /wp:cover -->`;
}

async function uploadImages(analysis: LegacyHomeAnalysis) {
  const images = new Map<string, UploadedImage>();
  const warnings: string[] = [];
  for (const image of analysis.images) {
    try {
      const downloaded = await downloadLegacyImage(image.sourceUrl);
      const uploaded = await uploadWordPressMedia({
        filename: downloaded.filename,
        contentType: downloaded.contentType,
        bytes: downloaded.bytes,
        altText: image.alt,
      });
      images.set(image.sourceUrl, uploaded);
    } catch {
      warnings.push(`画像を移植できなかったため、下書きから除外しました（${image.sourceUrl}）。`);
    }
  }
  return { images, warnings };
}

/** 同じslugの既存ページを上書きせず、必ず新規下書きを作成する。 */
export async function createLegacyHomeMigrationDraft() {
  const analysis = await fetchAndAnalyzeLegacyHome();
  if (analysis.blocks.length === 0) {
    throw new Error("現行トップページから移植できる本文を抽出できませんでした。");
  }
  // メディアだけが重複作成されないよう、アップロード前に下書きの有無を確認する。
  await assertWordPressMigrationDraftAvailable(WORDPRESS_MIGRATION_DRAFT_SLUG);
  const { images, warnings: imageWarnings } = await uploadImages(analysis);
  const content = [heroBlockHtml(analysis, images), ...analysis.blocks.map((block) => blockHtml(block, images))]
    .filter(Boolean)
    .join("\n\n");
  const featuredImage = analysis.heroImages.find((image) => image.device === "desktop") ?? analysis.heroImages[0];
  const page = await createWordPressMigrationDraft({
    title: WORDPRESS_MIGRATION_DRAFT_TITLE,
    slug: WORDPRESS_MIGRATION_DRAFT_SLUG,
    content,
    featuredMediaId: featuredImage ? images.get(featuredImage.sourceUrl)?.id : undefined,
  });
  return {
    page,
    analysis,
    uploadedImageCount: images.size,
    skippedImageCount: analysis.images.length - images.size,
    mapCount: analysis.blocks.filter((block) => block.kind === "google-map").length,
    featuredImageSet: Boolean(featuredImage && images.get(featuredImage.sourceUrl)),
    warnings: [...analysis.warnings, ...imageWarnings],
  };
}
