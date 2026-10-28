import { useEffect, useRef, useState } from 'react';

/** Animates a number from its previous value to the new one (ease-out, about 450 ms). */
export function useCountUp(target: number, durationMs = 450): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = reduce ? 1 : Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      setShown(value);
      fromRef.current = value;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return shown;
}
