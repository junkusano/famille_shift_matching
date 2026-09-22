import { load } from "cheerio";

export type BlogHistory = {
  id: number;
  slug: string;
  status?: string;
  title: { raw?: string; rendered?: string };
  content: { raw?: string; rendered?: string };
};

// WordPress wptexturize changes punctuation without changing the article.
export function publicationText(html: string) {
  const $ = load(html);
  $("script,style,noscript").remove();
  return $.text().replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/\s+/g, "");
}

export function sourceWasPublished(sourceId: string, posts: BlogHistory[]) {
  const prefix = sourceId.slice(0, 8);
  return posts.some(post => new RegExp(`^smart-ai-\\d{8}-${prefix}(?:-\\d+)?$`).test(post.slug));
}

export function editorialHistory(posts: BlogHistory[]) {
  return posts.filter(post => post.status === undefined || post.status === "publish").slice(0, 30).map(post => {
    const $ = load(post.content.raw ?? post.content.rendered ?? "");
    const text = $.text();
    // Bound token cost while retaining the opening, examples, headings and conclusion.
    const content = text.length <= 2200 ? text : [text.slice(0, 700), text.slice(Math.floor(text.length / 2) - 300, Math.floor(text.length / 2) + 300), text.slice(-900)].join("\n[…]\n");
    return { id: post.id, title: load(post.title.raw ?? post.title.rendered ?? "").text(), headings: $("h2,h3").text().slice(0, 500), content };
  });
}
