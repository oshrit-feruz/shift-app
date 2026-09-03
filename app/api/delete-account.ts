import { readBearerToken, type ApiRequest, type ApiResponse } from './_lib/http.js';
import {
  SUPABASE_TIMEOUT_MS,
  fetchJsonWithTimeout,
  readAdminConfig,
  resolveUserId,
} from './_lib/supabaseAdmin.js';

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
 * request body or query (see _lib/supabaseAdmin.ts). A caller therefore
 * cannot delete anyone but themselves, whatever they send.
 *
 * Deleting the auth user cascades to public.profiles, public.user_state, the
 * ledger tables and public.snaptrade_users (`on delete cascade` in
 * supabase/migrations/), so this one call removes the user's data too — there
 * is no second cleanup step that could silently fail and leave orphaned rows
 * behind. The brokerage connection at SnapTrade's end is revoked before this
 * is called, by the client asking /api/snaptrade-link to disconnect; that is
 * an upstream call with its own failure modes, and putting it inside this
 * function's budget would risk the deletion itself timing out.
 */

/**
 * Budget for the reconciliation read after a lost DELETE. Deliberately
 * tighter than the shared per-call budget: in the worst case it runs THIRD,
 * after the session check and the DELETE each spent their full 10s — so it
 * must fit inside what remains of the function's 30s maxDuration, or the
 * platform would kill the invocation before the honest delete_unconfirmed
 * answer goes out (10 + 10 + 5 = 25s, with margin to respond).
 */
const RECONCILE_TIMEOUT_MS = 5_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
  }

  const admin = readAdminConfig();
  if (!admin) {
    // An honest 500: the deployment is missing configuration. Saying "deleted"
    // here would be the worst possible lie on this particular endpoint.
    return res.status(500).json({
      error: 'not_configured',
      message: 'Account deletion is not configured on this deployment.',
    });
  }
  const { url, serviceKey } = admin;

  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Missing bearer token.' });
  }

  // Step 1 — establish WHO is calling, from the token itself.
  const who = await resolveUserId(admin, token, SUPABASE_TIMEOUT_MS);
  if ('failure' in who) {
    return who.failure === 'unauthorized'
      ? res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session.' })
      : res.status(502).json({ error: 'upstream_unreachable', message: 'Could not verify the session.' });
  }
  const userId = who.userId;

  // Step 2 — delete that user, and only that user.
  try {
    const del = await fetchJsonWithTimeout(`${url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    // Already gone — e.g. a retry of a delete whose response was lost — is a
    // success: the account not existing is exactly what was asked for.
    if (del.status === 404) return res.status(200).json({ deleted: true });
    if (!del.ok) {
      return res.status(502).json({ error: 'delete_failed', message: 'The account was not deleted.' });
    }
  } catch {
    // The timeout can fire AFTER Supabase received the DELETE, so the
    // deletion may have completed without us seeing the response. On this
    // endpoint a wrong answer in either direction is serious, so ask before
    // claiming anything.
    return reconcileAfterLostDelete(res, url, serviceKey, userId);
  }

  return res.status(200).json({ deleted: true });
}

/**
 * The DELETE's outcome was lost (abort / network). Establish the account's
 * actual state before answering: gone → the deletion happened and is
 * reported as the success it is; still there → an honest "not deleted";
 * unknowable → say exactly that rather than guessing either way.
 */
async function reconcileAfterLostDelete(res: ApiResponse, url: string, serviceKey: string, userId: string) {
  try {
    const check = await fetchJsonWithTimeout(
      `${url}/auth/v1/admin/users/${userId}`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
      RECONCILE_TIMEOUT_MS,
    );
    if (check.status === 404) return res.status(200).json({ deleted: true });
    if (check.ok) {
      return res.status(502).json({ error: 'delete_failed', message: 'The account was not deleted.' });
    }
  } catch {
    // Fall through to the honest "unknown" below.
  }
  return res.status(502).json({
    error: 'delete_unconfirmed',
    message: 'Could not confirm whether the account was deleted. Please try again.',
  });
}
