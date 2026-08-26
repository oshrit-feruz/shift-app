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
  | 'steps'
  | 'library'
  | 'grid'
  | 'calendar';

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
  steps: 'M5 12l4 4 10-10',
  library: 'M12 4v16M6 8h12M6 16h8',
  grid: 'M8 12h8M12 8v8M4 4h16v16H4z',
  calendar: 'M4 5h16v15H4zM4 9h16M8 3v4M16 3v4M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01',
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
