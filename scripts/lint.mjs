// Syntax checks for owned application code only; never execute challenge sources.
import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { transform } from 'esbuild';
let count=0;
async function scan(dir){for(const e of await readdir(dir,{withFileTypes:true})){const path=`${dir}/${e.name}`;if(e.isDirectory()){if(e.name!=='fixtures')await scan(path)}else if(/\.(jsx|mjs|js)$/.test(e.name)){if(e.name.endsWith('.jsx'))await transform(await readFile(path,'utf8'),{loader:'jsx',jsx:'automatic'});else {const r=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}count++}}}
for(const dir of ['ui','scripts','tests'])await scan(dir);
for(const name of ['archive.js','discovery.js','enhancements.js','motion-loader.js']){const r=spawnSync(process.execPath,['--check',`static/js/${name}`],{stdio:'inherit'});if(r.status!==0)process.exit(1);count++}
for (const css of ['static/css/cinematic.css','static/css/about-v4.css','static/css/premium-ui.css','static/css/ctf-events.css','static/css/mobile-refinement.css']) await transform(await readFile(css,'utf8'),{loader:'css',minify:true});
console.log(`Syntax checks passed: ${count} JavaScript/JSX files and cinematic/About CSS.`);
