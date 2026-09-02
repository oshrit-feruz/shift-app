/**
 * A radar dish that keeps turning — the live state of the daily screen, drawn
 * rather than described.
 *
 * It sits beside the LiveBadge rather than replacing it: the badge says the
 * word for anyone reading, this says it for anyone glancing. Both are green
 * for the same reason and in the same one place, so the pair reads as a single
 * statement about the radar and not as two decorations.
 *
 * Decorative, so it is hidden from assistive technology; the badge beside it
 * is the accessible half.
 */
export function RadarSweep({ size = 26 }: Readonly<{ size?: number }>) {
  return (
    <span className="radar-sweep" style={{ width: size, height: size }} aria-hidden="true">
      <span className="radar-sweep-beam" />
    </span>
  );
}
