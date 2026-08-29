import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTranslationMemo,
  deeplEndpoint,
  isHebrew,
  MAX_TEXTS_PER_REQUEST,
  translateToHebrew,
} from './translate.js';

/** A DeepL success for whatever texts the request carried, prefixed so the mapping is visible. */
function deeplOk(prefix = 'HE:') {
  return vi.fn(async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { text: string[] };
    return new Response(JSON.stringify({ translations: body.text.map((t) => ({ text: `${prefix}${t}` })) }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  // The memo is module state that deliberately survives invocations in
  // production; a test that inherited it from the previous case would pass
  // for the wrong reason.
  clearTranslationMemo();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isHebrew', () => {
  it('recognises Hebrew text and leaves everything else alone', () => {
    expect(isHebrew('אנבידיה מעלה תחזית')).toBe(true);
    expect(isHebrew('NVIDIA lifts outlook')).toBe(false);
    expect(isHebrew('')).toBe(false);
  });
});

describe('deeplEndpoint', () => {
  // A free key answered on the paid host comes back as an auth error, which
  // would read as "bad key" rather than "wrong host".
  it('routes a free key to the free host and anything else to the paid one', () => {
    expect(deeplEndpoint('abc-123:fx')).toContain('api-free.deepl.com');
    expect(deeplEndpoint('abc-123')).toBe('https://api.deepl.com/v2/translate');
  });
});

describe('translateToHebrew', () => {
  it('translates in order and preserves length', async () => {
    const out = await translateToHebrew(['one', 'two'], 'k:fx', 1_000, deeplOk());
    expect(out).toEqual(['HE:one', 'HE:two']);
  });

  it('sends the key in DeepL’s own header scheme and pins EN->HE', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const spy = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({ translations: [{ text: 'שלום' }] }), { status: 200 });
    }) as unknown as typeof fetch;

    await translateToHebrew(['hello'], 'secret:fx', 1_000, spy);

    expect(seenUrl).toContain('api-free.deepl.com');
    expect((seenInit?.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key secret:fx');
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({ source_lang: 'EN', target_lang: 'HE' });
  });

  it('passes empty strings and already-Hebrew text through without spending quota', async () => {
    const spy = deeplOk();
    const out = await translateToHebrew(['', 'כותרת בעברית', 'real'], 'k:fx', 1_000, spy);
    expect(out).toEqual(['', 'כותרת בעברית', 'HE:real']);
    // The one request carried only the string that actually needed translating.
    expect(JSON.parse(String(vi.mocked(spy).mock.calls[0][1]?.body)).text).toEqual(['real']);
  });

  it('makes no request at all when nothing needs translating', async () => {
    const spy = deeplOk();
    const out = await translateToHebrew(['', 'עברית'], 'k:fx', 1_000, spy);
    expect(out).toEqual(['', 'עברית']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a repeated string once and writes it back to every position', async () => {
    const spy = deeplOk();
    const out = await translateToHebrew(['same', 'other', 'same'], 'k:fx', 1_000, spy);
    expect(out).toEqual(['HE:same', 'HE:other', 'HE:same']);
    expect(JSON.parse(String(vi.mocked(spy).mock.calls[0][1]?.body)).text).toEqual(['same', 'other']);
  });

  it('chunks at DeepL’s 50-text limit', async () => {
    const spy = deeplOk();
    const texts = Array.from({ length: MAX_TEXTS_PER_REQUEST + 10 }, (_, i) => `text ${i}`);
    const out = await translateToHebrew(texts, 'k:fx', 5_000, spy);

    expect(out).toEqual(texts.map((t) => `HE:${t}`));
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(spy).mock.calls) {
      expect(JSON.parse(String(call[1]?.body)).text.length).toBeLessThanOrEqual(MAX_TEXTS_PER_REQUEST);
    }
  });

  it('reuses a memoised translation instead of paying for it twice', async () => {
    const first = deeplOk();
    await translateToHebrew(['repeat me'], 'k:fx', 1_000, first);

    const second = deeplOk('SHOULD-NOT-BE-CALLED:');
    const out = await translateToHebrew(['repeat me'], 'k:fx', 1_000, second);

    expect(out).toEqual(['HE:repeat me']);
    expect(second).not.toHaveBeenCalled();
  });

  // Every failure below returns null, and the caller then serves the English
  // original. A partial or mis-paired result would be worse than no
  // translation: it would put one article's words under another's headline.
  it.each([
    ['a non-2xx status', async () => new Response('nope', { status: 500 })],
    ['a spent free quota (456)', async () => new Response('quota', { status: 456 })],
    ['a rejected key', async () => new Response('forbidden', { status: 403 })],
    ['a body of the wrong shape', async () => new Response(JSON.stringify({ nope: true }), { status: 200 })],
    ['unparseable JSON', async () => new Response('not json{{{', { status: 200 })],
    [
      'a translations entry that is not a string',
      async () => new Response(JSON.stringify({ translations: [{ text: 42 }] }), { status: 200 }),
    ],
    [
      'fewer translations than texts',
      async () => new Response(JSON.stringify({ translations: [] }), { status: 200 }),
    ],
    [
      'more translations than texts',
      async () =>
        new Response(JSON.stringify({ translations: [{ text: 'a' }, { text: 'b' }] }), { status: 200 }),
    ],
    [
      'a network failure',
      async () => {
        throw new Error('offline');
      },
    ],
  ])('returns null on %s', async (_label, impl) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await translateToHebrew(['one'], 'k:fx', 1_000, impl as unknown as typeof fetch)).toBeNull();
  });

  it('returns null on a timeout, and does not memoise the failed text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stalled = (async (_url: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;

    expect(await translateToHebrew(['slow'], 'k:fx', 10, stalled)).toBeNull();

    // A failure must be retried next time, not remembered as an answer.
    const retry = deeplOk();
    expect(await translateToHebrew(['slow'], 'k:fx', 1_000, retry)).toEqual(['HE:slow']);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shares one budget across chunks rather than restarting it per request', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // The clock is driven rather than raced: the first chunk "takes" ten
    // seconds against a one-second budget, so the second must not be sent at
    // all. Given a per-request timeout instead of a shared deadline, a long
    // feed could run for chunks × timeout — the thing this asserts against.
    const clock = [0, 0, 10_000, 10_000];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.shift() ?? 10_000);

    const spy = deeplOk();
    const texts = Array.from({ length: MAX_TEXTS_PER_REQUEST + 1 }, (_, i) => `t${i}`);
    expect(await translateToHebrew(texts, 'k:fx', 1_000, spy)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
