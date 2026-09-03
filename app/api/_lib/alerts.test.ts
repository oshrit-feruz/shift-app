import { describe, expect, it } from 'vitest';
import {
  evaluateEarningsRule,
  evaluateNewsRule,
  evaluatePriceRule,
  evaluateThresholds,
  isoDayUtc,
  money,
  MAX_NEWS_FIRINGS_PER_RULE,
  newsRuleKey,
  priceRuleKey,
  pushPayload,
  readKeywords,
  readLevel,
  readRules,
  readThresholds,
  shiftDay,
  signedPct,
  thresholdKey,
  type AlertRule,
} from './alerts.js';
import type { NewsArticle } from './news.js';
import type { EarningsRow } from './earnings.js';

/**
 * The engine's whole job is to fire on a change and stay quiet on a state.
 * Every table below is some version of that one property: the first look
 * arms, the crossing fires, the run after the crossing is silent, and
 * nothing about a rule's text, its id or its creation time can make it fire
 * on a condition that was already true.
 */

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: 'alert-1',
  ticker: 'NVDA',
  kind: 'price',
  condition: 'rise',
  value: '200',
  remind: 'day',
  notifyBy: { push: true, email: false },
  ...over,
});

const TODAY = '2026-09-03';

describe('readRules', () => {
  it('reads the client bag, normalising tickers and dropping what the client would drop', () => {
    const bag = {
      savedAlerts: [
        {
          id: 'a',
          ticker: ' nvda ',
          kind: 'price',
          condition: 'rise',
          value: '200',
          notifyBy: { push: true },
        },
        { id: 'b', ticker: 'AMD', kind: 'bogus', value: '1' },
        { id: 'c', ticker: 'BAD TICKER', kind: 'news', value: '' },
        { id: 'd', ticker: 'LLY', kind: 'earn', value: '', remind: 'lands' },
        'not an object',
      ],
    };
    const rules = readRules(bag);
    expect(rules.map((r) => r.id)).toEqual(['a', 'd']);
    expect(rules[0]).toMatchObject({
      ticker: 'NVDA',
      condition: 'rise',
      notifyBy: { push: true, email: false },
    });
    expect(rules[1]).toMatchObject({
      remind: 'lands',
      condition: 'rise',
      notifyBy: { push: false, email: false },
    });
  });

  it('is empty for a bag with no alerts, or no bag', () => {
    expect(readRules({})).toEqual([]);
    expect(readRules(null)).toEqual([]);
    expect(readRules({ savedAlerts: 'nope' })).toEqual([]);
  });
});

describe('readThresholds', () => {
  it('reads both fields as magnitudes and blanks as null', () => {
    expect(readThresholds({ alertUpThreshold: '25', alertDownThreshold: '-10' })).toEqual({
      up: 25,
      down: 10,
    });
    expect(readThresholds({ alertUpThreshold: '', alertDownThreshold: '0' })).toEqual({
      up: null,
      down: null,
    });
    expect(readThresholds({ alertUpThreshold: 'abc' })).toEqual({ up: null, down: null });
    expect(readThresholds(null)).toEqual({ up: null, down: null });
  });
});

describe('readLevel', () => {
  it('accepts a price with or without a dollar sign and separators', () => {
    expect(readLevel(rule({ value: '200.00' }))).toBe(200);
    expect(readLevel(rule({ value: '$1,250.5' }))).toBe(1250.5);
  });

  it('is null for anything that is not a positive price', () => {
    expect(readLevel(rule({ value: '' }))).toBeNull();
    expect(readLevel(rule({ value: '0' }))).toBeNull();
    expect(readLevel(rule({ value: 'soon' }))).toBeNull();
  });
});

describe('evaluatePriceRule', () => {
  it('arms on the first look without firing, whichever side the price is on', () => {
    const above = evaluatePriceRule(rule(), 210, undefined, TODAY);
    expect(above.firings).toEqual([]);
    expect(above.states).toEqual([{ key: priceRuleKey('NVDA', 'rise', 200), state: 'above' }]);
    const below = evaluatePriceRule(rule(), 190, undefined, TODAY);
    expect(below.firings).toEqual([]);
    expect(below.states).toEqual([{ key: priceRuleKey('NVDA', 'rise', 200), state: 'below' }]);
  });

  it('fires on the crossing in the watched direction, and records the new side', () => {
    const r = evaluatePriceRule(rule(), 201.5, 'below', TODAY);
    expect(r.firings).toHaveLength(1);
    expect(r.firings[0]).toMatchObject({
      kind: 'price',
      ticker: 'NVDA',
      dedupeKey: 'price|NVDA|rise|200|2026-09-03',
    });
    expect(r.firings[0].title.en).toBe('NVDA rose above $200.00 (now $201.50)');
    expect(r.firings[0].title.he).toContain('עלתה מעל');
    expect(r.states).toEqual([{ key: 'price|NVDA|rise|200', state: 'above' }]);
  });

  it('stays quiet while the condition merely holds', () => {
    const r = evaluatePriceRule(rule(), 230, 'above', TODAY);
    expect(r.firings).toEqual([]);
    expect(r.states).toEqual([]);
  });

  it('does not fire a rise rule on the way back down, but re-arms it', () => {
    const r = evaluatePriceRule(rule(), 195, 'above', TODAY);
    expect(r.firings).toEqual([]);
    expect(r.states).toEqual([{ key: 'price|NVDA|rise|200', state: 'below' }]);
  });

  it('fires a fall rule only on the way down', () => {
    const fall = rule({ condition: 'fall', value: '150' });
    expect(evaluatePriceRule(fall, 149, 'above', TODAY).firings[0].title.en).toBe(
      'NVDA fell below $150.00 (now $149.00)',
    );
    expect(evaluatePriceRule(fall, 151, 'below', TODAY).firings).toEqual([]);
  });

  it('does nothing for an unreadable level or a missing price', () => {
    expect(evaluatePriceRule(rule({ value: 'x' }), 100, 'below', TODAY)).toEqual({ firings: [], states: [] });
    expect(evaluatePriceRule(rule(), 0, 'below', TODAY)).toEqual({ firings: [], states: [] });
  });

  it('keys the state on the rule, not its id, so re-creating a rule does not re-fire it', () => {
    expect(priceRuleKey('NVDA', 'rise', 200)).toBe(priceRuleKey('NVDA', 'rise', 200));
    expect(priceRuleKey('NVDA', 'rise', 200)).not.toBe(priceRuleKey('NVDA', 'rise', 210));
  });
});

describe('evaluateThresholds', () => {
  const held = [
    { ticker: 'NVDA', shares: 10, avgCost: 100 },
    { ticker: 'AMD', shares: 5, avgCost: 200 },
    { ticker: 'SOLD', shares: 0, avgCost: 50 },
  ];

  it('is silent with no thresholds set', () => {
    expect(evaluateThresholds(held, { up: null, down: null }, { NVDA: 200 }, {}, TODAY)).toEqual({
      firings: [],
      states: [],
    });
  });

  it('arms every held, priced position on the first look', () => {
    const r = evaluateThresholds(held, { up: 25, down: 10 }, { NVDA: 127, AMD: 190 }, {}, TODAY);
    expect(r.firings).toEqual([]);
    expect(r.states).toEqual([
      { key: thresholdKey('NVDA', 'up', 25), state: 'above' },
      { key: thresholdKey('NVDA', 'down', 10), state: 'below' },
      { key: thresholdKey('AMD', 'up', 25), state: 'below' },
      { key: thresholdKey('AMD', 'down', 10), state: 'below' },
    ]);
  });

  it('fires when a position crosses the line, in the words the client already had for it', () => {
    const prev = { [thresholdKey('NVDA', 'up', 25)]: 'below' };
    const r = evaluateThresholds(held, { up: 25, down: null }, { NVDA: 127 }, prev, TODAY);
    expect(r.firings).toHaveLength(1);
    expect(r.firings[0]).toMatchObject({ kind: 'threshold', ticker: 'NVDA' });
    expect(r.firings[0].title.en).toBe('NVDA crossed your +25% alert (currently +27.0% from entry)');
    expect(r.firings[0].title.he).toBe('NVDA חצתה את ההתראה שלך של +25% (כרגע +27.0% מנקודת הכניסה)');
  });

  it('measures a fall from entry as a magnitude below zero', () => {
    const prev = { [thresholdKey('AMD', 'down', 10)]: 'below' };
    const r = evaluateThresholds(held, { up: null, down: 10 }, { AMD: 170 }, prev, TODAY);
    expect(r.firings[0].title.en).toBe('AMD crossed your −10% alert (currently −15.0% from entry)');
  });

  it('skips a position with no price, nothing held, or no cost basis', () => {
    const r = evaluateThresholds(
      [...held, { ticker: 'FREE', shares: 3, avgCost: 0 }],
      { up: 25, down: null },
      { SOLD: 500, FREE: 10 },
      {},
      TODAY,
    );
    expect(r.states).toEqual([]);
  });
});

describe('news rules', () => {
  const article = (over: Partial<NewsArticle>): NewsArticle => ({
    headline: 'NVIDIA lifts data-centre outlook',
    source: 'Reuters',
    publishedAt: '2026-09-03T10:00:00+00:00',
    summary: 'Guidance raised on strong demand.',
    url: 'https://example.com/a',
    symbols: ['NVDA'],
    sentiment: null,
    ...over,
  });
  const now = new Date('2026-09-03T12:00:00Z');

  it('reads keywords as a lowercase comma list, and treats an empty field as "anything"', () => {
    expect(readKeywords(rule({ kind: 'news', value: ' Data centre, Guidance ,, ' }))).toEqual([
      'data centre',
      'guidance',
    ]);
    expect(readKeywords(rule({ kind: 'news', value: '' }))).toEqual([]);
    expect(newsRuleKey(rule({ kind: 'news', value: 'a, b' }))).toBe('news|NVDA|a,b');
  });

  it('records the newest article on the first look and fires nothing', () => {
    const r = evaluateNewsRule(rule({ kind: 'news', value: 'guidance' }), [article({})], undefined, now);
    expect(r.firings).toEqual([]);
    expect(r.states).toEqual([{ key: 'news|NVDA|guidance', state: '2026-09-03T10:00:00.000Z' }]);
  });

  it('with no articles at all, arms at "now" so old coverage never counts as new later', () => {
    const r = evaluateNewsRule(rule({ kind: 'news', value: '' }), [], undefined, now);
    expect(r.states).toEqual([{ key: 'news|NVDA|', state: now.toISOString() }]);
  });

  it('fires for an article newer than the mark that mentions a keyword, and moves the mark', () => {
    const r = evaluateNewsRule(
      rule({ kind: 'news', value: 'guidance, buyback' }),
      [
        article({ url: 'https://example.com/new', publishedAt: '2026-09-03T11:00:00Z' }),
        article({ url: 'https://example.com/old', publishedAt: '2026-09-02T11:00:00Z' }),
      ],
      '2026-09-03T10:30:00.000Z',
      now,
    );
    expect(r.firings).toHaveLength(1);
    expect(r.firings[0]).toMatchObject({
      kind: 'news',
      dedupeKey: 'news|NVDA|https://example.com/new',
      detail: { en: 'News alert · matched "guidance"' },
    });
    expect(r.firings[0].title.en).toBe('Reuters: NVIDIA lifts data-centre outlook');
    expect(r.states).toEqual([{ key: 'news|NVDA|guidance,buyback', state: '2026-09-03T11:00:00.000Z' }]);
  });

  it('skips a new article that mentions none of the keywords, and leaves the mark alone when nothing is newer', () => {
    const miss = evaluateNewsRule(
      rule({ kind: 'news', value: 'buyback' }),
      [article({ publishedAt: '2026-09-03T11:00:00Z' })],
      '2026-09-03T10:30:00.000Z',
      now,
    );
    expect(miss.firings).toEqual([]);
    const stale = evaluateNewsRule(
      rule({ kind: 'news', value: '' }),
      [article({ publishedAt: '2026-09-03T09:00:00Z' })],
      '2026-09-03T10:30:00.000Z',
      now,
    );
    expect(stale).toEqual({ firings: [], states: [] });
  });

  it('caps a busy day and ignores an article it cannot date', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      article({ url: `https://example.com/${i}`, publishedAt: `2026-09-03T11:0${i}:00Z` }),
    );
    const r = evaluateNewsRule(
      rule({ kind: 'news', value: '' }),
      [...many, article({ url: 'https://example.com/undated', publishedAt: 'yesterday-ish' })],
      '2026-09-03T10:00:00.000Z',
      now,
    );
    // The three OLDEST unseen articles, and the mark stops at the last one.
    expect(r.firings).toHaveLength(MAX_NEWS_FIRINGS_PER_RULE);
    expect(r.firings.map((f) => f.dedupeKey)).toEqual([
      'news|NVDA|https://example.com/0',
      'news|NVDA|https://example.com/1',
      'news|NVDA|https://example.com/2',
    ]);
    expect(r.states).toEqual([{ key: 'news|NVDA|', state: '2026-09-03T11:02:00.000Z' }]);
  });

  it('fires the ones the cap held back on the next run instead of losing them', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      article({ url: `https://example.com/${i}`, publishedAt: `2026-09-03T11:0${i}:00Z` }),
    );
    const first = evaluateNewsRule(rule({ kind: 'news', value: '' }), many, '2026-09-03T10:00:00.000Z', now);
    const second = evaluateNewsRule(rule({ kind: 'news', value: '' }), many, first.states[0].state, now);
    expect(second.firings.map((f) => f.dedupeKey)).toEqual([
      'news|NVDA|https://example.com/3',
      'news|NVDA|https://example.com/4',
      'news|NVDA|https://example.com/5',
    ]);
    // Everything seen now, so the mark reaches the newest article and a
    // third run has nothing left to say.
    expect(second.states).toEqual([{ key: 'news|NVDA|', state: '2026-09-03T11:05:00.000Z' }]);
    const third = evaluateNewsRule(rule({ kind: 'news', value: '' }), many, second.states[0].state, now);
    expect(third).toEqual({ firings: [], states: [] });
  });
});

describe('earnings rules', () => {
  const row = (over: Partial<EarningsRow>): EarningsRow => ({
    ticker: 'LLY',
    reportDate: '2026-09-04',
    periodEnd: null,
    timing: 'AMC',
    actual: null,
    estimate: null,
    surprisePct: null,
    ...over,
  });
  const lly = (remind: AlertRule['remind']) => rule({ ticker: 'LLY', kind: 'earn', remind });

  it('reminds the day before, naming the session when the calendar does', () => {
    const r = evaluateEarningsRule(lly('day'), [row({})], undefined, '2026-09-03');
    expect(r.firings[0]).toMatchObject({ kind: 'earn', dedupeKey: 'earn|LLY|day|2026-09-04' });
    expect(r.firings[0].title.en).toBe('LLY reports tomorrow (after the close)');
    expect(r.firings[0].title.he).toBe('LLY מפרסמת דוח מחר (אחרי הנעילה)');
    expect(evaluateEarningsRule(lly('day'), [row({})], undefined, '2026-09-02').firings).toEqual([]);
  });

  it('reminds on the morning of, and says nothing about timing it was not told', () => {
    const r = evaluateEarningsRule(lly('morning'), [row({ timing: null })], undefined, '2026-09-04');
    expect(r.firings[0].title.en).toBe('LLY reports today');
    expect(r.states).toEqual([]);
  });

  it('for "when it lands", remembers the date on the day and fires the morning after, once', () => {
    const onTheDay = evaluateEarningsRule(lly('lands'), [row({})], undefined, '2026-09-04');
    expect(onTheDay.firings).toEqual([]);
    expect(onTheDay.states).toEqual([{ key: 'earn|LLY|lands', state: '2026-09-04' }]);
    // A second run that day does not rewrite the same memory.
    expect(evaluateEarningsRule(lly('lands'), [row({})], '2026-09-04', '2026-09-04').states).toEqual([]);

    // The feed has dropped the row by the next morning; the memory fires.
    const after = evaluateEarningsRule(lly('lands'), [], '2026-09-04', '2026-09-05');
    expect(after.firings[0]).toMatchObject({ dedupeKey: 'earn|LLY|lands|2026-09-04' });
    expect(after.firings[0].title.en).toBe('LLY was due to report yesterday');
    expect(after.states).toEqual([{ key: 'earn|LLY|lands', state: 'done:2026-09-04' }]);

    // Consumed: the run after that is silent.
    expect(evaluateEarningsRule(lly('lands'), [], 'done:2026-09-04', '2026-09-06')).toEqual({
      firings: [],
      states: [],
    });
  });

  it('only reads its own ticker off the calendar', () => {
    const r = evaluateEarningsRule(lly('morning'), [row({ ticker: 'NVDA' })], undefined, '2026-09-04');
    expect(r.firings).toEqual([]);
  });
});

describe('formatting and dates', () => {
  it('prints money and signed percentages the way the app does', () => {
    expect(money(1234.5)).toBe('$1,234.50');
    expect(signedPct(27.04)).toBe('+27.0%');
    expect(signedPct(-3.25)).toBe('−3.3%');
  });

  it('shifts calendar days in UTC', () => {
    expect(isoDayUtc(new Date('2026-09-03T23:59:00Z'))).toBe('2026-09-03');
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('builds a push payload in one language', () => {
    const f = evaluatePriceRule(rule(), 201, 'below', TODAY).firings[0];
    expect(pushPayload(f, 'he')).toEqual({ title: f.title.he, body: 'התראת מחיר', ticker: 'NVDA' });
  });
});
