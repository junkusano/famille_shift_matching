import "server-only";
import { load } from "cheerio";
import { wordpressFetch, assertNoInternalReferenceLinks } from "@/lib/wordpress/server";
import type { RewriteCandidate } from "@/lib/knowledge-automation/rewritePolicy";

export async function listPublishedBlogPosts() {
  const posts: RewriteCandidate[] = [];
  for (let page=1; page<=10; page++) {
    const {data,response}=await wordpressFetch<RewriteCandidate[]>(`posts?context=edit&status=publish&per_page=100&page=${page}&orderby=modified&order=asc&_fields=id,link,modified_gmt,date_gmt,content,title,status,slug`);
    if (!Array.isArray(data)) throw new Error("ブログ記事一覧を取得できませんでした。");
    posts.push(...data);
    if(page>=Number(response.headers.get("x-wp-totalpages") ?? 1)) break;
  }
  return posts;
}
export async function getPublishedBlogPost(id:number) {
  const {data}=await wordpressFetch<RewriteCandidate>(`posts/${id}?context=edit`);
  if(data.id!==id || data.status!=="publish" || typeof data.content?.raw!=="string") throw new Error("対象記事が公開状態ではありません。");
  return data;
}
export async function updatePublishedBlogPost(original: RewriteCandidate, content: string) {
  const oldLinks = new Set(load(original.content.raw)("a[href]").toArray().map(el => load(original.content.raw)(el).attr("href")));
  const next = load(content);
  assertNoInternalReferenceLinks(next("a[href]").toArray().filter(el => !oldLinks.has(next(el).attr("href"))).map(el => next.html(el)).join(""));
  const current=await getPublishedBlogPost(original.id);
  if(current.modified_gmt!==original.modified_gmt || current.content.raw!==original.content.raw || current.slug!==original.slug) throw new Error("編集中に記事が変更されたため更新を中止しました。");
  await wordpressFetch(`posts/${original.id}?context=edit`,{method:"POST",body:JSON.stringify({content})});
  const saved=await getPublishedBlogPost(original.id);
  if(saved.content.raw.replace(/\r\n/g,"\n").trim()!==content.replace(/\r\n/g,"\n").trim() || saved.link!==original.link || saved.slug!==original.slug) throw new Error("記事更新後の本文・URLの確認に失敗しました。実行履歴を確認してください。");
  await verifyPublishedBlogPost(saved,content);
  return saved;
}

export async function verifyPublishedBlogPost(saved:{id:number;link:string},content:string) {
  const {data:publicPost}=await wordpressFetch<{id:number;status:string;content:{rendered:string}}>(`posts/${saved.id}?context=view&_rewrite_check=${Date.now()}`);
  if(publicPost.id!==saved.id || publicPost.status!=="publish" || !publicPost.content?.rendered) throw new Error("公開記事の反映を確認できませんでした。");
  const text=(html:string)=>load(html).text().replace(/\s+/g,"");
  const expected=text(content), rendered=text(publicPost.content.rendered);
  const blocks=load(content)("p,h1,h2,h3,h4,li,td,blockquote").toArray().map(el=>text(load(content).html(el))).filter(value=>value.length>=20);
  const snippets=blocks.length ? blocks : [expected];
  if(snippets.some(part=>!rendered.includes(part))) throw new Error("公開APIの本文が更新結果と一致しません。");
  const page=await fetch(saved.link,{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!page.ok) throw new Error("公開ページを取得できませんでした。");
  const visible=text(await page.text());
  if(snippets.some(part=>!visible.includes(part))) throw new Error("公開ページへの反映を確認できませんでした。キャッシュと実行履歴を確認してください。");

}
