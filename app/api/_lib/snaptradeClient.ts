/**
 * One signed SnapTrade request, shared by the two routes that make them.
 *
 * The transport — timeout budget, abort wiring, and the classification of
 * every failure into a specific code — is the shared fetchUpstreamJson() the
 * other routes use, so this cannot drift from the failure contract they hold.
 * Only the signing is SnapTrade's own: an HMAC over the canonical JSON of
 * { content, path, query }, sent in a `Signature` header. The consumer key
 * itself never travels.
 *
 * WHAT MAY BE CALLED THROUGH HERE. Two kinds of path, and no third:
 *   - read-only account data (GET), listed in READ_ONLY_PATHS in
 *     ../snaptrade.ts;
 *   - the account link itself, listed in LINK_PATHS below.
 * Trading endpoints (/trade/*, /accounts/{id}/orders, …) are deliberately
 * absent from both lists and must stay absent: this integration reads
 * someone's portfolio with their permission, and it has no order confirmation
 * and no audit trail that placing a trade on their behalf would require.
 */

import { SNAPTRADE_BASE, buildQuery, computeSignature, type SnapTradeUser } from './snaptrade.js';
import { fetchUpstreamJson, type UpstreamFailure } from './upstream.js';

export const PROVIDER = 'SnapTrade';

/** Raised to unwind out of a fan-out with a classified failure. */
export class UpstreamError extends Error {
  constructor(readonly failure: UpstreamFailure) {
    super(failure.message);
  }
}

/**
 * THE COMPLETE SET OF NON-GET PATHS THIS INTEGRATION CAN REACH. All three are
 * about the link and nothing else:
 *
 * - registerUser  creates the SnapTrade user behind one signed-in person.
 * - login         mints the hosted Connection Portal URL they authorise in.
 *                 The portal is where the brokerage credentials are entered —
 *                 they are entered at SnapTrade, never here, which is the
 *                 whole reason this is a legitimate way to read someone's
 *                 account rather than a password to be kept.
 * - deleteUser    revokes everything, on the user's own instruction.
 */
export const LINK_PATHS = {
  registerUser: '/snapTrade/registerUser',
  login: '/snapTrade/login',
  deleteUser: '/snapTrade/deleteUser',
} as const;

export interface SnapTradeCreds {
  clientId: string;
  consumerKey: string;
}

/**
 * Reads the client credentials from the environment.
 *
 * The `SNAPTRADE_PERSONAL_*` names are still honoured so a deployment that
 * carried the single-account demo keeps working across this change without a
 * dashboard edit; new deployments set the unprefixed pair, which is what the
 * credentials actually are now.
 */
export function readCreds(env: NodeJS.ProcessEnv = process.env): SnapTradeCreds | null {
  // Resolved as a PAIR, never a variable at a time. The consumer key is the
  // HMAC key for the client id beside it; a half-finished rename that leaves
  // the new client id next to the old consumer key would sign every request
  // with a key that does not belong to it, and each one comes back
  // `upstream_unauthorized` with nothing saying why.
  if (env.SNAPTRADE_CLIENT_ID && env.SNAPTRADE_CONSUMER_KEY) {
    return { clientId: env.SNAPTRADE_CLIENT_ID, consumerKey: env.SNAPTRADE_CONSUMER_KEY };
  }
  if (env.SNAPTRADE_PERSONAL_CLIENT_ID && env.SNAPTRADE_PERSONAL_CONSUMER_KEY) {
    return {
      clientId: env.SNAPTRADE_PERSONAL_CLIENT_ID,
      consumerKey: env.SNAPTRADE_PERSONAL_CONSUMER_KEY,
    };
  }
  return null;
}

export interface SnapTradeRequest {
  /** Path without the `/api/v1` prefix — it is added for both the URL and the signature. */
  path: string;
  creds: SnapTradeCreds;
  timeoutMs: number;
  route: string;
  method?: 'GET' | 'POST' | 'DELETE';
  /** The SnapTrade user this call is on behalf of. Absent only for registerUser. */
  user?: SnapTradeUser;
  /** Request body for a POST. Signed as `content`; GET and DELETE send none. */
  body?: Record<string, unknown>;
  fetchImpl?: typeof fetch;
}

/**
 * Issues one signed request and returns the parsed body, throwing
 * UpstreamError with a classified failure on anything but a 2xx.
 */
export async function snapTradeRequest({
  path,
  creds,
  timeoutMs,
  route,
  method = 'GET',
  user,
  body,
  fetchImpl = fetch,
}: SnapTradeRequest): Promise<unknown> {
  const query = buildQuery(creds.clientId, Math.floor(Date.now() / 1000), user);
  const content = body ?? null;
  const signature = computeSignature({
    path: `/api/v1${path}`,
    query,
    consumerKey: creds.consumerKey,
    content,
  });

  const result = await fetchUpstreamJson(
    new URL(`${SNAPTRADE_BASE}${path}?${query}`),
    timeoutMs,
    PROVIDER,
    route,
    fetchImpl,
    'json',
    {
      Accept: 'application/json',
      Signature: signature,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    method === 'GET' ? undefined : { method, ...(body ? { body: JSON.stringify(body) } : {}) },
  );
  if (!result.ok) throw new UpstreamError(result.failure);
  return result.body;
}
