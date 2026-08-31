import { useEffect, useRef, useState } from 'react';

/** Parses a CSS `<time>` string ("180ms", ".18s") into milliseconds. */
function parseCssDurationMs(value: string): number {
  const trimmed = value.trim();
  const num = parseFloat(trimmed);
  if (Number.isNaN(num)) return 0;
  return trimmed.endsWith('ms') ? num : num * 1000;
}

/** base.css's `--dur-exit` — the single source of truth this hook's default
 *  reads from, so raising the CSS duration can never leave the JS timer
 *  cutting the exit animation off mid-fade (or the reverse: the JS default
 *  outliving an animation that finished sooner).
 *
 *  Exported for the toast, which drives its own two-phase timer rather than
 *  going through this hook but needs its unmount tied to the same token for
 *  exactly the same reason. */
export function readExitDurationMs(): number {
  if (typeof window === 'undefined') return 180;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-exit');
  return raw ? parseCssDurationMs(raw) : 180;
}

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
 *
 * `durationMs` defaults to `--dur-exit`, read once per mount. Pass it
 * explicitly only when an overlay's own exit animation genuinely runs a
 * different duration than the shared token — see Sheet.tsx, which springs out
 * rather than running a CSS animation and so has no duration to share, and
 * passes a value timed a little past where that spring comes to rest.
 */
export function useDismissAnimation(open: boolean, durationMs?: number) {
  const [mounted, setMounted] = useState(open);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const duration = useRef(durationMs ?? readExitDurationMs()).current;

  useEffect(() => {
    clearTimeout(timer.current);
    if (open) {
      setMounted(true);
    } else if (mounted) {
      timer.current = setTimeout(() => setMounted(false), duration);
    }
    return () => clearTimeout(timer.current);
  }, [open, mounted, duration]);

  return { mounted, closing: mounted && !open };
}
