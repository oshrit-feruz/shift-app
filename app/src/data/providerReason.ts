/**
 * Turns an API error body into the bilingual reason a screen shows.
 *
 * The Vercel functions answer every failure with `{ error, message }`, and
 * until now the data layer threw that away and rendered one generic
 * "unavailable" for all of them. That is honest about the failure and silent
 * about its nature — and the three cases behave completely differently:
 *
 *   - a plan or key the provider refuses  -> will never fix itself; the
 *     subscription has to change, and retrying is pointless
 *   - a spent quota                       -> fixes itself, tomorrow
 *   - a provider timeout or outage        -> fixes itself, probably soon
 *
 * Telling someone to "try again later" for the first one is the polite
 * version of a wrong answer. The messages stay non-technical: a reader is
 * told what kind of problem it is, not the upstream status code (that stays
 * in the JSON body for whoever is debugging).
 */

export interface Reason {
  en: string;
  he: string;
}

/**
 * Codes come from api/_lib/upstream.ts, plus `not_configured` which the
 * handlers raise when the server has no API key at all. Anything else falls
 * back to the caller's own surface-specific wording.
 */
const REASONS: Record<string, Reason> = {
  upstream_unauthorized: {
    en: 'The data provider rejected this app’s credentials.',
    he: 'ספק הנתונים דחה את פרטי הגישה של האפליקציה.',
  },
  upstream_forbidden: {
    en: 'The data provider refused the request — this subscription may not include this data.',
    he: 'ספק הנתונים סירב לבקשה — ייתכן שהמנוי אינו כולל את הנתונים האלה.',
  },
  upstream_rate_limited: {
    en: 'The data provider’s request quota has run out for now.',
    he: 'מכסת הבקשות אצל ספק הנתונים נוצלה כרגע.',
  },
  upstream_timeout: {
    en: 'The data provider did not respond in time.',
    he: 'ספק הנתונים לא הגיב בזמן.',
  },
  not_configured: {
    en: 'This service is not configured on the server.',
    he: 'השירות אינו מוגדר בשרת.',
  },
};

/**
 * Read a failed response's body for a known error code. Never throws, and
 * never invents: an unreadable or unrecognised body yields `fallback`, the
 * same generic wording as before.
 *
 * The body can only be read once, so this consumes it — callers are past the
 * point of wanting anything else from a failed response.
 */
export async function reasonFromResponse(res: Response, fallback: Reason): Promise<Reason> {
  try {
    const body: unknown = await res.json();
    if (body === null || typeof body !== 'object') return fallback;
    const code = (body as Record<string, unknown>).error;
    if (typeof code !== 'string') return fallback;
    return REASONS[code] ?? fallback;
  } catch {
    return fallback;
  }
}
