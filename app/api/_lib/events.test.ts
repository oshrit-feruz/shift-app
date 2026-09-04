import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../events.js';
import { makeRes } from './failureContract.js';

/**
 * The two properties this route exists to keep, and which a refactor could
 * quietly lose: it writes exactly the three columns the table has, and it
 * never writes the caller's identity.
 */

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_URL = process.env.SUPABASE_URL;
const ORIGINAL_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VERIFIED_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const ANON = 'a-11111111-2222-3333-4444-555555555555';
const SESSION = 's-66666666-7777-8888-9999-000000000000';

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

/** Upstream: /auth/v1/user identifies the caller, the insert succeeds. */
function mockUpstream(opts: { whoOk?: boolean; insertStatus?: number } = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = vi
    .fn()
    .mockImplementation((input: string, init?: { method?: string; body?: string }) => {
      const url = String(input);
      calls.push({
        url,
        method: init?.method ?? 'GET',
        body: init?.body ? JSON.parse(init.body) : undefined,
      });
      if (url.endsWith('/auth/v1/user')) {
        return Promise.resolve(
          new Response(JSON.stringify({ id: VERIFIED_ID }), { status: opts.whoOk === false ? 401 : 200 }),
        );
      }
      return Promise.resolve(new Response('', { status: opts.insertStatus ?? 201 }));
    }) as unknown as typeof fetch;
  return calls;
}

function post(body: unknown, headers: Record<string, string> = { authorization: 'Bearer tok' }) {
  return { method: 'POST', query: {}, headers, body };
}

const valid = { name: 'reco_started', sessionId: SESSION, anonId: ANON };

describe('/api/events', () => {
  it('records a valid event and answers 202', async () => {
    const calls = mockUpstream();
    const res = makeRes();
    await handler(post(valid), res);
    expect(res._status).toBe(202);
    expect(res._body).toEqual({ recorded: true });
    const insert = calls.find((c) => c.url.includes('/rest/v1/funnel_events'));
    expect(insert?.method).toBe('POST');
  });

  it('writes only the stage and the two anonymous ids — never the caller', async () => {
    // The privacy property, asserted rather than asserted-in-a-comment: the
    // verified user id is resolved by this route and must not reach the row.
    const calls = mockUpstream();
    await handler(post(valid), makeRes());
    const insert = calls.find((c) => c.url.includes('/rest/v1/funnel_events'));
    expect(insert?.body).toEqual({ name: 'reco_started', session_id: SESSION, anon_id: ANON });
    expect(JSON.stringify(insert?.body)).not.toContain(VERIFIED_ID);
  });

  it('does not send a client-supplied timestamp, so the server clock wins', async () => {
    const calls = mockUpstream();
    await handler(post({ ...valid, created_at: '1999-01-01T00:00:00Z' }), makeRes());
    const insert = calls.find((c) => c.url.includes('/rest/v1/funnel_events'));
    expect(insert?.body).not.toHaveProperty('created_at');
  });

  it.each(['reco_started', 'reco_completed', 'broker_screen_viewed', 'broker_action_clicked'])(
    'accepts the %s stage',
    async (name) => {
      mockUpstream();
      const res = makeRes();
      await handler(post({ ...valid, name }), res);
      expect(res._status).toBe(202);
    },
  );

  it('rejects an unknown event name rather than storing it', async () => {
    const calls = mockUpstream();
    const res = makeRes();
    await handler(post({ ...valid, name: 'something_else' }), res);
    expect(res._status).toBe(400);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it.each([
    ['a short session id', { ...valid, sessionId: 'tiny' }],
    ['a short device id', { ...valid, anonId: 'tiny' }],
    ['a non-string id', { ...valid, anonId: 42 }],
    ['an over-long id', { ...valid, anonId: 'x'.repeat(65) }],
  ])('rejects %s', async (_label, body) => {
    mockUpstream();
    const res = makeRes();
    await handler(post(body), res);
    expect(res._status).toBe(400);
  });

  it('rejects a non-object body', async () => {
    mockUpstream();
    const res = makeRes();
    await handler(post('not-an-object'), res);
    expect(res._status).toBe(400);
  });

  it('refuses an unauthenticated caller, so the table is not a public write endpoint', async () => {
    const calls = mockUpstream();
    const res = makeRes();
    await handler(post(valid, {}), res);
    expect(res._status).toBe(401);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('refuses a token Supabase rejects', async () => {
    const calls = mockUpstream({ whoOk: false });
    const res = makeRes();
    await handler(post(valid), res);
    expect(res._status).toBe(401);
    expect(calls.some((c) => c.url.includes('/rest/v1/'))).toBe(false);
  });

  it('reports a failed insert rather than claiming the event was recorded', async () => {
    mockUpstream({ insertStatus: 400 });
    const res = makeRes();
    await handler(post(valid), res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: 'write_failed' });
  });

  it('says so when the deployment has no service key, rather than a silent 200', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = makeRes();
    await handler(post(valid), res);
    expect(res._status).toBe(500);
    expect(res._body).toMatchObject({ error: 'not_configured' });
  });

  it('rejects any method but POST', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: {}, headers: {}, body: undefined }, res);
    expect(res._status).toBe(405);
    expect(res._headers.Allow).toBe('POST');
  });

  it('is never cached', async () => {
    mockUpstream();
    const res = makeRes();
    await handler(post(valid), res);
    expect(res._headers['Cache-Control']).toBe('private, no-store');
  });
});
