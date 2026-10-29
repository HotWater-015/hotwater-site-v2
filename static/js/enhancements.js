(() => {
  'use strict';
  const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('#primary-navigation');
  const setOpen=open=>{if(!toggle)return;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');toggle.querySelector('svg path')?.setAttribute('d',open?'M5 5l10 10M15 5 5 15':'M3 6h14M3 10h14M3 14h14')};
  document.addEventListener('click',e=>{if(!e.target.closest('.site-nav'))setOpen(false)});
  matchMedia('(max-width:760px)').addEventListener('change',()=>setOpen(false));
  toggle?.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&toggle?.getAttribute('aria-expanded')==='true'){setOpen(false);toggle.focus();}if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();location.href='/search/';}});
  nav?.addEventListener('click',e=>{if(e.target.closest('a'))setOpen(false);});
  document.querySelectorAll('[data-copy-code]').forEach(button=>button.addEventListener('click',async()=>{
    const block=button.closest('.mb-codeblock,.script-panel');
    const code=block.querySelector('pre code')||block.querySelector('pre');
    const original=button.textContent;
    try { await navigator.clipboard.writeText(code?.textContent||'');button.textContent='Copied!';button.dataset.copyStatus='success';document.dispatchEvent(new CustomEvent('code:copied',{detail:{button}})); }
    catch {button.textContent='Copy unavailable — select the source';}
    button.setAttribute('aria-live','polite');setTimeout(()=>{button.textContent=original;delete button.dataset.copyStatus;},2500);
  }));
  document.querySelector('[data-script-select]')?.addEventListener('change',e=>{document.querySelectorAll('.script-panel').forEach(p=>p.hidden=p.id!==e.target.value);document.dispatchEvent(new CustomEvent('solution:changed'));});
  const progress=document.querySelector('.reading-progress span'),article=document.querySelector('.article-main');
  if(progress&&article){let pending=false;const update=()=>{const start=article.getBoundingClientRect().top+scrollY;const length=article.offsetHeight-innerHeight;progress.style.width='100%';progress.style.transform=`scaleX(${Math.min(1,Math.max(0,(scrollY-start)/Math.max(1,length)))})`;pending=false;};window.addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(update);}},{passive:true});window.addEventListener('resize',update);update();}
  const links=[...document.querySelectorAll('.toc-nav a')];
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){links.forEach(a=>{const active=decodeURIComponent(a.hash.slice(1))===entry.target.id;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -65% 0px'});document.querySelectorAll('.markdown-body :is(h1,h2,h3,h4)[id]').forEach(h=>observer.observe(h));}
})();

// Native disclosure retains keyboard behavior; Escape returns focus to its trigger.
(() => {
 const disclosure=document.querySelector('.nav-disclosure');if(!disclosure)return;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&disclosure.open){disclosure.open=false;disclosure.querySelector('summary').focus()}});
 document.addEventListener('click',event=>{if(disclosure.open&&!disclosure.contains(event.target))disclosure.open=false});
})();

// Tabs expose only the existing Hugo-approved files; the native selector remains available.
(() => {
 const tabs=document.querySelector('.script-tabs'),select=document.querySelector('[data-script-select]');if(!tabs||!select)return;
 const buttons=[...tabs.querySelectorAll('[role="tab"]')];
 const sync=()=>buttons.forEach(button=>{const active=button.dataset.scriptTarget===select.value;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
 const choose=button=>{select.value=button.dataset.scriptTarget;select.dispatchEvent(new Event('change'));button.focus()};
 buttons.forEach(button=>{const panel=document.getElementById(button.dataset.scriptTarget);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;button.addEventListener('click',()=>choose(button))});
 tabs.addEventListener('keydown',event=>{let index=buttons.indexOf(document.activeElement);if(index<0)return;if(event.key==='ArrowRight')index=(index+1)%buttons.length;else if(event.key==='ArrowLeft')index=(index-1+buttons.length)%buttons.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=buttons.length-1;else return;event.preventDefault();choose(buttons[index])});
 select.addEventListener('change',sync);sync();tabs.hidden=false;
})();

// Keep the article title near the top on narrow screens; contents remain one tap away.
if (matchMedia('(max-width: 760px)').matches) {
 document.querySelector('.toc-wrapper')?.removeAttribute('open');
}

// Flag controls preserve article text and copy exactly the existing inline value.
(() => {
 document.querySelectorAll('.markdown-body p > strong').forEach(label=>{
  const code=label.nextElementSibling;
  if(!/^flag\s*:?$/i.test(label.textContent.trim())||code?.tagName!=='CODE')return;
  const display=document.createElement('span');display.className='flag-display';label.before(display);display.append(label,code);
  const button=document.createElement('button');button.type='button';button.className='flag-copy';button.textContent='Copy flag';button.setAttribute('aria-live','polite');button.setAttribute('aria-label','Copy challenge flag');
  button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.textContent);button.textContent='Copied ✓'}catch{button.textContent='Select flag to copy'}setTimeout(()=>button.textContent='Copy flag',2200)});display.append(button);
 });
 document.querySelectorAll('.markdown-body blockquote').forEach(block=>{const text=block.textContent.trim();const kind=/^(?:\[!WARNING\]|Warning:|Caution:)/i.test(text)?'Warning':/^(?:\[!NOTE\]|Note:|Tip:)/i.test(text)?'Note':null;if(kind){block.classList.add('technical-callout');block.dataset.callout=kind}});
 document.querySelector('.script-tabs:not([hidden])')?.closest('.solution-scripts').setAttribute('data-tabs-ready','true');
})();
