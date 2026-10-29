import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const base=process.env.SITE_V2_URL||'http://localhost:1314';
const out=process.env.UI_QA_OUT||'reports/ui-polish/iteration-1';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/home/jarvis/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome',args:['--no-sandbox']});
const errors=[],results=[];const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&new URL(r.url()).origin===new URL(base).origin)errors.push(`${r.status()} ${r.url()}`)});
const check=(name,ok)=>{results.push({name,passed:!!ok});if(!ok)throw Error(name)};
async function go(path){await page.goto(base+path);await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.documentElement.dataset.motion);await page.waitForTimeout(1600)}
async function shot(name,selector){const el=selector?page.locator(selector).first():page; if(selector){await el.scrollIntoViewIfNeeded();await page.waitForTimeout(700)}await el.screenshot({path:`${out}/${name}.png`})}
try{
 await go('/');await shot('home');await shot('navbar','.site-header');
 check('General Sans loads for navbar',await page.locator('.brand').first().evaluate(e=>getComputedStyle(e).fontFamily.includes('General Sans')&&document.fonts.check('500 24px "General Sans"')));
 await page.getByRole('link',{name:'Writeups',exact:true}).first().hover();await shot('navbar-hover','.site-header');
 await shot('home-about','.about-archive');await shot('footer','.archive-footer');
 check('Footer rows occupy full width',await page.locator('.archive-footer').evaluate(e=>getComputedStyle(e).display==='block'&&e.scrollWidth<=e.clientWidth+1));
 await go('/writeups/');await shot('archive');await shot('card-default','.writeup-card');await page.locator('.writeup-card').first().hover();await page.waitForTimeout(400);await shot('card-hover','.writeup-card');
 check('Title turns crimson',await page.locator('.writeup-card h3').first().evaluate(e=>getComputedStyle(e).color==='rgb(255, 88, 103)'));
 await page.mouse.move(0,0);await page.locator('.card-home-body').first().focus();await shot('card-focus','.writeup-card');
 await go('/categories/');await shot('categories');await shot('category-grid','.category-tiles');const art=await page.locator('.category-tiles .ctf-visual').evaluateAll(es=>es.map(e=>e.getAttribute('class')));check('17 unique category illustrations',art.length===17&&new Set(art).size===17);
 await page.locator('.category-tiles>a').filter({hasText:'Digital Forensics'}).hover();await shot('category-hover','.category-tiles>a:has-text("Digital Forensics")');
 for(const width of [768,390,320]){await page.setViewportSize({width,height:900});for(const route of ['/','/writeups/','/categories/','/about/']){await go(route);check(`No overflow ${width} ${route}`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await shot(`${width}-${route.replaceAll('/','')||'home'}`)}if(width===390){await go('/');await page.locator('.menu-toggle').click();await shot('mobile-navigation','.site-header');await page.locator('.menu-toggle').click();await shot('mobile-about','.about-archive');await shot('mobile-footer','.archive-footer')}}
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1440,height:1000});await go('/categories/');await page.locator('.category-tiles>a').first().hover();check('Reduced motion disables artwork transforms',await page.locator('.ctf-visual g').evaluateAll(es=>es.every(e=>getComputedStyle(e).transform==='none')));await shot('reduced-categories');
 check('No browser or local resource errors',errors.length===0);
}finally{await fs.writeFile(`${out}/results.json`,JSON.stringify({base,results,errors},null,2));await browser.close()}
console.log(JSON.stringify({checks:results.length,errors},null,2));
