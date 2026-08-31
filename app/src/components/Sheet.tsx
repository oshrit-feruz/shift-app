import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useDismissAnimation } from '../lib/useDismissAnimation';
import { useSheetDrag } from '../lib/useSheetDrag';

/** The phone-frame element sheets mount into (set in App.tsx). */
export const SHELL_ID = 'app-shell';

/**
 * Bottom sheet over a veil — the app's one modal treatment. Glass ground,
 * grab handle, spring motion. Clicking the veil dismisses, and so does
 * dragging the sheet down.
 *
 * The sheet is grabbable everywhere except inside its own scrolled list: it
 * follows the finger 1:1, resists being pulled above its open position, and
 * on release leaves or returns based on where the throw was heading rather
 * than where the finger stopped. See useSheetDrag for the gesture and
 * lib/spring for the motion.
 *
 * Rendered through a portal into the app shell rather than in place. Sheets
 * opened from inside a screen (TxSheet, NewPortfolioSheet) sit under
 * `.anim-fade-up`, whose filling opacity animation makes it a stacking
 * context — so the sheet's z-index was scoped to that screen and the floating
 * tab bar, a positioned sibling higher up, painted over the sheet's lower
 * half. Portalling to the shell puts the sheet in the same stacking context
 * as the tab bar, where its z-index actually outranks it.
 *
 * The shell is the portal target rather than document.body so the sheet stays
 * inside the centred phone frame instead of spanning a desktop window.
 */
export function Sheet({
  open,
  onClose,
  title,
  meta,
  children,
  maxHeight = '78%',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxHeight?: string;
}) {
  // Stays mounted through the exit so closing is animated, not a cut. Timed a
  // little past where the dismiss spring comes to rest.
  const { mounted, closing } = useDismissAnimation(open, 380);
  // Resolved after mount: on the very first render the shell is still being
  // committed, so the node does not exist yet.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.getElementById(SHELL_ID)), []);
  if (!mounted) return null;
  return <SheetBody {...{ closing, onClose, title, meta, maxHeight, host }}>{children}</SheetBody>;
}

/**
 * Split out so the gesture's hooks mount and unmount with the sheet itself.
 * Kept inside Sheet they would have to run on every screen that renders a
 * closed sheet, and the entrance spring would have nothing to measure.
 */
function SheetBody({
  closing,
  onClose,
  title,
  meta,
  children,
  maxHeight,
  host,
}: {
  closing: boolean;
  onClose: () => void;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  maxHeight: string;
  host: HTMLElement | null;
}) {
  const { sheetRef, veilRef, bodyRef, dragHandlers } = useSheetDrag({ closing, onClose });

  const sheet = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        alignItems: 'flex-end',
        // Once the parent has committed to closing, the overlay stops
        // intercepting taps even though it is still mounted for its exit.
        pointerEvents: closing ? 'none' : undefined,
      }}
      onClick={onClose}
    >
      {/* Its own layer rather than a background on the flex parent, so the
          dimming can fade with the drag without taking the sheet's opacity
          down with it. Opacity is written by useSheetDrag, which is why it is
          absent here — a value in this style object would be reapplied on
          every re-render, clobbering the animation mid-flight. */}
      <div ref={veilRef} style={{ position: 'absolute', inset: 0, background: 'var(--veil)' }} />
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        {...dragHandlers}
        className="glass-sheet"
        style={{
          position: 'relative',
          width: '100%',
          borderTop: '1px solid rgba(146,155,172,.22)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: '16px 16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 11,
          maxHeight,
          // The handle and header are never a scroll, always a drag.
          touchAction: 'none',
          willChange: 'transform',
        }}
      >
        <div
          style={{ width: 38, height: 4, borderRadius: 2, background: 'var(--line)', alignSelf: 'center' }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div
            className="nowrap"
            style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-title)', flex: 'none' }}
          >
            {title}
          </div>
          {meta != null && (
            <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
              {meta}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: 0, opacity: 0.6 }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" size={18} strokeWidth={2} />
          </button>
        </div>
        {/* The scroll moved off the sheet and onto its content: the sheet
            itself has to stay untouched by scrolling for the drag to own the
            gesture, and the title stays put rather than scrolling away.
            `contain` keeps a pull at the top of the list from chaining out to
            the screen behind the veil. */}
        <div
          ref={bodyRef}
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
            paddingBottom: 34,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
  // Before the host resolves, render in place rather than not at all.
  return host ? createPortal(sheet, host) : sheet;
}
