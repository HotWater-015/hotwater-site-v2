import { useEffect, useRef } from 'react';
import { animate } from 'motion';
const clamp = n => Math.max(0, Math.min(1, n));
export default function AboutExperience({ enabled }) {
  const counted = useRef(false);
  const teamSeen = useRef(false);
  useEffect(() => {
    const root = document.getElementById('about-v4');
    if (!root) return;
    const hero = root.querySelector('.av-sequence');
    const bio = root.querySelector('.av-manifesto');
    const words = [...bio.querySelectorAll('span')];
    const sequence = root.querySelector('.av-awards-sequence');
    const awards = [...root.querySelectorAll('.av-award')];
    const links = [...root.querySelectorAll('[data-award-go]')];
    const footer = root.querySelector('.av-closing-v5');
    const podium = root.querySelector('.av-podium');
    const desktop = matchMedia('(min-width: 901px) and (min-height: 740px)');
    const animations = [];
    let frame = 0, disposed = false, disposeScene, sceneProgress = 0, metrics;
    root.dataset.enhanced = String(enabled);
    const measure = () => {
      metrics = { heroTop: hero.getBoundingClientRect().top + scrollY - 76, heroLength: Math.max(1, hero.offsetHeight - innerHeight + 76), bioTop: bio.getBoundingClientRect().top + scrollY, bioHeight: bio.offsetHeight, awardsTop: sequence.getBoundingClientRect().top + scrollY - 76, awardsLength: Math.max(1, sequence.offsetHeight - innerHeight + 76), podiumTop: podium.getBoundingClientRect().top + scrollY, footerTop: footer.getBoundingClientRect().top + scrollY, events: awards.map(a => a.getBoundingClientRect().top + scrollY) };
      schedule();
    };
    const update = () => {
      frame = 0;
      if (!metrics) return;
      const cinematic = enabled && desktop.matches;
      sceneProgress = cinematic ? clamp((scrollY - metrics.heroTop) / metrics.heroLength) : 0;
      root.style.setProperty('--hero-progress', sceneProgress.toFixed(4));
      const progress = clamp((scrollY + innerHeight * .85 - metrics.bioTop) / (metrics.bioHeight + innerHeight * .38));
      words.forEach((word, i) => {
        const revealed = !enabled || progress >= i / words.length;
        word.style.color = revealed ? (word.dataset.accent === 'true' ? '#ef4444' : '#f5f5f5') : '#71717a';
      });
      const rawStory = cinematic ? clamp((scrollY - metrics.awardsTop) / metrics.awardsLength) * (awards.length - 1) : 0;
      const fraction = rawStory - Math.floor(rawStory);
      const transition = clamp((fraction - .25) * 2);
      const story = Math.floor(rawStory) + transition * transition * (3 - 2 * transition);
      const active = cinematic ? Math.round(story) : Math.max(0, metrics.events.findLastIndex(top => top < scrollY + innerHeight * .55));
      root.style.setProperty('--podium-light', enabled ? clamp((scrollY + innerHeight - metrics.podiumTop) / (innerHeight * .6)) : 1);
      root.style.setProperty('--close-progress', enabled ? clamp((scrollY + innerHeight - metrics.footerTop) / (innerHeight * .5)) : 1);
      awards.forEach((award, i) => {
        const delta = i - story;
        award.style.opacity = cinematic ? String(clamp(1 - Math.abs(delta) * .3)) : '';
        award.style.transform = cinematic ? `translate3d(${delta * 106}%,0,0)` : '';
        const figure = award.querySelector('.av-event-figure');
        const title = award.querySelector('.av-event-title');
        if (figure) figure.style.transform = cinematic ? `translate3d(${delta * (i % 2 ? -110 : 110)}px,${Math.abs(delta) * 20}px,0) scale(${1 - Math.min(Math.abs(delta), 1) * .1}) rotateY(${delta * 5}deg)` : '';
        if (title) title.style.transform = cinematic ? `translateY(${delta * -70}px)` : '';
        if (Math.abs(i - active) <= 1) award.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
        award.inert = cinematic && i !== active;
        if (cinematic && i !== active) award.setAttribute('aria-hidden', 'true'); else award.removeAttribute('aria-hidden');
      });
      links.forEach((link, i) => link.setAttribute('aria-current', String(active === i)));
      sequence.dataset.active = String(active);
    };
    function schedule() { if (!frame) frame = requestAnimationFrame(update); }
    function navigate(event) {
      if (!enabled || !desktop.matches) return;
      event.preventDefault();
      const index = Number(event.currentTarget.dataset.awardGo);
      scrollTo({ top: metrics.awardsTop + metrics.awardsLength * index / Math.max(1, awards.length - 1), behavior: 'smooth' });
    }
    links.forEach(link => link.addEventListener('click', navigate));
    const resize = new ResizeObserver(measure); resize.observe(root); resize.observe(bio);
    addEventListener('scroll', schedule, { passive: true }); addEventListener('resize', measure); desktop.addEventListener('change', measure);
    measure();
    if (enabled) {
      const title = root.querySelectorAll('.av-hero-copy h1 span');
      title.forEach((line, i) => animations.push(animate(line, { opacity: [0, 1], transform: ['translateY(55px)', 'translateY(0)'] }, { duration: .85, delay: i * .12, ease: [.22, 1, .36, 1] })));
      animations.push(animate(root.querySelector('.av-grid'), { opacity: [0, 1] }, { duration: 1 }));
      animations.push(animate(root.querySelector('.av-hero-note'), { filter: ['blur(5px)', 'blur(0px)'] }, { duration: 1 }));
    }
    const teamGroup = root.querySelector('.av-team-group');
    const teamObserver = teamGroup && enabled ? new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || teamSeen.current) return;
      teamSeen.current = true;
      animations.push(animate(teamGroup, { opacity: [.35, 1], transform: ['translateY(16px)', 'translateY(0)'] }, { duration: .65, ease: [.22, 1, .36, 1] }));
      teamObserver.disconnect();
    }, { threshold: .5 }) : null;
    if (teamGroup) teamObserver?.observe(teamGroup);
    let podiumBounds;
    const proximity = event => {
      if (!enabled || event.pointerType === 'touch') return;
      podiumBounds ||= podium.getBoundingClientRect();
      podium.style.setProperty('--light-x', `${clamp((event.clientX - podiumBounds.left) / podiumBounds.width) * 100}%`);
      podium.style.setProperty('--light-y', `${clamp((event.clientY - podiumBounds.top) / podiumBounds.height) * 100}%`);
    };
    const resetBounds = () => { podiumBounds = null; };
    podium.addEventListener('pointermove', proximity, { passive: true });
    podium.addEventListener('pointerenter', resetBounds);
    addEventListener('scroll', resetBounds, { passive: true });
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || counted.current || !enabled) return;
      counted.current = true;
      root.querySelectorAll('[data-count]').forEach(el => {
        const value = Number(el.dataset.count);
        animations.push(animate(0, value, { duration: 1.15, ease: 'easeOut', onUpdate: n => { el.textContent = String(Math.round(n)).padStart(2, '0'); } }));
      });
      root.querySelectorAll('.av-plinth').forEach((el, i) => animations.push(animate(el, { transform: ['scaleY(.5)', 'scaleY(1)'], opacity: [.35, 1] }, { duration: .95, delay: i * .08, ease: [.22, 1, .36, 1] })));
      io.disconnect();
    }, { threshold: .3 }); io.observe(podium);
    if (enabled) {
      const host = document.getElementById('about-artifact');
      import('../about-scene.js').then(({ mountAboutScene }) => {
        if (!disposed) disposeScene = mountAboutScene(host, () => sceneProgress);
      }).catch(() => { host.dataset.scene = 'fallback'; });
    }
    return () => {
      disposed = true; disposeScene?.();
      teamObserver?.disconnect();
      podium.removeEventListener('pointermove', proximity); podium.removeEventListener('pointerenter', resetBounds); removeEventListener('scroll', resetBounds); io.disconnect(); resize.disconnect(); cancelAnimationFrame(frame);
      animations.forEach(a => a.cancel());
      root.querySelectorAll('.av-hero-copy h1 span,.av-grid,.av-plinth').forEach(el => { el.style.opacity = ''; el.style.transform = ''; });
      root.querySelector('.av-hero-note').style.filter = '';
      if (teamGroup) { teamGroup.style.opacity = ''; teamGroup.style.transform = ''; }
      removeEventListener('scroll', schedule); removeEventListener('resize', measure); desktop.removeEventListener('change', measure);
      links.forEach(link => link.removeEventListener('click', navigate));
      root.dataset.enhanced = 'false'; root.style.removeProperty('--hero-progress');
      words.forEach(w => w.style.removeProperty('color'));
      awards.forEach(a => { a.style.opacity = ''; a.style.transform = ''; a.inert = false; a.removeAttribute('aria-hidden'); a.querySelectorAll('.av-event-figure,.av-event-title').forEach(el => { el.style.transform = ''; }); });
      root.querySelectorAll('[data-count]').forEach(e => { e.textContent = e.dataset.count.padStart(2, '0'); });
    };
  }, [enabled]);
  return null;
}
