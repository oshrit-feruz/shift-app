/**
 * Pure helpers for the /api/snaptrade proxy — request signing and upstream
 * response mapping, kept out of the handler so they can be unit-tested
 * without a request/response pair or a mocked global fetch. Same split as
 * _lib/news.ts.
 *
 * SCOPE — READ-ONLY BROKERAGE DATA, PER USER:
 * This module knows about the account, balance, position, connection and
 * user-registration paths in ../snaptrade.ts, and nothing else. Nothing here
 * can describe an order, and no trading path appears anywhere in this file.
 * The one place a trading permission could enter — the connection portal's
 * `connectionType` — is pinned to 'read' in connectBody() below.
 */

import { createHmac } from 'node:crypto';

/** SnapTrade's API root. The signed path carries the same `/api/v1` prefix. */
export const SNAPTRADE_BASE = 'https://api.snaptrade.com/api/v1';

/**
 * Orders two object keys by UTF-16 code unit — the ordering a canonical form
 * requires, and the one the default `.sort()` already gives for strings.
 *
 * Written out rather than left implicit because the alternative is actively
 * wrong here. `String.localeCompare` is locale-sensitive: it sorts
 * ["B","a","Z","é","e"] as [a, B, e, é, Z] where code units give
 * [B, Z, a, e, é]. Either ordering is "alphabetical" to a reader, but only one
 * of them is the ordering SnapTrade's server reproduces when it recomputes the
 * signature — so swapping this for localeCompare would change the canonical
 * JSON, change the HMAC, and 401 every request. It would also make the result
 * depend on the server's locale, which is the opposite of canonical.
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Canonical JSON as SnapTrade's signing spec defines it: object keys sorted at
 * every level, no insignificant whitespace, UTF-8.
 *
 * Arrays keep their order — order is meaningful in an array and sorting one
 * would change the value, not just its spelling. Only object keys are sorted,
 * and by code unit (see byCodeUnit).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort(byCodeUnit)
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
 * `content` is the request body: the object itself for a POST, and null for a
 * GET or a DELETE that carries none. Getting this wrong is invisible until
 * the server recomputes the hash and refuses — the spec is explicit that the
 * body is part of the signed payload, so a POST signed as though it had none
 * fails with the same 401 a bad key gives.
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
 * The query string every request carries: the clientId and a Unix timestamp.
 *
 * This is the whole query only for the two paths that are not about a
 * particular person — registering a user, and nothing else. Every read of
 * someone's accounts adds their credentials; see buildUserQuery.
 */
export function buildQuery(clientId: string, timestampSec: number): string {
  return `clientId=${encodeURIComponent(clientId)}&timestamp=${timestampSec}`;
}

/**
 * The query string for a request about one person: the clientId, a timestamp,
 * and that person's SnapTrade credentials.
 *
 * Commercial API key auth identifies the user in the query rather than from
 * the key, which is what makes per-user linking possible at all — a Personal
 * key resolves to one fixed user and has no userSecret to send
 * (docs.snaptrade.com/docs/authentication-methods).
 *
 * Both values are percent-encoded, and the caller signs THIS EXACT STRING:
 * SnapTrade hashes the raw query as sent, so encoding it again for the URL
 * would produce a valid-looking signature the server rejects.
 *
 * The `userSecret` travels in the query to SnapTrade over TLS and appears
 * nowhere else — never in a response body, never in a log, never in the
 * client. It is read from public.snaptrade_users by the service role alone
 * (supabase/migrations/0007_snaptrade_users.sql).
 *
 * It is optional because one path takes the user without it: deleting a
 * SnapTrade user is authorised by the partner key and the id alone
 * (reference/Authentication/Authentication_deleteSnapTradeUser). Sending a
 * secret a path does not declare would change the signed string for no
 * reason, and on the one path we call after losing access to a secret there
 * may not be one to send.
 */
export function buildUserQuery(
  clientId: string,
  timestampSec: number,
  userId: string,
  userSecret?: string,
): string {
  const base =
    `clientId=${encodeURIComponent(clientId)}&timestamp=${timestampSec}` +
    `&userId=${encodeURIComponent(userId)}`;
  return userSecret === undefined ? base : `${base}&userSecret=${encodeURIComponent(userSecret)}`;
}

/**
 * The body of a connection-portal request.
 *
 * `connectionType: 'read'` is the important line in this file. SnapTrade
 * defaults to read, but this app's product rule is that no trade can ever be
 * placed through it, and a default is a thing that changes — stating it
 * makes the permission the app asks for visible at the one point where a
 * trading connection could be requested by accident.
 *
 * `immediateRedirect` with `customRedirect` sends the person straight back to
 * the app when they finish, instead of leaving them on SnapTrade's own
 * "done" screen wondering where they are. Both are omitted together when
 * there is no origin to return to (see returnTo): an immediate redirect to an
 * empty string is not a weaker version of that, it is a request to send
 * someone nowhere.
 *
 * `locale` is 'en' because SnapTrade ships only `en` and `pt-BR` — this is a
 * Hebrew-first app, and the portal will not be in Hebrew. That is worth
 * saying to the reader before they are sent there, which the UI does, rather
 * than passing a locale the API would reject.
 */
export function connectBody(returnTo: string, darkMode: boolean): Record<string, unknown> {
  return {
    connectionType: 'read',
    connectionPortalVersion: 'v4',
    locale: 'en',
    darkMode,
    ...(returnTo === '' ? {} : { immediateRedirect: true, customRedirect: returnTo }),
  };
}

/**
 * The registration body: the id we address this person by at SnapTrade.
 *
 * Prefixed rather than the bare Supabase uuid so a row in SnapTrade's own
 * dashboard is identifiable as this app's, and immutable per person, which
 * SnapTrade requires of the field.
 */
export function snapTradeUserId(supabaseUserId: string): string {
  return `shift-${supabaseUserId}`;
}

/**
 * The portal URL out of a /snapTrade/login response.
 *
 * Null for the encrypted-response variant the schema also allows (it applies
 * to users registered with an SSH public key, which this app never does) and
 * for any other shape — the caller reports that as a bad response rather
 * than sending someone to `undefined`.
 */
export function readRedirectUri(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const uri = (raw as Record<string, unknown>).redirectURI;
  return typeof uri === 'string' && uri.startsWith('https://') ? uri : null;
}

/**
 * The generated secret out of a /snapTrade/registerUser response.
 *
 * Both fields must be present and be strings: this is the only time
 * SnapTrade ever sends the secret, so a half-read response is a failure to
 * report, never something to store partially.
 */
export function readRegistration(raw: unknown): { userId: string; userSecret: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const userId = str(r.userId);
  const userSecret = str(r.userSecret);
  return userId && userSecret ? { userId, userSecret } : null;
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
  /**
   * The connection this account belongs to (`brokerage_authorization`). Needed
   * to tell whether the connection behind it is still live — a disabled one
   * keeps serving its last cached state, which must never be shown as current.
   */
  connectionId: string | null;
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
    connectionId: str(a.brokerage_authorization, at(a, 'brokerage_authorization', 'id')),
    name: str(a.name),
    numberMasked: maskAccountNumber(a.number),
    institution: str(a.institution_name, at(a, 'institution', 'name')),
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

/**
 * One SnapTrade connection, as `/authorizations` reports it.
 *
 * Carried so a zero-account answer can say WHICH state it is in. A live
 * connection whose brokerage reports no accounts and no connection at all are
 * different facts, and both used to render as "nothing connected yet".
 *
 * States and counts only — nothing here identifies an account.
 */
export interface ConnectedConnection {
  id: string;
  brokerage: string | null;
  /** SnapTrade's own flag: a disabled connection can no longer reach the brokerage. */
  disabled: boolean | null;
  /** 'read' or 'trade'. Ours is read-only, and this is where that is visible. */
  type: string | null;
  /**
   * 'realtime' means SnapTrade queries the brokerage during the call, so an
   * empty account list is the brokerage's current answer rather than a stale
   * cache waiting to refresh.
   */
  dataFreshnessMode: string | null;
  /** How many accounts this connection reported. */
  accountCount: number;
}

/**
 * Maps one raw connection. A row with no id is dropped — it cannot be queried
 * for accounts, so reporting it would describe something we never looked at.
 */
export function mapConnection(raw: unknown): Omit<ConnectedConnection, 'accountCount'> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const id = str(c.id);
  if (!id) return null;
  return {
    id,
    brokerage: str(at(c, 'brokerage', 'display_name'), at(c, 'brokerage', 'name'), c.name),
    disabled: typeof c.disabled === 'boolean' ? c.disabled : null,
    type: str(c.type),
    dataFreshnessMode: str(c.data_freshness_mode),
  };
}
