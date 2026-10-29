import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { CyberBackground } from './components/CyberBackground.jsx';
import { HeroScene } from './components/HeroScene.jsx';
import { CustomCursor } from './components/CustomCursor.jsx';
import { useContentMotion } from './motion-effects.js';

const AboutExperience = lazy(() => import('./components/AboutExperience.jsx'));
const STORAGE_KEY = 'hotwater.motion';
function readPreference() {
  try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch { return true; }
}
export function MotionSystem({ variant }) {
  const [wanted, setWanted] = useState(readPreference);
  const initialReduced = useReducedMotion();
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches || initialReduced !== false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const enabled = wanted && !reduced;
  useContentMotion(enabled);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : enabled ? 'on' : 'off';
    return () => { delete document.documentElement.dataset.motion; };
  }, [enabled, reduced]);
  useEffect(() => {
    const sync = event => { if (event.key === STORAGE_KEY) setWanted(event.newValue !== 'off'); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, []);
  const toggle = () => {
    const next = !wanted; setWanted(next);
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* Session-only control still works. */ }
  };
  const slot = document.getElementById('motion-control-slot');
  return <>
      {variant !== 'global' && <CyberBackground variant={variant} enabled={enabled} />}
      <CustomCursor enabled={enabled} />
      {document.getElementById('about-v4') && <Suspense fallback={null}><AboutExperience enabled={enabled} /></Suspense>}
      {variant === 'hero' && <HeroScene enabled={enabled} />}
      {slot && createPortal(<button type="button" className="motion-toggle" onClick={toggle}
        aria-pressed={enabled} disabled={reduced}
        title={reduced ? 'Your system requests reduced motion' : enabled ? 'Pause decorative motion' : 'Enable decorative motion'}>
        <span className="motion-toggle-dot" aria-hidden="true" />
        {reduced ? 'Motion reduced' : enabled ? 'Motion on' : 'Motion off'}
      </button>, slot)}
  </>;
}
const host = document.querySelector('[data-cyber-background]') || document.getElementById('global-motion');
if (host) {
  const root = createRoot(host);
  root.render(<MotionSystem variant={host.dataset.cyberVariant || 'global'} />);
  window.addEventListener('pagehide', event => { if (!event.persisted) root.unmount(); });
}
