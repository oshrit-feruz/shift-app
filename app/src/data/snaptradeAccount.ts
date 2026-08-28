/**
 * LIVE data source — one real brokerage account, read through the
 * founder-demo SnapTrade Personal integration.
 *
 * WHAT THIS IS: a demo-only capability. SnapTrade's Personal tier gives one
 * free clientId/consumerKey pair for a single personal account, connected by
 * the founder through SnapTrade's own hosted Connection Portal. It exists to
 * demonstrate "we can connect to a real brokerage account and read it" with
 * actual data instead of a mockup.
 *
 * WHAT THIS IS NOT: how end users would ever link accounts. That needs
 * SnapTrade's Commercial tier, per-user registration and userSecret storage,
 * KYC and billing — a separate product decision that has not been made. See
 * the README. Nothing in this file is multi-user, and it must not be mistaken
 * for the shape of one that is.
 *
 * READ ONLY: the endpoint behind this only ever issues GETs against
 * SnapTrade's accounts, balances and positions paths. No trading path is
 * reachable from the app at all.
 *
 * DATA HONESTY CONTRACT, the same one recoveryDetector.ts holds:
 * - Zero connected accounts is a successful, legitimate ok([]) — that is the
 *   true state before a brokerage has been linked, and the screen renders it
 *   as an honest "nothing connected yet", never as an error and never as a
 *   placeholder holding.
 * - Any failure — network, timeout, non-2xx, unparseable body, or a shape we
 *   do not recognise — returns 'unavailable' with a specific reason. It must
 *   NEVER fall back to the demo adapter's numbers: showing invented positions
 *   where a real account was promised is the exact failure this integration
 *   exists to disprove.
 * - Individual missing fields become null and render as "—". A price the
 *   brokerage did not report is shown as unknown, never back-filled.
 */

import { ok, unavailable, type ConnectedAccount, type Loadable } from './types';

/** The server-side proxy that holds the SnapTrade Personal credentials. */
export const SNAPTRADE_ENDPOINT = '/api/snaptrade';

/**
 * Generous: the request fans out to three upstream SnapTrade calls, and a
 * brokerage that is mid-sync can be slow. Still bounded, so a hung request
 * fails visibly rather than leaving the screen spinning forever.
 */
const TIMEOUT_MS = 20_000;

/**
 * Reasons the user actually sees. Each says something true and specific —
 * "the demo credentials are not set" is actionable in a way that a generic
 * "try again later" would not be, and pretending a configuration fault is a
 * transient glitch would send someone retrying a button that cannot work.
 */
const REASONS = {
  notConfigured: {
    en: 'The SnapTrade demo credentials are not set on the server.',
    he: 'פרטי ההתחברות של SnapTrade אינם מוגדרים בשרת.',
  },
  notAuthorized: {
    en: 'SnapTrade rejected the demo credentials.',
    he: 'SnapTrade דחתה את פרטי ההתחברות של ההדגמה.',
  },
  rateLimited: {
    en: 'SnapTrade rate-limited this request. Try again in a minute.',
    he: 'SnapTrade הגבילה את קצב הבקשות. נסי שוב בעוד דקה.',
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
 * `fetchImpl` is injectable so every honest-state branch can be unit-tested
 * without a network, exactly as fetchSatelliteSignals() does it.
 */
export async function fetchConnectedAccounts(
  fetchImpl: typeof fetch = fetch,
): Promise<Loadable<ConnectedAccount[]>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(SNAPTRADE_ENDPOINT, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
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

    const accounts = rawAccounts
      .map(parseAccount)
      .filter((a): a is ConnectedAccount => a !== null);
    // An empty list is a real answer — no brokerage linked yet — and is
    // returned as ok([]) so the screen shows the honest empty state.
    return ok(accounts);
  } catch (err) {
    return unavailable(
      err instanceof DOMException && err.name === 'AbortError' ? REASONS.timeout : REASONS.unreachable,
    );
  } finally {
    clearTimeout(timer);
  }
}
