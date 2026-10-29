/* Accessible, custom dark discovery controls; existing Hugo cards and filtering remain authoritative. */
(() => {
 const selects=[...document.querySelectorAll('.archive-select select')];if(!selects.length)return;
 const normalize=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const choose=(select,value)=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))};
 let openMenu=null;
 const menus=selects.map((select,index)=>{
  const label=select.getAttribute('aria-label');
  const trigger=document.createElement('button');trigger.type='button';trigger.className='filter-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',label);trigger.innerHTML='<span></span><span class="filter-chevron" aria-hidden="true">⌄</span>';
  const popup=document.createElement('div');popup.className='filter-popup';popup.hidden=true;popup.id=`filter-popup-${index}`;popup.setAttribute('role','dialog');popup.setAttribute('aria-label',`Choose ${label}`);trigger.setAttribute('aria-controls',popup.id);
  const heading=document.createElement('div');heading.className='filter-popup-heading';heading.textContent=`SELECT ${label.toUpperCase()}`;
  const search=document.createElement('input');search.type='search';search.className='filter-menu-search';search.placeholder=index===0?'Find a CTF event…':index===1?'Find a discipline…':'Find a sort order…';search.setAttribute('aria-label',search.placeholder);search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-expanded','false');
  const list=document.createElement('div');list.className='filter-options';list.id=`filter-options-${index}`;list.setAttribute('role','listbox');list.setAttribute('aria-label',label);search.setAttribute('aria-controls',list.id);
  const empty=document.createElement('p');empty.className='filter-menu-empty';empty.textContent='No matching options. Try another term.';empty.setAttribute('role','status');
  const hint=document.createElement('div');hint.className='filter-menu-hint';hint.textContent='Arrow keys Navigate · Enter Select · Esc Close';
  popup.append(heading,search,list,empty,hint);document.body.append(popup);select.after(trigger);select.hidden=true;select.tabIndex=-1;
  let options=[],active=0;
  const setActive=i=>{active=Math.max(0,Math.min(i,options.length-1));options.forEach((option,n)=>option.classList.toggle('is-active',n===active));if(options[active]){search.setAttribute('aria-activedescendant',options[active].id);options[active].scrollIntoView({block:'nearest'})}else search.removeAttribute('aria-activedescendant')};
  const close=(focus=false)=>{popup.hidden=true;trigger.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');if(openMenu===api)openMenu=null;if(focus)trigger.focus()};
  const render=()=>{
   trigger.firstElementChild.textContent=select.selectedOptions[0]?.textContent||label;
   trigger.setAttribute('aria-label',`${label}: ${trigger.firstElementChild.textContent}`);
   list.replaceChildren();options=[];
   [...select.options].filter(o=>normalize(o.textContent).includes(normalize(search.value))).forEach((o,n)=>{
    const item=document.createElement('div');item.className='filter-option';item.id=`filter-${index}-option-${n}`;item.setAttribute('role','option');item.setAttribute('aria-selected',String(o.selected));item.dataset.value=o.value;
    const count=o.textContent.match(/\s+\((\d+)\)$/);const text=document.createElement('span');text.textContent=o.textContent.replace(/\s+\(\d+\)$/,'');
    const badge=document.createElement('span');badge.className='filter-option-count';badge.textContent=count?.[1]|| (o.selected?'✓':'');item.append(text,badge);
    item.addEventListener('pointerdown',e=>e.preventDefault());item.addEventListener('click',()=>{choose(select,o.value);close(true)});list.append(item);options.push(item);
   });empty.hidden=options.length>0;
   active=Math.max(0,options.findIndex(o=>o.dataset.value===select.value));
   if(!popup.hidden)setActive(active);
  };
  const position=()=>{
   const r=trigger.getBoundingClientRect(),gap=8,margin=16,viewport=window.visualViewport;
   const viewTop=viewport?.offsetTop||0,viewHeight=Math.min(innerHeight,viewport?.height||innerHeight),viewBottom=viewTop+viewHeight;
   const mobile=innerWidth<=760,width=mobile?innerWidth-40:Math.min(Math.max(r.width,320),innerWidth-margin*2);
   const below=viewBottom-r.bottom-gap-margin,above=r.top-gap-Math.max(90,viewTop+margin),upwards=below<280&&above>below;
   const mobileTop=viewTop+(viewHeight<400?16:90),available=mobile?viewBottom-mobileTop-margin:Math.max(180,upwards?above:below);
   popup.style.width=`${width}px`;popup.style.left=`${mobile?20:Math.max(margin,Math.min(r.left,innerWidth-width-margin))}px`;popup.style.maxHeight=`${available}px`;
   list.style.maxHeight=`${Math.max(60,Math.min(320,available-(mobile?120:150)))}px`;
   popup.style.top=mobile?`${mobileTop}px`:upwards?'auto':`${r.bottom+gap}px`;popup.style.bottom=!mobile&&upwards?`${innerHeight-r.top+gap}px`:'auto';
  };
  const open=()=>{
   openMenu?.close();search.value='';render();popup.hidden=false;openMenu=api;trigger.setAttribute('aria-expanded','true');search.setAttribute('aria-expanded','true');
   position();
   search.focus({preventScroll:true});setActive(active);
  };
  const api={close,render,popup,trigger,position};
  trigger.addEventListener('click',()=>popup.hidden?open():close(true));trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open()}});
  search.addEventListener('input',()=>{render();setActive(0)});
  search.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setActive(active+(e.key==='ArrowDown'?1:-1))}else if(e.key==='Enter'){e.preventDefault();options[active]?.click()}else if(e.key==='Escape'){e.preventDefault();close(true)}else if(e.key==='Tab'){close();trigger.focus()}});
  render();return api;
 });
 document.addEventListener('pointerdown',e=>{if(openMenu&&!openMenu.popup.contains(e.target)&&!openMenu.trigger.contains(e.target))openMenu.close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')openMenu?.close(true)});
 window.addEventListener('resize',()=>openMenu?.position());window.visualViewport?.addEventListener('resize',()=>openMenu?.position());window.addEventListener('scroll',()=>{if(innerWidth>760)openMenu?.close()},{passive:true});
 const strip=document.querySelector('[data-discipline-strip]'),selection=document.querySelector('[data-filter-selection]'),category=selects[1],event=selects[0],sort=selects[2],query=document.querySelector('[data-archive-q]');
 const sync=()=>{
  menus.forEach(menu=>menu.render());selection.replaceChildren();
  const tokens=[...selects.filter(s=>s.value!==(s===sort?'newest':'all')).map(s=>({text:s.selectedOptions[0].textContent.replace(/\s+\(\d+\)$/,''),clear:()=>choose(s,s===sort?'newest':'all')})),...(query.value?[{text:`Search: ${query.value}`,clear:()=>{query.value='';query.dispatchEvent(new Event('input'))}}]:[])];
  tokens.forEach(token=>{const button=document.createElement('button');button.type='button';button.className='selected-filter';button.textContent=token.text+' ×';button.setAttribute('aria-label',`Remove ${token.text} filter`);button.addEventListener('click',()=>{token.clear();query.focus()});selection.append(button)});selection.hidden=!tokens.length;
  [...strip.children].forEach(button=>{const option=[...category.options].find(o=>o.value===button.dataset.category);button.setAttribute('aria-pressed',String(category.value===button.dataset.category));button.querySelector('span').textContent=option?.textContent.match(/\((\d+)\)$/)?.[1]||'0'});
 };
 for(const option of category.options){if(option.value==='all'||['cryptography','binary-exploitation','web-exploitation','digital-forensics','reverse-engineering'].includes(option.value)){const b=document.createElement('button');b.type='button';b.dataset.category=option.value;const name=document.createElement('strong');name.textContent=option.value==='all'?'All disciplines':option.textContent.replace(/\s+\(\d+\)$/,'');b.append(name,document.createElement('span'));b.addEventListener('click',()=>choose(category,option.value));strip.append(b)}}
 document.addEventListener('archive:updated',sync);sync();
})();
