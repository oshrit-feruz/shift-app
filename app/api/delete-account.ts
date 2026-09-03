import { type ApiRequest, type ApiResponse } from './_lib/http.js';
import {
  fetchJsonWithTimeout,
  readSnapTradeIdentity,
  serverConfig,
  verifiedCaller,
  SUPABASE_TIMEOUT_MS,
  type ServerConfig,
} from './_lib/supabaseAdmin.js';
import { SNAPTRADE_BASE, buildUserQuery, computeSignature } from './_lib/snaptrade.js';

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
 * Deleting the auth user cascades to public.profiles, public.user_state, the
 * ledger tables and public.snaptrade_users (`on delete cascade` in
 * 0001_auth.sql, 0005_ledger.sql and 0007_snaptrade_users.sql), so this one
 * call removes the user's data too — there is no second cleanup step that
 * could silently fail and leave orphaned rows behind.
 *
 * THE ONE THING THE CASCADE CANNOT DO is reach the brokerage connection this
 * person may hold at SnapTrade, and it destroys the only credential that
 * could — the `userSecret` in snaptrade_users. So the SnapTrade user is
 * deleted FIRST, and if that fails the account deletion does not proceed:
 * carrying on would leave a live connection to someone's brokerage at a third
 * party that nobody can ever read or remove again. A retry is recoverable;
 * that is not.
 */

/**
 * Budget for the reconciliation read after a lost DELETE. Deliberately
 * tighter than the shared per-call budget: in the worst case it runs LAST,
 * after the session check, the SnapTrade step and the DELETE each spent
 * theirs — so it must fit inside what remains of the function's 30s
 * maxDuration, or the platform would kill the invocation before the honest
 * delete_unconfirmed answer goes out.
 */
const RECONCILE_TIMEOUT_MS = 5_000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
  }

  const cfg = serverConfig();
  if (!cfg) {
    // An honest 500: the deployment is missing configuration. Saying "deleted"
    // here would be the worst possible lie on this particular endpoint.
    return res.status(500).json({
      error: 'not_configured',
      message: 'Account deletion is not configured on this deployment.',
    });
  }

  // Step 1 — establish WHO is calling, from the token itself.
  const caller = await verifiedCaller(req, cfg);
  if (!caller.ok) {
    const { status, error, message } = caller.failure;
    return res.status(status).json({ error, message });
  }
  const userId = caller.userId;

  // Step 2 — remove their brokerage connection at SnapTrade, before the
  // cascade takes away the credential that reaches it.
  const unlinked = await deleteSnapTradeUser(cfg, userId);
  if (!unlinked) {
    return res.status(502).json({
      error: 'brokerage_unlink_failed',
      message: 'Could not disconnect your brokerage account, so nothing was deleted. Please try again.',
    });
  }

  // Step 3 — delete that user, and only that user.
  try {
    const del = await fetchJsonWithTimeout(`${cfg.url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` },
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
    return reconcileAfterLostDelete(res, cfg, userId);
  }

  return res.status(200).json({ deleted: true });
}

/**
 * Delete the caller's SnapTrade user, if they have one. Returns whether the
 * account deletion may proceed.
 *
 * `true` for the ordinary case of someone who never linked a brokerage —
 * there is nothing at SnapTrade to remove, and no credentials need even be
 * configured for that to be true. `false` only when they DO have one and it
 * could not be removed, which is the case where proceeding would strand it.
 *
 * SnapTrade's deleteUser is asynchronous: a 200 means the deletion was
 * queued, which is as much confirmation as the API offers and is enough — the
 * request is on their side of the line now, where our disappearing
 * credentials cannot lose it.
 */
async function deleteSnapTradeUser(cfg: ServerConfig, userId: string): Promise<boolean> {
  const identity = await readSnapTradeIdentity(cfg, userId);
  // Never linked (including on a project where 0007 has not been run, which
  // has no linked brokerages by definition): nothing to do.
  if (identity === null) return true;
  // We cannot tell whether they have one. Refusing is the safe direction:
  // the account survives and a retry can establish the answer.
  if (identity === undefined) {
    console.error('/api/delete-account: could not read the stored SnapTrade identity');
    return false;
  }

  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
  if (!clientId || !consumerKey) {
    console.error('/api/delete-account: a SnapTrade identity exists but the credentials are not configured');
    return false;
  }

  const path = '/snapTrade/deleteUser';
  const query = buildUserQuery(clientId, Math.floor(Date.now() / 1000), identity.snapTradeUserId);
  const signature = computeSignature({ path: `/api/v1${path}`, query, consumerKey });
  try {
    const del = await fetchJsonWithTimeout(
      `${SNAPTRADE_BASE}${path}?${query}`,
      { method: 'DELETE', headers: { Accept: 'application/json', Signature: signature } },
      SUPABASE_TIMEOUT_MS,
    );
    // 404 is success in the same sense as above: SnapTrade does not have this
    // user, which is the state being asked for.
    return del.ok || del.status === 404;
  } catch {
    console.error('/api/delete-account: deleting the SnapTrade user failed');
    return false;
  }
}

/**
 * The DELETE's outcome was lost (abort / network). Establish the account's
 * actual state before answering: gone → the deletion happened and is
 * reported as the success it is; still there → an honest "not deleted";
 * unknowable → say exactly that rather than guessing either way.
 */
async function reconcileAfterLostDelete(res: ApiResponse, cfg: ServerConfig, userId: string) {
  try {
    const check = await fetchJsonWithTimeout(
      `${cfg.url}/auth/v1/admin/users/${userId}`,
      { headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` } },
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
