import nextEnv from "@next/env";
import * as cheerio from "cheerio";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const LEGACY_ORIGIN = "https://www.shi-on.net";
const wpApi = (process.env.WORDPRESS_API_URL || "").replace(/\/+$/, "");
const wpUser = process.env.WORDPRESS_USERNAME || "";
const wpPassword = process.env.WORDPRESS_APP_PASSWORD || "";
const apply = process.argv.includes("--apply");
const publish = process.argv.includes("--publish");
const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="))?.split("=")[1];
const limitArg = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0);
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="))?.split("=")[1] || "";

if (!wpApi || !wpUser || !wpPassword) throw new Error("WordPress credentials are not configured");
if (apply && confirmArg !== "IMPORT_LEADGRID") {
  throw new Error("Apply mode requires --confirm=IMPORT_LEADGRID");
}

const wpHeaders = {
  Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPassword}`).toString("base64")}`,
};

async function fetchResponse(url, init = {}) {
  const response = await fetch(url, { redirect: "follow", ...init });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}: ${url}\n${body.slice(0, 300)}`);
  }
  return response;
}

async function fetchText(url, init = {}) {
  return (await fetchResponse(url, init)).text();
}

async function fetchJson(url, init = {}) {
  return (await fetchResponse(url, init)).json();
}

async function wpRequest(path, init = {}) {
  const headers = { Accept: "application/json", ...wpHeaders, ...(init.headers || {}) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  return fetchJson(`${wpApi}/${path.replace(/^\//, "")}`, { ...init, headers });
}

async function wpCollection(type, query = "") {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const response = await fetchResponse(`${wpApi}/${type}?per_page=100&page=${page}${query}`, { headers: wpHeaders });
    rows.push(...await response.json());
    if (page >= Number(response.headers.get("x-wp-totalpages") || 1)) return rows;
  }
}

function cleanText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  return cleanText(cheerio.load(`<span>${value || ""}</span>`)("span").text());
}

function titleKey(value) {
  return decodeHtml(value)
    .normalize("NFKC")
    .replace(/[\s　「」『』【】〖〗・:：,，。！？!?―—–\-]/g, "")
    .toLowerCase();
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(value, baseUrl).toString(); } catch { return ""; }
}

function filenameFor(url, contentType) {
  const basename = new URL(url).pathname.split("/").filter(Boolean).pop() || "image";
  const safe = basename.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (/\.(?:jpe?g|png|gif|webp)$/i.test(safe)) return `leadgrid-${safe}`;
  const extension = contentType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return `leadgrid-${safe}.${extension}`;
}

function excerptFromHtml(html) {
  return cleanText(cheerio.load(html).text()).slice(0, 220);
}

function parseLegacyArticle(path, html) {
  const pageUrl = new URL(path, LEGACY_ORIGIN).toString();
  const $ = cheerio.load(html);
  const header = $(".s-blogDetail__header").first();
  const contentRoot = $(".s-blogDetail__body .shion-recruit-c-wysiwyg").first();
  if (!header.length || !contentRoot.length) throw new Error(`Article structure not found: ${path}`);

  contentRoot.find("script,style,noscript,form,template").remove();
  contentRoot.find("*").each((_, element) => {
    for (const attribute of Object.keys(element.attribs || {})) {
      if (/^on/i.test(attribute)) $(element).removeAttr(attribute);
    }
  });

  contentRoot.find("a[href]").each((_, element) => {
    const source = $(element).attr("href") || "";
    const resolved = absoluteUrl(source, pageUrl);
    if (!resolved) return $(element).removeAttr("href");
    const parsed = new URL(resolved);
    if (["www.shi-on.net", "shi-on.net", "corprate.shi-on.net"].includes(parsed.hostname)) {
      $(element).attr("href", `${parsed.pathname}${parsed.search}${parsed.hash}`);
    } else {
      $(element).attr("href", resolved);
      $(element).attr("rel", "noopener noreferrer");
    }
  });

  const images = [];
  contentRoot.find("img[src]").each((_, element) => {
    const sourceUrl = absoluteUrl($(element).attr("src"), pageUrl);
    if (!sourceUrl) return;
    const image = { sourceUrl, alt: cleanText($(element).attr("alt")) };
    images.push(image);
    $(element).attr("data-leadgrid-source", sourceUrl);
  });

  const featuredNode = $(".s-blogDetail__thumb img[src]").first();
  const featuredUrl = featuredNode.length ? absoluteUrl(featuredNode.attr("src"), pageUrl) : "";
  const categoryLink = header.find('a[href^="/column/"]').filter((_, element) => !($(element).attr("href") || "").includes("?taxonomy_column_tags")).first();
  const categoryHref = categoryLink.attr("href") || "";
  const tags = header.find('a[href*="taxonomy_column_tags"]')
    .map((_, element) => {
      const name = cleanText($(element).text()).replace(/^#/, "");
      const href = absoluteUrl($(element).attr("href"), pageUrl);
      const slug = href ? new URL(href).searchParams.get("taxonomy_column_tags[]") || "" : "";
      return name ? { name, slug } : null;
    })
    .get()
    .filter(Boolean);
  const dateText = cleanText(header.find("time").first().text());

  return {
    legacyPath: path,
    legacyId: path.split("/").filter(Boolean).pop(),
    title: cleanText(header.find("h1").first().text()),
    date: /^\d{4}\.\d{2}\.\d{2}$/.test(dateText) ? `${dateText.replaceAll(".", "-")}T09:00:00` : null,
    category: {
      name: cleanText(categoryLink.text()) || "旧サイト記事",
      slug: categoryHref.split("/").filter(Boolean).pop() || "legacy-column",
    },
    tags: [...new Map(tags.map((tag) => [tag.name, tag])).values()],
    contentHtml: contentRoot.html() || "",
    excerpt: excerptFromHtml(contentRoot.html() || ""),
    images,
    featuredUrl,
  };
}

async function concurrentMap(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function uploadImage(sourceUrl, altText) {
  const response = await fetchResponse(sourceUrl);
  const contentType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!/^image\/(?:jpeg|png|gif|webp)$/.test(contentType)) throw new Error(`Unsupported image: ${sourceUrl}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 12 * 1024 * 1024) throw new Error(`Image exceeds 12MB: ${sourceUrl}`);
  const media = await wpRequest("media", {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filenameFor(sourceUrl, contentType)}"`,
    },
    body: bytes,
  });
  if (altText) await wpRequest(`media/${media.id}`, { method: "POST", body: JSON.stringify({ alt_text: altText }) });
  return { id: media.id, sourceUrl: media.source_url };
}

async function ensureTerm(type, name, slug, parent = 0) {
  const query = new URLSearchParams({ search: name, per_page: "100", context: "edit" });
  const existing = await wpRequest(`${type}?${query}`);
  const found = existing.find((row) => decodeHtml(row.name) === name);
  if (found) return found.id;
  const created = await wpRequest(type, { method: "POST", body: JSON.stringify({ name, slug, ...(parent ? { parent } : {}) }) });
  return created.id;
}

const sitemap = await fetchText(`${LEGACY_ORIGIN}/sitemap.xml`);
let articlePaths = sitemap
  .split("<loc>")
  .slice(1)
  .map((chunk) => new URL(chunk.split("</loc>")[0].trim()).pathname)
  .filter((path) => /^\/column\/(?!sr\d+$|cat\d+$|dai\d+$)[a-z0-9_]+$/i.test(path));
if (onlyArg) articlePaths = articlePaths.filter((path) => path.endsWith(`/${onlyArg}`));
if (limitArg > 0) articlePaths = articlePaths.slice(0, limitArg);

const [posts, categories, tags] = await Promise.all([
  wpCollection("posts", "&context=edit&status=publish,draft,pending,private,future"),
  wpCollection("categories", "&context=edit"),
  wpCollection("tags", "&context=edit"),
]);
const postByTitle = new Map(posts.map((row) => [titleKey(row.title?.raw || row.title?.rendered), row]));
const postBySlug = new Map(posts.map((row) => [decodeURIComponent(row.slug), row]));

const articles = await concurrentMap(articlePaths, 12, async (path) => parseLegacyArticle(path, await fetchText(new URL(path, LEGACY_ORIGIN))));
const planned = [];
const matched = [];
for (const article of articles) {
  const existing = postBySlug.get(article.legacyId) || postByTitle.get(titleKey(article.title));
  if (existing) matched.push({ legacyPath: article.legacyPath, title: article.title, wpId: existing.id, wpLink: existing.link });
  else planned.push(article);
}

const uniqueImageUrls = new Set(planned.flatMap((article) => [article.featuredUrl, ...article.images.map((image) => image.sourceUrl)]).filter(Boolean));
const categoryTerms = [...new Map(planned.map((article) => [article.category.name, article.category])).values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));
const tagTerms = [...new Map(planned.flatMap((article) => article.tags).map((tag) => [tag.name, tag])).values()].sort((a, b) => a.name.localeCompare(b.name, "ja"));

if (!apply) {
  console.log(JSON.stringify({
    mode: "dry-run",
    scannedArticles: articles.length,
    existingTitleOrSlugMatches: matched.length,
    existingMatches: matched,
    postsToCreate: planned.length,
    uniqueImagesToUpload: uniqueImageUrls.size,
    categoriesToUse: categoryTerms,
    tagsToUse: tagTerms,
    samplePostsToCreate: planned.slice(0, 20).map((article) => ({ legacyPath: article.legacyPath, title: article.title, date: article.date, category: article.category, tags: article.tags, images: article.images.length, featured: Boolean(article.featuredUrl) })),
  }, null, 2));
  process.exit(0);
}

const columnCategory = categories.find((row) => decodeHtml(row.name) === "コラム" || row.slug === "column");
if (!columnCategory) throw new Error("Parent category コラム was not found");
const categoryIds = new Map(categories.map((row) => [decodeHtml(row.name), row.id]));
const tagIds = new Map(tags.map((row) => [decodeHtml(row.name), row.id]));
for (const term of categoryTerms) {
  if (!categoryIds.has(term.name)) categoryIds.set(term.name, await ensureTerm("categories", term.name, term.slug, columnCategory.id));
}
for (const term of tagTerms) {
  if (!tagIds.has(term.name)) tagIds.set(term.name, await ensureTerm("tags", term.name, term.slug));
}

const uploaded = new Map();
function sharedUpload(image) {
  if (!uploaded.has(image.sourceUrl)) {
    const promise = uploadImage(image.sourceUrl, image.alt).catch((error) => {
      uploaded.delete(image.sourceUrl);
      throw error;
    });
    uploaded.set(image.sourceUrl, promise);
  }
  return uploaded.get(image.sourceUrl);
}

let finished = 0;
const created = await concurrentMap(planned, 6, async (article) => {
  const articleImages = [...new Map([
    ...(article.featuredUrl ? [[article.featuredUrl, { sourceUrl: article.featuredUrl, alt: article.title }]] : []),
    ...article.images.map((image) => [image.sourceUrl, image]),
  ]).values()];
  const articleMedia = new Map(await Promise.all(articleImages.map(async (image) => [image.sourceUrl, await sharedUpload(image)])));

  const $ = cheerio.load(article.contentHtml, null, false);
  $("img[data-leadgrid-source]").each((_, element) => {
    const source = $(element).attr("data-leadgrid-source") || "";
    const media = articleMedia.get(source);
    if (media) $(element).attr("src", media.sourceUrl);
    $(element).removeAttr("data-leadgrid-source");
  });
  const featuredMedia = article.featuredUrl ? articleMedia.get(article.featuredUrl)?.id : undefined;
  const payload = {
    title: article.title,
    slug: article.legacyId,
    content: $.html(),
    excerpt: article.excerpt,
    status: publish ? "publish" : "draft",
    ...(article.date ? { date: article.date } : {}),
    categories: [columnCategory.id, categoryIds.get(article.category.name)].filter(Boolean),
    tags: article.tags.map((tag) => tagIds.get(tag.name)).filter(Boolean),
    ...(featuredMedia ? { featured_media: featuredMedia } : {}),
  };
  const post = await wpRequest("posts", { method: "POST", body: JSON.stringify(payload) });
  finished += 1;
  console.error(`[${finished}/${planned.length}] ${article.legacyId} -> ${post.id}`);
  return { legacyPath: article.legacyPath, title: article.title, wpId: post.id, wpLink: post.link, status: post.status };
});

console.log(JSON.stringify({ mode: publish ? "applied-publish" : "applied-draft", scannedArticles: articles.length, matched, created, uploadedImages: uploaded.size }, null, 2));
