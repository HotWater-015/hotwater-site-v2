import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const base=process.env.SITE_V2_URL||'http://localhost:1314';
const out=process.env.CTF_QA_OUT||'reports/ctf-polish/iteration-1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/home/jarvis/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))errors.push(`${r.status()} ${r.url()}`)});
const check=(name,ok)=>{checks.push({name,passed:!!ok});if(!ok)throw Error(name)};
async function go(route){await page.goto(base+route);await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.documentElement.dataset.motion);await page.evaluate(()=>{document.activeElement?.blur();const el=document.querySelector('.events-section');scrollTo({top:el.getBoundingClientRect().top+scrollY-115,behavior:'instant'})});await page.waitForTimeout(1100);await page.waitForFunction(()=>getComputedStyle(document.querySelector('.events-section')).opacity==='1')}
async function shot(name,selector='.events-section'){if(selector==='.events-section'&&page.viewportSize().width<=1100){await page.screenshot({path:`${out}/${name}.png`,animations:'disabled'})}else{await page.locator(selector).first().screenshot({path:`${out}/${name}.png`,animations:'disabled'})}}
try{
 await go('/');await shot('desktop-default');
 const events=await page.locator('.event-tile').evaluateAll(es=>es.map(e=>({href:e.getAttribute('href'),title:e.querySelector('h3').textContent.replace(/\s+/g,' ').trim(),count:e.querySelector('.event-count').textContent.trim()})));
 check('Homepage retains six events',events.length===6);
 check('Exact titles, years and counts',JSON.stringify(events.map(e=>[e.title,e.count]))===JSON.stringify([['ISFCR CryoVault Finals 2026','31 writeups'],['ISFCR CTF 2026','63 writeups'],['H7CTF 2026','21 writeups'],['XploitX CTF 2026','30 writeups'],['GenCyS CTF 2026','4 writeups'],['NNS CTF 2026','6 writeups']]));
 check('General Sans 500 titles',await page.locator('.event-tile h3').evaluateAll(es=>es.every(e=>getComputedStyle(e).fontFamily.includes('General Sans')&&getComputedStyle(e).fontWeight==='500')));
 check('Distinct homepage artwork',await page.locator('.event-artwork').evaluateAll(es=>new Set(es.map(e=>e.src)).size===6&&es.every(e=>e.complete&&e.naturalWidth>0)));
 await page.locator('.event-tile').nth(1).hover();await page.waitForTimeout(500);await shot('desktop-hover');await shot('card-hover','.event-tile:nth-child(2)');
 check('Pointer-reactive light',await page.locator('.event-tile').nth(1).evaluate(e=>e.style.getPropertyValue('--pointer-x')!==''));
 check('Hover lift limited to 3px',await page.locator('.event-tile').nth(1).evaluate(e=>Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42+3)<.1));
 await page.mouse.move(0,0);await page.locator('.event-tile').first().focus();await shot('keyboard-focus');
 check('Visible focus outline',await page.locator('.event-tile').first().evaluate(e=>getComputedStyle(e).outlineWidth==='2px'));
 for(const width of [1024,768,390,320]){await page.setViewportSize({width,height:900});await go('/');await shot(`home-${width}`);check(`No overflow or clipped title at ${width}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.event-tile h3')].every(e=>e.scrollWidth<=e.clientWidth+1)));}
 await page.setViewportSize({width:1440,height:1000});await go('/ctfs/');await shot('all-events');
 check('CTF index retains thirteen events',await page.locator('.event-tile').count()===13);
 const links=await page.locator('.event-tile').evaluateAll(es=>es.map(e=>e.href));
 for(const href of links){const r=await page.request.get(href);check(`Event route ${new URL(href).pathname}`,r.status()===200)}
 await page.setViewportSize({width:390,height:844});await go('/ctfs/');await shot('all-events-mobile');
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});await go('/');await page.locator('.event-tile').first().hover();await shot('reduced-motion');
 check('Reduced motion has no lift or art transform',await page.locator('.event-tile,.event-artwork').evaluateAll(es=>es.every(e=>getComputedStyle(e).transform==='none')));
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const phone=await touch.newPage();await phone.goto(base+'/');await phone.locator('.event-tile').first().scrollIntoViewIfNeeded();
 check('Touch pointer has no hover capability',await phone.evaluate(()=>matchMedia('(hover:none)').matches));
 await phone.locator('.event-tile').first().tap();await phone.waitForURL('**/writeups/cryovault/');check('Touch event link opens correct archive',phone.url().endsWith('/writeups/cryovault/'));await touch.close();
 check('No browser/resource errors',errors.length===0);
}finally{await fs.writeFile(`${out}/results.json`,JSON.stringify({base,checks,errors},null,2));await browser.close()}
console.log(JSON.stringify({passed:checks.length,errors}));
