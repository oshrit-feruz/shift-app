/** Stroke icon set — the exact 24×24 paths the design uses. One place to add
 *  or restyle an icon; never inline raw <svg> in screens. */

export type IconName =
  | 'home'
  | 'watch'
  | 'news'
  | 'portfolio'
  | 'more'
  | 'search'
  | 'bell'
  | 'trend'
  | 'list'
  | 'settings'
  | 'check'
  | 'plus'
  | 'close'
  | 'steps'
  | 'library'
  | 'grid'
  | 'calendar'
  | 'share'
  | 'dotsV'
  | 'addSquare'
  | 'arrowDown';

const PATHS: Record<IconName, string> = {
  home: 'M4 11l8-7 8 7v8a1 1 0 01-1 1h-5v-6h-4v6H5a1 1 0 01-1-1z',
  watch: 'M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9zM10 18a2 2 0 004 0',
  news: 'M4 5h16v14H4zM7 9h6M7 13h10',
  portfolio: 'M3 7h18v12H3zM8 7V5h8v2',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  bell: 'M6 9a6 6 0 1112 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9zM10 18a2 2 0 004 0',
  trend: 'M4 18l5-5 3 2 8-9M15 6h6v6',
  list: 'M5 6h14M5 11h9M5 16h6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6M4 12h2M18 12h2M12 4v2M12 18v2',
  check: 'M5 12l4 4 10-10',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  steps: 'M5 12l4 4 10-10',
  library: 'M12 4v16M6 8h12M6 16h8',
  grid: 'M8 12h8M12 8v8M4 4h16v16H4z',
  calendar: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',
  // iOS's Share glyph: a box open at the top with an arrow rising out of it —
  // the button the install steps point at, drawn rather than described.
  share: 'M12 15V4M8.5 7.5L12 4l3.5 3.5M8 10H5v10h14V10h-3',
  // The Android/Chrome overflow menu, vertical.
  dotsV: 'M12 5h.01M12 12h.01M12 19h.01',
  // "Add to Home Screen": a plus inside a screen.
  addSquare: 'M4 4h16v16H4zM12 8.5v7M8.5 12h7',
  arrowDown: 'M12 4v15M6 13l6 6 6-6',
};

export function Icon({
  name,
  size = 17,
  strokeWidth = 1.9,
  color = 'currentColor',
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Raw path accessor for places that draw their own svg (tab bar). */
export const iconPath = (name: IconName): string => PATHS[name];

/** Apple's wordmark glyph — a solid brand mark, not a stroke icon, so it
 *  lives outside the PATHS set above. Uses currentColor to follow button
 *  text color in both themes (the Apple button is a secondary/outline
 *  button, not a fixed brand color). */
export function AppleLogo({ size = 18, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.31-2.383 4.06 0 3.29 2.956 4.42 3.007 4.44z" />
    </svg>
  );
}
