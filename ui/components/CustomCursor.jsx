import { useEffect, useState } from 'react';
/** Native cursor remains usable; the ring is a supplementary, pointer-transparent affordance. */
export function CustomCursor({ enabled }) {
 const [fine,setFine]=useState(false);
 useEffect(()=>{const media=matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)');const sync=()=>setFine(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync)},[]);
 useEffect(()=>{
  const media=matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)');
  if(!enabled||!fine)return;
  const ring=document.createElement('div'),dot=document.createElement('div');ring.className='custom-cursor';dot.className='cursor-dot';ring.setAttribute('aria-hidden','true');dot.setAttribute('aria-hidden','true');document.body.append(ring,dot);
  let x=0,y=0,tx=0,ty=0,frame=0,active=false,card=null,magnet=null,rect=null;
  const reset=()=>{if(card){card.style.removeProperty('--tilt-x');card.style.removeProperty('--tilt-y');card=null}if(magnet){magnet.style.removeProperty('transform');magnet=null}};
  const hide=()=>{active=false;ring.dataset.visible=dot.dataset.visible='false';cancelAnimationFrame(frame);frame=0;reset()};
  function draw(){x+=(tx-x)*.22;y+=(ty-y)*.22;ring.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;dot.style.transform=`translate3d(${tx}px,${ty}px,0) translate(-50%,-50%)`;if(active&&Math.hypot(tx-x,ty-y)>.1)frame=requestAnimationFrame(draw);else frame=0}
  function move(e){
   if(e.pointerType==='touch'||!media.matches||e.target.closest('input,textarea,select,pre,.script-source,.markdown-body,[contenteditable="true"]')){hide();return}
   tx=e.clientX;ty=e.clientY;if(!active){x=tx;y=ty;active=true}ring.dataset.visible=dot.dataset.visible='true';
   const target=e.target.closest('[data-cursor],a,button,summary');ring.textContent=target?.dataset.cursor||'';ring.dataset.active=String(Boolean(target));
   const nextCard=e.target.closest('.writeup-card,.event-tile');const nextMagnet=e.target.closest('[data-magnetic]');
   if(nextCard!==card||nextMagnet!==magnet){reset();card=nextCard;magnet=nextMagnet;rect=(card||magnet)?.getBoundingClientRect()}
   if(card&&rect){const px=tx-rect.left,py=ty-rect.top;card.style.setProperty('--pointer-x',`${px}px`);card.style.setProperty('--pointer-y',`${py}px`);card.style.setProperty('--tilt-x',`${-(py/rect.height-.5)*2}deg`);card.style.setProperty('--tilt-y',`${(px/rect.width-.5)*2}deg`)}
   if(magnet&&rect)magnet.style.transform=`translate(${(tx-rect.left-rect.width/2)*.08}px,${(ty-rect.top-rect.height/2)*.1}px)`;
   if(!frame)frame=requestAnimationFrame(draw);
  }
  document.addEventListener('pointermove',move,{passive:true});document.addEventListener('pointerleave',hide);window.addEventListener('scroll',hide,{passive:true});window.addEventListener('blur',hide);media.addEventListener('change',hide);
  return()=>{hide();document.removeEventListener('pointermove',move);document.removeEventListener('pointerleave',hide);window.removeEventListener('scroll',hide);window.removeEventListener('blur',hide);media.removeEventListener('change',hide);ring.remove();dot.remove()};
 },[enabled,fine]);
 return null;
}
