import {
  SNAPTRADE_BASE,
  buildQuery,
  computeSignature,
  mapAccount,
  mapBalance,
  mapConnection,
  mapPosition,
  unwrapPositions,
  type ConnectedAccount,
  type ConnectedBalance,
  type ConnectedConnection,
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
  /**
   * Daily data by SnapTrade's own description: "cached and refreshed once a
   * day". A connection linked today can legitimately answer an empty list
   * here, which is why `connections` and `connectionAccounts` below exist.
   */
  accounts: () => '/accounts',
  balances: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/balances`,
  /** `/positions` does not exist; `/positions/all` is the real path. */
  positions: (accountId: string) => `/accounts/${encodeURIComponent(accountId)}/positions/all`,
  /** The real-time route, used only when the daily cache reports nothing. */
  connections: () => '/authorizations',
  connectionAccounts: (authorizationId: string) =>
    `/authorizations/${encodeURIComponent(authorizationId)}/accounts`,
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

type MappedAccount = NonNullable<ReturnType<typeof mapAccount>>;

/** A `bad_response` failure, phrased for the one provider this route talks to. */
function badResponse(detail: string): UpstreamError {
  console.error(`${ROUTE}: ${detail}`);
  return new UpstreamError({
    status: 502,
    error: 'bad_response',
    message: `The ${PROVIDER} provider returned an unexpected shape.`,
  });
}

/**
 * Maps an `Account[]` payload — the shape both `/accounts` and
 * `/authorizations/{id}/accounts` answer with.
 *
 * Rows present with none mappable is a shape we do not understand, NOT an
 * account-less user: every row was missing the id we address it by. Reporting
 * it as the latter would send someone hunting for a brokerage connection that
 * is already there, so the two must not look alike.
 */
function mapAccountList(raw: unknown, label: string): MappedAccount[] {
  if (!Array.isArray(raw)) throw badResponse(`${label} did not return an array`);
  const mapped = raw.map(mapAccount).filter((a): a is MappedAccount => a !== null);
  if (raw.length > 0 && mapped.length === 0) {
    throw badResponse(`${label} returned ${raw.length} row(s), none with a usable id`);
  }
  return mapped.slice(0, MAX_ACCOUNTS);
}

/**
 * The real-time account list, used only when the daily cache reports nothing.
 *
 * `/accounts` is documented as daily data, "cached and refreshed once a day",
 * so a brokerage connected today legitimately answers an empty list there
 * while the connection itself is live. This walks the connections instead and
 * asks each one directly.
 *
 * Both calls are GET. The manual-refresh endpoint that would force a sync is
 * deliberately NOT used: it is a POST, and SnapTrade charges per call — not
 * something to fire from a public, unauthenticated endpoint.
 */
async function listConnections(
  creds: { clientId: string; consumerKey: string },
  timeoutMs: number,
): Promise<Array<Omit<ConnectedConnection, 'accountCount'>>> {
  const raw = await snapTradeGet(READ_ONLY_PATHS.connections(), creds, timeoutMs);
  if (!Array.isArray(raw)) throw badResponse('/authorizations did not return an array');
  return raw
    .map(mapConnection)
    .filter((c): c is NonNullable<ReturnType<typeof mapConnection>> => c !== null)
    .slice(0, MAX_ACCOUNTS);
}

/**
 * True for a connection SnapTrade has marked disabled.
 *
 * This matters more than it looks. SnapTrade's own docs say a disabled
 * connection "can no longer access the latest data from the brokerage, but
 * will continue to return the last available cached state" — so it answers
 * 200 with holdings that are of entirely unknown age. Serving those as
 * current is the same lie as the stale screener snapshot this app already
 * refuses to serve, and it would be worse here because it is money.
 *
 * `disabled` is null when SnapTrade did not say. Unknown is treated as live:
 * the field is documented and normally present, and refusing to show a real
 * account because one boolean was absent would be its own dishonesty.
 */
function isDisabled(c: { disabled: boolean | null }): boolean {
  return c.disabled === true;
}

async function realtimeAccounts(
  live: Array<Omit<ConnectedConnection, 'accountCount'>>,
  creds: { clientId: string; consumerKey: string },
  timeoutMs: number,
): Promise<{ accounts: MappedAccount[]; perConnection: MappedAccount[][] }> {
  const perConnection = await Promise.all(
    live.map(async (connection) =>
      mapAccountList(
        await snapTradeGet(READ_ONLY_PATHS.connectionAccounts(connection.id), creds, timeoutMs),
        `/authorizations/${connection.id}/accounts`,
      ),
    ),
  );
  return { accounts: perConnection.flat().slice(0, MAX_ACCOUNTS), perConnection };
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
      // The connection list comes first and always, not only as a fallback.
      // It is the only place SnapTrade reports `disabled`, and without it a
      // dead connection's last cached holdings would be served as current.
      const allConnections = await listConnections(creds, timeoutMs);
      const live = allConnections.filter((c) => !isDisabled(c));
      const liveIds = new Set(live.map((c) => c.id));

      let source: 'daily' | 'realtime' = 'daily';
      // Accounts from a disabled connection are dropped here rather than
      // shown: SnapTrade keeps serving their last cached state, and we have
      // no way to tell how old it is. The connection is still reported below,
      // so the screen says the connection is dead rather than silently
      // showing nothing.
      let base = mapAccountList(
        await snapTradeGet(READ_ONLY_PATHS.accounts(), creds, timeoutMs),
        '/accounts',
      ).filter((a) => a.connectionId === null || liveIds.has(a.connectionId));

      // The daily cache has nothing. That is expected for a brokerage linked
      // today, so ask the live connections directly before concluding the
      // user has no account.
      if (base.length === 0 && live.length > 0) {
        base = (await realtimeAccounts(live, creds, timeoutMs)).accounts;
        source = 'realtime';
      }

      // Every connection is reported, live or not, with what it returned —
      // so a zero-account answer can name the brokerage and say whether the
      // connection is dead or merely quiet.
      //
      // Counted from the accounts actually being returned, not from the
      // real-time fan-out: on the daily route that fan-out never runs, and
      // counting it there produced a response that said "1 account" and
      // "this connection reported 0 accounts" in the same breath.
      const connections: ConnectedConnection[] = allConnections.map((c) => ({
        ...c,
        accountCount: base.filter((a) => a.connectionId === c.id).length,
      }));

      // Nothing from either route. An honest, explicit empty answer — the demo
      // screen renders "no account connected", never a placeholder holding.
      if (base.length === 0) {
        // An empty answer has two very different causes, and they were
        // indistinguishable from the response: SnapTrade may see no
        // CONNECTION for this key at all, or it may see a live connection
        // whose brokerage reports no accounts. `connections` separates them
        // and names the brokerage, so the screen can state which. Whether
        // the second case is "the brokerage has nothing" or "the cache was
        // never filled" depends on the connection's own
        // `data_freshness_mode`, which is why it is reported too: `realtime`
        // means SnapTrade asked the brokerage during this call, `delayed`
        // means it answered from a cache that a manual refresh can populate
        // (scripts/snaptrade-refresh.mjs). Do not infer it from the plan —
        // a Personal connection can be either, and IBKR's is delayed.
        // States and counts only; nothing here identifies an account.
        console.warn(
          `${ROUTE}: no accounts. /authorizations reported ${connections.length} connection(s): ` +
            connections.map((c) => `${c.brokerage ?? c.id} disabled=${c.disabled}`).join(', '),
        );
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30');
        return res.status(200).json({ accounts: [], source, connections });
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

          // An envelope we cannot read is reported, never flattened to zero
          // positions — a real account full of holdings must not render as
          // "no positions" with no error anywhere.
          const envelope = unwrapPositions(rawPositions);
          if (envelope === null) throw badResponse(`/accounts/${account.id}/positions/all had no results array`);
          const positions: ConnectedPosition[] = envelope.rows
            .map(mapPosition)
            .filter((p): p is ConnectedPosition => p !== null);

          return { ...account, balances, positions, asOf: envelope.asOf, source };
        }),
      );

      // A short edge cache on success only, never on an error path — an error
      // must keep reaching this function so a real recovery shows up at once.
      // It also keeps a demo that is being reloaded on stage well inside
      // SnapTrade's holdings-call guidance. No stale-while-revalidate: serving
      // an expired response while refreshing in the background is exactly the
      // stale-data fallback this contract forbids.
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
      // `connections` rides along on success as well, so a disabled
      // connection is still reported even when another one is working.
      return res.status(200).json({ accounts, source, connections });
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
