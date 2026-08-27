import { describe, it, expect } from 'vitest';
import { summarize, deriveSource, mapArticle, mapSymbols, resolveSymbol, isValidTicker } from './news.js';

describe('summarize', () => {
  it('returns empty string for empty or missing content', () => {
    expect(summarize(null)).toBe('');
    expect(summarize('')).toBe('');
    expect(summarize('   ')).toBe('');
  });

  it('keeps only the first two sentences', () => {
    const s = summarize('First sentence. Second sentence. Third sentence that should be dropped.');
    expect(s).toBe('First sentence. Second sentence.');
  });

  it('strips HTML tags and collapses whitespace', () => {
    expect(summarize('<p>Hello   <b>world</b>.</p>')).toBe('Hello world.');
  });

  it('hard-caps very long content at 280 chars including the ellipsis', () => {
    const long = 'word '.repeat(100) + '.';
    const s = summarize(long);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(280);
  });
});

describe('deriveSource', () => {
  it('prefers an explicit source-like field', () => {
    expect(deriveSource({ source: 'Reuters' }, 'https://example.com/a')).toBe('Reuters');
    expect(deriveSource({ publisher: 'Bloomberg' }, null)).toBe('Bloomberg');
  });

  it('falls back to the article URL hostname, stripping www.', () => {
    expect(deriveSource({}, 'https://www.reuters.com/markets/x')).toBe('reuters.com');
  });

  it('falls back to Unknown when nothing usable exists', () => {
    expect(deriveSource({}, null)).toBe('Unknown');
    expect(deriveSource({}, 'not a url')).toBe('Unknown');
  });
});

describe('mapArticle', () => {
  it('maps a well-formed EODHD-shaped row', () => {
    const raw = {
      title: 'NVIDIA beats estimates',
      link: 'https://www.reuters.com/tech/nvidia',
      date: '2026-08-27T09:42:00+00:00',
      content: 'NVIDIA posted strong results. Analysts raised targets. Extra sentence dropped.',
      source: 'Reuters',
    };
    expect(mapArticle(raw)).toEqual({
      headline: 'NVIDIA beats estimates',
      source: 'Reuters',
      publishedAt: '2026-08-27T09:42:00+00:00',
      summary: 'NVIDIA posted strong results. Analysts raised targets.',
      url: 'https://www.reuters.com/tech/nvidia',
      symbols: [],
    });
  });

  it('keeps a bare "<" as text instead of swallowing the sentence', () => {
    // Financial copy says "guidance is < 5%". Treating every "<" as an
    // unterminated tag dropped everything after it — real text lost to a
    // markup rule.
    expect(summarize('Guidance is < 5%. Revenue rose.')).toBe('Guidance is < 5%. Revenue rose.');
    expect(summarize('Unclosed <tag and more text here.')).toBe('Unclosed <tag and more text here.');
    expect(summarize('Margins < 30% and volumes > 2m units.')).toContain('< 30%');
  });

  it('still strips complete markup', () => {
    expect(summarize('<p>Real <b>tag</b> stripped.</p> Second.')).toBe('Real tag stripped. Second.');
  });

  describe('adversarial input', () => {
    // The cleanup expressions are quadratic on a run of one repeated
    // character. Measured before the input bound was added: 80KB of "<"
    // took ~7s and the sentence split ~9.7s, against the function's own 10s
    // budget — one oversized article body could consume the whole request.
    // Content comes from an upstream feed, so its size is not ours to trust.
    it.each([
      ['angle brackets', '<'.repeat(200_000)],
      ['whitespace', ' '.repeat(200_000) + 'x'],
      ['no sentence terminator', 'a'.repeat(200_000)],
      ['alternating tags', '<a> '.repeat(50_000)],
    ])('stays linear on %s', (_label, input) => {
      const t0 = performance.now();
      const out = summarize(input);
      expect(performance.now() - t0).toBeLessThan(150);
      expect(out.length).toBeLessThanOrEqual(280);
    });
  });

  describe('symbols (general market feed)', () => {
    it('strips the exchange suffix and uppercases', () => {
      expect(mapSymbols(['AAPL.US', 'msft.us'])).toEqual(['AAPL', 'MSFT']);
    });

    it('de-duplicates and drops anything unusable', () => {
      // A malformed entry must not become a ticker the UI tries to open.
      expect(mapSymbols(['AAPL.US', 'AAPL.NASDAQ', '', '  ', null, 42, 'A B.US', {}])).toEqual(['AAPL']);
    });

    it('returns an empty array for a non-array or absent field', () => {
      // Real market news is often about a sector, an index or a rate
      // decision rather than one company. Empty is a legitimate answer;
      // inventing a ticker for those would be a fabrication.
      for (const v of [undefined, null, 'AAPL.US', {}, 0]) expect(mapSymbols(v)).toEqual([]);
    });

    it('carries tagged symbols through mapArticle', () => {
      const a = mapArticle({
        title: 'Chip stocks rally',
        link: 'https://example.com/a',
        date: '2026-08-27',
        symbols: ['NVDA.US', 'AMD.US'],
      });
      expect(a?.symbols).toEqual(['NVDA', 'AMD']);
    });
  });

  it('derives source from the URL when EODHD omits it', () => {
    const raw = { title: 'Headline', link: 'https://www.bloomberg.com/x', date: '2026-01-01' };
    expect(mapArticle(raw)?.source).toBe('bloomberg.com');
  });

  it('drops a row with no headline rather than inventing one', () => {
    expect(mapArticle({ link: 'https://x.com/a' })).toBeNull();
  });

  it('drops a row with no link rather than inventing one', () => {
    expect(mapArticle({ title: 'Headline only' })).toBeNull();
  });

  it('drops a row whose link is not a real http(s) URL', () => {
    expect(mapArticle({ title: 'Headline', link: 'not a url' })).toBeNull();
    expect(mapArticle({ title: 'Headline', link: 'javascript:alert(1)' })).toBeNull();
    expect(mapArticle({ title: 'Headline', link: '/relative/path' })).toBeNull();
    expect(mapArticle({ title: 'Headline', link: 'ftp://example.com/a' })).toBeNull();
  });

  it('accepts a well-formed http (not just https) URL', () => {
    expect(mapArticle({ title: 'Headline', link: 'http://example.com/a' })?.url).toBe('http://example.com/a');
  });

  it('drops non-object rows', () => {
    expect(mapArticle('nope')).toBeNull();
    expect(mapArticle(null)).toBeNull();
    expect(mapArticle(undefined)).toBeNull();
  });
});

describe('resolveSymbol', () => {
  it('appends .US when no exchange is specified', () => {
    expect(resolveSymbol('NVDA')).toBe('NVDA.US');
  });

  it('leaves an explicit exchange suffix alone', () => {
    expect(resolveSymbol('VOD.LSE')).toBe('VOD.LSE');
  });
});

describe('isValidTicker', () => {
  it('accepts plain tickers and dotted exchange suffixes', () => {
    expect(isValidTicker('NVDA')).toBe(true);
    expect(isValidTicker('VOD.LSE')).toBe(true);
    expect(isValidTicker('BRK-B')).toBe(true);
  });

  it('rejects anything with spaces, slashes, or query-injection characters', () => {
    expect(isValidTicker('NV DA')).toBe(false);
    expect(isValidTicker('../etc')).toBe(false);
    expect(isValidTicker('NVDA&x=1')).toBe(false);
    expect(isValidTicker('')).toBe(false);
  });
});
