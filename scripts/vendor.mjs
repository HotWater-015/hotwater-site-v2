// Pin and self-host the existing math renderer so reading does not depend on CDN availability.
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
const root='node_modules/katex';
const license=await readFile(`${root}/LICENSE`,'utf8');
await mkdir('static/js/katex',{recursive:true});await mkdir('static/css/katex',{recursive:true});
for(const [source,target] of [['dist/katex.min.js','static/js/katex/katex.min.js'],['dist/contrib/auto-render.min.js','static/js/katex/auto-render.min.js'],['dist/katex.min.css','static/css/katex/katex.min.css']]){
 const content=`/*! KaTeX license\n${license}\n*/\n${await readFile(`${root}/${source}`,'utf8')}`;
 if(await readFile(target,'utf8').catch(()=>null)!==content)await writeFile(target,content);
}
await mkdir('static/css/katex/fonts',{recursive:true});
for(const name of await readdir(`${root}/dist/fonts`)) {
 const data=await readFile(`${root}/dist/fonts/${name}`),target=`static/css/katex/fonts/${name}`;
 const current=await readFile(target).catch(()=>null);
 if(!current?.equals(data))await writeFile(target,data);
}
console.log('Prepared local KaTeX assets (0.16.22).');
