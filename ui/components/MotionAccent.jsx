import { useEffect } from 'react';
import { useAnimate } from 'motion/react-mini';

/** A bounded entrance animation; there are no endlessly repeating UI accents. */
export function MotionAccent({ enabled }) {
  const [scope, animate] = useAnimate();
  useEffect(() => {
    if (!enabled) return;
    const animation = animate(scope.current,
      { opacity: [.5, 1], transform: ['scaleX(.35)', 'scaleX(1)'] },
      { duration: .55, ease: 'easeOut' });
    return () => animation.complete();
  }, [enabled, animate, scope]);
  return <span ref={scope} className="cyber-accent-line" />;
}
