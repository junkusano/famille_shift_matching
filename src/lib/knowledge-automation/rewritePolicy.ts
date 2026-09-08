import { load } from "cheerio";

export type RewriteCandidate = { id: number; link: string; modified_gmt: string; date_gmt: string; content: { raw: string }; title: { raw: string }; status: string; slug: string };

export function rankRewriteCandidates(posts: RewriteCandidate[], views: Map<string, number>, cooldownDays = 30, now = Date.now()) {
  return posts.flatMap(post => {
    const modified = Date.parse(`${post.modified_gmt}Z`);
    const published = Date.parse(`${post.date_gmt}Z`);
    const age = (now - modified) / 86400000;
    if (post.status !== "publish" || !Number.isFinite(age) || !Number.isFinite(published) || age < cooldownDays || (now-published)/86400000 < cooldownDays) return [];
    if (!post.content.raw || /elementor|\[vc_|\[et_pb_|\[fusion_/i.test(post.content.raw)) return [];
    const measuredViews = views.get(new URL(post.link).pathname) ?? null;
    const text = load(post.content.raw).text();
    const reasons = [
      ...(measuredViews !== null && measuredViews <= 10 ? [`計測期間内の閲覧数が${measuredViews}回`] : []),
      ...(age >= 180 ? [`最終更新から${Math.floor(age)}日経過`] : []),
      ...(text.length < 800 ? ["説明が短く、内容を補う余地がある"] : []),
    ];
    if (!reasons.length) return [];
    return [{ post, measuredViews, reasons, score: (measuredViews !== null && measuredViews <= 10 ? 200 : 0) + Math.min(age, 730) / 5 + (text.length < 800 ? 40 : 0) }];
  }).sort((a,b)=>b.score-a.score || a.post.id-b.post.id);
}

export function validateRewrite(original: string, proposed: string) {
  const before = load(original, {}, false), after = load(proposed, {}, false);
  const originalText = before.text().replace(/\s+/g, "").trim();
  const nextText = after.text().replace(/\s+/g, "").trim();
  if (nextText === originalText || nextText.length < Math.max(600, originalText.length * 0.65)) throw new Error("本文の改善がないか、元の記事の内容が失われています。");
  // Existing embeds must survive exactly; generated active content is forbidden.
  const protectedMarkup = ($: ReturnType<typeof load>) => $("script,style,iframe,form,input,button,object,embed,svg").toArray().map(el=>$.html(el)).sort();
  if (JSON.stringify(protectedMarkup(before)) !== JSON.stringify(protectedMarkup(after))) throw new Error("埋め込み要素を変更できません。");
  const assets = ($: ReturnType<typeof load>) => $("img,video,audio,source").toArray().map(el=>$.html(el)).sort();
  if (JSON.stringify(assets(before)) !== JSON.stringify(assets(after))) throw new Error("既存の画像・動画を保持してください。");
  const links = (before("a[href]").toArray().map(el=>before(el).attr("href")));
  if (links.some(href=>!after("a[href]").toArray().some(el=>after(el).attr("href")===href))) throw new Error("既存リンクを保持してください。");
  const comments = (html:string) => html.match(/<!--\s*\/?wp:[\s\S]*?-->/g) ?? [];
  if (JSON.stringify(comments(original)) !== JSON.stringify(comments(proposed))) throw new Error("WordPressブロック構造を保持してください。");
  const shortcodes = (html:string)=>html.match(/\[\/?[a-zA-Z][^\]\n]*\]/g) ?? [];
  if(JSON.stringify(shortcodes(original))!==JSON.stringify(shortcodes(proposed))) throw new Error("ショートコードを保持してください。");
  after("*").each((_,el)=>{
    for(const [name,value] of Object.entries("attribs" in el ? el.attribs : {})) {
      if (/^on/i.test(name) || /^(?:javascript|data|vbscript):/i.test(value.trim())) throw new Error("安全でないHTML属性です。");
    }
  });
  return proposed;
}
