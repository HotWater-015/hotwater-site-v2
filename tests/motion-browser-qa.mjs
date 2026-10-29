// Optional UI layer QA against the production output. Uses Firefox BiDi + Node built-ins.
import fs from 'node:fs';
const reduced = process.env.MOTION_EXPECT_REDUCED === '1';
const ws = new WebSocket(`ws://127.0.0.1:${process.env.BIDI_PORT || 9222}/session`);
let sequence = 0; const pending = new Map(), errors = [], cases = [];
ws.onmessage = event => {
  const message = JSON.parse(event.data);
  if (message.id) { const item = pending.get(message.id); pending.delete(message.id); message.type === 'error' ? item.reject(Error(message.message)) : item.resolve(message.result); }
  else if (message.method === 'log.entryAdded' && message.params.level === 'error') errors.push(message.params.text);
};
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
try {
  await call('session.new', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
  await call('session.subscribe', { events: ['log.entryAdded'] });
  const { context } = await call('browsingContext.create', { type: 'tab' });
  await call('network.setCacheBehavior',{cacheBehavior:'bypass',contexts:[context]});
  const run = async expression => {
    const response = await call('script.evaluate', { expression, target: { context }, awaitPromise: true });
    if (response.type === 'exception') throw Error(response.exceptionDetails.text);
    return response.result.value;
  };
  const wait = expression => run(`new Promise((resolve,reject)=>{let attempts=0;const check=()=>{if(${expression})return resolve(true);if(attempts++>100)return reject(Error('Timed out waiting for ${expression.replaceAll("'", '')}'));setTimeout(check,30)};check()})`);
  const check = async (name, expression) => { if (!await run(expression)) throw Error('FAIL ' + name); cases.push(name); console.log('PASS', name); };
  const go = async path => { await call('browsingContext.navigate', { context, url: (process.env.SITE_V2_URL || 'http://localhost:1314') + path, wait: 'complete' }); await wait("document.documentElement.hasAttribute('data-motion')"); };
  await call('browsingContext.setViewport', { context, viewport: { width: 1440, height: 1000 } });
  await go('/');
  if (reduced) {
    await check('Real OS reduced-motion preference honored', `matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion==='reduced'`);
    await check('Static fallback, no particle RAF, toggle cannot override OS', `getComputedStyle(document.querySelector('.cyber-canvas')).display==='none' && document.querySelector('.cyber-background').dataset.animating!=='true' && document.querySelector('.motion-toggle').disabled`);
    await check('No running decorative animations', `document.getAnimations().filter(a=>a.playState==='running').length===0`);
    await go('/writeups/');
    await check('Reduced motion preserves immediate filtering', `(()=>{const q=document.querySelector('[data-archive-q]');q.value='rime';q.dispatchEvent(new Event('input'));return document.querySelectorAll('.writeup-card:not([hidden])').length===5&&document.getAnimations().filter(a=>a.playState==='running').length===0})()`);
    await go('/writeups/cryovault/floe/');
    await check('Reduced motion preserves script selection', `(()=>{const s=document.querySelector('[data-script-select]');s.value='script-1';s.dispatchEvent(new Event('change'));return document.querySelector('.script-panel:not([hidden]) strong').textContent==='brute_canary.py'})()`);
    await check('No article canvas, header-scoped ambient only', `!document.querySelector('.cyber-canvas') && document.querySelector('.cyber-background').closest('.article-header')!==null`);
  } else {
    await wait("document.querySelector('.cyber-background').dataset.animating==='true'");
    await check('React island and bounded hero canvas initialized', `document.querySelector('.cyber-background').dataset.particleCount<=56 && document.querySelector('.motion-toggle').getAttribute('aria-pressed')==='true' && document.querySelector('.cyber-terminal').textContent.includes('document --methodology')`);
    await check('DPR capped and background cannot block controls', `(()=>{const host=document.querySelector('.cyber-background'),canvas=host.querySelector('canvas');return canvas.width/host.clientWidth<=2.01&&getComputedStyle(host).pointerEvents==='none'&&getComputedStyle(canvas).pointerEvents==='none'})()`);
    await run("document.querySelector('.motion-toggle').click()");
    await wait("document.documentElement.dataset.motion==='off'");
    await check('Motion toggle cancels RAF and keeps a static grid', `document.querySelector('.cyber-background').dataset.animating==='false' && getComputedStyle(document.querySelector('.cyber-background'),'::before').backgroundImage.includes('linear-gradient')`);
    await go('/');
    await check('Motion-off preference survives navigation', `document.documentElement.dataset.motion==='off' && document.querySelector('.motion-toggle').getAttribute('aria-pressed')==='false'`);
    await run("document.querySelector('.motion-toggle').click()");
    await wait("document.querySelector('.cyber-background').dataset.animating==='true'");
    await run("scrollTo({top:document.body.scrollHeight,behavior:'instant'})");
    await wait("document.querySelector('.cyber-background').dataset.animating==='false'");
    cases.push('Canvas pauses when hero leaves viewport');
    await run("scrollTo({top:0,behavior:'instant'})");
    await wait("document.querySelector('.cyber-background').dataset.animating==='true'");
    cases.push('Canvas resumes when hero returns');
    const other = await call('browsingContext.create', { type: 'tab' });
    await call('browsingContext.activate', { context: other.context });
    await wait("document.hidden && document.querySelector('.cyber-background').dataset.animating==='false'");
    cases.push('Hidden tab pauses canvas');
    await call('browsingContext.activate', { context });
    await wait("!document.hidden && document.querySelector('.cyber-background').dataset.animating==='true'");
    await call('browsingContext.close', { context: other.context });
    cases.push('Visible tab resumes canvas');
    await run("new Promise(resolve=>setTimeout(resolve,450))");
    fs.writeFileSync('reports/preview-motion-home.png', Buffer.from((await call('browsingContext.captureScreenshot', { context })).data, 'base64'));
    await go('/writeups/');
    await check('Archive is lower density', `Number(document.querySelector('.cyber-background').dataset.particleCount)<=26`);
    await check('Filters update synchronously without moving/remounting cards', `(async()=>{const grid=document.querySelector('[data-archive-grid]'),before=[...grid.children];let moves=0;const observer=new MutationObserver(records=>moves+=records.length);observer.observe(grid,{childList:true});const q=document.querySelector('[data-archive-q]');q.value='rime';const start=performance.now();q.dispatchEvent(new Event('input'));window.__filterDuration=performance.now()-start;const immediate=document.querySelectorAll('.writeup-card:not([hidden])').length;await Promise.resolve();observer.disconnect();return immediate===5&&moves===0&&before.every((el,i)=>el===grid.children[i])&&location.search.includes('q=rime')})()`);
    await check('Filter accent and empty state', `(()=>{const s=document.querySelector('[data-archive-category]');s.value='cryptography';s.dispatchEvent(new Event('change'));const q=document.querySelector('[data-archive-q]');q.value='not-a-real-challenge';q.dispatchEvent(new Event('input'));return s.closest('.archive-select').dataset.filterActive==='true'&&!document.querySelector('[data-archive-empty]').hidden})()`);
    await run("document.querySelector('[data-archive-reset]').click();document.querySelector('.writeup-card').scrollIntoView({behavior:'instant',block:'center'})");
    const point = JSON.parse(await run(`JSON.stringify((()=>{const b=document.querySelector('.writeup-card').getBoundingClientRect();return{x:Math.round(b.x+40),y:Math.round(b.y+40)}})())`));
    await call('input.performActions', { context, actions: [{ type: 'pointer', id: 'qa-mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', x: point.x, y: point.y, duration: 0 }] }] });
    await run('new Promise(resolve=>setTimeout(resolve,220))');
    await check('Card hover lift is restrained to 3px', `(()=>{const card=document.querySelector('.writeup-card:hover');if(!card)return false;const y=new DOMMatrix(getComputedStyle(card).transform).m42;return y>=-4&&y<=-2})()`);
    await go('/writeups/cryovault/floe/');
    await check('Articles never start a particle loop', `!document.querySelector('.cyber-canvas')&&document.querySelector('.cyber-background').closest('.article-header')!==null`);
    await check('Script change is immediate and source stays stable', `(()=>{const select=document.querySelector('[data-script-select]');select.value='script-1';select.dispatchEvent(new Event('change'));return document.querySelector('.script-panel:not([hidden]) strong').textContent==='brute_canary.py'&&document.querySelector('.script-panel:not([hidden]) code').textContent.includes('import')})()`);
    await check('Copy confirmation marks success without modifying source', `(async()=>{let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>copied=t}});const panel=document.querySelector('.script-panel:not([hidden])'),text=panel.querySelector('code').textContent,button=panel.querySelector('[data-copy-code]');button.click();await Promise.resolve();return copied===text&&button.dataset.copyStatus==='success'&&panel.querySelector('code').textContent===text})()`);
    await call('browsingContext.setViewport', { context, viewport: { width: 375, height: 900 } });
    await go('/');
    await wait("document.querySelector('.cyber-background').dataset.particleCount!==undefined");
    await check('Mobile caps particles, disables cursor work and prevents overflow', `document.querySelector('.cyber-background').dataset.particleCount<=18&&document.querySelector('.cyber-background').dataset.cursorEnabled==='false'&&document.documentElement.scrollWidth<=innerWidth`);
    const preload = await call('script.addPreloadScript', { contexts: [context], functionDeclaration: `() => { HTMLCanvasElement.prototype.getContext = function(){return null}; }` });
    await go('/writeups/');
    await check('Canvas-unavailable fallback keeps content and search usable', `(()=>{const q=document.querySelector('[data-archive-q]');q.value='rime';q.dispatchEvent(new Event('input'));return document.querySelectorAll('.writeup-card:not([hidden])').length===5&&document.querySelector('.cyber-background').dataset.animating!=='true'&&getComputedStyle(document.querySelector('.cyber-background'),'::before').backgroundImage.includes('linear-gradient')})()`);
    await call('script.removePreloadScript', { script: preload.script });
  }
  if (errors.length) throw Error('Browser console errors: ' + JSON.stringify(errors));
  const report = { mode: reduced ? 'system-reduced-motion' : 'normal-motion', passed: cases.length, cases, consoleErrors: errors };
  fs.writeFileSync(`reports/motion-browser-${reduced ? 'reduced' : 'normal'}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { try { await call('session.end'); } catch {} ws.close(); }
