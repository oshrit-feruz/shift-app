import { describe, expect, it } from 'vitest';
import { classifyFetchError, classifyUpstreamStatus, failureBody, isAbortError } from './upstream.js';

describe('classifyUpstreamStatus', () => {
  // The distinction that matters operationally: 401/403 will not fix itself
  // — the key or its plan has to change — while 5xx probably will. Reporting
  // both as one code told a reader "try again later" for a problem no amount
  // of waiting resolves.
  it.each([
    [401, 'upstream_unauthorized'],
    [402, 'upstream_forbidden'],
    [403, 'upstream_forbidden'],
    [429, 'upstream_rate_limited'],
    [418, 'upstream_error'],
    [500, 'upstream_error'],
    [503, 'upstream_error'],
  ])('maps %i to %s', (status, error) => {
    const f = classifyUpstreamStatus(status, 'earnings');
    expect(f.error).toBe(error);
    expect(f.status).toBe(502);
    // The provider's own status is carried through: one curl then tells a
    // plan problem from an outage without reading server logs.
    expect(f.upstreamStatus).toBe(status);
  });

  it('names the surface in the message', () => {
    expect(classifyUpstreamStatus(403, 'news').message).toContain('news');
    expect(classifyUpstreamStatus(403, 'earnings').message).toContain('earnings');
  });
});

describe('classifyFetchError', () => {
  it('reports our own abort as a timeout, with the budget that elapsed', () => {
    const f = classifyFetchError(new DOMException('Aborted', 'AbortError'), 15_000, 'news');
    expect(f.error).toBe('upstream_timeout');
    expect(f.timeoutMs).toBe(15_000);
    expect(f.upstreamStatus).toBeUndefined();
  });

  // A provider that answered in 16 seconds and one we never reached are
  // different facts; collapsing them sends whoever is debugging it looking
  // in the wrong place.
  it('reports anything else as unreachable', () => {
    const f = classifyFetchError(new TypeError('fetch failed'), 15_000, 'news');
    expect(f.error).toBe('upstream_unavailable');
    expect(f.timeoutMs).toBeUndefined();
  });
});

describe('isAbortError', () => {
  it.each([
    ['an AbortError', new DOMException('Aborted', 'AbortError'), true],
    ['a plain error', new Error('nope'), false],
    ['a string', 'AbortError', false],
    ['null', null, false],
    ['a lookalike object', { name: 'AbortError' }, true],
  ])('%s -> %s', (_label, value, expected) => {
    expect(isAbortError(value)).toBe(expected);
  });
});

describe('failureBody', () => {
  it('omits the fields that do not apply', () => {
    expect(failureBody(classifyFetchError(new TypeError('x'), 1, 'news'))).toEqual({
      error: 'upstream_unavailable',
      message: 'Could not reach the news provider.',
    });
  });

  it('never carries anything beyond the reported facts', () => {
    const body = failureBody(classifyUpstreamStatus(403, 'earnings'));
    expect(Object.keys(body).sort()).toEqual(['error', 'message', 'upstreamStatus']);
  });
});
