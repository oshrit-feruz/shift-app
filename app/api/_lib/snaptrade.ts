/**
 * Pure helpers for the /api/snaptrade proxy — request signing and upstream
 * response mapping, kept out of the handler so they can be unit-tested
 * without a request/response pair or a mocked global fetch. Same split as
 * _lib/news.ts.
 *
 * SCOPE — READ ONLY, PERSONAL TIER, ONE ACCOUNT:
 * This module knows about exactly three SnapTrade paths, all GET, all
 * read-only (see READ_ONLY_PATHS in ../snaptrade.ts). Nothing here can
 * describe an order, and no trading path appears anywhere in this file.
 */

import { createHmac } from 'node:crypto';

/** SnapTrade's API root. The signed path carries the same `/api/v1` prefix. */
export const SNAPTRADE_BASE = 'https://api.snaptrade.com/api/v1';

/**
 * Canonical JSON as SnapTrade's signing spec defines it: object keys sorted
 * alphabetically at every level, no insignificant whitespace, UTF-8.
 *
 * Arrays keep their order — order is meaningful in an array and sorting one
 * would change the value, not just its spelling. Only object keys are sorted.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * The `Signature` header for one SnapTrade request: base64 HMAC-SHA256, keyed
 * with the consumer key, over the canonical JSON of { content, path, query }.
 *
 * `path` must include the `/api/v1` prefix and exclude the query string;
 * `query` is the raw query string without the leading `?` and must be byte-for-
 * byte what is actually sent — which is why the caller builds the query string
 * once and passes the same string here and to fetch(). Re-encoding it
 * separately for the URL is the classic way to get a 401 that looks like a bad
 * key.
 *
 * `content` is the request body; every call this app makes is a GET, so it is
 * always null here. It stays a parameter rather than a hardcoded null only so
 * the signing rule is expressed completely and testably.
 */
export function computeSignature({
  path,
  query,
  consumerKey,
  content = null,
}: {
  path: string;
  query: string;
  consumerKey: string;
  content?: unknown;
}): string {
  const payload = canonicalJson({ content: content ?? null, path, query });
  return createHmac('sha256', consumerKey).update(payload, 'utf8').digest('base64');
}

/**
 * The query string carried by every request: the Personal clientId and a Unix
 * timestamp. Deliberately no userId/userSecret — under Personal API key auth
 * SnapTrade resolves the user from the key itself, and a Personal user has no
 * userSecret to send (docs.snaptrade.com/docs/personal-vs-commercial).
 */
export function buildQuery(clientId: string, timestampSec: number): string {
  return `clientId=${encodeURIComponent(clientId)}&timestamp=${timestampSec}`;
}

/** First candidate that is a non-empty string, trimmed. Upstream field names vary by brokerage. */
function str(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * First candidate that is a real, finite number. Numeric strings are tolerated
 * (some brokerages send "12.50"), but anything else — including NaN and an
 * empty string — becomes null rather than 0. A position whose price we do not
 * know renders as "—"; it is never back-filled with a zero that would read as
 * a real, and very wrong, number.
 */
function num(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Reads a nested property path defensively, returning undefined at the first non-object. */
function at(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/**
 * Masks a brokerage account number down to its last four characters before it
 * ever leaves the server. The demo only needs to prove "this is a real account
 * we are reading"; the full number adds nothing to that and this response is
 * served from a public URL.
 */
export function maskAccountNumber(raw: unknown): string | null {
  const s = str(raw);
  if (!s) return null;
  return s.length <= 4 ? `••${s}` : `••${s.slice(-4)}`;
}

export interface ConnectedPosition {
  ticker: string;
  description: string | null;
  units: number | null;
  price: number | null;
  /** units × price when both are known — never a partial or guessed product. */
  marketValue: number | null;
  avgCost: number | null;
  openPnl: number | null;
  currency: string | null;
}

export interface ConnectedBalance {
  currency: string | null;
  cash: number | null;
  buyingPower: number | null;
}

export interface ConnectedAccount {
  id: string;
  name: string | null;
  /** Already masked (see maskAccountNumber) — the full number never leaves the server. */
  numberMasked: string | null;
  institution: string | null;
  currency: string | null;
  /** Total account value as the brokerage reports it, or null when it doesn't. */
  totalValue: number | null;
  balances: ConnectedBalance[];
  positions: ConnectedPosition[];
  /**
   * When the brokerage data behind these positions was fetched, from
   * SnapTrade's `data_freshness.as_of`. Null when it did not say — the screen
   * then shows no freshness claim at all rather than implying "live".
   */
  asOf: string | null;
  /**
   * Which route answered: the daily cache, or the per-connection real-time
   * one used when the cache had nothing yet.
   */
  source: 'daily' | 'realtime';
}

/**
 * Maps one raw SnapTrade account. Returns null when the row has no usable id —
 * an account we cannot address is dropped rather than shown with a fabricated
 * identity, and dropping it is what makes the honest empty state honest.
 */
export function mapAccount(
  raw: unknown,
): Omit<ConnectedAccount, 'balances' | 'positions' | 'asOf' | 'source'> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const id = str(a.id);
  if (!id) return null;
  return {
    id,
    name: str(a.name),
    numberMasked: maskAccountNumber(a.number),
    institution: str(a.institution_name, a.brokerage_authorization, at(a, 'institution', 'name')),
    currency: str(at(a, 'balance', 'total', 'currency'), at(a, 'meta', 'currency')),
    totalValue: num(at(a, 'balance', 'total', 'amount'), a.total_value, at(a, 'total_value', 'value')),
  };
}

/** Maps one raw balance row. Missing numbers stay null. */
export function mapBalance(raw: unknown): ConnectedBalance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const b = raw as Record<string, unknown>;
  const currency = str(at(b, 'currency', 'code'), b.currency);
  const cash = num(b.cash, at(b, 'cash', 'amount'));
  const buyingPower = num(b.buying_power, b.buyingPower);
  // A row that carries no currency and no number at all says nothing; drop it
  // rather than render an empty line that looks like a real zero balance.
  if (currency === null && cash === null && buyingPower === null) return null;
  return { currency, cash, buyingPower };
}

/**
 * Unwraps the positions envelope.
 *
 * `/accounts/{id}/positions/all` answers an OBJECT —
 * `{ results: [...], data_freshness: { as_of } }` — not a bare array. Reading
 * it as an array silently yields zero positions, which would render a real
 * account full of holdings as "no positions": invented emptiness presented as
 * fact, with no error anywhere. So an unrecognised envelope returns null and
 * the caller reports `bad_response`. "We could not read it" must never look
 * like "you hold nothing".
 */
export function unwrapPositions(raw: unknown): { rows: unknown[]; asOf: string | null } | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.results)) return null;
  return { rows: body.results, asOf: str(at(body, 'data_freshness', 'as_of')) };
}

/**
 * Maps one raw position, against SnapTrade's `AccountPosition` + `Instrument`
 * schemas.
 *
 * `instrument` is a `oneOf` discriminated on `kind` (stock, etf, adr,
 * mutualfund, cef, crypto, future, cfd, option, other). Every variant that
 * names a security exposes `symbol` and `description` at the same level, so
 * one mapper covers them all; options carry an OCC symbol and map as-is.
 *
 * `units`, `price` and `cost_basis` arrive as decimal STRINGS ("10.5"), which
 * num() already tolerates.
 *
 * A row with no symbol is dropped: an unnamed holding is not something this
 * screen can honestly show.
 */
export function mapPosition(raw: unknown): ConnectedPosition | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const ticker = str(at(p, 'instrument', 'symbol'), at(p, 'instrument', 'raw_symbol'));
  if (!ticker) return null;

  const units = num(p.units);
  const price = num(p.price);
  const avgCost = num(p.cost_basis);

  return {
    ticker,
    description: str(at(p, 'instrument', 'description')),
    units,
    price,
    // Only when both are known. Multiplying a known unit count by an unknown
    // price would produce a confident-looking zero.
    marketValue: units !== null && price !== null ? units * price : null,
    avgCost,
    /**
     * DERIVED, not reported: SnapTrade's position schema carries no open-P&L
     * field at all. This is plain arithmetic over three numbers the brokerage
     * did report, and it is null the moment any of them is missing — it is
     * never estimated, and it renders as "—" rather than as a zero return.
     */
    openPnl: units !== null && price !== null && avgCost !== null ? units * (price - avgCost) : null,
    currency: str(p.currency, at(p, 'instrument', 'currency')),
  };
}
