// Run with existing environment loaded. Dry-run unless --apply is supplied.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const scriptUrl = 'https://myfamille.shi-on.net/recruitment-tracking.js';
const hash = value => createHash('sha256').update(value).digest('hex');
async function main() {
  const base = new URL(process.env.WORDPRESS_API_URL.replace(/\/?$/, '/'));
  if (!['shi-on.net','www.shi-on.net'].includes(base.hostname) || base.protocol !== 'https:') throw Error('Unexpected WordPress host');
  const headers = { Authorization: 'Basic ' + Buffer.from(process.env.WORDPRESS_USERNAME + ':' + process.env.WORDPRESS_APP_PASSWORD).toString('base64') };
  async function request(endpoint, body) {
    const r = await fetch(new URL(endpoint, base), { method: body ? 'POST' : 'GET', headers: { ...headers, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!r.ok) throw Error('WordPress HTTP ' + r.status);
    return r.json();
  }
  const pages = await request('pages?slug=recruiting&context=edit');
  if (pages.length !== 1 || pages[0].status !== 'publish') throw Error('Expected one published recruiting page');
  const page = pages[0], original = page.content.raw;
  if (typeof original !== 'string') throw Error('Raw page unavailable');
  let count = 0;
  let content = original.replace(/href=(['"])(https:\/\/myfamille\.shi-on\.net\/entry\/?)(\1)/g, (_, quote, url) => {
    count++; return 'href=' + quote + url + '?recruitment_source=recruiting_lp' + quote;
  });
  if (!content.includes(scriptUrl)) content += '\n<!-- wp:html -->\n<script defer src="' + scriptUrl + '"></script>\n<!-- /wp:html -->\n';
  console.log(JSON.stringify({ pageId: page.id, changedLinks: count, changed: content !== original, mode: process.argv.includes('--apply') ? 'apply' : 'dry-run' }));
  if (!process.argv.includes('--apply') || content === original) return;
  const script = await fetch(scriptUrl, { signal: AbortSignal.timeout(15000) });
  if (!script.ok || !(await script.text()).includes('recruitment-journey-v1')) throw Error('Deploy measurement script before updating WordPress');
  const current = await request('pages/' + page.id + '?context=edit');
  if (current.modified_gmt !== page.modified_gmt || current.content.raw !== original) throw Error('Page changed during preparation; retry after review');
  fs.mkdirSync(path.join(process.cwd(), 'tmp'), { recursive: true });
  const backup = path.join(process.cwd(), 'tmp', 'recruiting-before-tracking-' + Date.now() + '.json');
  fs.writeFileSync(backup, JSON.stringify({ id: page.id, modified_gmt: page.modified_gmt, content: original }));
  const saved = await request('pages/' + page.id, { content });
  if (saved.content.raw !== content) throw Error('Saved content differs; inspect WordPress sanitization');
  console.log(JSON.stringify({ savedPage: saved.id, beforeHash: hash(original), afterHash: hash(content), backup }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
