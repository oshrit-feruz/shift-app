import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../snaptrade-link.js';
import { makeRes } from './failureContract.js';
import { open } from './secretBox.js';
// The environment, the fixed encryption key and the stubbed Supabase answers
// are shared with the account-route suite: both routes resolve the caller the
// same way, and two copies of that setup could drift into testing different
// things.
import {
  AUTHED,
  AUTH_USER_ID,
  ENC_KEY,
  SUPABASE_URL,
  USER_SECRET,
  captureEnv,
  jsonResponse,
  linkedRow,
  restoreEnv,
  setEnv,
} from './snaptradeTestKit.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = captureEnv();
const PORTAL = 'https://app.snaptrade.com/portal/session-1';

const POST = { method: 'POST', query: {}, headers: { ...AUTHED, host: 'shift.example' } };
const DELETE = { ...POST, method: 'DELETE' };

/** Every request the handler made, in order, so a test can assert the flow. */
interface Call {
  url: string;
  method: string;
  body: unknown;
}
let calls: Call[];
/** The stored row, or [] for a user who has connected nothing. */
let row: unknown[];
/** Overridable per test so the register-conflict path can be exercised. */
let registerResponse: () => Promise<Response>;

function install() {
  calls = [];
  globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });

    if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return jsonResponse({ id: AUTH_USER_ID });
    if (url.startsWith(`${SUPABASE_URL}/rest/v1/snaptrade_users`)) {
      if (method === 'GET') return jsonResponse(row);
      // A write. PostgREST answers 201/204 with no body under return=minimal.
      return jsonResponse(null, 204);
    }
    if (url.includes('/snapTrade/registerUser')) return registerResponse();
    if (url.includes('/snapTrade/login')) return jsonResponse({ redirectURI: PORTAL, sessionId: 's' });
    if (url.includes('/snapTrade/deleteUser')) return jsonResponse({ status: 'deleted' });
    throw new Error(`unexpected call to ${url}`);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  setEnv();
  row = [];
  registerResponse = async () => jsonResponse({ userId: AUTH_USER_ID, userSecret: USER_SECRET });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  install();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  restoreEnv(ORIGINAL_ENV);
});

const upstream = (fragment: string) => calls.filter((c) => c.url.includes(fragment));

describe('/api/snaptrade-link', () => {
  it('rejects methods that are neither connecting nor disconnecting', async () => {
    const res = makeRes();
    await handler({ ...POST, method: 'GET' }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('POST, DELETE');
  });

  it('refuses a caller with no bearer token', async () => {
    const res = makeRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res._status).toBe(401);
    expect(upstream('snapTrade')).toEqual([]);
  });

  it('never lets a link response into a cache', async () => {
    const res = makeRes();
    await handler(POST, res);
    expect(res._headers['Cache-Control']).toBe('private, no-store');
  });

  it('registers a new user under their Supabase id and returns a portal URL', async () => {
    const res = makeRes();
    await handler(POST, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ redirectURI: PORTAL, expiresInSeconds: 300 });
    // The id is the verified user's, not anything the request carried.
    expect(upstream('/snapTrade/registerUser')[0].body).toEqual({ userId: AUTH_USER_ID });
  });

  it('asks for a READ connection, never one that could trade', async () => {
    // What the user is being asked to grant. 'trade' or 'trade-if-available'
    // would hand this app an ability it has no confirmation flow for.
    await handler(POST, makeRes());
    const body = upstream('/snapTrade/login')[0].body as Record<string, unknown>;
    expect(body.connectionType).toBe('read');
    expect(JSON.stringify(body)).not.toMatch(/trade-if-available/);
  });

  it('stores the secret sealed, never in plaintext', async () => {
    await handler(POST, makeRes());
    const write = calls.find((c) => c.url.includes('/rest/v1/snaptrade_users') && c.method === 'POST');
    const stored = (write?.body as { user_secret: string }).user_secret;
    expect(stored).not.toContain(USER_SECRET);
    // And it is the real secret underneath, not a hash that could never be used.
    expect(open(stored, ENC_KEY)).toBe(USER_SECRET);
  });

  it('stores the secret before opening the portal', async () => {
    // Order matters: a connection completed against a secret we failed to
    // store is a live link to someone's brokerage that nobody can read or
    // revoke.
    await handler(POST, makeRes());
    const write = calls.findIndex((c) => c.url.includes('/rest/v1/snaptrade_users') && c.method === 'POST');
    const login = calls.findIndex((c) => c.url.includes('/snapTrade/login'));
    expect(write).toBeGreaterThan(-1);
    expect(write).toBeLessThan(login);
  });

  it('does not register a second time for a user who already has a link', async () => {
    row = linkedRow();
    const res = makeRes();
    await handler(POST, res);
    expect(res._status).toBe(200);
    expect(upstream('/snapTrade/registerUser')).toEqual([]);
    expect(upstream('/snapTrade/login')[0].url).toContain(`userSecret=${USER_SECRET}`);
  });

  it('sends the user back to the host they came from, not to anything they asked for', async () => {
    await handler({ ...POST, query: { customRedirect: 'https://evil.example' } }, makeRes());
    const body = upstream('/snapTrade/login')[0].body as Record<string, unknown>;
    expect(body.customRedirect).toBe('https://shift.example/');
  });

  it('prefers the configured redirect when there is one', async () => {
    process.env.SNAPTRADE_REDIRECT_URL = 'https://shift.app/connected';
    await handler(POST, makeRes());
    const body = upstream('/snapTrade/login')[0].body as Record<string, unknown>;
    expect(body.customRedirect).toBe('https://shift.app/connected');
  });

  it('refuses a portal URL that is not https rather than navigating to it', async () => {
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return jsonResponse({ id: AUTH_USER_ID });
      if (url.startsWith(`${SUPABASE_URL}/rest/v1/snaptrade_users`)) return jsonResponse(linkedRow());
      return jsonResponse({ redirectURI: 'javascript:alert(1)' });
    }) as unknown as typeof fetch;
    const res = makeRes();
    await handler(POST, res);
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('resets a link SnapTrade still holds but we have no secret for', async () => {
    // The divergent state a half-completed disconnect leaves. The secret is
    // only ever returned at registration, so the user cannot be recovered —
    // only removed and made again.
    registerResponse = async () => jsonResponse({ detail: 'user already exists' }, 400);
    const res = makeRes();
    await handler(POST, res);
    expect(res._status).toBe(409);
    expect((res._body as { error: string }).error).toBe('link_reset');
    expect(upstream('/snapTrade/deleteUser')).toHaveLength(1);
  });

  it('revokes at SnapTrade, not just here', async () => {
    // A "disconnect" that only forgot our row would leave a live read
    // connection to the user's brokerage that nothing could revoke.
    row = linkedRow();
    const res = makeRes();
    await handler(DELETE, res);

    expect(res._status).toBe(200);
    expect(res._body).toEqual({ disconnected: true });
    const revoke = upstream('/snapTrade/deleteUser')[0];
    expect(revoke.method).toBe('DELETE');
    expect(revoke.url).toContain(`userId=${AUTH_USER_ID}`);
    // The secret is not needed to delete a user, so it is not put in a URL.
    expect(revoke.url).not.toContain('userSecret');
  });

  it('revokes upstream before forgetting the row', async () => {
    row = linkedRow();
    await handler(DELETE, makeRes());
    const revoke = calls.findIndex((c) => c.url.includes('/snapTrade/deleteUser'));
    const forget = calls.findIndex((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/'));
    expect(revoke).toBeLessThan(forget);
  });

  it('keeps the row when the upstream revoke fails', async () => {
    row = linkedRow();
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: null });
      if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return jsonResponse({ id: AUTH_USER_ID });
      if (url.startsWith(`${SUPABASE_URL}/rest/v1/snaptrade_users`)) return jsonResponse(linkedRow());
      return jsonResponse({ detail: 'nope' }, 500);
    }) as unknown as typeof fetch;

    const res = makeRes();
    await handler(DELETE, res);
    expect(res._status).toBe(502);
    // Nothing was deleted on this side either: the two must not diverge on a
    // failure, or the connection becomes live and unrevocable.
    expect(calls.filter((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/'))).toEqual([]);
  });

  it('finishes a disconnect SnapTrade says it has already done', async () => {
    // A 404 means there is nothing left upstream to revoke. Refusing here
    // would leave the row — and the user — permanently stuck connected to an
    // account that no longer exists.
    row = linkedRow();
    globalThis.fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? 'GET', body: null });
      if (url.startsWith(`${SUPABASE_URL}/auth/v1/user`)) return jsonResponse({ id: AUTH_USER_ID });
      if (url.startsWith(`${SUPABASE_URL}/rest/v1/snaptrade_users`)) {
        return init?.method === 'DELETE' ? jsonResponse(null, 204) : jsonResponse(linkedRow());
      }
      return jsonResponse({ detail: 'not found' }, 404);
    }) as unknown as typeof fetch;

    const res = makeRes();
    await handler(DELETE, res);
    expect(res._status).toBe(200);
    expect(calls.filter((c) => c.method === 'DELETE' && c.url.includes('/rest/v1/'))).toHaveLength(1);
  });

  it('treats disconnecting nothing as done, not as an error', async () => {
    const res = makeRes();
    await handler(DELETE, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ disconnected: true });
    expect(upstream('/snapTrade/deleteUser')).toEqual([]);
  });
});
