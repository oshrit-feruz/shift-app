/**
 * Connecting and disconnecting one signed-in user's brokerage account.
 *
 * POST   — hand back a Connection Portal URL for this user to authorise in.
 * DELETE — revoke everything: the SnapTrade user, the connections under it,
 *          and the stored secret.
 *
 * WHY THIS IS THE LEGITIMATE WAY TO READ SOMEONE'S PORTFOLIO, and the reason
 * the flow looks like this rather than like a login form: the brokerage
 * credentials are entered in SnapTrade's own hosted portal, over SnapTrade's
 * own connection to the brokerage. This app never sees a brokerage username,
 * never sees a password, and cannot place a trade — the portal is opened with
 * `connectionType: 'read'`, so what the user grants is a read connection and
 * nothing more. The only thing stored on this side is the `userSecret`
 * SnapTrade issues, sealed under a key that lives in the server environment
 * (_lib/secretBox.ts).
 *
 * WHAT DISCONNECT MEANS, because a revocation that leaves data behind is not
 * one: DELETE removes the SnapTrade user itself, not just our row. That takes
 * the brokerage connections with it at SnapTrade's end, so afterwards there is
 * nothing left anywhere that can read the account — which is what a person
 * pressing "disconnect" is asking for.
 */

import type { ApiRequest, ApiResponse } from './_lib/http.js';
import { failureBody } from './_lib/upstream.js';
import {
  LINK_PATHS,
  PROVIDER,
  UpstreamError,
  snapTradeRequest,
  type SnapTradeCreds,
} from './_lib/snaptradeClient.js';
import { resolveSession } from './_lib/snaptradeSession.js';
import { deleteLink, saveLink, type LinkStore } from './_lib/snaptradeLinks.js';

const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;
const ROUTE = '/api/snaptrade-link';

/**
 * Where the portal sends the user when they are done.
 *
 * Taken from an environment variable when one is set, and otherwise from the
 * host this request arrived at — which on Vercel is the deployment's own
 * domain, so preview deploys return to themselves without configuration. It is
 * deliberately NOT read from anything in the request body: a redirect target a
 * caller can name is an open redirect wearing a brokerage's branding.
 */
function redirectUrl(req: ApiRequest): string | null {
  const configured = process.env.SNAPTRADE_REDIRECT_URL;
  if (configured) return configured;
  const raw = req.headers?.['x-forwarded-host'] ?? req.headers?.host;
  const host = Array.isArray(raw) ? raw[0] : raw;
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return null;
  const proto = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
  return `${proto}://${host}/`;
}

/** Reads `{ userId, userSecret }` out of a registerUser response, or null. */
function parseRegistration(raw: unknown): { userId: string; userSecret: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { userId, userSecret } = raw as Record<string, unknown>;
  if (typeof userId !== 'string' || !userId) return null;
  if (typeof userSecret !== 'string' || !userSecret) return null;
  return { userId, userSecret };
}

/** Reads the portal URL out of a login response, or null. */
function parseRedirect(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const uri = (raw as Record<string, unknown>).redirectURI;
  // https only, and parsed rather than pattern-matched: this string is handed
  // to the browser to navigate to.
  if (typeof uri !== 'string' || !uri) return null;
  try {
    return new URL(uri).protocol === 'https:' ? uri : null;
  } catch {
    return null;
  }
}

/**
 * The route, with its upstream timeout injected so tests can drive it without
 * waiting fifteen seconds for the real one.
 */
export function createHandler(timeoutMs: number) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'POST, DELETE');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use POST or DELETE.' });
    }
    // Nothing about a link belongs in any cache: the POST body carries a
    // one-time portal URL, and the DELETE's answer is about one person.
    res.setHeader('Cache-Control', 'private, no-store');

    // Credentials, caller and link in one step — see resolveSession. Every
    // failure it can produce already carries the body to return, so this
    // route and /api/snaptrade answer them identically.
    const session = await resolveSession(req, ROUTE);
    if (!session.ok) return res.status(session.error.status).json(session.error.body);
    const { creds } = session;

    try {
      return req.method === 'POST'
        ? await connect(req, res, session.userId, session.link, session.store, creds, timeoutMs)
        : await disconnect(res, session.userId, session.link, session.store, creds, timeoutMs);
    } catch (err) {
      if (err instanceof UpstreamError) {
        return res.status(err.failure.status).json(failureBody(err.failure));
      }
      // A store write that failed, or anything else unforeseen. Specific in
      // the log, generic in the body.
      console.error(`${ROUTE}: unexpected failure:`, err);
      return res
        .status(502)
        .json({ error: 'link_failed', message: `Could not reach the ${PROVIDER} provider.` });
    }
  };
}

type Link = { snapTradeUserId: string; userSecret: string } | null;

/**
 * Registers the user with SnapTrade if they are new, then mints a portal URL.
 *
 * The SnapTrade user id IS the Supabase user id: stable, unique, and not an
 * email — SnapTrade documents the id as immutable, and an address is the one
 * identifier people change.
 */
async function connect(
  req: ApiRequest,
  res: ApiResponse,
  userId: string,
  existing: Link,
  store: LinkStore,
  creds: SnapTradeCreds,
  timeoutMs: number,
) {
  let link = existing;

  if (link === null) {
    let registration: { userId: string; userSecret: string } | null;
    try {
      registration = parseRegistration(
        await snapTradeRequest({
          path: LINK_PATHS.registerUser,
          method: 'POST',
          body: { userId },
          creds,
          timeoutMs,
          route: ROUTE,
        }),
      );
    } catch (err) {
      // SnapTrade already knows this id, but we hold no secret for it — the
      // two sides diverged, which a half-completed disconnect can do. The
      // secret is only ever returned at registration, so it cannot be
      // recovered: the only way back is to remove that user and start again.
      // The removal is queued on SnapTrade's side, so this says so and asks
      // for a retry rather than pretending the next call will succeed.
      if (err instanceof UpstreamError && err.failure.upstreamStatus === 400) {
        console.error(`${ROUTE}: user ${userId} exists upstream with no stored secret; removing it`);
        await snapTradeRequest({
          path: LINK_PATHS.deleteUser,
          method: 'DELETE',
          user: { userId },
          creds,
          timeoutMs,
          route: ROUTE,
        });
        return res.status(409).json({
          error: 'link_reset',
          message: 'The previous connection is being removed. Please try again in a moment.',
        });
      }
      throw err;
    }
    if (registration === null) {
      console.error(`${ROUTE}: registerUser did not return a userId and userSecret`);
      return res.status(502).json({
        error: 'bad_response',
        message: `The ${PROVIDER} provider returned an unexpected shape.`,
      });
    }
    // Stored BEFORE the portal is opened. A secret we hold and never use costs
    // nothing; a connection the user completes against a secret we failed to
    // store is a live link to their brokerage that nobody can read or revoke.
    link = { snapTradeUserId: registration.userId, userSecret: registration.userSecret };
    await saveLink(store, userId, link);
  }

  const customRedirect = redirectUrl(req);
  const redirectURI = parseRedirect(
    await snapTradeRequest({
      path: LINK_PATHS.login,
      method: 'POST',
      user: { userId: link.snapTradeUserId, userSecret: link.userSecret },
      body: {
        // The permission the user is being asked for, and the only one this
        // app can act on. Not 'trade', and not 'trade-if-available': a
        // connection that could place orders is not what a read-only
        // portfolio view should be holding.
        connectionType: 'read',
        connectionPortalVersion: 'v4',
        ...(customRedirect ? { customRedirect, immediateRedirect: true } : {}),
      },
      creds,
      timeoutMs,
      route: ROUTE,
    }),
  );
  if (redirectURI === null) {
    console.error(`${ROUTE}: login did not return an https redirectURI`);
    return res
      .status(502)
      .json({ error: 'bad_response', message: `The ${PROVIDER} provider returned an unexpected shape.` });
  }

  // SnapTrade expires the portal link after five minutes; the client says so
  // rather than leaving a dead URL looking live in a tab.
  return res.status(200).json({ redirectURI, expiresInSeconds: 300 });
}

/**
 * Revokes the link. Deleting something that is not there is a success — the
 * caller asked for it to be gone, and it is.
 */
async function disconnect(
  res: ApiResponse,
  userId: string,
  link: Link,
  store: LinkStore,
  creds: SnapTradeCreds,
  timeoutMs: number,
) {
  if (link !== null) {
    // Upstream first, then our row. In the other order a failed upstream
    // delete would leave a live connection at SnapTrade that this app no
    // longer has the secret to revoke — unreadable here, and still connected
    // to the user's brokerage, which is the one outcome a disconnect must not
    // produce.
    try {
      await snapTradeRequest({
        path: LINK_PATHS.deleteUser,
        method: 'DELETE',
        user: { userId: link.snapTradeUserId },
        creds,
        timeoutMs,
        route: ROUTE,
      });
    } catch (err) {
      // SnapTrade does not know this user — a delete that already went
      // through, or a row left behind by one. There is nothing upstream to
      // revoke, so the row goes and the caller gets the success they asked
      // for. Every other failure is rethrown and the row stays, because then
      // the connection really is still live.
      if (!(err instanceof UpstreamError) || err.failure.upstreamStatus !== 404) throw err;
      console.error(`${ROUTE}: SnapTrade had no user ${link.snapTradeUserId}; removing the row anyway`);
    }
  }
  await deleteLink(store, userId);
  return res.status(200).json({ disconnected: true });
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
