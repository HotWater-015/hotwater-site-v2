import { browser } from './bidi.mjs'; import fs from 'node:fs';
const productionBase=process.env.SITE_V2_URL || 'http://localhost:1314';
const b=await browser();const checks=[];
const wait=()=>b.run('new Promise(r=>setTimeout(r,1400))');
const check=async(label,expr)=>{if(!await b.run(expr))throw Error(label);checks.push(label)};
const shot=async(name)=>{await wait();fs.writeFileSync(`reports/about-v5-${name}.png`,Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'))};
try{
 await b.viewport(1440,960);await b.go(productionBase+'/about/');await wait();
 await check('Exact headline',`document.querySelector('h1').textContent.trim().replace(/\\s+/g,' ')==='TRUST IS A VULNERABILITY.'`);
 await check('Seven data-driven events',`document.querySelectorAll('[data-event-id]').length===7`);
 await check('Five mapped photographs',`[...document.querySelectorAll('.av-event-figure img')].map(i=>i.getAttribute('src')).join('|')==='/images/achievements/xploitx-ctf-2026.png|/images/achievements/in-ctf-hardware-2026.jpg|/images/achievements/drestein-cyber-heist-2026.jpg|/images/achievements/lunar-ctf-2026.jpg|/images/achievements/cryovault-ctf-2026.jpg'`);
 await check('Confirmed XploitX photo; two abstract fallbacks',`document.querySelector('img[src*="xploitx-ctf-2026.png"]') && document.querySelectorAll('.av-procedural').length===2`);
 await check('One footer, one back to top',`document.querySelectorAll('footer').length===1&&[...document.querySelectorAll('a')].filter(e=>/back to top/i.test(e.textContent)).length===1`);
 await shot('hero');
 await b.run('scrollTo({top:600,behavior:"instant"})');await shot('hero-transition');
 await b.run('document.querySelector("#positions").scrollIntoView({behavior:"instant"})');await shot('podium');
 await check('Podium 00 / 06 / 01',`JSON.stringify([...document.querySelectorAll('[data-count]')].map(e=>e.textContent))==='["00","06","01"]'`);
 await check('Gold and crimson metals',`getComputedStyle(document.querySelector('.av-first')).getPropertyValue('--metal').trim()==='#facc15'&&getComputedStyle(document.querySelector('.av-third')).getPropertyValue('--metal').trim()==='#ef4444'`);
 for(let i=0;i<7;i++){
  await b.run(`document.querySelector('[data-award-go="${i}"]').click()`);await wait();
  await check(`Gallery event ${i+1} focused`,`document.querySelector('.av-awards-sequence').dataset.active==='${i}'&&document.querySelector('[data-award="${i}"]').inert===false`);
  await check(`Event ${i+1} frame contained`, `(()=>{const a=document.querySelector('[data-award="${i}"]'),w=document.querySelector('.av-awards-window').getBoundingClientRect(),r=a.querySelector('figure').getBoundingClientRect();return r.bottom<=w.bottom+2&&r.top>=w.top-2})()`);
  await shot(`event-${i+1}`);
 }
 await check('Photographs decoded',`[...document.querySelectorAll('.av-event-figure img')].every(i=>i.complete&&i.naturalWidth>0)`);
 await check('Portrait uses contain',`getComputedStyle(document.querySelector('.av-portrait img')).objectFit==='contain'`);
 await b.run(`(()=>{const s=document.querySelector('.av-awards-sequence');scrollTo({top:s.offsetTop-76+(s.offsetHeight-innerHeight+76)*.42,behavior:'instant'})})()`);await shot('gallery-transition');
 await b.run('document.querySelector("#about-closing").scrollIntoView({behavior:"instant"})');await shot('footer');
 await check('Desktop no overflow','document.documentElement.scrollWidth<=innerWidth');
 await b.viewport(768,1024);await b.go(productionBase+'/about/');await wait();await b.run('document.querySelector("#achievements").scrollIntoView({behavior:"instant"})');await shot('tablet-gallery');await check('Tablet no overflow','document.documentElement.scrollWidth<=innerWidth');
 await b.viewport(390,844);await b.go(productionBase+'/about/');await shot('mobile-hero');
 for(const [id,name] of [['positions','mobile-podium'],['achievements','mobile-gallery'],['cryovault-ctf-2026','mobile-portrait'],['about-closing','mobile-footer']]){await b.run(`document.getElementById('${id}').scrollIntoView({behavior:'instant'})`);await shot(name)}
 await check('Mobile all events accessible',`[...document.querySelectorAll('.av-award')].every(e=>!e.inert&&!e.hasAttribute('aria-hidden'))`);
 await check('Mobile no overflow','document.documentElement.scrollWidth<=innerWidth');
 await b.viewport(1440,960);await b.go(productionBase+'/about/');await wait();await b.run('document.querySelector(".motion-toggle").click()');await wait();await check('Motion-off no pinned gallery',`getComputedStyle(document.querySelector('.av-awards-stage')).position!=='sticky'&&!document.querySelector('#about-artifact canvas')`);await b.run('document.querySelector(".motion-toggle").click()');
 if(b.errors.length)throw Error(b.errors.join('; '));
 fs.writeFileSync('reports/about-v5-browser.json',JSON.stringify({checks,errors:b.errors},null,2));console.log(`${checks.length} V5 checks passed.`);
}finally{await b.close()}
