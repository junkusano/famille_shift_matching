import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { load } from 'cheerio';

export type RssArticle = { id: string; title: string; summary: string; externalUrl: string; occurredAt: string | null; feedUrl: string };
export function publicFeedUrl(value: string) {
  try {
    const u = new URL(value);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || h.endsWith('.local') || h.endsWith('.internal') || isIP(h.replace(/^\[|\]$/g,''))) return null;
    return u.toString();
  } catch { return null; }
}
function publicAddress(address: string) {
  if (isIP(address) === 6) return /^[23][a-f\d]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  const [a,b] = address.split('.').map(Number);
  return isIP(address) === 4 && a > 0 && a < 224 && ![10,127].includes(a) && !(a===100&&b>=64&&b<=127) && !(a===169&&b===254) && !(a===172&&b>=16&&b<=31) && !(a===192&&[0,168].includes(b)) && !(a===198&&[18,19,51].includes(b)) && !(a===203&&b===0);
}
async function feedText(raw: string, signal: AbortSignal, hops = 0): Promise<string> {
  const url = publicFeedUrl(raw);
  if (!url || hops > 3) throw Error('Invalid public feed');
  const addresses = await lookup(new URL(url).hostname, {all:true});
  if (!addresses.length || addresses.some(x=>!publicAddress(x.address))) throw Error('Non-public feed');
  const response = await fetch(url, {redirect:'manual', signal, headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml'}});
  if ([301,302,303,307,308].includes(response.status)) {
    const next=response.headers.get('location');if(!next)throw Error('Missing redirect');
    return feedText(new URL(next,url).toString(),signal,hops+1);
  }
  if(!response.ok || !response.body) throw Error('Feed unavailable');
  const reader=response.body.getReader(), chunks:Uint8Array[]=[]; let size=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000)throw Error('Feed too large');chunks.push(value);} }
  finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString('utf8');
}
export function parseFeedArticles(xml: string, feedUrl: string, now=Date.now()): RssArticle[] {
  const $=load(xml,{xmlMode:true}), articles:RssArticle[]=[];
  $('item,entry').each((_,el)=>{
    const node=$(el), title=load(node.find('title').first().text()).text().trim();
    const raw=node.find('link').filter((_,link)=>!$(link).attr('rel')||$(link).attr('rel')==='alternate').first();
    const href=raw.attr('href')||raw.text();let url:string|null=null;try{url=publicFeedUrl(new URL(href,feedUrl).toString());}catch{}
    const date=node.find('pubDate,published,updated,dc\\:date').first().text().trim();
    const timestamp=Date.parse(date);
    // News must have a trustworthy date; a monitoring URL is never an article.
    if(!title||!url||!Number.isFinite(timestamp)||timestamp>now+86400000||timestamp<now-45*86400000)return;
    const html=node.find('description,summary,content,content\\:encoded,media\\:description').first().text();
    const summaryDoc=load(html);summaryDoc('script,style').remove();
    const summary=summaryDoc.text().replace(/\s+/g,' ').trim().slice(0,1200)||title;
    articles.push({id:createHash('sha256').update(url).digest('hex'),title,summary,externalUrl:url,occurredAt:new Date(timestamp).toISOString(),feedUrl});
  });
  return articles.slice(0,12);
}
export async function loadLiveRssArticles(urls: string[]) {
  const feeds=[...new Set(urls)].filter(u=>publicFeedUrl(u)&&/(?:rss|feed|\.rdf(?:\?|$)|\.xml(?:\?|$))/i.test(u)).slice(0,24);
  const articles:RssArticle[]=[]; const failed:string[]=[]; let index=0;
  await Promise.all(Array.from({length:4},async()=>{while(index<feeds.length){const url=feeds[index++];try{articles.push(...parseFeedArticles(await feedText(url,AbortSignal.timeout(6000)),url));}catch{failed.push(url);}}}));
  const unique=[...new Map(articles.map(a=>[a.externalUrl,a])).values()].sort((a,b)=>b.occurredAt!.localeCompare(a.occurredAt!));
  return {articles:unique,failed,feedCount:feeds.length};
}
