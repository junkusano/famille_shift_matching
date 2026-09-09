import nextEnv from "@next/env";
import * as cheerio from "cheerio";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const LEGACY_ORIGIN = "https://www.shi-on.net";
const wpApi = (process.env.WORDPRESS_API_URL || "").replace(/\/+$/, "");
const wpUser = process.env.WORDPRESS_USERNAME || "";
const wpPassword = process.env.WORDPRESS_APP_PASSWORD || "";

if (!wpApi) throw new Error("WORDPRESS_API_URL is not configured");

const wpHeaders = wpUser && wpPassword
  ? { Authorization: `Basic ${Buffer.from(`${wpUser}:${wpPassword}`).toString("base64")}` }
  : {};

async function fetchText(url, init = {}) {
  const response = await fetch(url, { redirect: "follow", ...init });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return { text: await response.text(), response };
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, { redirect: "follow", ...init });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return { json: await response.json(), response };
}

async function wpCollection(type, query = "") {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const url = `${wpApi}/${type}?per_page=100&page=${page}${query}`;
    const { json, response } = await fetchJson(url, { headers: wpHeaders });
    rows.push(...json);
    const pages = Number(response.headers.get("x-wp-totalpages") || 1);
    if (page >= pages) return rows;
  }
}

function metadata(html, sourceUrl) {
  const $ = cheerio.load(html);
  const navLinks = [];
  const seen = new Set();
  $("header a[href], nav a[href]").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    let href;
    try { href = new URL($(element).attr("href"), sourceUrl).toString(); } catch { return; }
    const key = `${text}\n${href}`;
    if (text && !seen.has(key)) {
      navLinks.push({ text, href });
      seen.add(key);
    }
  });
  return {
    title: $("title").first().text().replace(/\s+/g, " ").trim(),
    description: $("meta[name=description]").attr("content") || "",
    canonical: $("link[rel=canonical]").attr("href") || "",
    h1: $("h1").first().text().replace(/\s+/g, " ").trim(),
    navLinks,
  };
}

function cleanTitle(value) {
  return cheerio.load(`<span>${value || ""}</span>`)("span").text().replace(/\s+/g, " ").trim();
}

function titleKey(value) {
  return cleanTitle(value)
    .normalize("NFKC")
    .replace(/[\s　「」『』【】〖〗・:：,，。！？!?―—–\-]/g, "")
    .toLowerCase();
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

const { text: sitemap } = await fetchText(`${LEGACY_ORIGIN}/sitemap.xml`);
const legacyUrls = sitemap.split("<loc>").slice(1).map((chunk) => chunk.split("</loc>")[0].trim());
const legacyPaths = legacyUrls.map((url) => new URL(url).pathname || "/");
const legacyFixedUrls = legacyUrls.filter((url) => !new URL(url).pathname.startsWith("/column/"));

const legacyFixed = [];
for (const url of legacyFixedUrls) {
  const { text, response } = await fetchText(url);
  legacyFixed.push({ url, finalUrl: response.url, ...metadata(text, response.url) });
}

const [pages, posts, categories, tagsResponse] = await Promise.all([
  wpCollection("pages", "&context=edit&status=publish,draft,pending,private,future"),
  wpCollection("posts", "&context=edit&status=publish,draft,pending,private,future"),
  wpCollection("categories"),
  fetchJson(`${wpApi}/tags?per_page=1`),
]);

const wpRows = [...pages.map((row) => ({ ...row, type: "page" })), ...posts.map((row) => ({ ...row, type: "post" }))];
const wpPaths = new Map();
for (const row of wpRows) {
  try { wpPaths.set(new URL(row.link).pathname.replace(/\/$/, "") || "/", row); } catch {}
}

const legacyColumnArticles = legacyPaths.filter((path) => /^\/column\/20\d{7,}$/.test(path));
const legacyColumnTaxonomies = legacyPaths.filter((path) => path.startsWith("/column/") && !legacyColumnArticles.includes(path));
const legacyArticleMeta = await concurrentMap(legacyColumnArticles, 12, async (path) => {
  const url = new URL(path, LEGACY_ORIGIN).toString();
  try {
    const { text, response } = await fetchText(url);
    const meta = metadata(text, response.url);
    return { path, title: meta.h1 || meta.title.split("｜")[0], status: response.status };
  } catch (error) {
    return { path, title: "", error: error instanceof Error ? error.message : String(error) };
  }
});

const wpPostByTitle = new Map(posts.map((row) => [titleKey(row.title?.raw || row.title?.rendered), row]));
const titleMatched = [];
const titleMissing = [];
for (const legacy of legacyArticleMeta) {
  const post = wpPostByTitle.get(titleKey(legacy.title));
  if (post) titleMatched.push({ legacyPath: legacy.path, legacyTitle: legacy.title, wpId: post.id, wpSlug: post.slug, wpStatus: post.status });
  else titleMissing.push(legacy);
}
const matched = [];
const missing = [];
for (const path of legacyPaths) {
  const normalized = path.replace(/\/$/, "") || "/";
  const row = wpPaths.get(normalized);
  if (row) matched.push({ path: normalized, type: row.type, id: row.id, status: row.status, slug: row.slug });
  else missing.push(normalized);
}

const report = {
  generatedAt: new Date().toISOString(),
  legacy: {
    totalUrls: legacyUrls.length,
    fixed: legacyFixed,
    columnArticles: legacyColumnArticles.length,
    columnTaxonomies: legacyColumnTaxonomies,
    articleFetchErrors: legacyArticleMeta.filter((row) => row.error),
  },
  wordpress: {
    api: wpApi,
    pages: pages.length,
    posts: posts.length,
    categories: categories.map((row) => ({ id: row.id, name: row.name, slug: row.slug, parent: row.parent, count: row.count })),
    tags: Number(tagsResponse.response.headers.get("x-wp-total") || tagsResponse.json.length),
    frontCandidates: pages.filter((row) => ["home", "home-new-visual", "front-page", "top"].includes(row.slug)).map((row) => ({ id: row.id, slug: row.slug, status: row.status, title: row.title?.rendered, link: row.link })),
  },
  urlComparison: {
    matchedCount: matched.length,
    matched,
    missingCount: missing.length,
    missing,
  },
  contentComparison: {
    exactTitleMatchedCount: titleMatched.length,
    exactTitleMatched: titleMatched,
    legacyArticlesWithoutTitleMatchCount: titleMissing.length,
    legacyArticlesWithoutTitleMatch: titleMissing,
  },
};

if (process.argv.includes("--full")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(JSON.stringify({
    generatedAt: report.generatedAt,
    legacy: {
      totalUrls: report.legacy.totalUrls,
      fixedPaths: report.legacy.fixed.map((row) => new URL(row.url).pathname || "/"),
      columnArticles: report.legacy.columnArticles,
      columnTaxonomies: report.legacy.columnTaxonomies.length,
      articleFetchErrors: report.legacy.articleFetchErrors,
    },
    wordpress: {
      pages: report.wordpress.pages,
      posts: report.wordpress.posts,
      categories: report.wordpress.categories,
      tags: report.wordpress.tags,
      frontCandidates: report.wordpress.frontCandidates,
    },
    urlComparison: {
      matchedCount: report.urlComparison.matchedCount,
      missingCount: report.urlComparison.missingCount,
    },
    contentComparison: {
      exactTitleMatchedCount: report.contentComparison.exactTitleMatchedCount,
      legacyArticlesWithoutTitleMatchCount: report.contentComparison.legacyArticlesWithoutTitleMatchCount,
      sampleMatched: report.contentComparison.exactTitleMatched.slice(0, 10),
      sampleMissing: report.contentComparison.legacyArticlesWithoutTitleMatch.slice(0, 20),
    },
  }, null, 2));
}
