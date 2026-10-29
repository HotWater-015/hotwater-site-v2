import { useEffect, useRef } from 'react';
import { animate } from 'motion/mini';

/** Enhance Hugo-owned DOM without cloning, remounting, or taking ownership of content. */
export function useContentMotion(enabled) {
  const seen = useRef(new WeakSet());
  const heroSeen = useRef(false);
  useEffect(() => {
    if (!enabled || !Element.prototype.animate) return;
    const running = new Map();
    const play = (element, frames, options = {}) => {
      if (!element) return;
      // Replacement can target an element just hidden by a filter. Cancel without
      // committing computed styles: Firefox rejects commitStyles on hidden nodes.
      running.get(element)?.cancel();
      const control = animate(element, frames, { duration: .2, ease: 'easeOut', ...options });
      running.set(element, control);
      Promise.resolve(control).then(() => {
        if (running.get(element) === control) running.delete(element);
      }, () => running.delete(element));
    };
    const hero = document.querySelector('.archive-hero');
    if (hero && !heroSeen.current) {
      heroSeen.current = true;
      hero.querySelectorAll('.hero-copy > .eyebrow, .hero-heading-line, .hero-description, .hero-actions').forEach((el, i) => {
        play(el, { opacity: [.15, 1], transform: ['translateY(24px)', 'translateY(0)'] }, { duration: .85, delay: i * .075 });
      });
    }
    const cardObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting || target.hidden) continue;
        cardObserver.unobserve(target);
        if (seen.current.has(target)) continue;
        seen.current.add(target);
        // Only opacity for cards: CSS exclusively owns their small hover transform.
        play(target, { opacity: [.35, 1] }, { duration: .65 });
      }
    }, { threshold: .06 }) : null;
    document.querySelectorAll('.writeup-card,.event-tile,[data-reveal]').forEach(el => cardObserver?.observe(el));
    // A shallow scroll depth for the home identity; no work while it is off screen.
    const identity = document.querySelector('.about-symbol');
    const emblem = identity?.querySelector('.emblem-display');
    const orbit = identity?.querySelector('.emblem-orbit');
    let identityVisible = false, identityFrame = 0;
    const depth = () => {
      identityFrame = 0;
      if (!identityVisible || !emblem || innerWidth <= 760) return;
      const box = identity.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, (innerHeight / 2 - box.top - box.height / 2) / innerHeight));
      emblem.style.translate = `0 ${progress * -18}px`;
      if (orbit) orbit.style.translate = `0 ${progress * 12}px`;
    };
    const requestDepth = () => { if (identityVisible && !identityFrame) identityFrame = requestAnimationFrame(depth); };
    const identityObserver = identity && 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => { identityVisible = entry.isIntersecting; requestDepth(); }) : null;
    if (identity) identityObserver?.observe(identity);
    window.addEventListener('scroll', requestDepth, { passive: true });
    window.addEventListener('resize', requestDepth, { passive: true });
    const filter = () => {
      play(document.querySelector('[data-archive-grid]'), { opacity: [.92, 1] }, { duration: .14 });
      const empty = document.querySelector('[data-archive-empty]');
      if (empty && !empty.hidden) play(empty, { opacity: [.8, 1], transform: ['translateY(4px)', 'translateY(0)'] });
    };
    const script = () => play(document.querySelector('.script-panel:not([hidden])'), { opacity: [.82, 1] }, { duration: .16 });
    const copy = event => play(event.detail.button, { transform: ['scale(1)', 'scale(1.025)', 'scale(1)'] }, { duration: .22 });
    const main = document.querySelector('.script-panel.main-solver:not([hidden])');
    const solverObserver = main && 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { play(main, { opacity: [.86, 1] }); solverObserver.disconnect(); }
    }) : null;
    if (main) solverObserver?.observe(main);
    document.addEventListener('archive:updated', filter);
    document.addEventListener('solution:changed', script);
    document.addEventListener('code:copied', copy);
    return () => {
      cardObserver?.disconnect(); solverObserver?.disconnect(); identityObserver?.disconnect();
      window.removeEventListener('scroll', requestDepth); window.removeEventListener('resize', requestDepth);
      cancelAnimationFrame(identityFrame);
      if (emblem) emblem.style.translate = ''; if (orbit) orbit.style.translate = '';
      document.removeEventListener('archive:updated', filter);
      document.removeEventListener('solution:changed', script);
      document.removeEventListener('code:copied', copy);
      running.forEach(control => control.complete()); running.clear();
    };
  }, [enabled]);
}
