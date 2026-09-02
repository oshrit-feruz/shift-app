/**
 * The server's side of Supabase: who is calling, and the service-role reads
 * and writes that answer for them.
 *
 * Two routes need this — /api/delete-account, which removes the caller, and
 * /api/snaptrade + /api/snaptrade-link, which read and write the caller's
 * brokerage link. Both establish identity the same way and both must establish
 * it the same way, so it is written once here rather than twice.
 *
 * THE SECURITY PROPERTY, stated where it can be checked: the user id these
 * routes act on comes from asking Supabase who the *access token* belongs to,
 * never from a request body, query or header the caller controls. Decoding the
 * token locally would be faster and would happily read the claims out of a
 * forged or expired one. A caller therefore cannot address anyone but
 * themselves, whatever they send.
 *
 * The service-role key bypasses Row-Level Security entirely and must never
 * reach the browser: it is read from a server-only environment variable,
 * deliberately NOT VITE_-prefixed (the same convention as EODHD_API_KEY).
 */

/**
 * Per-call budget. Well under the functions' 30s maxDuration so a hung
 * Supabase yields the route's own JSON error rather than the platform's 504
 * page — the contract every route here keeps.
 */
export const SUPABASE_TIMEOUT_MS = 10_000;

export interface SupabaseAdminConfig {
  url: string;
  serviceKey: string;
}

/**
 * Reads the pair from the environment, or null when either is missing.
 *
 * The URL is not a secret, so the client's own copy is a fine fallback — it
 * saves configuring the same value twice and forgetting one of them. The
 * service-role key has no such fallback and never should.
 */
export function readAdminConfig(env: NodeJS.ProcessEnv = process.env): SupabaseAdminConfig | null {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? { url, serviceKey } : null;
}

/**
 * fetch + body read under one AbortController timeout. Throws on timeout like
 * any abort. The timer stays armed through the body read on purpose: fetch()
 * resolves at response HEADERS, and a body that then stalls would otherwise
 * hang past the budget (the same subtlety _lib/upstream.ts handles).
 * `body` is null when the response carries no parseable JSON.
 */
export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = SUPABASE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // Non-JSON or empty body — the status code still tells the story. A
      // 204 from PostgREST is the normal case, not a fault.
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** Why a token did not resolve to a user. The two are answered differently. */
export type AuthFailure = 'unauthorized' | 'unreachable';

/**
 * Resolves an access token to the user id it belongs to.
 *
 * Returns the id, or which kind of failure happened: 'unauthorized' when
 * Supabase answered and said no (missing, forged, expired), 'unreachable' when
 * we never got an answer. A route must not collapse those into one — telling a
 * signed-in user their session is invalid because a network hop failed sends
 * them to sign in again for no reason.
 */
export async function resolveUserId(
  config: SupabaseAdminConfig,
  token: string,
  timeoutMs: number = SUPABASE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<{ userId: string } | { failure: AuthFailure }> {
  let who: { ok: boolean; status: number; body: unknown };
  try {
    who = await fetchJsonWithTimeout(
      `${config.url}/auth/v1/user`,
      { headers: { apikey: config.serviceKey, Authorization: `Bearer ${token}` } },
      timeoutMs,
      fetchImpl,
    );
  } catch {
    return { failure: 'unreachable' };
  }
  const id =
    who.body !== null && typeof who.body === 'object' ? (who.body as { id?: unknown }).id : undefined;
  if (!who.ok || typeof id !== 'string' || !id) return { failure: 'unauthorized' };
  return { userId: id };
}
