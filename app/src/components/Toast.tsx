import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SHELL_ID } from './Sheet';
import { readExitDurationMs } from '../lib/useDismissAnimation';

/**
 * The app's one transient confirmation.
 *
 * Adding or removing a stock changes a list the user may not be looking at —
 * the add button lives in the search overlay, which covers the watchlist, and
 * the row's own ✕ removes the row it was attached to. Without a word from the
 * app, the only evidence either worked is a row appearing or vanishing behind
 * a sheet, which is no evidence at all.
 *
 * Deliberately not a queue. Someone adding four stocks in a row wants to know
 * the last one landed, not to sit through four messages; a new toast replaces
 * the one on screen and restarts its clock.
 */

type ToastFn = (message: string) => void;

const ToastCtx = createContext<ToastFn>(() => {});

/** Show a short confirmation over the app. */
export const useToast = () => useContext(ToastCtx);

const VISIBLE_MS = 2200;

export function ToastProvider({ children }: { children: ReactNode }) {
  // `seq` is what makes an identical repeat message re-announce and re-animate:
  // toggling the same ticker twice produces the same string, and keying the
  // node on the text alone would leave the first toast sitting there unchanged.
  const [toast, setToast] = useState<{ message: string; seq: number; closing: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);
  // How long to leave the toast mounted after it starts closing, read from
  // `--dur-exit` rather than written down again here. The two had already
  // drifted — a local constant said 200 against the token's 180 — which costs
  // nothing while the exit animation fills forwards, and would cut the toast
  // off mid-flight the moment anyone raised the token. Read on mount, not at
  // module scope, so the stylesheet is guaranteed to have landed.
  const fadeMs = useRef(readExitDurationMs()).current;

  const show = useCallback(
    (message: string) => {
      for (const t of timers.current) clearTimeout(t);
      seq.current += 1;
      setToast({ message, seq: seq.current, closing: false });
      timers.current = [
        setTimeout(() => setToast((t) => (t ? { ...t, closing: true } : t)), VISIBLE_MS),
        setTimeout(() => setToast(null), VISIBLE_MS + fadeMs),
      ];
      // fadeMs is a ref's value and so stable for the provider's life; listing
      // it keeps the dependency honest rather than relying on that.
    },
    [fadeMs],
  );

  // Timers outlive the component otherwise, and a setState after unmount is a
  // warning at best and a leak at worst.
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <ToastHost key={toast.seq} message={toast.message} closing={toast.closing} />}
    </ToastCtx.Provider>
  );
}

/**
 * The toast itself, portalled into the app shell so it floats above the tab
 * bar rather than inside whichever screen happened to raise it — the same
 * reason sheets portal (see components/Sheet.tsx).
 */
function ToastHost({ message, closing }: { message: string; closing: boolean }) {
  // Resolved after mount: on the first render the shell may not be committed.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(SHELL_ID)), []);
  if (!host) return null;

  return createPortal(
    <div
      // Above every other layer in the shell: the tab bar (50), sheets (80)
      // and the search overlay (90). Not a stylistic ranking — the overlay is
      // where most stocks are added, and a confirmation that renders behind
      // the surface that raised it confirms nothing.
      style={{
        position: 'absolute',
        insetInline: 0,
        // Clears the floating tab bar, which is out of flow.
        bottom: 'calc(104px + env(safe-area-inset-bottom))',
        zIndex: 100,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 20px',
        // The toast is a message, never a target: it must not swallow a tap
        // meant for the row underneath it.
        pointerEvents: 'none',
      }}
    >
      <div
        // polite, not assertive: this confirms something the user just did,
        // so it should wait its turn rather than interrupt.
        role="status"
        aria-live="polite"
        // Rises from the bottom edge and leaves back through it, rather than
        // fading in place: a thing that appears one way is expected to go the
        // way it came, and this one lives at the bottom of the screen. Safe to
        // transform where screens are not — a toast is a single solid pane
        // with no glass descendant to detach (see base.css's Motion note).
        className={closing ? 'anim-toast-out' : 'anim-toast-in'}
        style={{
          maxWidth: '100%',
          padding: '10px 15px',
          borderRadius: 999,
          fontSize: 'var(--text-body)',
          lineHeight: 1.3,
          textAlign: 'center',
          color: 'var(--color-text)',
          // Solid, not the glass fill: a toast sits over live content and
          // has to stay readable against whatever happens to be behind it.
          background: 'var(--surface-solid)',
          border: '1px solid var(--color-divider)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, .38)',
        }}
      >
        {message}
      </div>
    </div>,
    host,
  );
}
