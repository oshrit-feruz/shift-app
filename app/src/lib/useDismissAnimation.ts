import { useEffect, useRef, useState } from 'react';

/**
 * Keeps an overlay mounted long enough to play its exit animation.
 *
 * `open` flips instantly; this returns `mounted` (render the element at all)
 * and `closing` (play its exit). Without it an overlay disappears the frame
 * its flag goes false, which is the jarring half of every open/close pair —
 * the entrance animates and the exit is a cut.
 *
 * A timer drives the unmount rather than an `animationend` listener, so a
 * dropped event — a backgrounded tab, or reduced-motion collapsing the
 * duration — can never strand the overlay on screen.
 */
export function useDismissAnimation(open: boolean, durationMs = 200) {
  const [mounted, setMounted] = useState(open);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
    } else if (mounted) {
      timer.current = setTimeout(() => setMounted(false), durationMs);
    }
    return () => clearTimeout(timer.current);
  }, [open, mounted, durationMs]);

  return { mounted, closing: mounted && !open };
}
