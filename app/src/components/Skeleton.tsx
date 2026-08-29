import type { CSSProperties } from 'react';
import { Card } from './Card';
import { ListRow } from './ListRow';

/**
 * Loading placeholders.
 *
 * The point of these is layout stability: a skeleton must occupy the same box
 * as the content that replaces it, so data arriving swaps in place rather than
 * pushing the page around.
 *
 * That is why SkeletonRow renders a real ListRow rather than re-implementing
 * its markup, and why SkeletonLine reserves a full line box instead of just a
 * bar: text height comes from font-size × line-height (1.5 from base.css), not
 * from the bar you can see, so a bare 11px bar standing in for a 15px line is
 * 11px short every time. Reserve the line, draw the bar inside it.
 *
 * Skeletons are decorative: each is aria-hidden, and the surrounding DataState
 * owns the single role="status" that announces loading to assistive tech.
 */

/** A single shimmer block. Width/height accept any CSS length. */
export function Skeleton({
  width = '100%',
  height = 12,
  radius,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className="skeleton"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

/**
 * A bar centred inside the line box a real text run of `fontSize` would make.
 * `lineHeight` defaults to the document's 1.5; pass the element's own value
 * when it overrides that (e.g. the 1.05 on big display numbers).
 */
export function SkeletonLine({
  width = '100%',
  fontSize = 17,
  lineHeight = 1.5,
  bar = 11,
  style,
}: {
  width?: number | string;
  fontSize?: number;
  lineHeight?: number;
  bar?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{ display: 'flex', alignItems: 'center', height: fontSize * lineHeight, ...style }}
    >
      <Skeleton width={width} height={Math.min(bar, fontSize * lineHeight)} />
    </span>
  );
}

/**
 * A ListRow whose slots hold skeletons — same component, so the row box is
 * identical to the loaded one by construction (34px tile, 15px title line,
 * 13px subtitle line, 14/12.5px right-hand pair).
 */
export function SkeletonRow({
  leading = true,
  subtitle = true,
  right = true,
  minHeight,
  divider = true,
}: {
  leading?: boolean;
  subtitle?: boolean;
  right?: boolean;
  minHeight?: number;
  divider?: boolean;
}) {
  return (
    <ListRow
      divider={divider}
      minHeight={minHeight}
      leading={leading ? <Skeleton width={34} height={34} radius="var(--radius-sm)" /> : undefined}
      title={<SkeletonLine width="42%" fontSize={18} />}
      subtitle={subtitle ? <SkeletonLine width="68%" fontSize={16} bar={9} /> : undefined}
      right={
        right ? (
          <>
            <SkeletonLine width={56} fontSize={17} />
            <SkeletonLine width={38} fontSize={15.5} bar={9} />
          </>
        ) : undefined
      }
    />
  );
}

/** `count` stacked SkeletonRows. The first has no divider, matching list starts. */
export function SkeletonList({
  count = 3,
  leading = true,
  subtitle = true,
  right = true,
  minHeight,
  firstDivider = false,
}: {
  count?: number;
  leading?: boolean;
  subtitle?: boolean;
  right?: boolean;
  minHeight?: number;
  firstDivider?: boolean;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow
          key={i}
          leading={leading}
          subtitle={subtitle}
          right={right}
          minHeight={minHeight}
          divider={i > 0 || firstDivider}
        />
      ))}
    </>
  );
}

/** Stacked text lines, for paragraph-shaped content. */
export function SkeletonText({
  lines = 2,
  fontSize = 17,
  widths,
}: {
  lines?: number;
  fontSize?: number;
  widths?: string[];
}) {
  return (
    <span aria-hidden style={{ display: 'block' }}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLine
          key={i}
          fontSize={fontSize}
          width={widths?.[i] ?? (i === lines - 1 ? '55%' : '100%')}
          bar={10}
        />
      ))}
    </span>
  );
}

/**
 * Stands in for AreaChart. A flat grey block here reads as a much bigger
 * change than the rest of a skeleton card: AreaChart fills its area with a
 * top-to-bottom accent gradient (see AreaChart.tsx), so on load a large grey
 * rectangle becomes a glowing purple one — the single biggest jump in an
 * otherwise gray-to-real swap, on the card that is usually the first thing a
 * reader sees. Tinting the placeholder with the same accent, at low opacity,
 * pre-empts that glow instead of hiding it behind flat grey. The shimmer
 * still plays (background-image, untouched here); only background-color
 * changes.
 */
export function SkeletonChart({ height, style }: { height: number; style?: CSSProperties }) {
  return (
    <Skeleton
      height={height}
      radius="var(--radius-md)"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 18%, transparent)', ...style }}
    />
  );
}

/**
 * A whole-card placeholder that IS a Card, so it carries the same glass
 * surface — background, blur, radius, shadow — as the content replacing it.
 *
 * A bare shimmer block was standing in for whole cards, which meant the
 * material changed at load: a flat rectangle became glass, and behind it the
 * background shapes went from painted-over to showing through. Reusing Card
 * keeps the surface identical and leaves only the contents to fade in.
 *
 * `height` is fixed so the swap holds its layout; the lines inside are the
 * loading signal and are clipped rather than allowed to change that height.
 */
export function SkeletonCard({
  height,
  lines = 3,
  padding = 13,
}: {
  height: number;
  lines?: number;
  padding?: number | string;
}) {
  return (
    <Card padding={padding} gap={9} style={{ height, overflow: 'hidden', flex: 'none' }}>
      <Skeleton width="46%" height={12} />
      <SkeletonText lines={lines} fontSize={16} />
    </Card>
  );
}
