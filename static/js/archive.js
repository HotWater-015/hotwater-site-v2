(() => {
  "use strict";
  const grid = document.querySelector('[data-archive-grid]');
  if (!grid) return;
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const controls = Object.fromEntries(['event','category','sort','q'].map(k => [k,document.querySelector(`[data-archive-${k}]`)]));
  const cards = [...grid.children].map(el => ({el,event:el.dataset.event,category:el.dataset.cat,title:el.dataset.title,date:Number(el.dataset.date),difficulty:norm(el.dataset.difficulty),hay:norm(el.textContent+' '+el.dataset.tags)}));
  const options = {};
  for (const key of ['event','category']) {
    const labels = new Map();
    cards.forEach(c => { const values=c.el.querySelector('.card-meta').children; labels.set(c[key],values[key==='event'?0:1].textContent); });
    options[key]=[...labels].sort((a,b)=>a[1].localeCompare(b[1]));
    for (const [value,label] of options[key]) controls[key].add(new Option(label,value));
  }
  let state;
  let lastSort = null;
  const read = () => {
    const p=new URLSearchParams(location.search);
    state={event:p.get('event')||'all',category:p.get('cat')||'all',q:p.get('q')||'',sort:p.get('sort')||'newest'};
    // Accept old category query values without changing existing shared links.
    const aliases={crypto:'cryptography',rev:'reverse-engineering',forensics:'digital-forensics',forensic:'digital-forensics',web:'web-exploitation',pwn:'binary-exploitation',misc:'miscellaneous'};
    state.category=aliases[norm(state.category)]||norm(state.category);
    for (const k of ['event','category','sort']) {
      const wanted=norm(state[k]).replace(/\s+/g,'-');
      const found=[...controls[k].options].find(o=>o.value===wanted||norm(o.textContent).replace(/\s+\(\d+\)$/,'').replace(/\s+/g,'-')===wanted);
      state[k]=found?found.value:(k==='sort'?'newest':'all');
    }
    for (const k in controls) controls[k].value=state[k];
  };
  const match=(c,ignore)=> (ignore==='event'||state.event==='all'||c.event===state.event) && (ignore==='category'||state.category==='all'||c.category===state.category) && (!state.q||c.hay.includes(norm(state.q)));
  const render=(sync=true)=> {
    const rank={beginner:0,easy:1,medium:2,hard:3,insane:4};
    const sorted=[...cards].sort((a,b)=>state.sort==='alpha'?a.title.localeCompare(b.title):state.sort==='difficulty'?(rank[a.difficulty]??99)-(rank[b.difficulty]??99)||a.title.localeCompare(b.title):state.sort==='oldest'?a.date-b.date:b.date-a.date);
    let count=0;
    // Filters only change visibility; move existing nodes only when sort actually changes.
    for (const c of sorted) { const hidden=!match(c);if(c.el.hidden!==hidden)c.el.hidden=hidden;if(!hidden)count++; }
    if(lastSort!==state.sort){const fragment=document.createDocumentFragment();for(const c of sorted)fragment.append(c.el);grid.append(fragment);lastSort=state.sort;}
    for(const k of ['event','category'])controls[k].closest('.archive-select').dataset.filterActive=String(state[k]!=='all');
    controls.q.closest('.archive-search').dataset.searchActive=String(Boolean(state.q));
    for (const k of ['event','category']) {
      const counts=new Map();cards.filter(c=>match(c,k)).forEach(c=>counts.set(c[k],(counts.get(c[k])||0)+1));
      controls[k].options[0].textContent=`All ${k==='event'?'CTFs':'categories'} (${[...counts.values()].reduce((a,b)=>a+b,0)})`;
      options[k].forEach(([v,label],i)=>{controls[k].options[i+1].textContent=`${label} (${counts.get(v)||0})`;});
    }
    document.querySelector('[data-archive-count]').textContent=`Showing ${count} of ${cards.length} writeups`;
    document.querySelector('[data-archive-empty]').hidden=count!==0;
    document.querySelector('[data-clear-search]').hidden=!state.q;
    document.dispatchEvent(new CustomEvent('archive:updated',{detail:{count}}));
    if(sync){const p=new URLSearchParams(location.search);for(const k of ['event','category','q','sort']){const name=k==='category'?'cat':k;p.delete(name);if(state[k]&&state[k]!== (k==='sort'?'newest':'all'))p.set(name,state[k]);}history.replaceState(null,'',location.pathname+(p.size?'?'+p:'')+location.hash);}
  };
  for(const k in controls)controls[k].addEventListener(k==='q'?'input':'change',()=>{state[k]=controls[k].value;render();});
  document.querySelectorAll('[data-archive-reset]').forEach(b=>b.addEventListener('click',()=>{state={event:'all',category:'all',q:'',sort:'newest'};for(const k in controls)controls[k].value=state[k];render();}));
  document.querySelector('[data-clear-search]').addEventListener('click',()=>{state.q='';controls.q.value='';render();controls.q.focus();});
  window.addEventListener('popstate',()=>{read();render(false);});
  read();render(false);
})();
