import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_SNAPSHOT_AGE_DAYS,
  SCREENER_MIRROR_URL,
  actionableSignals,
  extractBuySignals,
  extractPolicy,
  extractRankedTickers,
  extractStockRadar,
  fetchRankedTickers,
  fetchRankingRow,
  fetchSatelliteSignals,
  fetchStockRadar,
  findRankingRow,
  mapSignal,
  snapshotAgeDays,
  toNumber,
} from './recoveryDetector';

describe('toNumber', () => {
  it('accepts numbers', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber(0)).toBe(0);
  });
  it('accepts numeric strings, including formatted ones', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber(' 12.5 ')).toBe(12.5);
    expect(toNumber('$1,234.50')).toBe(1234.5);
  });
  it('rejects everything non-numeric as null — never 0', () => {
    for (const v of [null, undefined, '', '  ', 'n/a', {}, [], true, NaN, Infinity]) {
      expect(toNumber(v)).toBeNull();
    }
  });
});

describe('mapSignal — defensive field mapping', () => {
  it('accepts ticker or symbol', () => {
    expect(mapSignal({ ticker: 'NVDA' })?.ticker).toBe('NVDA');
    expect(mapSignal({ symbol: 'AMD' })?.ticker).toBe('AMD');
  });
  it('prefers ticker when both are present', () => {
    expect(mapSignal({ ticker: 'NVDA', symbol: 'AMD' })?.ticker).toBe('NVDA');
  });
  it('uppercases the ticker', () => {
    expect(mapSignal({ symbol: 'teva' })?.ticker).toBe('TEVA');
  });
  it('accepts price, current_price or last', () => {
    expect(mapSignal({ ticker: 'X', price: 20 })?.price).toBe(20);
    expect(mapSignal({ ticker: 'X', current_price: 21 })?.price).toBe(21);
    expect(mapSignal({ ticker: 'X', last: 22 })?.price).toBe(22);
  });
  it('honours candidate precedence for price', () => {
    expect(mapSignal({ ticker: 'X', price: 20, current_price: 21, last: 22 })?.price).toBe(20);
  });
  it('falls through to the next candidate when one is unparseable', () => {
    expect(mapSignal({ ticker: 'X', price: null, current_price: 21 })?.price).toBe(21);
  });
  it('maps the engine drawdown and score fields', () => {
    const s = mapSignal({ ticker: 'ORCL', drawdown_pct: 55.4, composite_score: 0.715, high_52w: 324.63 });
    expect(s?.drawdownPct).toBe(55.4);
    expect(s?.compositeScore).toBe(0.715);
    expect(s?.high52w).toBe(324.63);
  });
  it('keeps a recognised verdict verbatim', () => {
    for (const v of ['BUY', 'WATCH', 'SKIP'] as const) {
      expect(mapSignal({ ticker: 'X', signal: v })?.signal).toBe(v);
    }
  });
  it('reports an unrecognised verdict as null rather than coercing it to BUY', () => {
    for (const v of ['buy', 'STRONG_BUY', '', 42, null]) {
      expect(mapSignal({ ticker: 'X', signal: v })?.signal).toBeNull();
    }
  });
  it('missing numerics become null (rendered as "—"), never invented', () => {
    expect(mapSignal({ ticker: 'X' })).toEqual({
      ticker: 'X',
      price: null,
      high52w: null,
      drawdownPct: null,
      compositeScore: null,
      signal: null,
      active: null,
    });
  });
  it('reads `active` only as a real boolean — anything else is "not said", never true', () => {
    expect(mapSignal({ ticker: 'X', active: true })?.active).toBe(true);
    expect(mapSignal({ ticker: 'X', active: false })?.active).toBe(false);
    for (const v of ['true', 1, 'yes', null, undefined, {}]) {
      expect(mapSignal({ ticker: 'X', active: v })?.active).toBeNull();
    }
  });
  it('a real zero is preserved, not confused with missing', () => {
    expect(mapSignal({ ticker: 'MRK', drawdown_pct: 0 })?.drawdownPct).toBe(0);
  });
  it('drops rows with no usable ticker', () => {
    for (const row of [{}, { price: 10 }, { ticker: '' }, { ticker: '   ' }, null, 'NVDA', 42, []]) {
      expect(mapSignal(row)).toBeNull();
    }
  });
});

describe('actionableSignals — what the client may act on today', () => {
  const row = (ticker: string, active: boolean | null) => mapSignal({ ticker, signal: 'BUY', active })!;
  it('keeps active names and drops the ones the engine marked inactive', () => {
    const out = actionableSignals([row('A', true), row('B', false), row('C', true)]);
    expect(out.map((s) => s.ticker)).toEqual(['A', 'C']);
  });
  it('passes through names from a snapshot that predates the field (active null)', () => {
    expect(actionableSignals([row('A', null)]).map((s) => s.ticker)).toEqual(['A']);
  });
  it('an all-inactive day is an empty list, not an error', () => {
    expect(actionableSignals([row('A', false)])).toEqual([]);
  });
});

describe('extractPolicy / extractStockRadar — the engine’s sizing rule', () => {
  const policy = { sleeve_pct_of_budget: 10, max_sleeves: 10 };
  it('reads the published policy', () => {
    expect(extractPolicy({ satellite_policy: policy })).toEqual({ sleevePctOfBudget: 10, maxSleeves: 10 });
  });
  it('is null when the snapshot carries no policy (older mirror) — never a default', () => {
    expect(extractPolicy({ buy_signals: [] })).toBeNull();
    expect(extractPolicy({ satellite_policy: null })).toBeNull();
  });
  it('rejects a policy nothing can be sized from', () => {
    for (const bad of [
      { sleeve_pct_of_budget: 0, max_sleeves: 10 },
      { sleeve_pct_of_budget: 150, max_sleeves: 10 },
      { sleeve_pct_of_budget: 10, max_sleeves: 0 },
      { sleeve_pct_of_budget: 'ten', max_sleeves: 10 },
      { max_sleeves: 10 },
      [],
      'policy',
    ]) {
      expect(extractPolicy({ satellite_policy: bad })).toBeNull();
    }
  });
  it('floors a fractional cap rather than rounding it up', () => {
    expect(
      extractPolicy({ satellite_policy: { sleeve_pct_of_budget: 10, max_sleeves: 9.9 } })?.maxSleeves,
    ).toBe(9);
  });
  it('pairs the candidates with the policy from the same body', () => {
    const r = extractStockRadar({
      buy_signals: [{ ticker: 'ORCL', signal: 'BUY', active: true }],
      satellite_policy: policy,
    });
    expect(r?.signals.map((s) => s.ticker)).toEqual(['ORCL']);
    expect(r?.policy).toEqual({ sleevePctOfBudget: 10, maxSleeves: 10 });
  });
  it('a body with candidates but no policy is a real answer with policy null', () => {
    expect(extractStockRadar({ buy_signals: [] })).toEqual({ signals: [], policy: null });
  });
  it('a body with no candidates array is unrecognised, whatever the policy says', () => {
    expect(extractStockRadar({ satellite_policy: policy })).toBeNull();
  });
});

describe('extractBuySignals', () => {
  it('maps the engine buy_signals array', () => {
    const out = extractBuySignals({
      buy_signals: [
        {
          ticker: 'ORCL',
          price: 144.76,
          drawdown_pct: 55.4,
          composite_score: 0.715,
          high_52w: 324.63,
          signal: 'BUY',
        },
        { symbol: 'app', price: '310.54', signal: 'BUY' },
      ],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'APP']);
    expect(out?.[0].drawdownPct).toBe(55.4);
    expect(out?.[1].price).toBe(310.54);
  });

  it('an empty buy_signals array is a real answer — empty list, not an error', () => {
    expect(extractBuySignals({ buy_signals: [] })).toEqual([]);
  });

  it('ignores unrelated sibling fields on the screener body', () => {
    expect(extractBuySignals({ as_of: '2026-08-26', computed_on: '2026-08-26', buy_signals: [] })).toEqual(
      [],
    );
  });

  it('prefers buy_signals over full_ranking when both are present', () => {
    const out = extractBuySignals({
      buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }],
      full_ranking: [
        { ticker: 'NFLX', signal: 'BUY' },
        { ticker: 'SNDK', signal: 'SKIP' },
      ],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL']);
  });

  it('derives BUYs from full_ranking only when buy_signals is absent', () => {
    const out = extractBuySignals({
      full_ranking: [
        { ticker: 'ORCL', signal: 'BUY' },
        { ticker: 'SNDK', signal: 'SKIP' },
        { ticker: 'GLW', signal: 'WATCH' },
        { ticker: 'NFLX', signal: 'BUY' },
      ],
    });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'NFLX']);
  });

  it('a full_ranking with no BUYs yields an empty list, not every row', () => {
    const out = extractBuySignals({ full_ranking: [{ ticker: 'SNDK', signal: 'SKIP' }] });
    expect(out).toEqual([]);
  });

  it('silently drops unusable rows but keeps the good ones', () => {
    const out = extractBuySignals({ buy_signals: [{ ticker: 'ORCL' }, {}, null, { symbol: 'APP' }] });
    expect(out?.map((s) => s.ticker)).toEqual(['ORCL', 'APP']);
  });

  it('returns null for an unrecognised shape — we cannot claim "no candidates"', () => {
    for (const body of [
      {},
      { buy_signals: null },
      { buy_signals: 'none' },
      { open_positions: [] },
      [],
      null,
      'x',
    ]) {
      expect(extractBuySignals(body)).toBeNull();
    }
  });
});

/** Minimal Response stand-in for the fetch-level tests. */
const res = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

/**
 * A fixed clock and a snapshot date one day before it. Real screener
 * responses always carry `computed_on`, so fixtures here do too — a fixture
 * without it would be testing a payload the engine never actually sends.
 */
const NOW = new Date('2026-08-27T09:00:00Z');
const FRESH = '2026-08-26';

describe('fetchSatelliteSignals — honest states, no demo fallback', () => {
  it('ok with candidates when the engine picks some', async () => {
    const r = await fetchSatelliteSignals(
      async () =>
        res({ computed_on: FRESH, buy_signals: [{ ticker: 'ORCL', price: 144.76, signal: 'BUY' }] }),
      NOW,
    );
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.map((s) => s.ticker)).toEqual(['ORCL']);
  });

  it('ok with an EMPTY list on a quiet day (a real answer, not an error)', async () => {
    const r = await fetchSatelliteSignals(async () => res({ computed_on: FRESH, buy_signals: [] }), NOW);
    expect(r).toEqual({ status: 'ok', data: [] });
  });

  it('unavailable on a network/CORS failure — never demo data', async () => {
    const r = await fetchSatelliteSignals(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on a non-2xx response', async () => {
    const r = await fetchSatelliteSignals(async () => res({ buy_signals: [] }, false, 503));
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unparseable body', async () => {
    const r = await fetchSatelliteSignals(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad json');
          },
        }) as unknown as Response,
    );
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('unavailable on an unrecognised shape rather than a fake empty list', async () => {
    const r = await fetchSatelliteSignals(async () => res({ positions: [] }));
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('never returns the old demo tickers on any failure path', async () => {
    const demoTickers = ['MRNA', 'ALB', 'TEVA', 'MDA'];
    const failures = [
      async () => {
        throw new Error('network');
      },
      async () => res(null, false, 500),
      async () => res({ nope: true }),
    ];
    for (const f of failures) {
      const r = await fetchSatelliteSignals(f as unknown as typeof fetch);
      expect(r.status).toBe('unavailable');
      const serialised = JSON.stringify(r);
      for (const t of demoTickers) expect(serialised).not.toContain(t);
    }
  });
});

describe('fetchStockRadar — same mirror, same honesty rules, plus the policy', () => {
  it('returns candidates and policy from one fresh snapshot', async () => {
    const r = await fetchStockRadar(
      async () =>
        res({
          computed_on: FRESH,
          buy_signals: [{ ticker: 'ORCL', signal: 'BUY', active: true }],
          satellite_policy: { sleeve_pct_of_budget: 10, max_sleeves: 10 },
        }),
      NOW,
    );
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.data.signals.map((s) => s.ticker)).toEqual(['ORCL']);
      expect(r.data.policy).toEqual({ sleevePctOfBudget: 10, maxSleeves: 10 });
    }
  });
  it('an older snapshot without the policy still serves its candidates', async () => {
    const r = await fetchStockRadar(
      async () => res({ computed_on: FRESH, buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(r.status === 'ok' && r.data.policy).toBeNull();
    expect(r.status === 'ok' && r.data.signals[0].active).toBeNull();
  });
  it('is unavailable on a failure, exactly like fetchSatelliteSignals', async () => {
    const r = await fetchStockRadar(async () => res({ nope: true }));
    expect(r).toEqual({ status: 'unavailable' });
  });
  it('refuses a stale snapshot even when its policy is fine', async () => {
    const r = await fetchStockRadar(
      async () =>
        res({
          computed_on: '2026-08-01',
          buy_signals: [],
          satellite_policy: { sleeve_pct_of_budget: 10, max_sleeves: 10 },
        }),
      NOW,
    );
    expect(r.status).toBe('unavailable');
  });
});

describe('snapshotAgeDays — UTC-stable age of the mirrored snapshot', () => {
  const at = (iso: string) => new Date(iso);

  it('is 0 on the day the snapshot was computed', () => {
    expect(snapshotAgeDays('2026-08-27', at('2026-08-27T00:00:00Z'))).toBe(0);
    expect(snapshotAgeDays('2026-08-27', at('2026-08-27T23:59:59Z'))).toBe(0);
  });

  it('counts whole days elapsed', () => {
    expect(snapshotAgeDays('2026-08-26', at('2026-08-27T09:00:00Z'))).toBe(1);
    expect(snapshotAgeDays('2026-08-20', at('2026-08-27T09:00:00Z'))).toBe(7);
  });

  it('does not drift a day for viewers west of UTC', () => {
    // 2026-08-27T02:00Z is still 2026-08-26 in New York. Parsing the bare
    // date locally would make a same-day snapshot look a day old there.
    expect(snapshotAgeDays('2026-08-27', at('2026-08-27T02:00:00Z'))).toBe(0);
  });

  it('rejects impossible calendar dates instead of letting them roll forward', () => {
    // Date.UTC(2026, 7, 99) lands in November and Date.UTC(2026, 12, 45) lands
    // in 2027 — both yield a NEGATIVE age, which would sail past the
    // "older than MAX" gate and read as fresh. These must be null.
    for (const bad of ['2026-02-30', '2026-02-31', '2026-08-99', '2026-13-45', '2026-00-10', '2026-08-00']) {
      expect(snapshotAgeDays(bad, at('2026-08-01T00:00:00Z'))).toBeNull();
    }
  });

  it('still accepts real leap-day dates', () => {
    expect(snapshotAgeDays('2028-02-29', at('2028-03-01T00:00:00Z'))).toBe(1);
    expect(snapshotAgeDays('2026-02-29', at('2026-03-01T00:00:00Z'))).toBeNull();
  });

  it('returns null for a missing or unparseable date rather than guessing', () => {
    expect(snapshotAgeDays(undefined)).toBeNull();
    expect(snapshotAgeDays(null)).toBeNull();
    expect(snapshotAgeDays('')).toBeNull();
    expect(snapshotAgeDays('yesterday')).toBeNull();
    expect(snapshotAgeDays('26/08/2026')).toBeNull();
    expect(snapshotAgeDays(20260826)).toBeNull();
  });
});

describe('fetchSatelliteSignals — reads the mirror, refuses stale data', () => {
  it('reads the local mirror, not the Render origin', async () => {
    let requested = '';
    await fetchSatelliteSignals(async (url) => {
      requested = String(url);
      return res({ computed_on: FRESH, buy_signals: [] });
    }, NOW);
    expect(requested).toBe(SCREENER_MIRROR_URL);
    expect(requested).not.toContain('onrender.com');
  });

  it('serves a snapshot at exactly the age limit', async () => {
    const edge = '2026-08-23'; // 4 days before NOW
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: edge, buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(snapshotAgeDays(edge, NOW)).toBe(MAX_SNAPSHOT_AGE_DAYS);
    expect(r.status).toBe('ok');
  });

  it('refuses a snapshot one day past the limit, and says how old it is', async () => {
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: '2026-08-22', buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason?.en).toContain('5 days old');
    expect(r.status === 'unavailable' && r.reason?.he).toContain('5 ימים');
  });

  it('does not leak stale signals through the unavailable result', async () => {
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: '2026-01-01', buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(JSON.stringify(r)).not.toContain('ORCL');
  });

  it('falls back to as_of when computed_on is absent', async () => {
    const r = await fetchSatelliteSignals(async () => res({ as_of: FRESH, buy_signals: [] }), NOW);
    expect(r).toEqual({ status: 'ok', data: [] });
  });

  it('refuses a well-formed snapshot carrying no date at all', async () => {
    const r = await fetchSatelliteSignals(async () => res({ buy_signals: [] }), NOW);
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason?.en).toContain('missing its date');
  });

  it('reports a never-published mirror distinctly from a transient failure', async () => {
    const r = await fetchSatelliteSignals(async () => res(null, false, 404), NOW);
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason?.en).toContain('not been published');
  });

  it('refuses a snapshot dated in the future rather than reading it as fresh', async () => {
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: '2027-01-01', buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason?.en).toContain('future');
    expect(JSON.stringify(r)).not.toContain('ORCL');
  });

  it('tolerates one day of clock skew, so a fresh snapshot is not rejected', async () => {
    // A viewer whose device clock is a day behind UTC sees today's snapshot as
    // tomorrow's. That is skew, not a bad date, and must still render.
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: '2026-08-28', buy_signals: [] }),
      NOW,
    );
    expect(r).toEqual({ status: 'ok', data: [] });
  });

  it('refuses an impossible date rather than accepting its rolled-forward age', async () => {
    const r = await fetchSatelliteSignals(
      async () => res({ computed_on: '2026-08-99', buy_signals: [{ ticker: 'ORCL', signal: 'BUY' }] }),
      NOW,
    );
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason?.en).toContain('missing its date');
    expect(JSON.stringify(r)).not.toContain('ORCL');
  });

  it('reports a malformed snapshot as malformed, not as stale', async () => {
    // Unrecognised shape AND ancient: the shape check must win, so the
    // message does not send someone chasing a stale-mirror problem.
    const r = await fetchSatelliteSignals(async () => res({ computed_on: '2020-01-01', nope: true }), NOW);
    expect(r.status).toBe('unavailable');
    expect(r.status === 'unavailable' && r.reason).toBeUndefined();
  });
});

describe('the committed mirror artifact is consumable by the real parser', () => {
  // Guards the seam between the workflow that publishes the file and the code
  // that reads it: unit tests above use hand-written fixtures, so nothing else
  // would catch the published payload drifting from what the parser expects.
  const snapshot = JSON.parse(
    readFileSync(new URL('../../public/data/screener.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

  it('has the shape the publish workflow verifies before committing', () => {
    expect(Array.isArray(snapshot.full_ranking)).toBe(true);
    expect((snapshot.full_ranking as unknown[]).length).toBeGreaterThan(0);
  });

  it('carries a parseable date, so it can never read as "missing its date"', () => {
    expect(snapshotAgeDays(snapshot.computed_on ?? snapshot.as_of, new Date())).not.toBeNull();
  });

  it('yields real signals through extractBuySignals — not null, not empty rows', () => {
    const signals = extractBuySignals(snapshot);
    expect(signals).not.toBeNull();
    for (const s of signals!) {
      expect(s.ticker).toMatch(/^[A-Z.-]+$/);
      expect(s.signal).toBe('BUY');
    }
  });

  it('every ranking row maps to a usable ticker', () => {
    const mapped = (snapshot.full_ranking as unknown[]).map(mapSignal);
    expect(mapped.filter((s) => s === null)).toHaveLength(0);
  });
});

describe('findRankingRow / fetchRankingRow', () => {
  const SNAP = {
    computed_on: FRESH,
    full_ranking: [
      {
        ticker: 'ORCL',
        price: 144.76,
        high_52w: 324.63,
        drawdown_pct: 55.4,
        composite_score: 0.715,
        signal: 'BUY',
      },
      {
        ticker: 'INTC',
        price: 20.1,
        high_52w: 50.2,
        drawdown_pct: 60.0,
        composite_score: 0.4,
        signal: 'SKIP',
      },
    ],
  };

  it('finds a ranked ticker regardless of its verdict', () => {
    // The Satellite card wants BUYs only; a stock's own page wants whatever
    // the engine knows about that ticker, SKIP included.
    expect(findRankingRow(SNAP, 'INTC')?.signal).toBe('SKIP');
    expect(findRankingRow(SNAP, 'ORCL')?.drawdownPct).toBe(55.4);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(findRankingRow(SNAP, ' orcl ')?.ticker).toBe('ORCL');
  });

  it('returns null for a ticker the engine did not rank', () => {
    expect(findRankingRow(SNAP, 'TSLA')).toBeNull();
  });

  it('returns null for a malformed snapshot', () => {
    expect(findRankingRow(null, 'ORCL')).toBeNull();
    expect(findRankingRow({ full_ranking: 'nope' }, 'ORCL')).toBeNull();
    expect(findRankingRow([SNAP], 'ORCL')).toBeNull();
  });

  it('resolves ok(row) for a ranked ticker', async () => {
    const r = await fetchRankingRow('ORCL', async () => res(SNAP), NOW);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data?.ticker).toBe('ORCL');
  });

  it('resolves ok(null) — not unavailable — for an unranked ticker', async () => {
    // A healthy snapshot that simply does not cover this stock is not a
    // failure and has nothing to retry. Reporting it as unavailable would
    // show a broken-looking card on most symbols in the app.
    const r = await fetchRankingRow('TSLA', async () => res(SNAP), NOW);
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data).toBeNull();
  });

  it('is unavailable when the snapshot is unreadable', async () => {
    const r = await fetchRankingRow('ORCL', async () => res({ nope: true }), NOW);
    expect(r.status).toBe('unavailable');
  });

  it('applies the same staleness rules as the satellite feed', async () => {
    const stale = await fetchRankingRow('ORCL', async () => res({ ...SNAP, computed_on: '2020-01-01' }), NOW);
    expect(stale.status).toBe('unavailable');
    expect(stale.status === 'unavailable' && stale.reason?.he).toContain('ימים');

    const undated = await fetchRankingRow('ORCL', async () => res({ ...SNAP, computed_on: undefined }), NOW);
    expect(undated.status).toBe('unavailable');
  });

  it('reads the mirror, never onrender.com', async () => {
    let seen = '';
    await fetchRankingRow(
      'ORCL',
      async (url) => {
        seen = String(url);
        return res(SNAP);
      },
      NOW,
    );
    expect(seen).toBe(SCREENER_MIRROR_URL);
    expect(seen).not.toContain('onrender.com');
  });
});

describe('extractRankedTickers / fetchRankedTickers — who the engine has a view on', () => {
  it("lists every ranked ticker, regardless of the engine's verdict", () => {
    const t = extractRankedTickers({
      full_ranking: [
        { ticker: 'ORCL', price: 144.76, signal: 'BUY' },
        { ticker: 'SNDK', price: 1480.77, signal: 'SKIP' },
      ],
    });
    // SKIP is the engine declining to recommend the stock, not declining to
    // rank it: search offers both, and both rows say they are ranked.
    expect(t).toEqual(['ORCL', 'SNDK']);
  });

  it('keeps a ranked row whose numbers the engine omitted', () => {
    // The list is about membership, not about prices — those come from the
    // live quote route now — so a row with nothing but a ticker still counts.
    expect(extractRankedTickers({ full_ranking: [{ ticker: 'ORCL' }] })).toEqual(['ORCL']);
  });

  it('drops rows with no usable ticker rather than listing ""', () => {
    const t = extractRankedTickers({ full_ranking: [{ price: 10 }, { ticker: 'ORCL' }] });
    expect(t).toEqual(['ORCL']);
  });

  it('lists a duplicated ticker once', () => {
    const t = extractRankedTickers({
      full_ranking: [{ ticker: 'ORCL' }, { ticker: 'ORCL' }],
    });
    expect(t).toEqual(['ORCL']);
  });

  it('returns null for a body with no recognisable ranking', () => {
    expect(extractRankedTickers({ buy_signals: [] })).toBeNull();
    expect(extractRankedTickers(null)).toBeNull();
    expect(extractRankedTickers([])).toBeNull();
  });

  it('reads the same mirror as the satellite card, not the Render origin', async () => {
    let requested = '';
    await fetchRankedTickers(async (url: RequestInfo | URL) => {
      requested = String(url);
      return res({ computed_on: FRESH, full_ranking: [] });
    }, NOW);
    expect(requested).toBe(SCREENER_MIRROR_URL);
    expect(requested).not.toContain('onrender.com');
  });

  it("refuses a stale snapshot — a week-old ranking is not today's view", async () => {
    const r = await fetchRankedTickers(
      async () => res({ computed_on: '2026-08-20', full_ranking: [{ ticker: 'ORCL' }] }),
      NOW,
    );
    expect(r.status).toBe('unavailable');
  });

  it('is unavailable — never an empty list — on a network failure', async () => {
    // An empty list would read as "the engine ranks nothing today", which is
    // indistinguishable from a healthy but narrow snapshot. The failure has
    // to stay a failure; the one caller that softens it into "we know of no
    // ranking" does so explicitly.
    const r = await fetchRankedTickers(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r).toEqual({ status: 'unavailable' });
  });

  it('reads the committed mirror artifact for real', () => {
    const snapshot = JSON.parse(
      readFileSync(new URL('../../public/data/screener.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    const t = extractRankedTickers(snapshot)!;
    expect(t.length).toBeGreaterThan(50);
    for (const ticker of t) expect(ticker).toMatch(/^[A-Z.-]+$/);
  });
});
