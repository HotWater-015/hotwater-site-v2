import {browser} from './bidi.mjs';import fs from 'node:fs';
const b=await browser();try{
 await b.viewport(1440);await b.go('https://protexy.framer.website/');await b.run('new Promise(r=>setTimeout(r,2000))');
 console.log(await b.run(`JSON.stringify({title:document.title,headings:[...document.querySelectorAll('h1,h2')].slice(0,7).map(e=>({text:e.textContent,font:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize})),links:[...document.querySelectorAll('a')].map(a=>({text:a.textContent.trim(),href:a.getAttribute('href')})).filter(a=>a.text).slice(0,25),canvas:document.querySelectorAll('canvas').length})`));
 fs.writeFileSync('reports/reference-desktop.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
 await b.run('scrollTo(0,950);new Promise(r=>setTimeout(r,1200))');fs.writeFileSync('reports/reference-scroll.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
 await b.viewport(390);await b.run('scrollTo(0,0);new Promise(r=>setTimeout(r,800))');fs.writeFileSync('reports/reference-mobile.png',Buffer.from((await b.call('browsingContext.captureScreenshot',{context:b.context})).data,'base64'));
}finally{await b.close()}
