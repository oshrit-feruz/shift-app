import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { projectMomentum, rubberband, spring, type SpringHandle } from './spring';

/**
 * Makes a bottom sheet grabbable: the surface tracks the finger 1:1, resists
 * past its open position, and on release either flies out or falls back
 * depending on where the throw was heading — not on where the finger happened
 * to let go.
 *
 * The sheet drew a grab handle long before it could be grabbed. A handle is a
 * promise about what the surface does, and this is that promise kept.
 *
 * The animation runs on requestAnimationFrame against the element's transform
 * rather than through React state, because a re-render per frame is both
 * wasted work and a source of dropped frames on the exact interaction where
 * dropped frames are most visible.
 */

/** Apple's published drawer values: enough overshoot to read as physical. */
const DRAWER = { damping: 0.8, response: 0.3 };
/** Leaving is not a moment for bounce, and it should clear the screen crisply. */
const DISMISS = { damping: 1, response: 0.25 };
/** Movement before a press is treated as a drag, so taps inside stay taps. */
const THRESHOLD_PX = 10;
/** Samples older than this say nothing about where the finger is going now. */
const VELOCITY_WINDOW_MS = 100;

type Sample = { t: number; y: number };

type Drag = {
  pointerId: number;
  /** Where the finger is measured from. Re-based at the moment the drag is
   *  recognised so the surface starts glued rather than jumping the 10px the
   *  threshold ate. */
  originY: number;
  /** Presentation offset when the drag took over, so an in-flight spring is
   *  inherited instead of snapped away from. */
  originOffset: number;
  startedInBody: boolean;
  active: boolean;
  samples: Sample[];
};

export function useSheetDrag({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /** Pixels the sheet sits below its open position. 0 is open, one sheet
   *  height is fully clear of the screen. */
  const offset = useRef(0);
  const anim = useRef<SpringHandle | null>(null);
  const drag = useRef<Drag | null>(null);
  /** True while a flick is flying out but before the parent has been told, so
   *  the flight can still be caught and reversed. */
  const dismissing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** Measured only at the start of a drag or an animation, never per frame:
   *  reading offsetHeight mid-flight would force a synchronous layout on the
   *  one interaction that can least afford one. */
  const heightRef = useRef(0);
  const measure = () => {
    heightRef.current = sheetRef.current?.offsetHeight || 1;
    return heightRef.current;
  };
  const height = () => heightRef.current || 1;

  const paint = useCallback((next: number) => {
    offset.current = next;
    const sheet = sheetRef.current;
    if (sheet) sheet.style.transform = next === 0 ? '' : `translateY(${next}px)`;
    const veil = veilRef.current;
    // The dimming tracks the drag rather than waiting for it to finish, so the
    // background comes back continuously as the sheet is pulled away.
    if (veil) veil.style.opacity = String(Math.max(0, Math.min(1, 1 - next / height())));
  }, []);

  const animateTo = useCallback(
    (to: number, velocity: number, params: { damping: number; response: number }, onRest?: () => void) => {
      anim.current?.stop();
      anim.current = spring({ from: offset.current, to, velocity, ...params, onFrame: paint, onRest });
    },
    [paint],
  );

  // Entrance. Painted in a layout effect so the sheet is already offscreen on
  // the frame it first appears, instead of flashing at its open position.
  useLayoutEffect(() => {
    paint(measure());
    animateTo(0, 0, DRAWER);
    return () => anim.current?.stop();
  }, [animateTo, paint]);

  // Exit driven from outside — the close button, or a tap on the veil. A
  // gesture dismissal never comes through here; it animates first and tells
  // the parent afterwards.
  useEffect(() => {
    if (!closing) return;
    animateTo(measure(), anim.current?.velocity() ?? 0, DISMISS);
  }, [closing, animateTo]);

  const velocityFromSamples = (samples: Sample[]): number => {
    const last = samples[samples.length - 1];
    if (!last) return 0;
    const oldest = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? samples[0];
    const dt = last.t - oldest.t;
    return dt > 0 ? ((last.y - oldest.y) / dt) * 1000 : 0;
  };

  /** Released together, so an abandoned drag can never leave a listener or a
   *  half-applied style behind. */
  const detach = useRef<(() => void) | null>(null);

  const endDrag = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;
      detach.current?.();
      drag.current = null;
      if (!d.active) return;

      const velocity = velocityFromSamples(d.samples);
      const h = height();
      // Where the throw was going, not where the finger stopped. Releasing
      // halfway with a downward flick means the sheet was on its way out, and
      // snapping back to the nearest edge would refuse the throw.
      const projected = offset.current + projectMomentum(velocity);

      if (projected > h / 2) {
        dismissing.current = true;
        // Animate out first and tell the parent on landing. Staying "open"
        // through the flight is what lets the sheet be caught and pulled back
        // — the parent owns `open`, so calling onClose now would make a
        // reversal unrepresentable.
        animateTo(h, velocity, DISMISS, () => {
          if (!dismissing.current) return;
          dismissing.current = false;
          onCloseRef.current();
        });
      } else {
        animateTo(0, velocity, DRAWER);
      }
    },
    [animateTo],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.pointerId !== e.pointerId) return;

      d.samples.push({ t: performance.now(), y: e.clientY });
      if (d.samples.length > 8) d.samples.shift();

      if (!d.active) {
        const moved = e.clientY - d.originY;
        if (Math.abs(moved) < THRESHOLD_PX) return;
        // Started in the list and heading up: that is a scroll, and the sheet
        // should get out of its way for the rest of this gesture.
        if (d.startedInBody && moved < 0) {
          detach.current?.();
          drag.current = null;
          return;
        }
        d.active = true;
        measure();
        // Take over from whatever was in flight at the value it had reached,
        // and re-base so the surface follows from here rather than jumping
        // the threshold's worth of travel.
        anim.current?.stop();
        d.originOffset = anim.current?.value() ?? offset.current;
        d.originY = e.clientY;
        dismissing.current = false;
        // A drag is not a selection. Applied only for the drag so an article
        // sheet's text stays selectable the rest of the time.
        if (sheetRef.current) sheetRef.current.style.userSelect = 'none';
      }

      const raw = d.originOffset + (e.clientY - d.originY);
      // Above the open position there is nothing left to reveal, so the sheet
      // gives progressively less rather than stopping dead.
      paint(raw < 0 ? -rubberband(-raw, height()) : raw);
    },
    [paint],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (closing || drag.current) return;
      const target = e.target as HTMLElement;
      // Controls own their own presses; a form field inside a sheet must not
      // have to fight the sheet for the gesture.
      if (target.closest('button, a, input, textarea, select, [role="button"]')) return;

      const body = bodyRef.current;
      const startedInBody = !!body && body.contains(target);
      // Mid-list, the vertical gesture belongs to the scroller. Only from the
      // very top does pulling down mean "close this".
      if (startedInBody && body.scrollTop > 0) return;

      drag.current = {
        pointerId: e.pointerId,
        originY: e.clientY,
        originOffset: offset.current,
        startedInBody,
        active: false,
        samples: [{ t: performance.now(), y: e.clientY }],
      };

      // The rest of the gesture is tracked on the window rather than on the
      // sheet. A drag that starts near the top edge leaves the element within
      // a few pixels — before the threshold has even been crossed — and
      // element-scoped handlers simply stop hearing about it, so pulling the
      // sheet up did nothing at all. Pointer capture would also fix the
      // tracking, but it retargets the click that follows, which would break
      // taps on anything inside that is clickable without being a control.
      const move = onPointerMove;
      const up = endDrag;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      detach.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        detach.current = null;
        if (sheetRef.current) sheetRef.current.style.userSelect = '';
      };
    },
    [closing, onPointerMove, endDrag],
  );

  // A sheet unmounted mid-drag (a route change, a parent that stopped
  // rendering it) must not leave the window listening.
  useEffect(() => () => detach.current?.(), []);

  return {
    sheetRef,
    veilRef,
    bodyRef,
    dragHandlers: { onPointerDown },
  };
}
