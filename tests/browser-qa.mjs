// Firefox WebDriver BiDi QA with the standard Node WebSocket API; no test dependencies.
// Start Firefox --headless --remote-debugging-port 9222 with a temporary profile.
import fs from 'node:fs';
const ws=new WebSocket(`ws://127.0.0.1:${process.env.BIDI_PORT || 9222}/session`);
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.type==='error'?p.reject(new Error(JSON.stringify(m))):p.resolve(m.result);}else if(m.method==='log.entryAdded'&&m.params.level==='error')errors.push(m.params.text);};
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
const call=(method,params={})=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params}));});
const results=[];
try {
 await call('session.new',{capabilities:{alwaysMatch:{acceptInsecureCerts:true}}});
 await call('session.subscribe',{events:['log.entryAdded']});
 const {context}=await call('browsingContext.create',{type:'tab'});
 await call('network.setCacheBehavior',{cacheBehavior:'bypass',contexts:[context]});
 const run=async expression=>{const r=await call('script.evaluate',{expression,target:{context},awaitPromise:true});if(r.type==='exception')throw new Error(r.exceptionDetails.text);return r.result.value;};
 const go=async path=>{await call('browsingContext.navigate',{context,url:(process.env.SITE_V2_URL || 'http://localhost:1314')+path,wait:'complete'});await run('document.fonts.ready.then(()=>true)');};
 const check=async(name,expression)=>{const value=await run(expression);if(!value)throw new Error('FAIL '+name);results.push(name);console.log('PASS',name);};
 await call('browsingContext.setViewport',{context,viewport:{width:1440,height:1000}});
 await go('/');
 await check('Home: real content, fonts, black palette',`document.querySelectorAll('.writeup-card').length===6 && getComputedStyle(document.body).backgroundColor==='rgb(5, 5, 5)' && getComputedStyle(document.body).fontFamily.includes('Inter') && getComputedStyle(document.querySelector('h1')).fontFamily.includes('Manrope')`);
 fs.writeFileSync('reports/phase1-regression-home.png',Buffer.from((await call('browsingContext.captureScreenshot',{context})).data,'base64'));
 await go('/writeups/');
 await check('All CTFs and metadata-derived choices',`document.querySelectorAll('.writeup-card').length===177 && document.querySelector('[data-archive-event]').options.length===14 && document.querySelector('[data-archive-count]').textContent.includes('177 of 177')`);
 await check('One CTF',`(()=>{const s=document.querySelector('[data-archive-event]');s.value='cryovault';s.dispatchEvent(new Event('change'));const cards=[...document.querySelectorAll('.writeup-card:not([hidden])')];return cards.length===31&&cards.every(c=>c.dataset.event==='cryovault')})()`);
 await check('Combined CTF + category',`(()=>{const s=document.querySelector('[data-archive-category]');s.value='digital-forensics';s.dispatchEvent(new Event('change'));const cards=[...document.querySelectorAll('.writeup-card:not([hidden])')];return cards.length===7&&cards.every(c=>c.dataset.cat==='digital-forensics'&&c.dataset.event==='cryovault')})()`);
 await check('Search with filters',`(()=>{const q=document.querySelector('[data-archive-q]');q.value='borrowed';q.dispatchEvent(new Event('input'));return document.querySelectorAll('.writeup-card:not([hidden])').length===1&&location.search.includes('q=borrowed')})()`);
 await go('/writeups/?event=cryovault&cat=forensics&q=BORROWED');
 await check('URL refresh + legacy category normalization + case-insensitive search',`document.querySelectorAll('.writeup-card:not([hidden])').length===1&&document.querySelector('[data-archive-category]').value==='digital-forensics'`);
 await check('Zero results retains category',`(()=>{const q=document.querySelector('[data-archive-q]');q.value='no-result-xyz';q.dispatchEvent(new Event('input'));return !document.querySelector('[data-archive-empty]').hidden&&document.querySelector('[data-archive-category]').value==='digital-forensics'})()`);
 await check('Clear search retains filters',`(()=>{document.querySelector('[data-clear-search]').click();return document.querySelectorAll('.writeup-card:not([hidden])').length===7})()`);
 await check('Clear filters',`(()=>{document.querySelector('[data-archive-reset]').click();return document.querySelectorAll('.writeup-card:not([hidden])').length===177&&!location.search})()`);
 await check('Category alone',`(()=>{const s=document.querySelector('[data-archive-category]');s.value='cryptography';s.dispatchEvent(new Event('change'));return [...document.querySelectorAll('.writeup-card:not([hidden])')].every(c=>c.dataset.cat==='cryptography')})()`);
 await check('Alphabetical sorting',`(()=>{const s=document.querySelector('[data-archive-sort]');s.value='alpha';s.dispatchEvent(new Event('change'));const a=[...document.querySelectorAll('.writeup-card')].map(c=>c.dataset.title);return a.every((v,i)=>!i||a[i-1].localeCompare(v)<=0)})()`);
 await check('Oldest sorting',`(()=>{const s=document.querySelector('[data-archive-sort]');s.value='oldest';s.dispatchEvent(new Event('change'));const a=[...document.querySelectorAll('.writeup-card')].map(c=>Number(c.dataset.date));return a.every((v,i)=>!i||a[i-1]<=v)})()`);
 await check('Newest sorting',`(()=>{const s=document.querySelector('[data-archive-sort]');s.value='newest';s.dispatchEvent(new Event('change'));const a=[...document.querySelectorAll('.writeup-card')].map(c=>Number(c.dataset.date));return a.every((v,i)=>!i||a[i-1]>=v)})()`);
 await go('/writeups/?event=ISFCR%20CryoVault%20Finals%202026&cat=Digital%20Forensics&q=BORR');
 await check('CTF display-name query + partial matching',`document.querySelectorAll('.writeup-card:not([hidden])').length===1&&document.querySelector('[data-archive-event]').value==='cryovault'`);
 await go('/ctfs/');
 await check('CTF index',`document.querySelectorAll('.event-tile').length===13`);
 await go('/categories/');
 await check('Category index',`document.querySelectorAll('.category-links a').length>0`);
 await go('/search/');
 await check('Search route has accessible form',`document.querySelector('form').getAttribute('action')==='/writeups/'&&document.querySelector('label[for="site-search"]')!==null`);
 await go('/writeups/cryovault/floe/');
 await check('Desktop reading column is wide and left of TOC',`document.querySelector('.article-main').getBoundingClientRect().width>=650&&document.querySelector('.article-main').getBoundingClientRect().left<document.querySelector('.article-toc').getBoundingClientRect().left`);
 await check('39-candidate challenge exposes only two curated scripts',`document.querySelectorAll('.script-panel').length===2&&document.querySelector('.script-panel:not([hidden]) strong').textContent==='exploit_final.py'`);
 await check('File selection',`(()=>{const s=document.querySelector('[data-script-select]');s.value='script-1';s.dispatchEvent(new Event('change'));return document.querySelector('.script-panel:not([hidden]) strong').textContent==='brute_canary.py'})()`);
 await check('Source download + copy preserve exact content',`(async()=>{let copied;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text}}});const p=document.querySelector('.script-panel:not([hidden])');p.querySelector('[data-copy-code]').click();await Promise.resolve();const source=await(await fetch(p.querySelector('[download]').href)).text();return copied===source&&p.querySelector('pre code').textContent===source})()`);
 await check('Reading progress updates',`(async()=>{window.scrollTo({top:document.body.scrollHeight/2,behavior:'instant'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const width=parseFloat(document.querySelector('.reading-progress span').style.width);return width>0&&width<=100})()`);
 await check('TOC + tables + syntax highlighting',`document.querySelector('.toc-nav a')&&document.querySelector('.markdown-body table')&&document.querySelector('.chroma .k')`);
 await go('/writeups/isfcr/parallax/');
 await check('Multiple dependencies + unusual filename',`document.querySelectorAll('.script-panel').length===3&&[...document.querySelectorAll('.script-header strong')].some(e=>e.textContent==='model (1).py')`);
 await go('/writeups/cryovault/algebraic-mirage/');
 fs.writeFileSync('reports/phase1-regression-article.png',Buffer.from((await call('browsingContext.captureScreenshot',{context})).data,'base64'));
 await check('Math rendered',`document.querySelector('.katex')!==null`);
 await go('/writeups/xploit/common-modulus/');
 await check('Single curated script + long source lines',`document.querySelectorAll('.script-panel').length===1&&document.querySelector('.script-source pre').textContent.split('\\n').some(l=>l.length>200)&&document.documentElement.scrollWidth<=innerWidth`);
 await go('/writeups/cryovault/algebraic-mirage/');
 await check('No approved scripts: no empty viewer',`!document.querySelector('.solution-scripts')`);
 for(const width of [375,768,1440]){
  await call('browsingContext.setViewport',{context,viewport:{width,height:900}});
  await go('/writeups/cryovault/floe/');
  await check(`Article width ${width}: no page overflow`,`document.documentElement.scrollWidth<=innerWidth`);
  await go('/writeups/');
  await check(`Archive width ${width}: no page overflow`,`document.documentElement.scrollWidth<=innerWidth`);
  if(width===375){
   await check('Mobile navigation opens + Escape closes',`(()=>{const b=document.querySelector('.menu-toggle');b.click();const opened=b.getAttribute('aria-expanded')==='true'&&getComputedStyle(document.querySelector('#primary-navigation')).display!=='none';document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return opened&&b.getAttribute('aria-expanded')==='false'})()`);
   fs.writeFileSync('reports/phase1-regression-mobile.png',Buffer.from((await call('browsingContext.captureScreenshot',{context})).data,'base64'));
  }
 }
 await go('/writeups/sun/ground/');
 await check('Payload HTML remains escaped',`!document.querySelector('.markdown-body iframe')&&document.querySelector('.markdown-body pre').textContent.includes('<form')`);
 if(errors.length)throw Error('BROWSER ERRORS '+JSON.stringify(errors));
 const report={passed:results.length,cases:results,consoleErrors:errors,limits:['Clipboard API mocked to verify exact payload; actual OS clipboard permission not tested.','Static HTTP server does not apply Cloudflare _headers/_redirects; those are validated separately.']};
 fs.writeFileSync('reports/browser-qa.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:results.length,consoleErrors:errors.length}));
} finally {try{await call('session.end');}catch{} ws.close();}
