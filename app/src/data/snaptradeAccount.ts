/**
 * LIVE data source — the signed-in user's own brokerage accounts, read
 * through SnapTrade.
 *
 * WHAT THIS IS: a real product capability. Each user registers as their own
 * SnapTrade user, authorises a READ-ONLY connection in SnapTrade's hosted
 * Connection Portal, and this module reads what that connection reports. The
 * brokerage credentials are entered at SnapTrade and never touch this app;
 * what the app holds is a per-user secret, sealed server-side (see
 * app/api/_lib/secretBox.ts). Every request here carries the user's Supabase
 * access token, and the route resolves the account from that token alone — so
 * there is no way to ask this endpoint for somebody else's portfolio.
 *
 * READ ONLY: the endpoint behind this only ever issues GETs against
 * SnapTrade's accounts, balances and positions paths, and the connection
 * itself was granted as `read`. No trading path is reachable from the app at
 * all.
 *
 * DATA HONESTY CONTRACT, the same one recoveryDetector.ts holds:
 * - Not signed in, or signed in with nothing connected, is a successful
 *   ok({ linked: false, … }). That is the true state before a brokerage has
 *   been linked, and the app falls back to its own data rather than to an
 *   error.
 * - Zero accounts with `linked: true` is also a successful, legitimate answer
 *   — the brokerage reported none — and the screen says so rather than
 *   claiming nothing was ever connected.
 * - Any failure — network, timeout, non-2xx, unparseable body, or a shape we
 *   do not recognise — returns 'unavailable' with a specific reason. It must
 *   NEVER fall back to the demo adapter's numbers: showing invented positions
 *   where a real account was promised is the exact failure this integration
 *   exists to disprove.
 * - Individual missing fields become null and render as "—". A price the
 *   brokerage did not report is shown as unknown, never back-filled.
 */

import { supabase } from '../lib/supabase';
import { setLinked } from './linkState';
import {
  ok,
  unavailable,
  type ConnectedAccount,
  type ConnectedAccountsResult,
  type ConnectedConnection,
  type Loadable,
} from './types';

/** The server-side proxy that holds the SnapTrade client credentials. */
export const SNAPTRADE_ENDPOINT = '/api/snaptrade';
/** Where a connection is created and revoked. */
export const SNAPTRADE_LINK_ENDPOINT = '/api/snaptrade-link';

/**
 * Generous: the request fans out to three upstream SnapTrade calls, and a
 * brokerage that is mid-sync can be slow. Still bounded, so a hung request
 * fails visibly rather than leaving the screen spinning forever.
 */
const TIMEOUT_MS = 20_000;

/**
 * Reasons the user actually sees. Each says something true and specific —
 * "sign in again" and "try again in a moment" ask for different things, and
 * pretending a configuration fault is a transient glitch would send someone
 * retrying a button that cannot work.
 */
const REASONS = {
  notConfigured: {
    en: 'Connected accounts are not configured on this deployment.',
    he: 'חיבור חשבונות אינו מוגדר בגרסה הזו.',
  },
  notAuthorized: {
    en: 'SnapTrade rejected this app\u2019s credentials.',
    he: 'SnapTrade דחתה את פרטי ההתחברות של האפליקציה.',
  },
  signedOut: {
    en: 'Your session has expired. Sign in again to see your account.',
    he: 'תוקף ההתחברות פג. יש להתחבר שוב כדי לראות את החשבון.',
  },
  sessionUnavailable: {
    en: 'Could not verify your session. Try again in a moment.',
    he: 'לא הצלחנו לאמת את ההתחברות. אפשר לנסות שוב בעוד רגע.',
  },
  linkUnreadable: {
    en: 'The stored brokerage connection could not be read. Disconnect and connect again.',
    he: 'לא ניתן לקרוא את החיבור השמור לברוקר. יש לנתק ולחבר מחדש.',
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
} as const;

/**
 * Maps the proxy's error code to the reason shown on screen. The codes are
 * the shared upstream-failure taxonomy the other API routes use
 * (api/_lib/upstream.ts), so a code added there gets a real message here
 * rather than silently collapsing into the generic one.
 */
function reasonFor(code: unknown): { en: string; he: string } {
  switch (code) {
    case 'not_configured':
      return REASONS.notConfigured;
    case 'unauthorized':
      return REASONS.signedOut;
    // Never collapsed into 'unauthorized': the session may be perfectly
    // valid and simply unverifiable this second, and telling someone to sign
    // in again over a failed network hop is a lie with an action attached.
    case 'session_unavailable':
    case 'link_unavailable':
      return REASONS.sessionUnavailable;
    case 'link_unreadable':
      return REASONS.linkUnreadable;
    case 'upstream_unauthorized':
    case 'upstream_forbidden':
      return REASONS.notAuthorized;
    case 'upstream_rate_limited':
      return REASONS.rateLimited;
    case 'upstream_timeout':
      return REASONS.timeout;
    case 'bad_response':
      return REASONS.badShape;
    default:
      return REASONS.unreachable;
  }
}

/** A non-empty trimmed string, or null. An all-whitespace name is absent,
 * not a name made of spaces. */
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** A finite number, or null. Never coerces an absent field to 0. */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Re-validates the proxy's payload on the client rather than trusting its
 * shape. The proxy already maps defensively, but this file is the last thing
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
 * The caller's access token and user id, or nulls when nobody is signed in.
 *
 * Read per request rather than held: Supabase refreshes the token in the
 * background, and one captured on mount would start failing an hour into a
 * session. The id rides along because every answer here is about a named
 * person and must be recorded against them, never against "whoever is signed
 * in by the time the response lands".
 */
async function currentUser(): Promise<{ token: string; userId: string } | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const userId = data.session?.user?.id;
  return token && userId ? { token, userId } : null;
}

/**
 * Whether the session still belongs to the user a request was made for.
 *
 * Every read here captures its user before awaiting the network, and the
 * network is where a sign-out or an account switch happens. Without this
 * check, user A's answer landing after user B signed in would be written down
 * as the current one — the auth layer clears on the switch, but it cannot
 * cancel a request already in flight. So the write, not the read, is where
 * the check belongs: results are still returned to whoever asked, and only
 * *recording* them is refused once they are about somebody who has left.
 */
async function stillSignedInAs(userId: string): Promise<boolean> {
  return (await currentUser())?.userId === userId;
}

/**
 * Counts the times the link state has been changed by an act of the user
 * rather than by an observation of it — which today means one thing: a
 * completed disconnect.
 *
 * This is the same-user ordering the session check cannot cover. An account
 * read started before a disconnect can land after it, and its answer is a
 * true description of a moment that has since passed. Recording it would put
 * `linked` back to true for a connection the user has just revoked.
 */
let linkStateRevision = 0;

/**
 * Whether an observation made at `revision`, about `userId`, is still worth
 * writing down — the same person is signed in, and nothing has deliberately
 * changed the link state since the read began.
 *
 * The revision is compared *after* the session lookup, because that lookup is
 * itself an await and a disconnect can complete during it.
 */
async function mayRecord(userId: string, revision: number): Promise<boolean> {
  const sameUser = await stillSignedInAs(userId);
  return sameUser && revision === linkStateRevision;
}

/** The answer for someone with no connection: true, complete, and not an error. */
const NOT_LINKED: ConnectedAccountsResult = { linked: false, accounts: [], connections: [] };

/**
 * `fetchImpl` is injectable so every honest-state branch can be unit-tested
 * without a network, exactly as fetchSatelliteSignals() does it.
 */
export async function fetchConnectedAccounts(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<ConnectedAccountsResult>> {
  // Captured before anything is awaited, so a disconnect that happens while
  // this read is on the wire can be told apart from one that happened before
  // it started.
  const revision = linkStateRevision;
  const caller = await currentUser();
  // Signed out. Not a failure and not worth a request: there is no user for
  // the route to resolve, and the app's own data is what a signed-out reader
  // sees anyway. Nothing is recorded, because there is nobody to record it
  // against — the auth layer clears the remembered answer on sign-out.
  if (!caller) return ok(NOT_LINKED);
  const { token, userId } = caller;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SNAPTRADE_ENDPOINT, {
      signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });

    // The proxy's error bodies carry a code; read it so the screen can say
    // something specific rather than a blanket "unavailable".
    if (!res.ok) {
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown }).error;
      } catch {
        /* an error response that isn't JSON — the generic reason is right */
      }
      return unavailable(reasonFor(code));
    }

    const body = (await res.json()) as unknown;
    const rawAccounts = (body as { accounts?: unknown })?.accounts;
    if (!Array.isArray(rawAccounts)) return unavailable(REASONS.badShape);

    // The server's word on whether anything is connected, remembered so the
    // next load of every screen starts in the right shape (data/linkState.ts)
    // — and recorded against the user it is about, so a response that lands
    // after a sign-out or an account switch cannot be read as the new user's.
    const linked = (body as { linked?: unknown })?.linked === true;
    if (await mayRecord(userId, revision)) setLinked(linked, userId);

    const accounts = rawAccounts.map(parseAccount).filter((a): a is ConnectedAccount => a !== null);
    const rawConnections = (body as { connections?: unknown })?.connections;
    const connections = (Array.isArray(rawConnections) ? rawConnections : [])
      .map(parseConnection)
      .filter((c): c is ConnectedConnection => c !== null);
    // An empty account list is a real answer, and `linked` plus `connections`
    // say which kind: never connected, connected with the brokerage reporting
    // nothing, or a connection that has since been disabled. The screen
    // renders those as different states, because they are.
    return ok({ linked, accounts, connections });
  } catch (err) {
    return unavailable(
      err instanceof DOMException && err.name === 'AbortError' ? REASONS.timeout : REASONS.unreachable,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Budget for the two link calls. Shorter than a holdings read: neither talks
 * to a brokerage, and a person is waiting on a button with both of them.
 */
const LINK_TIMEOUT_MS = 15_000;

const LINK_REASONS = {
  signedOut: REASONS.signedOut,
  conflict: {
    en: 'A previous connection is still being removed. Try again in a moment.',
    he: 'חיבור קודם עדיין בהסרה. אפשר לנסות שוב בעוד רגע.',
  },
} as const;

/** One authenticated call to the link route, with the shared failure mapping. */
async function linkRequest(
  method: 'POST' | 'DELETE',
  fetchImpl: typeof fetch,
): Promise<Loadable<{ body: unknown; userId: string }>> {
  const caller = await currentUser();
  if (!caller) return unavailable(LINK_REASONS.signedOut);
  const { token, userId } = caller;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(SNAPTRADE_LINK_ENDPOINT, {
      method,
      signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* a body that isn't JSON — the status still tells the story */
    }
    if (!res.ok) {
      const code = body !== null && typeof body === 'object' ? (body as { error?: unknown }).error : null;
      return unavailable(code === 'link_reset' ? LINK_REASONS.conflict : reasonFor(code));
    }
    return ok({ body, userId });
  } catch (err) {
    return unavailable(
      err instanceof DOMException && err.name === 'AbortError' ? REASONS.timeout : REASONS.unreachable,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Starts a connection: asks the server for a Connection Portal URL to send
 * this user to.
 *
 * The URL is the whole point of the flow and the reason it is legitimate —
 * the brokerage login happens there, at SnapTrade, under the user's own eyes,
 * and this app never handles the credentials. SnapTrade expires the link
 * after about five minutes, so it is used immediately rather than stored.
 */
export async function startBrokerageConnection(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<{ redirectURI: string }>> {
  const result = await linkRequest('POST', fetchImpl);
  if (result.status !== 'ok') return result;
  const uri = (result.data.body as { redirectURI?: unknown })?.redirectURI;
  if (typeof uri !== 'string' || !uri) return unavailable(REASONS.badShape);
  return ok({ redirectURI: uri });
}

/**
 * Revokes the connection — at SnapTrade, not just here. On success the
 * remembered link state is cleared, so every screen shaped around a real
 * account returns to the app's own data in the same tick.
 */
export async function disconnectBrokerage(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<{ disconnected: true }>> {
  const result = await linkRequest('DELETE', fetchImpl);
  if (result.status !== 'ok') return result;
  if ((result.data.body as { disconnected?: unknown })?.disconnected !== true) {
    return unavailable(REASONS.badShape);
  }
  // Any account read already in flight described a connection that no longer
  // exists, so its answer is out of date whoever it turns out to be about.
  linkStateRevision += 1;
  // Same rule as the account read: a disconnect that completes after someone
  // else has signed in must not tell the app THEY have nothing connected.
  if (await stillSignedInAs(result.data.userId)) setLinked(false, result.data.userId);
  return ok({ disconnected: true });
}
