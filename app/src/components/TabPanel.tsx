import { useRef, type ReactNode } from 'react';

/**
 * Keep-alive tab panel. A tab's content mounts the first time it becomes
 * active and then STAYS mounted, hidden with display:none while another tab
 * is showing — so returning to a tab shows exactly what it already loaded
 * instead of unmounting it and paying a fresh skeleton on every visit.
 *
 * Re-activation replays a short opacity fade (`anim-tab-in`). Opacity-only
 * on purpose: the panel is an ancestor of glass cards, and animating
 * transform would detach their backdrop-filter for the duration — the same
 * trap documented at the Motion note in styles/base.css.
 *
 * Give the panel a `key` that includes whatever invalidates its content
 * (e.g. the ticker on a stock page): a key change remounts it, resetting the
 * visited flag, so a stock→stock navigation does not keep fetching tabs the
 * user never opened for the new symbol.
 */
export function TabPanel({
  active,
  children,
  gap = 12,
}: {
  active: boolean;
  children: ReactNode;
  gap?: number;
}) {
  const visited = useRef(false);
  if (active) visited.current = true;
  if (!visited.current) return null;
  return (
    <div
      className={active ? 'anim-tab-in' : undefined}
      // display toggled inline rather than via the `hidden` attribute: an
      // explicit display style would override `hidden`'s UA display:none.
      style={{ display: active ? 'flex' : 'none', flexDirection: 'column', gap }}
    >
      {children}
    </div>
  );
}
