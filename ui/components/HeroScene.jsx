import { useEffect } from 'react';
/** Load Three only for a visible, motion-enabled desktop hero. SVG stays underneath. */
export function HeroScene({ enabled }) {
 useEffect(()=>{
  const host=document.getElementById('hero-scene');
  if(!host)return;
  host.dataset.scene='fallback';
  const media=matchMedia('(min-width: 761px) and (pointer: fine)');
  let cancelled=false,dispose,loading=false;
  const load=async()=>{
   if(cancelled||loading||!enabled||!media.matches||navigator.connection?.saveData)return;
   loading=true;
   try{const {mountScene}=await import('../hero-scene.js');if(!cancelled&&media.matches)dispose=mountScene(host)}catch{host.dataset.scene='fallback'}
  };
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load()},{rootMargin:'100px'});
  const change=()=>{if(media.matches)load();else{dispose?.();dispose=undefined;loading=false;host.dataset.scene='fallback'}};
  observer.observe(host);media.addEventListener('change',change);
  return()=>{cancelled=true;observer.disconnect();media.removeEventListener('change',change);dispose?.();host.dataset.scene='fallback'};
 },[enabled]);
 return null;
}
