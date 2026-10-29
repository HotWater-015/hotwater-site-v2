// Raster derivatives rendered from the one original SVG. Development tooling only.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/home/jarvis/.cache/ms-playwright/chromium-1247/chrome-linux64/chrome',args:['--no-sandbox']});
const svg=await readFile('static/images/brand/fractured-hw.svg','utf8');
const page=await browser.newPage({deviceScaleFactor:1});
for(const [name,size,pad] of [['favicon-32',32,1],['apple-touch-180',180,25],['icon-192',192,27],['icon-512',512,72]]){
 await page.setViewportSize({width:size,height:size});
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#050505;padding:${pad}px}svg{width:100%;height:100%}</style>${svg}`);
 await page.screenshot({path:`static/icons/fractured/${name}.png`});
}
const font=await readFile('static/css/fonts/GeneralSans-Medium.woff2');
const social=`<style>@font-face{font-family:General;src:url(data:font/woff2;base64,${font.toString('base64')})}*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#050505;color:#f5f5f5;display:flex;align-items:center;justify-content:center;gap:55px;border-bottom:5px solid #dc2626}svg{width:245px;height:245px}h1{font:500 110px/1 General;margin:0;letter-spacing:-6px}p{font:24px General;color:#a1a1aa;letter-spacing:1px;margin-top:24px}</style>${svg}<div><h1>hotwater.</h1><p>Capture the flag. Share the process.</p></div>`;
await page.setViewportSize({width:1200,height:630});await page.setContent(social);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'static/images/brand/hotwater-social.png'});
await browser.close();
console.log('Rendered favicon, touch/PWA icons and social image from the Fractured HW master.');
