import { useEffect, useRef } from 'react';
import { MotionAccent } from './MotionAccent.jsx';

/** A decorative, region-scoped canvas. Content never belongs to this React root. */
export function CyberBackground({ variant = 'archive', enabled = false }) {
  const canvasRef = useRef(null);
  const simulation = useRef({ particles: [], frame: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled || variant === 'article') return;
    let context;
    try { context = canvas.getContext('2d', { alpha: true }); } catch { return; }
    if (!context) return;
    const host = canvas.parentElement;
    const region = host.closest('[data-cyber-region]') || host.parentElement;
    const state = simulation.current;
    let width = 0, height = 0, visible = true, disposed = false, previous = 0, lastPaint = 0;
    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    const cursor = { x: 0, y: 0, targetX: 0, targetY: 0, active: false, opacity: 0 };
    let mobile = true, pointerBounds = null;

    function resize() {
      const bounds = host.getBoundingClientRect(); pointerBounds = bounds;
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      mobile = width < 760 || !finePointer.matches;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cap = variant === 'hero' ? (mobile ? 18 : 56) : (mobile ? 9 : 26);
      const density = variant === 'hero' ? 15000 : 23000;
      const count = Math.max(5, Math.min(cap, Math.round(width * height / density)));
      const limited = navigator.connection?.saveData ? Math.ceil(count / 2) : count;
      state.particles = Array.from({ length: limited }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - .5) * .13, vy: (Math.random() - .5) * .11,
        depth: .3 + Math.random() * .7,
      }));
      host.dataset.particleCount = String(limited);
      host.dataset.cursorEnabled = String(!mobile && variant === 'hero');
      cursor.active = false;
    }
    function stop() {
      cancelAnimationFrame(state.frame); state.frame = 0;
      previous = 0; lastPaint = 0; host.dataset.animating = 'false';
    }
    function start() {
      if (disposed || document.hidden || !visible || state.frame) return;
      host.dataset.animating = 'true'; state.frame = requestAnimationFrame(draw);
    }
    function draw(now) {
      if (disposed || document.hidden || !visible) { stop(); return; }
      // Cap paint rate on small devices. Mutable positions stay in a ref, not React state.
      const interval = mobile ? 1000 / 24 : 1000 / 60;
      if (now - lastPaint >= interval - .5) {
        const dt = previous ? Math.min(2.5, (now - previous) / 16.667) : 1;
        previous = now; lastPaint = now;
        context.clearRect(0, 0, width, height);
        cursor.x += (cursor.targetX - cursor.x) * .07 * dt;
        cursor.y += (cursor.targetY - cursor.y) * .07 * dt;
        cursor.opacity += ((cursor.active ? 1 : 0) - cursor.opacity) * .055 * dt;
        if (!mobile && cursor.opacity > .01 && variant === 'hero') {
          const glow = context.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 180);
          glow.addColorStop(0, `rgba(220,38,38,${.045 * cursor.opacity})`);
          glow.addColorStop(1, 'rgba(220,38,38,0)');
          context.fillStyle = glow; context.fillRect(0, 0, width, height);
        }
        const particles = state.particles;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx * dt * p.depth; p.y += p.vy * dt * p.depth;
          if (!mobile && cursor.active && variant === 'hero') {
            const dx = p.x - cursor.x, dy = p.y - cursor.y, distance = Math.hypot(dx, dy);
            if (distance > 1 && distance < 115) {
              const force = (1 - distance / 115) * .035 * dt;
              p.x += dx / distance * force; p.y += dy / distance * force;
            }
          }
          if (p.x < -4) p.x = width + 4; else if (p.x > width + 4) p.x = -4;
          if (p.y < -4) p.y = height + 4; else if (p.y > height + 4) p.y = -4;
          context.beginPath(); context.arc(p.x, p.y, .65 + p.depth * .7, 0, Math.PI * 2);
          context.fillStyle = `rgba(239,68,68,${(.13 + p.depth * .26) * (variant === 'hero' ? 1 : .6)})`;
          context.fill();
          let connections = 0;
          for (let j = i + 1; j < particles.length && connections < 2; j++) {
            const q = particles[j], distance = Math.hypot(p.x - q.x, p.y - q.y);
            const range = mobile ? 80 : 135;
            if (distance >= range) continue;
            const nearCursor = cursor.active && !mobile ? Math.max(0, 1 - Math.hypot(p.x - cursor.x, p.y - cursor.y) / 180) : 0;
            const pulse = .35 + .65 * (.5 + .5 * Math.sin(now * .00015 + i * .9));
            const alpha = (1 - distance / range) * (.075 + nearCursor * .07) * pulse;
            context.strokeStyle = `rgba(185,38,38,${alpha})`;
            context.lineWidth = .6; context.beginPath(); context.moveTo(p.x, p.y); context.lineTo(q.x, q.y); context.stroke();
            connections++;
          }
        }
      }
      state.frame = requestAnimationFrame(draw);
    }
    function move(event) {
      if (mobile || variant !== 'hero' || event.pointerType === 'touch') return;
      const bounds = pointerBounds || (pointerBounds = host.getBoundingClientRect());
      cursor.targetX = event.clientX - bounds.left; cursor.targetY = event.clientY - bounds.top;
      if (!cursor.active) { cursor.x = cursor.targetX; cursor.y = cursor.targetY; }
      cursor.active = true;
    }
    const invalidateBounds = () => { pointerBounds = null; };
    const leave = () => { cursor.active = false; };
    const visibility = () => document.hidden ? stop() : start();
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; visible ? start() : stop();
    }, { threshold: 0 }) : null;
    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    resize(); observer?.observe(host); resizeObserver?.observe(host);
    if (!resizeObserver) window.addEventListener('resize', resize, { passive: true });
    finePointer.addEventListener('change', resize);
    window.addEventListener('scroll', invalidateBounds, { passive: true });
    region.addEventListener('pointermove', move, { passive: true });
    region.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', stop); window.addEventListener('pageshow', start);
    start();
    return () => {
      disposed = true; stop(); observer?.disconnect(); resizeObserver?.disconnect();
      window.removeEventListener('resize', resize); finePointer.removeEventListener('change', resize);
      window.removeEventListener('scroll', invalidateBounds);
      region.removeEventListener('pointermove', move); region.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', start);
      context.clearRect(0, 0, width, height); state.particles = [];
    };
  }, [enabled, variant]);

  return <>
    <div className="cyber-ambient" />
    {variant !== 'article' && <canvas ref={canvasRef} className="cyber-canvas" />}
    {variant === 'hero' && <div className="cyber-terminal">
      <span className="cyber-terminal-prompt">~/hotwater $</span>
      <span>document --methodology</span>
      <MotionAccent enabled={enabled} />
    </div>}
  </>;
}
