import { describe, it, expect } from 'vitest';
import { summarize, deriveSource, mapArticle, resolveSymbol, isValidTicker } from './news';

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
