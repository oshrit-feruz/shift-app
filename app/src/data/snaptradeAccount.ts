/**
 * LIVE data source — the reader's own brokerage accounts, read through
 * SnapTrade.
 *
 * WHAT THIS IS: per-user, read-only brokerage linking on SnapTrade's
 * Commercial tier. Each reader registers as a SnapTrade user of their own,
 * links their brokerage in SnapTrade's hosted Connection Portal, and this
 * reads back their balances and positions. It replaced a single-account
 * founder demo on the Personal tier, where one fixed account was read and
 * everybody saw the same one.
 *
 * WHERE THE CREDENTIALS ARE: not here. The per-user `userSecret` SnapTrade
 * issues lives in a Supabase table only the service role can read
 * (supabase/migrations/0007_snaptrade_users.sql) and is used only by
 * /api/snaptrade. Nothing in this file has, or could have, access to it — the
 * browser sends its own Supabase access token and the server decides which
 * person that is.
 *
 * READ ONLY: the endpoint behind this asks SnapTrade for a `read` connection
 * and only ever reads accounts, balances and positions. No trading path is
 * reachable from the app at all.
 *
 * DATA HONESTY CONTRACT, the same one recoveryDetector.ts holds:
 * - Zero connected accounts is a successful, legitimate ok — that is the true
 *   state before a brokerage has been linked, and the screen renders it as an
 *   honest "nothing connected yet", never as an error and never as a
 *   placeholder holding.
 * - Any failure — network, timeout, non-2xx, unparseable body, or a shape we
 *   do not recognise — returns 'unavailable' with a specific reason. It must
 *   NEVER fall back to the demo adapter's numbers: showing invented positions
 *   where a real account was promised is the exact failure this integration
 *   exists to disprove.
 * - Individual missing fields become null and render as "—". A price the
 *   brokerage did not report is shown as unknown, never back-filled.
 */

import { supabase } from '../lib/supabase';
import {
  ok,
  unavailable,
  type ConnectedAccount,
  type ConnectedAccountsResult,
  type ConnectedConnection,
  type Loadable,
} from './types';

/** The server-side route that holds the SnapTrade credentials. */
export const SNAPTRADE_ENDPOINT = '/api/snaptrade';

/**
 * Generous: the request fans out to several upstream SnapTrade calls, and a
 * brokerage that is mid-sync can be slow. Still bounded, so a hung request
 * fails visibly rather than leaving the screen spinning forever.
 */
const TIMEOUT_MS = 20_000;

/**
 * Reasons the user actually sees. Each says something true and specific —
 * "you are not signed in" is actionable in a way that a generic "try again
 * later" would not be, and pretending a configuration fault is a transient
 * glitch would send someone retrying a button that cannot work.
 */
const REASONS = {
  notConfigured: {
    en: 'Brokerage connections are not configured on the server.',
    he: 'חיבור חשבונות ברוקר אינו מוגדר בשרת.',
  },
  notSignedIn: {
    en: 'Sign in to see your connected brokerage accounts.',
    he: 'צריך להתחבר כדי לראות את חשבונות הברוקר המקושרים.',
  },
  notAuthorized: {
    en: 'SnapTrade rejected this app’s credentials.',
    he: 'SnapTrade דחתה את פרטי הגישה של האפליקציה.',
  },
  rateLimited: {
    en: 'SnapTrade rate-limited this request. Try again in a minute.',
    he: 'SnapTrade הגבילה את קצב הבקשות. אפשר לנסות שוב בעוד דקה.',
  },
  unreachable: {
    en: 'Could not reach SnapTrade.',
    he: 'לא הצלחנו להגיע ל-SnapTrade.',
  },
  badShape: {
    en: 'SnapTrade returned data in a shape we do not recognise.',
    he: 'SnapTrade החזירה נתונים במבנה שאיננו מזהים.',
  },
  timeout: {
    en: 'SnapTrade did not answer in time.',
    he: 'SnapTrade לא הגיבה בזמן.',
  },
  identity: {
    en: 'Could not read your brokerage connection. Please try again.',
    he: 'לא הצלחנו לקרוא את חיבור הברוקר שלך. אפשר לנסות שוב.',
  },
  notConnected: {
    en: 'That brokerage connection is not one of yours.',
    he: 'החיבור הזה אינו שלך.',
  },
} as const;

export type Reason = { en: string; he: string };

/**
 * The reason behind a Loadable that did not succeed, for a caller that shows
 * it in place rather than through DataState.
 *
 * `Loadable` includes 'loading', which these fetchers never return — they
 * resolve to ok or unavailable — but the type allows it, and narrowing on
 * `!== 'ok'` therefore leaves a branch with no reason on it. Asked here once
 * so two call sites do not each write the same narrowing.
 */
export function reasonOf(result: Loadable<unknown>): Reason | null {
  return result.status === 'unavailable' ? (result.reason ?? null) : null;
}

/**
 * Maps the route's error code to the reason shown on screen. The codes are
 * the shared upstream-failure taxonomy the other API routes use
 * (api/_lib/upstream.ts) plus this route's own, so a code added there gets a
 * real message here rather than silently collapsing into the generic one.
 */
function reasonFor(code: unknown): Reason {
  switch (code) {
    case 'not_configured':
      return REASONS.notConfigured;
    case 'unauthorized':
      return REASONS.notSignedIn;
    case 'upstream_unauthorized':
    case 'upstream_forbidden':
      return REASONS.notAuthorized;
    case 'upstream_rate_limited':
      return REASONS.rateLimited;
    case 'upstream_timeout':
      return REASONS.timeout;
    case 'bad_response':
      return REASONS.badShape;
    case 'identity_unreadable':
    case 'identity_not_saved':
      return REASONS.identity;
    case 'not_connected':
    case 'invalid_connection':
      return REASONS.notConnected;
    default:
      return REASONS.unreachable;
  }
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** A finite number, or null. Never coerces an absent field to 0. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Re-validates the route's payload on the client rather than trusting its
 * shape. The route already maps defensively, but this file is the last thing
 * between a response and a number on screen, and a field that silently
 * arrives as undefined would otherwise render as "NaN" or a blank that looks
 * like a real zero.
 */
function parseAccount(raw: unknown): ConnectedAccount | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const a = raw as Record<string, unknown>;
  const id = str(a.id);
  if (!id) return null;
  const positions = Array.isArray(a.positions) ? a.positions : [];
  const balances = Array.isArray(a.balances) ? a.balances : [];
  return {
    id,
    name: str(a.name),
    numberMasked: str(a.numberMasked),
    institution: str(a.institution),
    currency: str(a.currency),
    totalValue: num(a.totalValue),
    asOf: str(a.asOf),
    // Anything but the explicit real-time marker is treated as the daily
    // cache: the weaker claim is the safe default when the field is absent.
    source: a.source === 'realtime' ? 'realtime' : 'daily',
    balances: balances
      .filter((b): b is Record<string, unknown> => typeof b === 'object' && b !== null)
      .map((b) => ({ currency: str(b.currency), cash: num(b.cash), buyingPower: num(b.buyingPower) })),
    positions: positions
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p) => ({
        ticker: str(p.ticker) ?? '',
        description: str(p.description),
        units: num(p.units),
        price: num(p.price),
        marketValue: num(p.marketValue),
        avgCost: num(p.avgCost),
        openPnl: num(p.openPnl),
        currency: str(p.currency),
      }))
      .filter((p) => p.ticker !== ''),
  };
}

/**
 * Re-validates a connection row. Same reason parseAccount() exists: this file
 * is the last thing between the response and the screen, and a field that
 * silently arrived as undefined would render as a confident blank.
 */
function parseConnection(raw: unknown): ConnectedConnection | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const id = str(c.id);
  if (!id) return null;
  return {
    id,
    brokerage: str(c.brokerage),
    disabled: typeof c.disabled === 'boolean' ? c.disabled : null,
    type: str(c.type),
    dataFreshnessMode: str(c.dataFreshnessMode),
    accountCount: num(c.accountCount) ?? 0,
  };
}

/**
 * The caller's own Supabase access token, or null when they are not signed in
 * (or the client is not configured at all).
 *
 * This is the whole of the app's side of the authorisation: the token says
 * who is asking, and the server decides which person's brokerage that is.
 * Nothing about the brokerage connection itself is held in the browser.
 */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** The reason behind a non-2xx, read from the route's own error code. */
async function failureReason(res: Response): Promise<Reason> {
  let code: unknown;
  try {
    code = ((await res.json()) as { error?: unknown }).error;
  } catch {
    /* an error response that isn't JSON — the generic reason is right */
  }
  return reasonFor(code);
}

/** One request to the route, authenticated, under a bounded timeout. */
async function call(
  fetchImpl: typeof fetch,
  init: { method?: string; path?: string } = {},
): Promise<{ ok: true; body: unknown } | { ok: false; reason: Reason }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await accessToken();
    const res = await fetchImpl(`${SNAPTRADE_ENDPOINT}${init.path ?? ''}`, {
      method: init.method ?? 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return { ok: false, reason: await failureReason(res) };
    return { ok: true, body: (await res.json()) as unknown };
  } catch (err) {
    return {
      ok: false,
      reason:
        err instanceof DOMException && err.name === 'AbortError' ? REASONS.timeout : REASONS.unreachable,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `fetchImpl` is injectable so every honest-state branch can be unit-tested
 * without a network, exactly as fetchSatelliteSignals() does it.
 */
export async function fetchConnectedAccounts(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<ConnectedAccountsResult>> {
  const result = await call(fetchImpl);
  if (!result.ok) return unavailable(result.reason);

  const rawAccounts = (result.body as { accounts?: unknown })?.accounts;
  if (!Array.isArray(rawAccounts)) return unavailable(REASONS.badShape);

  const accounts = rawAccounts.map(parseAccount).filter((a): a is ConnectedAccount => a !== null);
  const rawConnections = (result.body as { connections?: unknown })?.connections;
  const connections = (Array.isArray(rawConnections) ? rawConnections : [])
    .map(parseConnection)
    .filter((c): c is ConnectedConnection => c !== null);
  // An empty account list is a real answer, and `connections` says which
  // kind: none at all means no brokerage is linked; one or more means a
  // live connection whose brokerage reported no accounts. The screen
  // renders those as two different states, because they are.
  return ok({ accounts, connections });
}

/**
 * A link to SnapTrade's Connection Portal, for the caller to open.
 *
 * The URL expires five minutes after it is issued, which is why it is
 * fetched when the button is pressed rather than when the screen loads: a
 * link prepared in advance would be dead by the time anyone used it.
 *
 * Returning the URL rather than navigating means the caller decides how to
 * open it, and the honest states — not signed in, not configured, SnapTrade
 * unreachable — come back as reasons the screen can show in place instead of
 * a blank tab.
 */
export async function fetchConnectionPortalUrl(
  fetchImpl: typeof fetch = fetch,
  theme: 'dark' | 'light' = 'dark',
): Promise<Loadable<string>> {
  const result = await call(fetchImpl, { method: 'POST', path: `?theme=${theme}` });
  if (!result.ok) return unavailable(result.reason);
  const url = str((result.body as { redirectUri?: unknown })?.redirectUri);
  // Only an https URL, and only from our own route. A portal link is
  // somewhere a person is about to be sent to type brokerage credentials, so
  // "whatever the response contained" is not good enough.
  if (!url || !url.startsWith('https://')) return unavailable(REASONS.badShape);
  return ok(url);
}

/**
 * Remove one of the caller's brokerage connections.
 *
 * `ok(true)` means SnapTrade accepted the removal, which it performs
 * asynchronously — so the caller re-reads the account list rather than
 * assuming the connection is already gone.
 */
export async function disconnectBrokerage(
  connectionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<true>> {
  const result = await call(fetchImpl, {
    method: 'DELETE',
    path: `?connectionId=${encodeURIComponent(connectionId)}`,
  });
  if (!result.ok) return unavailable(result.reason);
  return ok(true);
}
