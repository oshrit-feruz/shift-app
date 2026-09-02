/**
 * LIVE data source — the market-movers board, from /api/movers (EODHD screener).
 *
 * What the movers screen and the home preview rank. It replaced a board that
 * was not a board: both surfaces sorted `demoService.symbols()`, the app's
 * ten-row sample table, so "market movers" meant "the movers among ten stocks
 * somebody picked during design" — and both sat behind the sample-data switch
 * because of it. This ranks the actual US market, filtered to listings big
 * enough and liquid enough to be worth reading (see api/movers.ts for the
 * floors and why each one is there), so the gate comes off.
 *
 * ONE SESSION BEHIND, AND THE SCREEN SAYS SO. The screener answers on the last
 * completed session and cannot be asked for any other, so every figure here —
 * the close, the change, the volume — is that session's. During a trading day
 * that is yesterday's. The route sends `lastClose: true` rather than letting
 * the screen assume it, and the screen carries a line saying it.
 *
 * WHY NOTHING HERE IS PAIRED WITH A LIVE QUOTE: the change and the price it is
 * a change from have to be the same moment. The old table put the live quote's
 * price beside the live quote's day change, which was coherent; putting a live
 * price beside a last-close change would not be. So the board renders the
 * screener's own close, and the live price belongs to the stock page a tap
 * away.
 *
 * DATA HONESTY CONTRACT, matching data/stats.ts:
 * - An empty board is a real answer — nothing cleared the filters — and reads
 *   as empty, not as a failure.
 * - A row's volume or average volume may be null (a newly listed name has no
 *   200-day average), and renders "—". Never a zero.
 * - Any failure — network, timeout, non-2xx, unparseable body, a shape we do
 *   not recognise — is 'unavailable', carrying the route's own reason. There
 *   is no demo fallback: a board of invented movers is exactly the thing this
 *   file exists to remove.
 */

import { cachedLoadable } from './loadableCache';
import { readRoute } from './readRoute';
import { type Loadable } from './types';

/** Same-origin: the function is deployed alongside the app on Vercel. */
export const MOVERS_URL = '/api/movers';

/** The three boards. Must match BOARDS in api/movers.ts. */
export const BOARDS = ['gainers', 'losers', 'active'] as const;
export type Board = (typeof BOARDS)[number];

/** A read that takes this long is broken by any measure. */
const TIMEOUT_MS = 15_000;

/**
 * How long one board is reused.
 *
 * Half an hour, matching the route's edge cache: the screener recomputes once
 * a day, so flipping between the three tabs and coming back should not spend a
 * provider call to be told the same hundred rows. Each board is cached under
 * its own key, so the tabs do not evict each other.
 */
const CACHE_MS = 30 * 60_000;

const FALLBACK_REASON = {
  en: 'The market movers board is unavailable right now.',
  he: 'לוח מובילי השוק אינו זמין כרגע.',
};

/** One line of the board. Mirrors MoverRow in api/_lib/eodhd.ts. */
export interface MoverRow {
  ticker: string;
  name: string | null;
  /** The provider's own sector vocabulary, e.g. "Consumer Cyclical". */
  sector: string | null;
  /** The last completed session's close, and its change in percent, signed. */
  close: number;
  changePct: number;
  /** That session's volume, and the 200-day average to measure it against. */
  volume: number | null;
  averageVolume: number | null;
}

export interface MoversBoard {
  board: Board;
  /** True for every row: these are the last completed session's figures. */
  lastClose: boolean;
  rows: MoverRow[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A finite number, or null — including for the provider's own nulls. */
function numOrNull(v: unknown): number | null {
  return isNum(v) ? v : null;
}

/** A non-empty string, or null. */
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Pull the board out of the route's response, or null when the body is not one.
 *
 * A row without a ticker, a close and a change is not a line of a board, and
 * the whole body is refused rather than the row quietly dropped: the route
 * already drops what the provider could not carry, so a malformed row here
 * means we are not reading what we think we are reading.
 *
 * An empty `rows` is a real answer and comes back as an empty board.
 */
export function extractBoard(body: unknown): MoversBoard | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = body as Record<string, unknown>;
  const board = BOARDS.find((b) => b === raw.board);
  if (board === undefined || !Array.isArray(raw.rows)) return null;

  const rows: MoverRow[] = [];
  for (const entry of raw.rows) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const ticker = strOrNull(row.ticker);
    const close = numOrNull(row.close);
    const changePct = numOrNull(row.changePct);
    if (ticker === null || close === null || changePct === null) return null;
    rows.push({
      ticker: ticker.toUpperCase(),
      name: strOrNull(row.name),
      sector: strOrNull(row.sector),
      close,
      changePct,
      volume: numOrNull(row.volume),
      averageVolume: numOrNull(row.averageVolume),
    });
  }
  // Only ever true today, and read rather than assumed: if the board ever gains
  // an intraday source, the screen's wording follows the route without a change
  // here.
  return { board, lastClose: raw.lastClose === true, rows };
}

/** One board, ranked by the provider. Never throws. */
export async function fetchMovers(
  board: Board,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<MoversBoard>> {
  return fetchImpl === fetch
    ? cachedLoadable(`movers:${board}`, CACHE_MS, () => readMovers(board, fetch))
    : readMovers(board, fetchImpl);
}

/** The uncached read. Never throws — see data/readRoute.ts. */
function readMovers(board: Board, fetchImpl: typeof fetch): Promise<Loadable<MoversBoard>> {
  return readRoute(
    `${MOVERS_URL}?board=${encodeURIComponent(board)}`,
    { timeoutMs: TIMEOUT_MS, fallbackReason: FALLBACK_REASON, extract: extractBoard },
    fetchImpl,
  );
}
