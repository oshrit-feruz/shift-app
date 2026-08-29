import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chunkTexts,
  clearTranslationMemo,
  decodeEntities,
  isHebrew,
  MAX_CHARS_PER_REQUEST,
  MAX_TEXTS_PER_REQUEST,
  translateToHebrew,
} from './translate.js';

/** A Google success for whatever texts the request carried, prefixed so the mapping is visible. */
function googleOk(prefix = 'HE:') {
  return vi.fn(async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { q: string[] };
    return new Response(
      JSON.stringify({ data: { translations: body.q.map((t) => ({ translatedText: `${prefix}${t}` })) } }),
      { status: 200 },
    );
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

describe('decodeEntities', () => {
  // The v2 API HTML-escapes its output even for format: 'text', so an
  // undecoded string reaches the card literally — "Nvidia&#39;s outlook".
  it('undoes the escaping the API applies to its output', () => {
    expect(decodeEntities('Nvidia&#39;s outlook')).toBe("Nvidia's outlook");
    expect(decodeEntities('AT&amp;T &lt;tag&gt; &quot;quoted&quot;')).toBe('AT&T <tag> "quoted"');
    expect(decodeEntities('&#x2019;')).toBe('\u2019');
    expect(decodeEntities('&#1488;')).toBe('א');
  });

  it('leaves ordinary text alone, including a bare ampersand', () => {
    // "&" and a "&#" that starts nothing are ordinary characters in a
    // headline; rewriting them would corrupt a real string.
    expect(decodeEntities('no entities here')).toBe('no entities here');
    expect(decodeEntities('P&L up 3%')).toBe('P&L up 3%');
    expect(decodeEntities('&notanentity; &#; &#999999999;')).toBe('&notanentity; &#; &#999999999;');
  });
});

describe('chunkTexts', () => {
  it('splits on the segment cap', () => {
    const chunks = chunkTexts(Array.from({ length: MAX_TEXTS_PER_REQUEST + 1 }, (_, i) => `t${i}`));
    expect(chunks.map((c) => c.length)).toEqual([MAX_TEXTS_PER_REQUEST, 1]);
  });

  it('splits on the character budget too, well before the segment cap', () => {
    // 30 article summaries are nowhere near 128 segments but can be a large
    // request, so the count alone is not a sufficient bound.
    const big = 'x'.repeat(MAX_CHARS_PER_REQUEST / 2);
    const chunks = chunkTexts([big, big, big]);
    expect(chunks.map((c) => c.length)).toEqual([2, 1]);
  });

  it('sends an oversized single string on its own rather than dropping it', () => {
    const huge = 'x'.repeat(MAX_CHARS_PER_REQUEST * 2);
    expect(chunkTexts([huge, 'small'])).toEqual([[huge], ['small']]);
  });

  it('returns nothing for no texts', () => {
    expect(chunkTexts([])).toEqual([]);
  });
});

describe('translateToHebrew', () => {
  it('translates in order and preserves length', async () => {
    const out = await translateToHebrew(['one', 'two'], 'k', 1_000, googleOk());
    expect(out).toEqual(['HE:one', 'HE:two']);
  });

  it('sends the key as this API’s query parameter and pins en->he', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const spy = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: 'שלום' }] } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    await translateToHebrew(['hello'], 'secret key/+', 1_000, spy);

    expect(seenUrl).toContain('https://translation.googleapis.com/language/translate/v2');
    // Encoded, so a key containing URL-significant characters cannot smuggle
    // extra query parameters into the request.
    expect(seenUrl).toContain(`key=${encodeURIComponent('secret key/+')}`);
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({
      source: 'en',
      target: 'he',
      format: 'text',
    });
  });

  it('never puts the key in a log line', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = (async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch;

    expect(await translateToHebrew(['one'], 'super-secret-key', 1_000, failing)).toBeNull();

    // The key travels in the URL for this API, so a logged request line would
    // leak it into whatever collects the function's output.
    for (const call of errors.mock.calls) {
      expect(JSON.stringify(call)).not.toContain('super-secret-key');
    }
  });

  it('decodes escaped output before returning it', async () => {
    const escaped = (async () =>
      new Response(JSON.stringify({ data: { translations: [{ translatedText: 'AT&amp;T&#39;s' }] } }), {
        status: 200,
      })) as unknown as typeof fetch;
    expect(await translateToHebrew(["AT&T's"], 'k', 1_000, escaped)).toEqual(["AT&T's"]);
  });

  it('passes empty strings and already-Hebrew text through without spending quota', async () => {
    const spy = googleOk();
    const out = await translateToHebrew(['', 'כותרת בעברית', 'real'], 'k', 1_000, spy);
    expect(out).toEqual(['', 'כותרת בעברית', 'HE:real']);
    // The one request carried only the string that actually needed translating.
    expect(JSON.parse(String(vi.mocked(spy).mock.calls[0][1]?.body)).q).toEqual(['real']);
  });

  it('makes no request at all when nothing needs translating', async () => {
    const spy = googleOk();
    const out = await translateToHebrew(['', 'עברית'], 'k', 1_000, spy);
    expect(out).toEqual(['', 'עברית']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends a repeated string once and writes it back to every position', async () => {
    const spy = googleOk();
    const out = await translateToHebrew(['same', 'other', 'same'], 'k', 1_000, spy);
    expect(out).toEqual(['HE:same', 'HE:other', 'HE:same']);
    expect(JSON.parse(String(vi.mocked(spy).mock.calls[0][1]?.body)).q).toEqual(['same', 'other']);
  });

  it('splits a batch past the segment cap across requests', async () => {
    const spy = googleOk();
    const texts = Array.from({ length: MAX_TEXTS_PER_REQUEST + 10 }, (_, i) => `text ${i}`);
    const out = await translateToHebrew(texts, 'k', 5_000, spy);

    expect(out).toEqual(texts.map((t) => `HE:${t}`));
    expect(spy).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(spy).mock.calls) {
      expect(JSON.parse(String(call[1]?.body)).q.length).toBeLessThanOrEqual(MAX_TEXTS_PER_REQUEST);
    }
  });

  it('reuses a memoised translation instead of paying for it twice', async () => {
    const first = googleOk();
    await translateToHebrew(['repeat me'], 'k', 1_000, first);

    const second = googleOk('SHOULD-NOT-BE-CALLED:');
    const out = await translateToHebrew(['repeat me'], 'k', 1_000, second);

    expect(out).toEqual(['HE:repeat me']);
    expect(second).not.toHaveBeenCalled();
  });

  // Every failure below returns null, and the caller then serves the English
  // original. A partial or mis-paired result would be worse than no
  // translation: it would put one article's words under another's headline.
  it.each([
    ['a non-2xx status', async () => new Response('nope', { status: 500 })],
    ['a spent quota or a restricted key (403)', async () => new Response('forbidden', { status: 403 })],
    ['a rejected request (400)', async () => new Response('bad request', { status: 400 })],
    ['a body of the wrong shape', async () => new Response(JSON.stringify({ nope: true }), { status: 200 })],
    ['unparseable JSON', async () => new Response('not json{{{', { status: 200 })],
    [
      'a body with no data envelope',
      async () => new Response(JSON.stringify({ translations: [{ translatedText: 'a' }] }), { status: 200 }),
    ],
    [
      'a translations entry that is not a string',
      async () => new Response(JSON.stringify({ data: { translations: [{ translatedText: 42 }] } })),
    ],
    [
      'fewer translations than texts',
      async () => new Response(JSON.stringify({ data: { translations: [] } }), { status: 200 }),
    ],
    [
      'more translations than texts',
      async () =>
        new Response(
          JSON.stringify({ data: { translations: [{ translatedText: 'a' }, { translatedText: 'b' }] } }),
          { status: 200 },
        ),
    ],
    [
      'a network failure',
      async () => {
        throw new Error('offline');
      },
    ],
  ])('returns null on %s', async (_label, impl) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await translateToHebrew(['one'], 'k', 1_000, impl as unknown as typeof fetch)).toBeNull();
  });

  it('returns null on a timeout, and does not memoise the failed text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stalled = (async (_url: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as unknown as typeof fetch;

    expect(await translateToHebrew(['slow'], 'k', 10, stalled)).toBeNull();

    // A failure must be retried next time, not remembered as an answer.
    const retry = googleOk();
    expect(await translateToHebrew(['slow'], 'k', 1_000, retry)).toEqual(['HE:slow']);
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

    const spy = googleOk();
    const texts = Array.from({ length: MAX_TEXTS_PER_REQUEST + 1 }, (_, i) => `t${i}`);
    expect(await translateToHebrew(texts, 'k', 1_000, spy)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
