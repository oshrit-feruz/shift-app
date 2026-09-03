import { mapMoverRows, screenerUrl, type MoverRow } from './_lib/eodhd.js';
import { failureBody, fetchUpstreamJson } from './_lib/upstream.js';
import { type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * The market-movers board: GET /api/movers?board=gainers|losers|active
 *
 * What the movers screen ranks. It replaced a board that was not a board: the
 * screen sorted the app's ten-row sample table, so "market movers" meant "the
 * movers among ten stocks somebody picked during design", and the whole screen
 * sat behind the sample-data switch because of it.
 *
 * THE FILTERS ARE THE FEATURE. Sorted naively by day change, a US-wide
 * screener returns sub-penny OTC listings: a 14% "gain" on a stock quoted at
 * $0.0016 outranks every real move in the market. The three floors below are
 * what make the board readable, and they were chosen by running the query and
 * looking at the answer rather than by taste.
 *
 * ONE SESSION BEHIND, AND SAID SO. The screener answers on the last completed
 * session and its own documentation rules out asking for any other, so this
 * board is the last close's — during a trading day, yesterday's. That is a
 * real limit of the source, not a bug to hide: the screen carries a line
 * saying these are the last close's figures. The intraday alternative is the
 * bulk live endpoint (the whole US market in one request, fifteen minutes
 * delayed), which is a bigger change and a different cost.
 *
 * DATA HONESTY CONTRACT:
 *   - An empty board is a real answer — nothing cleared the filters — and is
 *     rendered as empty, not as an error.
 *   - A row that cannot carry a ticker, a close and a change is dropped; the
 *     rest of the board is still every row the provider ranked. Volume and its
 *     average are allowed to be missing, and render as "—".
 *   - Any failure is an error status with a code, never an empty board.
 */

/** Upstream budget. One board is a bounded body. */
const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * The floors a stock clears to be on this board, and why each one is here.
 *
 * Measured against the live screener rather than guessed. Without them the
 * top of the gainers board was Rolls-Royce's $0.0016 OTC line at +14%; with
 * them it is Moderna, Edison International and Duolingo.
 */
const MIN_MARKET_CAP = 5_000_000_000;
/** Below this a one-cent tick is a percentage move, which is noise, not news. */
const MIN_PRICE = 10;
/** Thin volume makes a large percentage move something nobody could trade. */
const MIN_VOLUME = 2_000_000;

/**
 * How many rows one board carries.
 *
 * The provider's ceiling is 100 and the screen takes all of it, because the
 * sector chips filter this board rather than re-running the query — a chip
 * shows the movers of that sector WITHIN the hundred, which is what the
 * screen says it is doing.
 */
const BOARD_SIZE = 100;

/** The three boards, and the provider field each ranks on. */
const BOARDS = {
  gainers: 'refund_1d_p.desc',
  losers: 'refund_1d_p.asc',
  active: 'avgvol_1d.desc',
} as const;

export type Board = keyof typeof BOARDS;

export function isBoard(value: string | undefined): value is Board {
  return value !== undefined && Object.hasOwn(BOARDS, value);
}

export interface MoversBody {
  board: Board;
  source: string;
  /**
   * True for every row on this board: the figures are the last completed
   * session's, not the running day's. Sent rather than assumed by the client,
   * so the screen's wording is driven by what the route actually served.
   */
  lastClose: true;
  rows: MoverRow[];
}

/** Builds the handler with an injectable budget and fetch, as the other routes do. */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    const raw = req.query.board;
    if (Array.isArray(raw) && raw.length > 1) {
      return res
        .status(400)
        .json({ error: 'repeated_param', message: 'Query param "board" must be given once.' });
    }
    const board = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!isBoard(board)) {
      return res.status(400).json({
        error: 'invalid_board',
        message: `Query param "board" must be one of ${Object.keys(BOARDS).join(', ')}.`,
      });
    }

    const apiKey = process.env.EODHD_API_KEY;
    if (!apiKey) {
      console.error('/api/movers: EODHD_API_KEY is not set');
      return res.status(500).json({ error: 'not_configured', message: 'Market movers are not configured.' });
    }

    const result = await fetchUpstreamJson(
      screenerUrl(apiKey, BOARDS[board], BOARD_SIZE, [
        ['exchange', '=', 'us'],
        ['market_capitalization', '>', MIN_MARKET_CAP],
        ['adjusted_close', '>', MIN_PRICE],
        ['avgvol_1d', '>', MIN_VOLUME],
      ]),
      timeoutMs,
      'market movers',
      '/api/movers',
      { fetchImpl },
    );
    if (!result.ok) return res.status(result.failure.status).json(failureBody(result.failure));

    const rows = mapMoverRows(result.body);
    if (rows === null) {
      console.error('/api/movers: upstream response had an unexpected shape');
      return res.status(502).json({
        error: 'bad_response',
        message: 'The market-movers provider returned an unexpected shape.',
      });
    }

    // Half an hour: the screener recomputes once a day, so the only thing a
    // shorter TTL buys is a faster view of a board that has not changed. The
    // window is short enough that the evening's new session lands promptly.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=1800, stale-while-revalidate=86400');
    return res.status(200).json({
      board,
      source: 'eodhd:screener',
      lastClose: true,
      rows,
    } satisfies MoversBody);
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
