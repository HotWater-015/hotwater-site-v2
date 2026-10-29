import { browser } from './bidi.mjs'; import fs from 'node:fs';
const b = await browser(); const checks=[];
const check=async(label,expression)=>{if(!await b.run(expression))throw Error(label);checks.push(label)};
try{
 await b.viewport(1440,960);await b.go('http://localhost:1314/about/');await b.run('new Promise(r=>setTimeout(r,900))');
 await check('System reduced motion honored',"matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#about-v4').dataset.enhanced==='false'");
 await check('No decorative WebGL canvas',"!document.querySelector('#about-artifact canvas')");
 await check('No pinned hero or achievement scenes',"getComputedStyle(document.querySelector('.av-stage')).position!=='sticky' && getComputedStyle(document.querySelector('.av-awards-stage')).position!=='sticky'");
 await check('All placements accessible',"[...document.querySelectorAll('.av-award')].every(e=>!e.inert&&!e.hasAttribute('aria-hidden'))");
 await check('Final counts immediately available',"[...document.querySelectorAll('[data-count]')].every(e=>Number(e.textContent)===Number(e.dataset.count))");
 fs.writeFileSync('reports/about-v5-reduced.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
 for(const width of [320,390,768,1280]){await b.viewport(width,800);await check(`${width}px no overflow`,'document.documentElement.scrollWidth<=innerWidth')}
 if(b.errors.length)throw Error(b.errors.join('; '));fs.writeFileSync('reports/about-v5-reduced.json',JSON.stringify({checks,errors:b.errors},null,2));console.log(`${checks.length} reduced-motion checks passed.`);
}finally{await b.close()}
