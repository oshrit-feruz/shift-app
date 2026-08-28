import { describe, expect, it } from 'vitest';
import { reasonFromResponse } from './providerReason';

const FALLBACK = { en: 'News is unavailable right now.', he: 'החדשות אינן זמינות כרגע.' };

function failure(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 502 });
}

describe('reasonFromResponse', () => {
  it('names a refused subscription rather than telling the reader to wait', async () => {
    const reason = await reasonFromResponse(
      failure({ error: 'upstream_forbidden', upstreamStatus: 403 }),
      FALLBACK,
    );
    expect(reason).not.toEqual(FALLBACK);
    expect(reason.he).toContain('מנוי');
    expect(reason.en).toContain('subscription');
  });

  it.each([['upstream_unauthorized'], ['upstream_rate_limited'], ['upstream_timeout'], ['not_configured']])(
    'gives %s its own wording in both languages',
    async (code) => {
      const reason = await reasonFromResponse(failure({ error: code }), FALLBACK);
      expect(reason).not.toEqual(FALLBACK);
      expect(reason.en.trim()).not.toBe('');
      expect(reason.he.trim()).not.toBe('');
    },
  );

  // Never invent a diagnosis from a body we did not understand: the generic
  // wording is the honest answer when the specific one is unknown.
  it.each([
    ['an unknown code', failure({ error: 'something_new' })],
    ['a non-string code', failure({ error: 42 })],
    ['no error field', failure({ message: 'nope' })],
    ['a JSON array', failure([1, 2])],
    ['a null body', failure(null)],
    ['unparseable text', new Response('<html>504</html>', { status: 504 })],
  ])('falls back to the generic reason for %s', async (_label, res) => {
    expect(await reasonFromResponse(res, FALLBACK)).toEqual(FALLBACK);
  });

  it('does not throw when the body was already consumed', async () => {
    const res = failure({ error: 'upstream_timeout' });
    await res.text();
    expect(await reasonFromResponse(res, FALLBACK)).toEqual(FALLBACK);
  });
});
