import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import{createRequire}from'node:module';
const require=createRequire(import.meta.url),ctx=vm.createContext({exports:{},require,Buffer,AbortSignal,fetch,URL,Date});
vm.runInContext(ts.transpileModule(fs.readFileSync(new URL('../src/lib/knowledge-automation/blogRss.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
const {parseFeedArticles,publicFeedUrl}=ctx.exports,now=Date.parse('2026-09-22T00:00:00Z');
test('RSS and Atom supply article links, dates and plain summaries',()=>{
 const rss=parseFeedArticles('<rss><channel><item><title>A</title><link>https://example.org/a</link><pubDate>2026-09-20</pubDate><description><![CDATA[<p>Fact</p><script>bad()</script>]]></description></item></channel></rss>','https://example.org/feed',now);
 assert.equal(rss.length,1);assert.equal(rss[0].summary,'Fact');
 const atom=parseFeedArticles('<feed><entry><title>A</title><link rel="self" href="https://example.org/api"/><link rel="alternate" href="https://example.org/a"/><updated>2026-09-20</updated><summary>Fact</summary></entry></feed>','https://example.org/feed',now);
 assert.equal(atom[0].externalUrl,'https://example.org/a');assert.equal(atom[0].id,rss[0].id);
});
test('RDF dates are read and old, undated or private URLs are not news',()=>{
 const xml='<rdf:RDF><item><title>A</title><link>https://example.org/a</link><dc:date>2026-09-20</dc:date></item><item><title>B</title><link>https://example.org/b</link><pubDate>2020-01-01</pubDate></item><item><title>C</title><link>https://example.org/c</link></item><item><title>D</title><link>http://127.0.0.1/d</link><pubDate>2026-09-20</pubDate></item></rdf:RDF>';
 assert.equal(parseFeedArticles(xml,'https://example.org/feed',now).length,1);
 for(const url of ['http://localhost/a','http://127.0.0.1/a','http://[::1]/a','https://x:y@example.org/feed','https://example.org:2083/feed','file:///a'])assert.equal(publicFeedUrl(url),null);
});
