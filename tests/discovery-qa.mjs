import {browser} from './bidi.mjs';import fs from 'node:fs';
const b=await browser(),cases=[],base=process.env.SITE_V2_URL || 'http://localhost:1314';
const check=async(name,js)=>{if(!await b.run(js))throw Error('FAIL '+name);cases.push(name);console.log('PASS',name)};
const wait=()=>b.run('new Promise(r=>setTimeout(r,400))');
const shot=async name=>fs.writeFileSync(`reports/quality-${name}.png`,Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
const open=async n=>{await b.run(`document.querySelectorAll('.filter-trigger')[${n}].click()`);await wait()};
const pick=value=>b.run(`document.querySelector('.filter-popup:not([hidden]) [data-value="${value}"]').click()`);
try{
 await b.viewport(1440,1000);await b.go(base+'/writeups/');await wait();
 await check('Custom controls hide native popups',`document.querySelectorAll('.filter-trigger').length===3&&[...document.querySelectorAll('.archive-select select')].every(e=>getComputedStyle(e).display==='none')`);await shot('archive-desktop');
 await open(0);await shot('ctf-menu-desktop');
 await check('Dialog/combobox/listbox semantics and real events',`document.querySelector('.filter-popup:not([hidden]) [role=combobox]')===document.activeElement&&document.querySelector('.filter-popup:not([hidden]) [role=listbox]').children.length===14`);
 await b.run(`var q=document.activeElement;q.value='cryovault';q.dispatchEvent(new Event('input'))`);
 await check('Searchable event list',`document.querySelectorAll('.filter-popup:not([hidden]) [role=option]').length===1`);
 await b.run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
 await check('Enter selects and restores trigger focus',`document.querySelectorAll('.writeup-card:not([hidden])').length===31&&document.activeElement===document.querySelectorAll('.filter-trigger')[0]`);
 await open(1);await shot('category-menu-desktop');await pick('digital-forensics');
 await check('Combined filters/counts/active chips',`document.querySelectorAll('.writeup-card:not([hidden])').length===7&&document.querySelectorAll('.selected-filter').length===2&&document.querySelector('[data-category="digital-forensics"] span').textContent==='7'`);
 await b.run(`var q=document.querySelector('[data-archive-q]');q.value='borrowed';q.dispatchEvent(new Event('input'))`);
 await check('Combined search',`document.querySelectorAll('.writeup-card:not([hidden])').length===1&&document.querySelectorAll('.selected-filter').length===3`);await shot('combined-desktop');
 await open(2);await shot('sort-menu-desktop');await pick('alpha');
 await check('Sort retains filters',`document.querySelector('[data-archive-sort]').value==='alpha'&&document.querySelectorAll('.writeup-card:not([hidden])').length===1`);
 await b.run(`document.querySelector('[data-archive-reset]').click();document.querySelector('[data-category="cryptography"]').click()`);
 await check('Quick category badge',`document.querySelectorAll('.writeup-card:not([hidden])').length===35&&document.querySelector('[data-category="cryptography"]').getAttribute('aria-pressed')==='true'`);
 await b.run(`document.querySelector('.selected-filter').click()`);
 await check('Remove filter restores results',`document.querySelectorAll('.writeup-card:not([hidden])').length===177&&document.querySelector('[data-filter-selection]').hidden`);
 await open(0);await b.run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
 await check('Arrow navigation active descendant',`document.activeElement.getAttribute('aria-activedescendant')!==null`);
 await b.run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
 await check('Escape restores focus',`!document.querySelector('.filter-popup:not([hidden])')&&document.activeElement.classList.contains('filter-trigger')`);
 await open(0);await b.run(`var q=document.activeElement;q.value='no-such-event';q.dispatchEvent(new Event('input'))`);
 await check('Menu empty state',`!document.querySelector('.filter-popup:not([hidden]) .filter-menu-empty').hidden`);
 await b.run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));var q=document.querySelector('[data-archive-q]');q.value='no-such-challenge';q.dispatchEvent(new Event('input'))`);await shot('empty-desktop');
 await check('Archive empty state',`!document.querySelector('[data-archive-empty]').hidden`);
 for(const width of [375,768,1440]){
  await b.viewport(width,1000);await b.go(base+'/writeups/');await wait();await shot(`archive-${width}`);
  await b.run(`document.querySelectorAll('.filter-trigger')[0].scrollIntoView({block:'center',behavior:'instant'})`);await wait();await open(0);
  await check(`${width}px menu bounds`,`(()=>{const r=document.querySelector('.filter-popup:not([hidden])').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()`);await shot(`menu-${width}`);await pick('cryovault');
  await check(`${width}px menu selection`,`document.querySelectorAll('.writeup-card:not([hidden])').length===31`);
  await b.go(base+'/writeups/cryovault/floe/');await wait();
  await check(`${width}px article bounds`,`document.documentElement.scrollWidth<=innerWidth`);
  await check(`${width}px exact flag copy`,`(async()=>{let text='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>text=s}});document.querySelector('.flag-copy').click();await Promise.resolve();return text===document.querySelector('.flag-display code').textContent&&document.querySelector('.flag-copy').textContent.includes('Copied')})()`);await shot(`article-${width}`);
  await b.run(`document.querySelector('.solution-scripts').scrollIntoView({block:'start',behavior:'instant'})`);await wait();await shot(`source-${width}`);
  await check(`${width}px real source tabs and metadata`,`getComputedStyle(document.querySelector('[data-script-select]')).display==='none'&&document.querySelectorAll('.script-tabs button').length===2&&document.querySelector('.source-size').textContent.includes('bytes')`);
 }
 await b.viewport(1440,1000);await b.go(base+'/');await b.run('new Promise(r=>setTimeout(r,1200))');await shot('home-desktop');
 await b.viewport(375,1000);await b.go(base+'/');await b.run('new Promise(r=>setTimeout(r,1600))');await shot('home-mobile');
 if(b.errors.length)throw Error(JSON.stringify(b.errors));fs.writeFileSync('reports/quality-browser.json',JSON.stringify({cases,consoleErrors:b.errors},null,2));
}finally{await b.close()}
