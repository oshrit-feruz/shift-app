import { describe, expect, it } from 'vitest';
import {
  buildStatements,
  companyFactsUrl,
  mapFact,
  readCompanyFacts,
  readTickerMap,
  secTicker,
  spanOf,
  type Fact,
} from './edgar.js';

/**
 * The choices this module makes over EDGAR's flat fact lists — which
 * duration is a quarter, which filing stands for a period, which tag a
 * metric is read through — asserted on hand-built payloads shaped like the
 * real ones (a QCOM company-facts response was the model).
 */

const fact = (over: Partial<Fact> & { end: string; val: number }): Fact => ({
  start: null,
  fy: 2025,
  fp: 'FY',
  form: '10-K',
  filed: '2025-11-05',
  ...over,
});

function facts(tags: Record<string, Array<Record<string, unknown>>>) {
  const gaap: Record<string, unknown> = {};
  for (const [tag, rows] of Object.entries(tags)) {
    const unit = tag.startsWith('EarningsPerShare') ? 'USD/shares' : 'USD';
    gaap[tag] = { units: { [unit]: rows } };
  }
  return { cik: 804328, entityName: 'QUALCOMM INC/DE', facts: { 'us-gaap': gaap } };
}

describe('mapFact', () => {
  it('keeps a 10-K/10-Q fact and drops the rest', () => {
    const raw = {
      start: '2024-09-30',
      end: '2025-09-28',
      val: 1,
      fy: 2025,
      fp: 'FY',
      form: '10-K',
      filed: '2025-11-05',
    };
    expect(mapFact(raw)).toEqual({ ...raw });
    expect(mapFact({ ...raw, form: '8-K' })).toBeNull();
    expect(mapFact({ ...raw, val: 'n/a' })).toBeNull();
    expect(mapFact({ ...raw, end: 'yesterday' })).toBeNull();
  });
});

describe('spanOf', () => {
  it('reads a year and a quarter from the duration, and drops year-to-date spans', () => {
    expect(spanOf(fact({ start: '2024-09-30', end: '2025-09-28', val: 1 }))).toBe('annual');
    expect(spanOf(fact({ start: '2026-03-30', end: '2026-06-28', val: 1 }))).toBe('quarterly');
    // Nine months: neither, and it must not land in a Q3 column.
    expect(spanOf(fact({ start: '2025-09-29', end: '2026-06-28', val: 1 }))).toBeNull();
    // Six months.
    expect(spanOf(fact({ start: '2025-09-29', end: '2026-03-29', val: 1 }))).toBeNull();
    expect(spanOf(fact({ start: null, end: '2026-06-28', val: 1 }))).toBeNull();
  });
});

describe('buildStatements', () => {
  const annual = (
    end: string,
    start: string,
    val: number,
    filed: string,
    extra: Record<string, unknown> = {},
  ) => ({
    start,
    end,
    val,
    fy: Number(end.slice(0, 4)),
    fp: 'FY',
    form: '10-K',
    filed,
    ...extra,
  });

  it('takes the latest filing for a period, so a restatement wins', () => {
    const company = readCompanyFacts(
      facts({
        Revenues: [
          annual('2024-09-29', '2023-10-02', 38_000, '2024-11-06'),
          // The same year, refiled a year later as a comparative, restated.
          annual('2024-09-29', '2023-10-02', 38_962, '2025-11-05'),
          annual('2025-09-28', '2024-09-30', 44_000, '2025-11-05'),
        ],
        NetIncomeLoss: [annual('2025-09-28', '2024-09-30', 5_000, '2025-11-05')],
      }),
    )!;
    const rows = buildStatements(company, 'annual', 5);
    expect(rows.map((r) => r.periodEnd)).toEqual(['2025-09-28', '2024-09-29']);
    expect(rows[1].revenue).toBe(38_962);
    expect(rows[1].filed).toBe('2025-11-05');
    expect(rows[0].netIncome).toBe(5_000);
  });

  it('reads a metric through its ordered tags, per period, so a tag change does not break the series', () => {
    const company = readCompanyFacts(
      facts({
        Revenues: [annual('2017-09-24', '2016-09-26', 22_000, '2017-11-01')],
        RevenueFromContractWithCustomerExcludingAssessedTax: [
          annual('2025-09-28', '2024-09-30', 44_000, '2025-11-05'),
        ],
        NetIncomeLoss: [],
      }),
    )!;
    const rows = buildStatements(company, 'annual', 5);
    expect(rows.map((r) => [r.periodEnd, r.revenue])).toEqual([
      ['2025-09-28', 44_000],
      ['2017-09-24', 22_000],
    ]);
  });

  it('matches a balance-sheet instant to the period it ends on', () => {
    const company = readCompanyFacts(
      facts({
        Revenues: [annual('2025-09-28', '2024-09-30', 44_000, '2025-11-05')],
        Assets: [
          { end: '2025-09-28', val: 57_000, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-11-05' },
          { end: '2024-09-29', val: 55_000, fy: 2025, fp: 'FY', form: '10-K', filed: '2025-11-05' },
        ],
      }),
    )!;
    const [row] = buildStatements(company, 'annual', 5);
    expect(row.assets).toBe(57_000);
    expect(row.liabilities).toBeNull();
  });

  it('keeps quarters and years apart, and never derives a fourth quarter', () => {
    const company = readCompanyFacts(
      facts({
        Revenues: [
          annual('2025-09-28', '2024-09-30', 44_000, '2025-11-05'),
          {
            start: '2025-03-31',
            end: '2025-06-29',
            val: 10_000,
            fy: 2025,
            fp: 'Q3',
            form: '10-Q',
            filed: '2025-07-30',
          },
          // Nine months to date, filed in the same 10-Q: not a quarter.
          {
            start: '2024-09-30',
            end: '2025-06-29',
            val: 33_000,
            fy: 2025,
            fp: 'Q3',
            form: '10-Q',
            filed: '2025-07-30',
          },
        ],
        NetIncomeLoss: [],
      }),
    )!;
    expect(buildStatements(company, 'annual', 5).map((r) => r.revenue)).toEqual([44_000]);
    const quarters = buildStatements(company, 'quarterly', 8);
    expect(quarters).toHaveLength(1);
    expect(quarters[0]).toMatchObject({ periodEnd: '2025-06-29', revenue: 10_000, fp: 'Q3', form: '10-Q' });
  });

  it('bounds the list and orders it newest first', () => {
    const company = readCompanyFacts(
      facts({
        Revenues: [2021, 2022, 2023, 2024, 2025].map((y) =>
          annual(`${y}-09-28`, `${y - 1}-09-30`, y, `${y}-11-05`),
        ),
      }),
    )!;
    expect(buildStatements(company, 'annual', 3).map((r) => r.revenue)).toEqual([2025, 2024, 2023]);
  });
});

describe('readCompanyFacts', () => {
  it('reads an IFRS-only filer as listed with nothing to show, not as a bad shape', () => {
    const company = readCompanyFacts({ cik: 1, entityName: 'X', facts: { 'ifrs-full': {} } });
    expect(company).not.toBeNull();
    expect(buildStatements(company!, 'annual', 5)).toEqual([]);
  });

  it('is null for a body it cannot read', () => {
    expect(readCompanyFacts(null)).toBeNull();
    expect(readCompanyFacts({ entityName: 'no cik' })).toBeNull();
    expect(readCompanyFacts({ cik: 1, facts: { 'us-gaap': 'nope' } })).toBeNull();
  });
});

describe('the SEC ticker file', () => {
  it('maps tickers to CIKs, in either spelling of a class share', () => {
    const map = readTickerMap({
      '0': { cik_str: 804328, ticker: 'QCOM', title: 'QUALCOMM INC/DE' },
      '1': { cik_str: 1067983, ticker: 'BRK-B', title: 'BERKSHIRE HATHAWAY INC' },
    })!;
    expect(map.get('QCOM')).toEqual({ cik: '804328', title: 'QUALCOMM INC/DE' });
    expect(map.get(secTicker('brk.b'))?.cik).toBe('1067983');
    expect(readTickerMap({})).toBeNull();
  });

  it('pads the CIK to the ten digits EDGAR expects', () => {
    expect(companyFactsUrl('804328').toString()).toBe(
      'https://data.sec.gov/api/xbrl/companyfacts/CIK0000804328.json',
    );
  });
});
