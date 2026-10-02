'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';

function subscribeMq(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  };
}

export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(subscribeMq(query), () => window.matchMedia(query).matches, () => serverValue);
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Light haptic tick on supported phones (Android); harmless elsewhere. */
export function haptic(pattern: number | number[] = 8) {
  try { navigator.vibrate?.(pattern); } catch {}
}
