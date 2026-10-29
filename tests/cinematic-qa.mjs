import { browser } from './bidi.mjs';
import fs from 'node:fs';
const b=await browser(),cases=[];const base='http://localhost:1314';
const check=async(name,js)=>{if(!await b.run(js))throw Error('FAIL '+name);cases.push(name);console.log('PASS',name)};
const shot=async(name)=>fs.writeFileSync(`reports/phase1-${name}.png`,Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
try{
 await b.viewport(1440,1000);await b.go(base+'/');await b.run('new Promise(r=>setTimeout(r,1800))');
 await check('Hugo hero and six real latest writeups',`document.querySelector('h1').textContent.includes('DOCUMENT.')&&document.querySelectorAll('.writeup-card').length===6`);
 await check('All seven original category visual families',`document.querySelectorAll('.category-tiles .ctf-visual').length===7`);
 console.log('SCENE',await b.run(`JSON.stringify({state:document.querySelector('#hero-scene').dataset.scene,canvas:!!document.querySelector('#hero-scene canvas'),width:innerWidth,overflow:document.documentElement.scrollWidth})`));
 await shot('home-desktop');
 await b.run('document.querySelector("#latest").scrollIntoView();new Promise(r=>setTimeout(r,800))');await shot('latest-desktop');
 await b.run('document.querySelector(".category-section").scrollIntoView();new Promise(r=>setTimeout(r,800))');await shot('categories-desktop');
 await b.go(base+'/writeups/');await b.run('new Promise(r=>setTimeout(r,800))');await shot('archive-desktop');
 await b.go(base+'/writeups/cryovault/floe/');await b.run('new Promise(r=>setTimeout(r,800))');await shot('article-desktop');
 await b.run('document.querySelector(".solution-scripts").scrollIntoView();new Promise(r=>setTimeout(r,400))');await shot('code-desktop');
 for(const width of [375,768,1440]){
  await b.viewport(width,960);
  for(const path of ['/','/writeups/','/ctfs/','/categories/','/about/','/writeups/cryovault/floe/']){
   await b.go(base+path);await b.run('new Promise(r=>setTimeout(r,250))');
   await check(`${width}px ${path} no overflow`,`document.documentElement.scrollWidth<=innerWidth`);
   if(width===375&&path==='/'){await b.run('new Promise(r=>setTimeout(r,900))');await shot('home-mobile')}
   if(width===375&&path==='/writeups/')await shot('archive-mobile');
   if(width===375&&path==='/writeups/cryovault/floe/')await shot('article-mobile');
  }
 }
 if(b.errors.length)throw Error(JSON.stringify(b.errors));
 fs.writeFileSync('reports/phase1-browser.json',JSON.stringify({cases,consoleErrors:b.errors},null,2));
}finally{await b.close()}
