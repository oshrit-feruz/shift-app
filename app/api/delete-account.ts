import { readBearerToken, type ApiRequest, type ApiResponse } from './_lib/http.js';

/**
 * Permanently deletes the calling user's account.
 *
 * This lives on the server for one reason: deleting a user is an admin
 * operation, and the SUPABASE_SERVICE_ROLE_KEY that authorises it bypasses
 * Row-Level Security entirely. That key must never reach the browser, so it
 * is read from a server-only environment variable — deliberately NOT
 * VITE_-prefixed, which would inline it into the client bundle (the same
 * convention as EODHD_API_KEY in api/news.ts).
 *
 * The security property that makes this endpoint safe to expose: the user id
 * being deleted is taken from the *verified* access token and never from the
 * request body or query. A caller therefore cannot delete anyone but
 * themselves, whatever they send. The token is verified by asking Supabase
 * who it belongs to rather than by decoding it locally — a decode would
 * happily read the claims out of a forged or expired token.
 *
 * Deleting the auth user cascades to public.profiles and public.user_state
 * (`on delete cascade` in supabase/migrations/0001_auth.sql), so this one
 * call removes the user's data too — there is no second cleanup step that
 * could silently fail and leave orphaned rows behind.
 */
/**
 * Per-call budget for each Supabase auth request, well under the function's
 * 30s maxDuration so a hung upstream yields this endpoint's own JSON error
 * rather than the platform's 504 page — the same contract api/news.ts and
 * api/earnings.ts keep.
 */
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * fetch + body read under one AbortController timeout. Throws on timeout like
 * any abort. The timer stays armed through the body read on purpose: fetch()
 * resolves at response HEADERS, and a body that then stalls would otherwise
 * hang past the budget (the same subtlety _lib/upstream.ts handles).
 * `body` is null when the response carries no parseable JSON.
 */
async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
  }

  // The URL is not a secret, so the client's own copy is a fine fallback —
  // it saves configuring the same value twice and forgetting one of them.
  // The service-role key has no such fallback and never should.
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // An honest 500: the deployment is missing configuration. Saying "deleted"
    // here would be the worst possible lie on this particular endpoint.
    return res.status(500).json({
      error: 'not_configured',
      message: 'Account deletion is not configured on this deployment.',
    });
  }

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token.' });
  }

  // Step 1 — establish WHO is calling, from the token itself.
  let userId: string;
  try {
    const who = await fetchJsonWithTimeout(`${url}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
    const id =
      who.body !== null && typeof who.body === 'object' ? (who.body as { id?: unknown }).id : undefined;
    if (!who.ok || typeof id !== 'string' || !id) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session.' });
    }
    userId = id;
  } catch {
    return res.status(502).json({ error: 'upstream_unreachable', message: 'Could not verify the session.' });
  }

  // Step 2 — delete that user, and only that user.
  try {
    const del = await fetchJsonWithTimeout(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!del.ok) {
      return res.status(502).json({ error: 'delete_failed', message: 'The account was not deleted.' });
    }
  } catch {
    return res.status(502).json({ error: 'upstream_unreachable', message: 'The account was not deleted.' });
  }

  return res.status(200).json({ deleted: true });
}
