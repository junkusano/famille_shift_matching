const {loadEnvConfig}=require('@next/env');loadEnvConfig(process.cwd());
const {createClient}=require('@supabase/supabase-js'),cheerio=require('cheerio'),ts=require('typescript'),fs=require('fs'),assert=require('assert/strict'),puppeteer=require('puppeteer-core');
(async()=>{
 const db=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
 const {data,error}=await db.from('rpa_page_snapshots').select('id,page_url,body_html').in('id',['90dc2665-5925-4098-acf1-3889a47a1039','93f88f11-96ec-4628-9360-992042f8d587']);if(error)throw Error(error.message);
 const code=ts.transpileModule(fs.readFileSync('C:/Users/USER/famille-rpa/src/social/page.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-background-networking']});
 let passed=0;
 try{for(const row of data){
  const platform=row.page_url.includes('x.com')?'x':'threads',account=platform==='x'?'JunKusano_Shion':'famillehelperservice',$=cheerio.load(row.body_html);
  const dialog=$('[role=dialog][aria-modal=true]').first();
  const nav=platform==='x'?$('a[data-testid=AppTabBar_Profile_Link]').first():$('a[href="/@famillehelperservice"]').filter((i,e)=>/プロフィール/.test($(e).text())).first();
  const p={platform,account,text:dialog.find('[role=textbox]').text().trim(),article_url:'https://shi-on.net/care-office-scale-break-even-wage-increase-202609/',operation_key:'blog-social:'+platform+':created:10'};
  const fragment=cheerio.load('<html><body>'+$.html(nav)+$.html(dialog)+'</body></html>');
  fragment('script,style,img,iframe,link,video').remove();fragment('*').each((i,e)=>{for(const a of Object.keys(e.attribs||{}))if(a.startsWith('on')||a==='style'||a==='class')fragment(e).removeAttr(a);});
  let html=fragment.html();const page=await browser.newPage();await page.setRequestInterception(true);
  page.on('request',r=>r.isNavigationRequest()?r.respond({status:200,contentType:'text/html; charset=utf-8',body:html}):r.abort());
  await page.goto(row.page_url);
  await page.addScriptTag({content:'var exports={};'+code});
  const inspect=await page.evaluate(p=>exports.socialPageAction(p,'inspect'),p);assert.equal(inspect.state,'ready');passed++;
  await assert.rejects(page.evaluate(p=>exports.socialPageAction({...p,account:'wrong_account'},'submit'),p),/LOGIN_REQUIRED/);passed++;
  await assert.rejects(page.evaluate(p=>exports.socialPageAction({...p,text:'different'},'submit'),p),/TEXT_MISMATCH/);passed++;
  await page.evaluate(platform=>{window.clicks=0;const dialog=document.querySelector('[role=dialog][aria-modal=true]');const button=platform==='x'?dialog.querySelector('[data-testid=tweetButton]'):[...dialog.querySelectorAll('[role=button]')].find(e=>e.textContent.trim()==='投稿');button.addEventListener('click',()=>{window.clicks++;dialog.remove();});},platform);
  const submitted=await page.evaluate(p=>exports.socialPageAction(p,'submit'),p);assert.equal(submitted.state,'submitted');assert.equal(await page.evaluate(()=>window.clicks),1);passed++;
  console.log(platform+': captured composer checks passed');
  
  const profile=platform==='x'?'https://x.com/'+account:'https://www.threads.com/@'+account;
  const postPath=platform==='x'?'/'+account+'/status/123':'/@'+account+'/post/abc';
  const escaped=p.text.replaceAll('&','&amp;').replaceAll('<','&lt;');
  const articleHref=platform==='x'?p.article_url:'https://l.threads.com/?u='+encodeURIComponent(p.article_url);
  html='<meta charset="utf-8">'+fragment.html(nav)+'<article><a href="'+postPath+'">今</a><p>'+escaped+'</p><a href="'+articleHref+'">記事</a></article>';
  // Preserve the sanitized profile navigation extracted from the captured DOM.
  html='<meta charset="utf-8">'+fragment('body').children('a').first().toString()+'<article><a href="'+postPath+'">今</a><p>'+escaped+'</p><a href="'+articleHref+'">記事</a></article>';
  await page.goto(profile);await page.addScriptTag({content:'var exports={};'+code});
  assert.equal((await page.evaluate(p=>exports.socialPageAction(p,'find_post'),p)).state,'published');passed++;
  await page.evaluate(()=>document.querySelector('article a:last-child').href='https://shi-on.net/wrong/');
  assert.equal((await page.evaluate(p=>exports.socialPageAction(p,'find_post'),p)).state,'not_found');passed++;
  console.log(platform+': profile verification checks passed');
  await page.close();
 }}finally{await browser.close();}
 console.log('Passed '+passed+' real-browser DOM checks; no network post requests were sent.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});