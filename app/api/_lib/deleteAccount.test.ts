import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../delete-account.js';
import { makeRes } from './failureContract.js';

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VERIFIED_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  if (ORIGINAL_URL === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = ORIGINAL_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL_KEY;
});

/** Happy-path upstream: /auth/v1/user identifies the caller, DELETE succeeds. */
function mockUpstream(opts: { whoOk?: boolean; deleteOk?: boolean; id?: unknown } = {}) {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = vi.fn().mockImplementation((input: string, init?: { method?: string }) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET' });
    if (url.endsWith('/auth/v1/user')) {
      return Promise.resolve(
        new Response(JSON.stringify({ id: 'id' in opts ? opts.id : VERIFIED_ID }), {
          status: opts.whoOk === false ? 401 : 200,
        }),
      );
    }
    return Promise.resolve(new Response('', { status: opts.deleteOk === false ? 500 : 200 }));
  }) as unknown as typeof fetch;
  return calls;
}

const authed = { method: 'POST', query: {}, headers: { authorization: 'Bearer tok' } };

describe('delete-account handler', () => {
  it('rejects non-POST methods', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('POST');
  });

  it('refuses honestly when the service key is not configured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
  });

  it.each([
    ['no header', {}],
    ['wrong scheme', { authorization: 'Basic abc' }],
    ['empty token', { authorization: 'Bearer   ' }],
  ])('rejects a request with %s', async (_label, headers) => {
    const res = makeRes();
    await handler({ method: 'POST', query: {}, headers }, res);
    expect(res._status).toBe(401);
  });

  it('rejects a token the auth server does not recognise', async () => {
    mockUpstream({ whoOk: false });
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(401);
  });

  it('rejects a verification response with no user id', async () => {
    mockUpstream({ id: null });
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(401);
  });

  it('deletes the account and reports it', async () => {
    const calls = mockUpstream();
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ deleted: true });
    expect(calls[1]).toEqual({
      url: `https://project.supabase.co/auth/v1/admin/users/${VERIFIED_ID}`,
      method: 'DELETE',
    });
  });

  // The security property of this endpoint: the id deleted comes from the
  // verified token, never from anything the caller sent. A request that tries
  // to name someone else still deletes only the caller.
  it('ignores any user id supplied by the caller', async () => {
    const calls = mockUpstream();
    const res = makeRes();
    await handler(
      { ...authed, query: { user_id: 'cccccccc-9999-9999-9999-dddddddddddd', id: 'victim' } },
      res,
    );
    expect(res._status).toBe(200);
    expect(calls[1].url).toContain(VERIFIED_ID);
    expect(calls[1].url).not.toContain('victim');
  });

  it('reports failure rather than claiming success when the delete fails', async () => {
    mockUpstream({ deleteOk: false });
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'delete_failed' });
  });

  it('reports failure when the auth server is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
    const res = makeRes();
    await handler(authed, res);
    expect(res._status).toBe(502);
  });
});
