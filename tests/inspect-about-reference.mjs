import {browser} from './bidi.mjs';import fs from 'node:fs';
const b=await browser();try{await b.viewport(1440,960);await b.go('https://protexy.framer.website/about');await b.run('new Promise(r=>setTimeout(r,1500))');
console.log(await b.run(`JSON.stringify({height:document.documentElement.scrollHeight,headings:[...document.querySelectorAll('h1,h2,h3')].map(e=>({text:e.textContent,font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize,y:Math.round(e.getBoundingClientRect().top+scrollY)})),sticky:[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='sticky').slice(0,15).map(e=>({tag:e.tagName,name:e.getAttribute('data-framer-name'),text:e.textContent.slice(0,80)}))})`));
for(const [name,y] of [['hero',0],['transition',650],['intro',1200],['middle',2200],['awards',3300],['end',4500]]){
 await b.run(`scrollTo({top:${y},behavior:'instant'});new Promise(r=>setTimeout(r,650))`);fs.writeFileSync(`reports/about-reference-${name}.png`,Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
 console.log(name,await b.run(`JSON.stringify([...document.querySelectorAll('h1,h2,h3,img')].filter(e=>{const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight}).slice(0,10).map(e=>({tag:e.tagName,text:e.textContent||e.getAttribute('alt'),top:Math.round(e.getBoundingClientRect().top),transform:getComputedStyle(e).transform})))`));
}
await b.viewport(390,900);await b.go('https://protexy.framer.website/about');await b.run('new Promise(r=>setTimeout(r,1000))');fs.writeFileSync('reports/about-reference-mobile.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
await b.run('scrollTo({top:1000,behavior:"instant"});new Promise(r=>setTimeout(r,700))');fs.writeFileSync('reports/about-reference-mobile-scroll.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
}finally{await b.close()}
