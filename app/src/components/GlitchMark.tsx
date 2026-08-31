/**
 * The wordmark, inline in a sentence, wearing the boot splash's glitch.
 *
 * The splash is where this app's brand actually speaks — a light-on-dark
 * lockup that tears and flickers like a signal — and this is the same artwork
 * and the same two keyframes at reading size, so a line like "the names
 * Shift's daily radar picked up" carries the mark rather than the word.
 *
 * The tear is a second copy of the image held at opacity 0 and revealed for a
 * couple of frames per cycle (see .glitch-mark in base.css), exactly as the
 * splash does it — which is what keeps the mark from ever blinking out.
 *
 * `alt` is on the base copy only: the tear is decoration and would otherwise
 * announce the brand twice. Sized by height so it sits on the text baseline
 * of whatever line it lands in.
 */
export function GlitchMark({ height = 15 }: { height?: number }) {
  return (
    <span className="glitch-mark" style={{ height, width: height * WORDMARK_RATIO }}>
      <img src="/assets/shift-wordmark.png" alt="Shift" width={1891} height={782} />
      <img
        src="/assets/shift-wordmark.png"
        alt=""
        aria-hidden="true"
        width={1891}
        height={782}
        className="glitch-tear"
      />
    </span>
  );
}

/** The asset's own aspect ratio (1891×782), so a height is all a caller sets. */
const WORDMARK_RATIO = 1891 / 782;
