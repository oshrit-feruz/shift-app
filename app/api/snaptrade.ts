import {
  SNAPTRADE_BASE,
  buildQuery,
  computeSignature,
  mapAccount,
  mapBalance,
  mapPosition,
  type ConnectedAccount,
  type ConnectedBalance,
  type ConnectedPosition,
} from './_lib/snaptrade.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import { failureBody, fetchUpstreamJson, type UpstreamFailure } from './_lib/upstream.js';

const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * Personal tier is one account by definition, but the account list is still a
 * list; this bounds the fan-out so a surprising response can't turn one
 * request into dozens of upstream calls.
 */
const MAX_ACCOUNTS = 3;

/**
 * THE COMPLETE SET OF UPSTREAM PATHS THIS FUNCTION CAN REACH. All three are
 * GET and all three are read-only. Paths are built from this list and an
 * account id that came back from SnapTrade itself — never from anything a
 * caller sends — so no request to this endpoint can steer it at a path that
 * is not written here.
 *
 * SnapTrade's trading endpoints (/trade/*, /accounts/{id}/orders, …) are
 * deliberately absent and must stay absent: this integration exists to prove
 * that a real brokerage account can be *read*, and it has no consent flow,
 * no order confirmation and no audit trail that placing an order would
 * require.
 */
const READ_ONLY_PATHS = {
  accounts: () => '/accounts',
  balances: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/balances`,
  positions: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/positions`,
} as const;

const PROVIDER = 'SnapTrade';
const ROUTE = '/api/snaptrade';

/** Raised to unwind out of the per-account fan-out with a classified failure. */
class UpstreamError extends Error {
  constructor(readonly failure: UpstreamFailure) {
    super(failure.message);
  }
}

/**
 * One signed, read-only GET against SnapTrade.
 *
 * The transport — timeout budget, abort wiring, and the classification of
 * every failure into a specific code — is the shared fetchUpstreamJson() the
 * other routes use, so this route cannot drift from the failure contract they
 * hold. Only the signing is SnapTrade's own.
 *
 * The query string is built once and used for both the signature and the URL:
 * the signing spec hashes the raw query exactly as sent, so re-encoding it
 * separately for the URL would produce a valid-looking signature that
 * SnapTrade rejects.
 */
async function snapTradeGet(
  path: string,
  creds: { clientId: string; consumerKey: string },
  timeoutMs: number,
): Promise<unknown> {
  const query = buildQuery(creds.clientId, Math.floor(Date.now() / 1000));
  const signature = computeSignature({ path: `/api/v1${path}`, query, consumerKey: creds.consumerKey });

  const result = await fetchUpstreamJson(
    new URL(`${SNAPTRADE_BASE}${path}?${query}`),
    timeoutMs,
    PROVIDER,
    ROUTE,
    fetch,
    'json',
    // The consumer key itself never travels — only the HMAC it keyed.
    { Accept: 'application/json', Signature: signature },
  );
  if (!result.ok) throw new UpstreamError(result.failure);
  return result.body;
}

/**
 * Builds the handler with an injectable timeout so tests can exercise the
 * timeout branch in milliseconds. The default export is this with the real
 * budget.
 *
 * WHAT THIS IS: a founder-demo, Personal-tier, single-account, READ-ONLY view
 * of one real brokerage account. It authenticates with SnapTrade's Personal
 * API key scheme — clientId plus a signature keyed with the consumer key, and
 * deliberately no userId/userSecret, because a Personal key resolves the user
 * on SnapTrade's side and a Personal user has no userSecret. Both credentials
 * are read from server-only environment variables and never appear in a
 * response body.
 *
 * WHAT THIS IS NOT: the architecture for real end users. Multi-user account
 * linking needs SnapTrade's Commercial tier, per-user registration and
 * userSecret storage, KYC and billing. See the README.
 *
 * Data-honesty contract, the same one /api/news and the screener mirror hold:
 * any failure returns 4xx/5xx with { error, message } for the frontend to
 * render as "unavailable". Zero connected accounts is a legitimate 200 with an
 * empty list — that is the true answer before a brokerage has been linked, not
 * an error, and never a reason to invent a holding.
 */
export function createHandler(timeoutMs: number) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET.' });
    }

    const clientId = process.env.SNAPTRADE_PERSONAL_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_PERSONAL_CONSUMER_KEY;
    if (!clientId || !consumerKey) {
      // A deploy/config problem, not a caller error — specific in the log,
      // generic in the body.
      console.error('/api/snaptrade: SNAPTRADE_PERSONAL_CLIENT_ID / _CONSUMER_KEY are not both set');
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'The connected-account demo is not configured.' });
    }
    const creds = { clientId, consumerKey };

    // Each upstream call carries its own budget, applied by the shared
    // transport (which keeps the timer armed through body parsing).
    try {
      const rawAccounts = await snapTradeGet(READ_ONLY_PATHS.accounts(), creds, timeoutMs);
      if (!Array.isArray(rawAccounts)) {
        console.error('/api/snaptrade: /accounts did not return an array');
        return res
          .status(502)
          .json({ error: 'bad_response', message: 'SnapTrade returned an unexpected shape.' });
      }

      const base = rawAccounts
        .map(mapAccount)
        .filter((a): a is NonNullable<ReturnType<typeof mapAccount>> => a !== null)
        .slice(0, MAX_ACCOUNTS);

      // No brokerage linked yet. An honest, explicit empty answer — the demo
      // screen renders "no account connected", never a placeholder holding.
      if (base.length === 0) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
        return res.status(200).json({ accounts: [] });
      }

      const accounts: ConnectedAccount[] = await Promise.all(
        base.map(async (account) => {
          const [rawBalances, rawPositions] = await Promise.all([
            snapTradeGet(READ_ONLY_PATHS.balances(account.id), creds, timeoutMs),
            snapTradeGet(READ_ONLY_PATHS.positions(account.id), creds, timeoutMs),
          ]);
          const balances: ConnectedBalance[] = (Array.isArray(rawBalances) ? rawBalances : [])
            .map(mapBalance)
            .filter((b): b is ConnectedBalance => b !== null);
          const positions: ConnectedPosition[] = (Array.isArray(rawPositions) ? rawPositions : [])
            .map(mapPosition)
            .filter((p): p is ConnectedPosition => p !== null);
          return { ...account, balances, positions };
        }),
      );

      // A short edge cache on success only, never on an error path — an error
      // must keep reaching this function so a real recovery shows up at once.
      // It also keeps a demo that is being reloaded on stage well inside
      // SnapTrade's holdings-call guidance. No stale-while-revalidate: serving
      // an expired response while refreshing in the background is exactly the
      // stale-data fallback this contract forbids.
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      return res.status(200).json({ accounts });
    } catch (err) {
      // The classified failure the shared transport produced — same codes,
      // same body shape, as /api/news and /api/earnings.
      if (err instanceof UpstreamError) {
        return res.status(err.failure.status).json(failureBody(err.failure));
      }
      console.error(`${ROUTE}: unexpected failure:`, err);
      return res
        .status(502)
        .json({ error: 'upstream_unavailable', message: `Could not reach the ${PROVIDER} provider.` });
    }
  };
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
