/**
 * Server-side Supabase access for the API routes: who is calling, and the
 * one table only the server may read.
 *
 * THE SERVICE-ROLE KEY BYPASSES ROW-LEVEL SECURITY ENTIRELY, so everything
 * here is written against one rule: the user id acted on comes from a
 * VERIFIED access token and never from a request body, query or header the
 * caller controls. That is the property that makes these endpoints safe to
 * expose — a caller cannot reach anyone's data but their own, whatever they
 * send.
 *
 * The token is verified by asking Supabase who it belongs to rather than by
 * decoding it locally: a local decode would happily read the claims out of a
 * forged or expired token.
 *
 * Extracted from api/delete-account.ts, which had all of this inline, when
 * /api/snaptrade needed the same three things — the config, the timeout-safe
 * fetch and the token check. Two copies of an authentication check is two
 * places for one of them to drift, and this is the check that must not.
 */

import { readBearerToken, type ApiRequest } from './http.js';

/**
 * Per-call budget for each Supabase request, well under the function's 30s
 * maxDuration so a hung upstream yields the route's own JSON error rather
 * than the platform's 504 page.
 */
export const SUPABASE_TIMEOUT_MS = 10_000;

export interface ServerConfig {
  url: string;
  serviceKey: string;
}

/**
 * The server's Supabase configuration, or null when this deployment has none.
 *
 * The URL is not a secret, so the client's own copy is a fine fallback — it
 * saves configuring the same value twice and forgetting one of them. The
 * service-role key has no such fallback and never should: a VITE_ prefix
 * would inline it into the browser bundle and hand every visitor a key that
 * bypasses RLS.
 */
export function serverConfig(): ServerConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      // Non-JSON or empty body — the status code still tells the story.
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/** A failure to report to the caller, in the shape every route answers with. */
export interface RouteFailure {
  status: number;
  error: string;
  message: string;
}

export type CallerResult = { ok: true; userId: string } | { ok: false; failure: RouteFailure };

/**
 * Establish WHO is calling, from the access token alone.
 *
 * Every distinguishable outcome gets its own status, because they need
 * different things from the reader: no token or a dead one is a sign-in
 * problem (401), and a Supabase we could not reach is not the caller's fault
 * at all (502) and must not be dressed up as an expired session.
 */
export async function verifiedCaller(
  req: ApiRequest,
  cfg: ServerConfig,
  timeoutMs: number = SUPABASE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<CallerResult> {
  const token = readBearerToken(req);
  if (!token) {
    return {
      ok: false,
      failure: { status: 401, error: 'unauthorized', message: 'Missing bearer token.' },
    };
  }
  try {
    const who = await fetchJsonWithTimeout(
      `${cfg.url}/auth/v1/user`,
      { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${token}` } },
      timeoutMs,
      fetchImpl,
    );
    const id =
      who.body !== null && typeof who.body === 'object' ? (who.body as { id?: unknown }).id : undefined;
    if (!who.ok || typeof id !== 'string' || !id) {
      return {
        ok: false,
        failure: { status: 401, error: 'unauthorized', message: 'Invalid or expired session.' },
      };
    }
    return { ok: true, userId: id };
  } catch {
    return {
      ok: false,
      failure: { status: 502, error: 'upstream_unreachable', message: 'Could not verify the session.' },
    };
  }
}

/**
 * The service-role headers for a PostgREST call. `apikey` and the bearer are
 * both the service key: PostgREST reads the role from the JWT, and the
 * service-role JWT is what bypasses RLS.
 */
function restHeaders(cfg: ServerConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** What public.snaptrade_users holds for one app user. */
export interface SnapTradeIdentity {
  snapTradeUserId: string;
  userSecret: string;
}

/**
 * The caller's SnapTrade identity, or null when they have none yet.
 *
 * A read that FAILS is distinguished from a read that found nothing: the
 * caller of this cannot be allowed to register a second SnapTrade user
 * because a database hiccup looked like "not registered", which would strand
 * the first secret. `undefined` is the failure; `null` is a real absence.
 */
export async function readSnapTradeIdentity(
  cfg: ServerConfig,
  userId: string,
  timeoutMs: number = SUPABASE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapTradeIdentity | null | undefined> {
  const url =
    `${cfg.url}/rest/v1/snaptrade_users?user_id=eq.${encodeURIComponent(userId)}` +
    `&select=snaptrade_user_id,user_secret`;
  let res: { ok: boolean; status: number; body: unknown };
  try {
    res = await fetchJsonWithTimeout(url, { headers: restHeaders(cfg) }, timeoutMs, fetchImpl);
  } catch {
    return undefined;
  }
  // 404 — the table is not there, because 0007 has not been run on this
  // project. That is a real "no identity", not a failed read: with no table
  // there is no SnapTrade user for anyone. It cannot be confused with a
  // missing ROW, which PostgREST answers as a 200 with an empty array, so
  // matching the status is enough. Reporting it as a failure would break
  // account deletion on a project that has never linked a brokerage.
  if (res.status === 404) return null;
  if (!res.ok || !Array.isArray(res.body)) return undefined;
  const row = res.body[0];
  if (row === undefined) return null;
  if (typeof row !== 'object' || row === null) return undefined;
  const r = row as Record<string, unknown>;
  const snapTradeUserId = typeof r.snaptrade_user_id === 'string' ? r.snaptrade_user_id : null;
  const userSecret = typeof r.user_secret === 'string' ? r.user_secret : null;
  // A row that exists but carries no secret is not an identity — reporting it
  // as one would send an unsigned request and read the 401 as a dead session.
  if (!snapTradeUserId || !userSecret) return undefined;
  return { snapTradeUserId, userSecret };
}

/**
 * Store a freshly registered SnapTrade identity. Returns whether it landed.
 *
 * The caller MUST act on `false` by deleting the SnapTrade user it just
 * registered: the secret exists only in that response, so a failed write
 * leaves a user nobody can ever read or remove.
 */
export async function writeSnapTradeIdentity(
  cfg: ServerConfig,
  userId: string,
  identity: SnapTradeIdentity,
  timeoutMs: number = SUPABASE_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchJsonWithTimeout(
      `${cfg.url}/rest/v1/snaptrade_users`,
      {
        method: 'POST',
        headers: restHeaders(cfg, { Prefer: 'return=minimal' }),
        body: JSON.stringify({
          user_id: userId,
          snaptrade_user_id: identity.snapTradeUserId,
          user_secret: identity.userSecret,
        }),
      },
      timeoutMs,
      fetchImpl,
    );
    return res.ok;
  } catch {
    return false;
  }
}
