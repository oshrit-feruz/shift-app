import {
  SNAPTRADE_BASE,
  buildQuery,
  buildUserQuery,
  computeSignature,
  connectBody,
  mapAccount,
  mapBalance,
  mapConnection,
  mapPosition,
  readRedirectUri,
  readRegistration,
  snapTradeUserId,
  unwrapPositions,
  type ConnectedAccount,
  type ConnectedBalance,
  type ConnectedConnection,
  type ConnectedPosition,
} from './_lib/snaptrade.js';
import type { ApiRequest, ApiResponse } from './_lib/http.js';
import {
  readSnapTradeIdentity,
  serverConfig,
  verifiedCaller,
  writeSnapTradeIdentity,
  type ServerConfig,
  type SnapTradeIdentity,
} from './_lib/supabaseAdmin.js';
import { failureBody, fetchUpstreamJson, type UpstreamFailure } from './_lib/upstream.js';

const DEFAULT_UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * How many of a person's accounts one request will read.
 *
 * Not a correctness bound — someone may genuinely hold more — but a bound on
 * the fan-out, since each account costs two further upstream calls. Five
 * covers the brokerages a person realistically links here, and the number is
 * stated rather than implicit so the cost of a surprising response is
 * bounded.
 */
const MAX_ACCOUNTS = 5;

/**
 * THE COMPLETE SET OF UPSTREAM PATHS THIS FUNCTION CAN REACH.
 *
 * Every path is built from this list plus an id that came back from SnapTrade
 * itself or from the app's own database — never from anything a caller sends
 * — so no request to this endpoint can steer it at a path that is not
 * written here.
 *
 * The read paths are all GET. The three that are not reads exist because
 * linking an account is not a read: registering the person at SnapTrade,
 * asking for their connection portal link, and removing a connection they no
 * longer want. None of them can place an order, and SnapTrade's trading
 * endpoints (/trade/*, /accounts/{id}/orders, …) are deliberately absent and
 * must stay absent: this integration has no consent flow, no order
 * confirmation and no audit trail that placing an order would require.
 */
const PATHS = {
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
  /** POST. Issues the userSecret — once, and never again. */
  registerUser: () => '/snapTrade/registerUser',
  /** POST. Returns the connection portal URL, which expires in five minutes. */
  login: () => '/snapTrade/login',
  /** DELETE. Asynchronous: a 200 means the removal was queued. */
  deleteConnection: (connectionId: string) => `/connection/${encodeURIComponent(connectionId)}`,
} as const;

const PROVIDER = 'SnapTrade';
const ROUTE = '/api/snaptrade';

/** Raised to unwind out of the per-account fan-out with a classified failure. */
class UpstreamError extends Error {
  constructor(readonly failure: UpstreamFailure) {
    super(failure.message);
  }
}

interface Creds {
  clientId: string;
  consumerKey: string;
}

/**
 * One signed request to SnapTrade.
 *
 * The transport — timeout budget, abort wiring, and the classification of
 * every failure into a specific code — is the shared fetchUpstreamJson() the
 * other routes use, so this route cannot drift from the failure contract they
 * hold. Only the signing is SnapTrade's own.
 *
 * The query string is built once and used for both the signature and the URL:
 * the signing spec hashes the raw query exactly as sent, so re-encoding it
 * separately for the URL would produce a valid-looking signature that
 * SnapTrade rejects. The body is signed for the same reason and serialised
 * once, so the bytes hashed are the bytes sent.
 */
async function snapTradeCall(
  path: string,
  query: string,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: Record<string, unknown> } = {},
): Promise<unknown> {
  const method = options.method ?? 'GET';
  const content = options.body ?? null;
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
    ROUTE,
    fetchImpl,
    'json',
    // The consumer key itself never travels — only the HMAC it keyed.
    {
      Accept: 'application/json',
      Signature: signature,
      ...(content === null ? {} : { 'Content-Type': 'application/json' }),
    },
    { method, ...(content === null ? {} : { body: JSON.stringify(content) }) },
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
 * True for a connection SnapTrade has marked disabled.
 *
 * This matters more than it looks. SnapTrade's own docs say a disabled
 * connection "can no longer access the latest data from the brokerage, but
 * will continue to return the last available cached state" — so it answers
 * 200 with holdings that are of entirely unknown age. Serving those as
 * current is the same lie as a stale price, and worse here because it is
 * money.
 *
 * `disabled` is null when SnapTrade did not say. Unknown is treated as live:
 * the field is documented and normally present, and refusing to show a real
 * account because one boolean was absent would be its own dishonesty.
 */
function isDisabled(c: { disabled: boolean | null }): boolean {
  return c.disabled === true;
}

/**
 * Everything one person's accounts view needs, as ONE fan-out.
 *
 * The connection list comes first and always, not only as a fallback: it is
 * the only place SnapTrade reports `disabled`, and without it a dead
 * connection's last cached holdings would be served as current.
 */
async function readAccounts(
  identity: SnapTradeIdentity,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<{ accounts: ConnectedAccount[]; connections: ConnectedConnection[]; source: string }> {
  const query = () =>
    buildUserQuery(
      creds.clientId,
      Math.floor(Date.now() / 1000),
      identity.snapTradeUserId,
      identity.userSecret,
    );
  const call = (path: string) => snapTradeCall(path, query(), creds, timeoutMs, fetchImpl);

  const rawConnections = await call(PATHS.connections());
  if (!Array.isArray(rawConnections)) throw badResponse('/authorizations did not return an array');
  const allConnections = rawConnections
    .map(mapConnection)
    .filter((c): c is NonNullable<ReturnType<typeof mapConnection>> => c !== null);
  const live = allConnections.filter((c) => !isDisabled(c));
  const liveIds = new Set(live.map((c) => c.id));

  let source: 'daily' | 'realtime' = 'daily';
  // Accounts from a disabled connection are dropped here rather than shown:
  // SnapTrade keeps serving their last cached state, and we have no way to
  // tell how old it is. The connection is still reported below, so the screen
  // says the connection is dead rather than silently showing nothing.
  let base = mapAccountList(await call(PATHS.accounts()), '/accounts').filter(
    (a) => a.connectionId === null || liveIds.has(a.connectionId),
  );

  // The daily cache has nothing. That is expected for a brokerage linked
  // today, so ask the live connections directly before concluding the
  // person has no account.
  if (base.length === 0 && live.length > 0) {
    const perConnection = await Promise.all(
      live.map(async (connection) =>
        mapAccountList(
          await call(PATHS.connectionAccounts(connection.id)),
          `/authorizations/${connection.id}/accounts`,
        ),
      ),
    );
    base = perConnection.flat().slice(0, MAX_ACCOUNTS);
    source = 'realtime';
  }

  // Every connection is reported, live or not, with what it returned — so a
  // zero-account answer can name the brokerage and say whether the connection
  // is dead or merely quiet.
  //
  // Counted from the accounts actually being returned, not from the real-time
  // fan-out: on the daily route that fan-out never runs, and counting it there
  // produced a response that said "1 account" and "this connection reported 0
  // accounts" in the same breath.
  const connections: ConnectedConnection[] = allConnections.map((c) => ({
    ...c,
    accountCount: base.filter((a) => a.connectionId === c.id).length,
  }));

  if (base.length === 0) {
    // An empty answer has two very different causes, and they were
    // indistinguishable from the response: SnapTrade may see no CONNECTION
    // for this person at all, or a live connection whose brokerage reports no
    // accounts. `connections` separates them and names the brokerage, so the
    // screen can state which. States and counts only; nothing here identifies
    // an account or a person.
    console.warn(
      `${ROUTE}: no accounts. /authorizations reported ${connections.length} connection(s): ` +
        connections.map((c) => `${c.brokerage ?? c.id} disabled=${c.disabled}`).join(', '),
    );
    return { accounts: [], connections, source };
  }

  const accounts: ConnectedAccount[] = await Promise.all(
    base.map(async (account) => {
      const [rawBalances, rawPositions] = await Promise.all([
        call(PATHS.balances(account.id)),
        call(PATHS.positions(account.id)),
      ]);
      const balances: ConnectedBalance[] = (Array.isArray(rawBalances) ? rawBalances : [])
        .map(mapBalance)
        .filter((b): b is ConnectedBalance => b !== null);

      // An envelope we cannot read is reported, never flattened to zero
      // positions — a real account full of holdings must not render as "no
      // positions" with no error anywhere.
      const envelope = unwrapPositions(rawPositions);
      if (envelope === null) throw badResponse(`/accounts/${account.id}/positions/all had no results array`);
      const positions: ConnectedPosition[] = envelope.rows
        .map(mapPosition)
        .filter((p): p is ConnectedPosition => p !== null);

      return { ...account, balances, positions, asOf: envelope.asOf, source };
    }),
  );

  return { accounts, connections, source };
}

/**
 * The caller's SnapTrade identity, registering them if this is their first
 * time.
 *
 * The order here is the whole point, and it is forced by the fact that
 * SnapTrade issues the `userSecret` exactly once (see
 * supabase/migrations/0007_snaptrade_users.sql):
 *
 *   1. read our own table — a failed read is NOT "not registered", because
 *      treating it as one would register a second user and strand the first
 *      secret, leaving a connection nobody can ever read or remove;
 *   2. register at SnapTrade;
 *   3. store the secret, and if that fails, delete the user just created so
 *      the next attempt starts clean rather than orphaning it.
 */
async function ensureIdentity(
  cfg: ServerConfig,
  supabaseUserId: string,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<SnapTradeIdentity> {
  const existing = await readSnapTradeIdentity(cfg, supabaseUserId, timeoutMs, fetchImpl);
  if (existing) return existing;
  if (existing === undefined) {
    console.error(`${ROUTE}: could not read the stored SnapTrade identity`);
    throw new UpstreamError({
      status: 502,
      error: 'identity_unreadable',
      message: 'Could not read your brokerage connection. Please try again.',
    });
  }

  const userId = snapTradeUserId(supabaseUserId);
  const registration = readRegistration(
    await snapTradeCall(
      PATHS.registerUser(),
      buildQuery(creds.clientId, Math.floor(Date.now() / 1000)),
      creds,
      timeoutMs,
      fetchImpl,
      { method: 'POST', body: { userId } },
    ),
  );
  if (registration === null) throw badResponse('/snapTrade/registerUser did not return a user secret');

  const identity: SnapTradeIdentity = {
    snapTradeUserId: registration.userId,
    userSecret: registration.userSecret,
  };
  if (await writeSnapTradeIdentity(cfg, supabaseUserId, identity, timeoutMs, fetchImpl)) {
    return identity;
  }

  // The secret is now held by nobody: it was in that response and nowhere
  // else. Undo the registration so the next attempt can register cleanly,
  // and report the failure rather than handing back an identity we cannot
  // read again.
  console.error(`${ROUTE}: storing the SnapTrade identity failed; deleting the user just registered`);
  try {
    await snapTradeCall(
      '/snapTrade/deleteUser',
      buildUserQuery(creds.clientId, Math.floor(Date.now() / 1000), identity.snapTradeUserId),
      creds,
      timeoutMs,
      fetchImpl,
      { method: 'DELETE' },
    );
  } catch {
    // Reported below either way; the person's next attempt is what matters,
    // and a SnapTrade user with no stored secret holds no connection yet.
  }
  throw new UpstreamError({
    status: 502,
    error: 'identity_not_saved',
    message: 'Could not save your brokerage connection. Please try again.',
  });
}

/**
 * Per-user, read-only brokerage data: GET /api/snaptrade
 * The connection portal link:              POST /api/snaptrade
 * Removing a connection:                   DELETE /api/snaptrade?connectionId=…
 *
 * WHY THREE METHODS ON ONE ROUTE rather than three files: Vercel turns every
 * file under api/ into its own Serverless Function and the plan allows
 * twelve, which the app is already close to (see api/_tests/README.md). These
 * three are one resource — the caller's brokerage connections — so the method
 * is the right axis to split them on anyway.
 *
 * THE SECURITY PROPERTY that makes this safe to expose: the person acted on
 * comes from a VERIFIED Supabase access token, and their SnapTrade
 * credentials are read from a table only the service role can see. A caller
 * cannot reach anyone's brokerage data but their own, whatever they send —
 * the only value taken from the request at all is the connection id to
 * remove, and that is checked against their own connections before it is
 * used.
 *
 * READ-ONLY: the portal is requested with `connectionType: 'read'` (see
 * _lib/snaptrade.ts) and no trading path is reachable from this app.
 *
 * DATA-HONESTY CONTRACT, the same one /api/news and the screener hold: any
 * failure returns 4xx/5xx with { error, message } for the frontend to render
 * as "unavailable". Zero connected accounts is a legitimate 200 with an empty
 * list — that is the true answer before a brokerage has been linked, not an
 * error, and never a reason to invent a holding.
 */
export function createHandler(timeoutMs: number, fetchImpl: typeof fetch = fetch) {
  return async function handler(req: ApiRequest, res: ApiResponse) {
    const method = req.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Use GET, POST or DELETE.' });
    }

    const clientId = process.env.SNAPTRADE_CLIENT_ID;
    const consumerKey = process.env.SNAPTRADE_CONSUMER_KEY;
    const cfg = serverConfig();
    if (!clientId || !consumerKey || !cfg) {
      // A deploy/config problem, not a caller error — specific in the log,
      // generic in the body.
      console.error(
        `${ROUTE}: SNAPTRADE_CLIENT_ID / SNAPTRADE_CONSUMER_KEY / the Supabase service key are not all set`,
      );
      return res
        .status(500)
        .json({ error: 'not_configured', message: 'Brokerage connections are not configured.' });
    }
    const creds = { clientId, consumerKey };

    const caller = await verifiedCaller(req, cfg, timeoutMs, fetchImpl);
    if (!caller.ok) {
      const { status, error, message } = caller.failure;
      return res.status(status).json({ error, message });
    }

    try {
      if (method === 'GET') return await handleGet(req, res, cfg, caller.userId, creds, timeoutMs, fetchImpl);
      if (method === 'POST')
        return await handleConnect(req, res, cfg, caller.userId, creds, timeoutMs, fetchImpl);
      return await handleDisconnect(req, res, cfg, caller.userId, creds, timeoutMs, fetchImpl);
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

/** The caller's accounts, or the honest empty answer of someone with none. */
async function handleGet(
  _req: ApiRequest,
  res: ApiResponse,
  cfg: ServerConfig,
  supabaseUserId: string,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
) {
  const identity = await readSnapTradeIdentity(cfg, supabaseUserId, timeoutMs, fetchImpl);
  if (identity === undefined) {
    console.error(`${ROUTE}: could not read the stored SnapTrade identity`);
    return res.status(502).json({
      error: 'identity_unreadable',
      message: 'Could not read your brokerage connection. Please try again.',
    });
  }
  // Never registered, so nothing is linked. A real answer — and deliberately
  // reached WITHOUT registering: reading your accounts should not create an
  // account at a third party. That happens when you ask to connect one.
  if (identity === null) {
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ accounts: [], connections: [], source: 'daily' });
  }

  const body = await readAccounts(identity, creds, timeoutMs, fetchImpl);
  // `private, no-store`: this is one person's money, and the previous
  // version's shared edge cache would have been a cross-user leak the moment
  // the route stopped serving a single demo account.
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json(body);
}

/** A connection portal link for the caller, registering them if need be. */
async function handleConnect(
  req: ApiRequest,
  res: ApiResponse,
  cfg: ServerConfig,
  supabaseUserId: string,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
) {
  const identity = await ensureIdentity(cfg, supabaseUserId, creds, timeoutMs, fetchImpl);
  const raw = await snapTradeCall(
    PATHS.login(),
    buildUserQuery(
      creds.clientId,
      Math.floor(Date.now() / 1000),
      identity.snapTradeUserId,
      identity.userSecret,
    ),
    creds,
    timeoutMs,
    fetchImpl,
    { method: 'POST', body: connectBody(returnTo(req), darkMode(req)) },
  );
  const redirectUri = readRedirectUri(raw);
  if (redirectUri === null) throw badResponse('/snapTrade/login did not return a portal URL');
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).json({ redirectUri });
}

/** Remove one of the caller's connections. */
async function handleDisconnect(
  req: ApiRequest,
  res: ApiResponse,
  cfg: ServerConfig,
  supabaseUserId: string,
  creds: Creds,
  timeoutMs: number,
  fetchImpl: typeof fetch,
) {
  const raw = req.query.connectionId;
  const connectionId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  // A uuid and nothing else. The path is built from this, so the shape is
  // checked rather than trusted — and it is checked against the caller's own
  // connections below, which is what stops one person removing another's.
  if (!connectionId || !/^[0-9a-fA-F-]{36}$/.test(connectionId)) {
    return res
      .status(400)
      .json({ error: 'invalid_connection', message: 'Query param "connectionId" must be a connection id.' });
  }

  const identity = await readSnapTradeIdentity(cfg, supabaseUserId, timeoutMs, fetchImpl);
  if (identity === undefined) {
    return res.status(502).json({
      error: 'identity_unreadable',
      message: 'Could not read your brokerage connection. Please try again.',
    });
  }
  if (identity === null) {
    return res.status(404).json({ error: 'not_connected', message: 'You have no brokerage connection.' });
  }

  // Ownership, established against SnapTrade rather than assumed. The
  // credentials sent are the caller's, so SnapTrade would refuse another
  // person's connection anyway — but its refusal is a 4xx we would have to
  // interpret, where this is a fact we can state.
  const rawConnections = await snapTradeCall(
    PATHS.connections(),
    buildUserQuery(
      creds.clientId,
      Math.floor(Date.now() / 1000),
      identity.snapTradeUserId,
      identity.userSecret,
    ),
    creds,
    timeoutMs,
    fetchImpl,
  );
  if (!Array.isArray(rawConnections)) throw badResponse('/authorizations did not return an array');
  const owned = rawConnections
    .map(mapConnection)
    .some((c) => c !== null && c.id.toLowerCase() === connectionId.toLowerCase());
  if (!owned) {
    return res
      .status(404)
      .json({ error: 'not_connected', message: 'That brokerage connection is not one of yours.' });
  }

  await snapTradeCall(
    PATHS.deleteConnection(connectionId),
    buildUserQuery(
      creds.clientId,
      Math.floor(Date.now() / 1000),
      identity.snapTradeUserId,
      identity.userSecret,
    ),
    creds,
    timeoutMs,
    fetchImpl,
    { method: 'DELETE' },
  );
  res.setHeader('Cache-Control', 'private, no-store');
  // SnapTrade's removal is asynchronous — a 200 means it was queued — so the
  // response says `queued`, not `removed`. The screen re-reads rather than
  // asserting the connection is already gone.
  return res.status(200).json({ queued: true });
}

/**
 * Where the portal sends the person when they finish: this app's own origin,
 * from the request that asked.
 *
 * Taken from the Origin header rather than a configured constant so a
 * preview deployment returns to itself instead of to production, and
 * validated to be an https origin and nothing more — it is handed to a third
 * party as a redirect target, which is exactly the kind of value that must
 * not be whatever a caller typed. Anything else falls back to no redirect at
 * all, which leaves the person on SnapTrade's own completion screen: worse,
 * but not a redirect somewhere they did not come from.
 */
export function returnTo(req: ApiRequest): string {
  const raw = req.headers?.origin ?? req.headers?.Origin;
  const origin = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  return /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : '';
}

/** Whether the portal should render dark, following the app's own theme. */
function darkMode(req: ApiRequest): boolean {
  const raw = req.query.theme;
  return (Array.isArray(raw) ? raw[0] : raw) !== 'light';
}

export default createHandler(DEFAULT_UPSTREAM_TIMEOUT_MS);
