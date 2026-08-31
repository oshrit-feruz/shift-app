import { memo } from 'react';

/**
 * The ground behind every screen.
 *
 * This used to be four large hand-drawn squiggles in violet, red and green at
 * 75% opacity. They were the design's originals, but every card in the app is
 * a `backdrop-filter` surface sampling whatever is behind it — and a hard-
 * edged coloured path read through blurred glass as a smear crossing the card,
 * not as texture behind it. The squiggles were competing with the content
 * sitting on top of them.
 *
 * The ground follows the boot splash instead, which is the brand's own
 * language: a deep centred vignette with a fine CRT scanline over it. It is
 * low-frequency and nearly monochrome, which is exactly what glass wants —
 * the blur turns it into a soft tint rather than a shape, so the cards read as
 * panes over a lit surface. The one piece of colour left is a diffuse accent
 * bloom, far too soft to have an edge.
 *
 * Purely decorative and props-less, so it is memoised and hidden from
 * assistive technology.
 */
export const AppBackground = memo(function AppBackground() {
  return (
    <div className="app-bg" aria-hidden="true">
      <span className="app-bg-scan" />
    </div>
  );
});
