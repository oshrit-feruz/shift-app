/**
 * "Who is calling, and what is their brokerage link?" — the first thing both
 * SnapTrade routes do, written once so they cannot answer it differently.
 *
 * Every failure it can produce is turned into the exact JSON body the route
 * returns, because these are the answers a screen has to render honestly and
 * they must not vary between the two endpoints. In particular:
 *
 * - `unauthorized` (401) means Supabase answered and said no. The client
 *   signs in again.
 * - `session_unavailable` (502) means we never got an answer. The client says
 *   "try again", NOT "your session expired" — sending someone back to sign in
 *   because a network hop failed is a lie with an action attached.
 * - `link_unreadable` (500) means the row exists but its secret would not
 *   open. It is deliberately not reported as "no account linked": that would
 *   invite the user to connect a second brokerage on top of a live connection
 *   they still have, and would hide a botched key rotation behind a friendly
 *   empty state.
 *
 * A user with no row at all is not a failure — it is everyone who has not
 * connected a brokerage yet, and it comes back as `link: null` with a 200 for
 * the caller to shape.
 */

import { readBearerToken, type ApiRequest } from './http.js';
import { readCreds, type SnapTradeCreds } from './snaptradeClient.js';
import { readKey } from './secretBox.js';
import { readAdminConfig, resolveUserId } from './supabaseAdmin.js';
import { LinkUnreadableError, readLink, type LinkStore, type SnapTradeLink } from './snaptradeLinks.js';

export interface RouteError {
  status: number;
  body: { error: string; message: string };
}

export type SessionResult =
  | { ok: true; userId: string; link: SnapTradeLink | null; store: LinkStore; creds: SnapTradeCreds }
  | { ok: false; error: RouteError };

/**
 * A failure the caller can return verbatim. The body is phrased here, once,
 * so both routes answer the same condition with the same words — a session
 * that cannot be verified must not read as an expired one in one route and a
 * server fault in the other.
 */
function fail(status: number, error: string, message: string): { ok: false; error: RouteError } {
  return { ok: false, error: { status, body: { error, message } } };
}

/**
 * Resolves the deployment's credentials, the caller from their bearer token,
 * and that caller's link — the three things both routes need before they can
 * do anything, in the one order they can be established in.
 *
 * `route` is only used in logs. Configuration faults are specific in the log
 * and generic in the body — a public error message must not name the
 * environment variable that is missing.
 */
export async function resolveSession(req: ApiRequest, route: string): Promise<SessionResult> {
  const creds = readCreds();
  if (!creds) {
    console.error(`${route}: SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY are not both set`);
    return fail(500, 'not_configured', 'Connected accounts are not configured.');
  }

  const admin = readAdminConfig();
  if (!admin) {
    console.error(`${route}: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not both set`);
    return fail(500, 'not_configured', 'Connected accounts are not configured on this deployment.');
  }

  let encryptionKey: Buffer;
  try {
    encryptionKey = readKey(process.env.SNAPTRADE_SECRET_KEY);
  } catch (err) {
    console.error(`${route}: ${(err as Error).message}`);
    return fail(500, 'not_configured', 'Connected accounts are not configured on this deployment.');
  }

  const token = readBearerToken(req);
  if (!token) return fail(401, 'unauthorized', 'Missing bearer token.');

  const who = await resolveUserId(admin, token);
  if ('failure' in who) {
    return who.failure === 'unauthorized'
      ? fail(401, 'unauthorized', 'Invalid or expired session.')
      : fail(502, 'session_unavailable', 'Could not verify the session.');
  }

  const store: LinkStore = { ...admin, encryptionKey };
  try {
    return { ok: true, userId: who.userId, link: await readLink(store, who.userId), store, creds };
  } catch (err) {
    if (err instanceof LinkUnreadableError) {
      console.error(`${route}: stored userSecret did not decrypt`);
      return fail(500, 'link_unreadable', 'The stored brokerage connection could not be read.');
    }
    console.error(`${route}: reading the brokerage link failed:`, err);
    return fail(502, 'link_unavailable', 'Could not read the brokerage connection.');
  }
}
