import { Sparkline } from './AreaChart';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { signalColor } from '../lib/format';

/** How many trailing sessions a sparkline covers — about five weeks. */
const SESSIONS = 26;

/**
 * One row's sparkline, drawn from that ticker's real closes.
 *
 * It loads its own series rather than taking values from the parent because it
 * is genuinely optional furniture: a ticker the mirror does not publish, or a
 * read that fails, must cost the row nothing. In every case that is not a real
 * series it renders nothing at all — no placeholder line, no seeded walk.
 * A missing sparkline is barely noticeable; a fabricated one is a picture of
 * price action that never happened, sitting beside a real price.
 *
 * The stroke colour comes from the drawn window's own direction, so the line
 * and its colour cannot disagree. The percentage beside it in the row is still
 * a demo day-change from a different source, which is exactly why this does
 * not borrow it.
 */
export function TickerSparkline({ ticker }: { ticker: string }) {
  const { state } = useLoadable(() => demoService.dailySeries(ticker), [ticker]);
  if (state.status !== 'ok' || !state.data) return null;

  const closes = state.data.slice(-SESSIONS).map((b) => b.close);
  // Two points are the minimum that makes a line rather than a dot.
  if (closes.length < 2) return null;

  const changePct = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;
  return <Sparkline values={closes} color={signalColor(changePct)} />;
}
