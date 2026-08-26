import type { CSSProperties } from 'react';
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
  fontSize = 14,
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
      title={<SkeletonLine width="42%" fontSize={15} />}
      subtitle={subtitle ? <SkeletonLine width="68%" fontSize={13} bar={9} /> : undefined}
      right={
        right ? (
          <>
            <SkeletonLine width={56} fontSize={14} />
            <SkeletonLine width={38} fontSize={12.5} bar={9} />
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
  fontSize = 14,
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
