import { describe, expect, it, vi } from 'vitest';
import { extractFinancials, fetchFinancials } from './financials';

const row = {
  periodStart: '2024-09-30',
  periodEnd: '2025-09-28',
  fy: 2025,
  fp: 'FY',
  form: '10-K',
  filed: '2025-11-05',
  revenue: 44_000_000_000,
  grossProfit: null,
  operatingIncome: 11_000_000_000,
  netIncome: 5_000_000_000,
  eps: 4.51,
  operatingCashFlow: 12_000_000_000,
  assets: 57_000_000_000,
  liabilities: 29_000_000_000,
  equity: 27_000_000_000,
  cash: 8_000_000_000,
};
const body = {
  ticker: 'QCOM',
  listed: true,
  cik: '804328',
  entity: 'QUALCOMM INC/DE',
  annual: [row],
  quarterly: [],
  source: 'sec:companyfacts',
};

function answering(status: number, payload: unknown): typeof fetch {
  return vi.fn(
    async () =>
      ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as unknown as Response,
  ) as unknown as typeof fetch;
}

describe('extractFinancials', () => {
  it('reads the statements and keeps a filing-less null as null', () => {
    const f = extractFinancials(body)!;
    expect(f.listed).toBe(true);
    expect(f.annual).toHaveLength(1);
    expect(f.annual[0].revenue).toBe(44_000_000_000);
    expect(f.annual[0].grossProfit).toBeNull();
    expect(f.annual[0].eps).toBe(4.51);
  });

  // Dropping it left a statement history with a period silently missing from
  // the middle, and no way for the reader to tell a column was gone. An
  // unreadable row makes the whole answer unreadable instead, so the screen
  // shows its unavailable state rather than a quietly shorter table.
  it('is null when a row names no filing, rather than dropping that row', () => {
    expect(extractFinancials({ ...body, annual: [{ ...row, filed: undefined }] })).toBeNull();
  });

  it('is null when the unreadable row is a quarterly one', () => {
    expect(extractFinancials({ ...body, quarterly: [{ ...row, form: undefined }] })).toBeNull();
  });

  // A row that is merely thin is not a row that is unreadable: the filing is
  // named, and a line it does not carry is null, which is the whole contract.
  it('keeps a row whose figures are missing but whose filing is named', () => {
    const f = extractFinancials({ ...body, annual: [{ ...row, revenue: undefined }] })!;
    expect(f.annual).toHaveLength(1);
    expect(f.annual[0].revenue).toBeNull();
  });

  it('is null for a body it cannot read', () => {
    expect(extractFinancials(null)).toBeNull();
    expect(extractFinancials({ ticker: 'QCOM' })).toBeNull();
    expect(extractFinancials({ ...body, annual: 'nope' })).toBeNull();
  });
});

describe('fetchFinancials', () => {
  it('is ok with the statements on a good answer', async () => {
    const res = await fetchFinancials('qcom', answering(200, body));
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.ticker).toBe('QCOM');
    expect(res.data.annual[0].netIncome).toBe(5_000_000_000);
  });

  it('is ok, not unavailable, for a ticker the SEC does not list', async () => {
    const res = await fetchFinancials(
      'MDA.TO',
      answering(200, { ...body, ticker: 'MDA.TO', listed: false, annual: [] }),
    );
    expect(res.status).toBe('ok');
    if (res.status !== 'ok') return;
    expect(res.data.listed).toBe(false);
  });

  it('carries the route’s own reason on a failure', async () => {
    const res = await fetchFinancials('QCOM', answering(500, { error: 'not_configured', message: 'x' }));
    expect(res.status).toBe('unavailable');
    if (res.status !== 'unavailable') return;
    expect(res.reason?.en).toContain('not configured');
  });

  it('is unavailable on a body it cannot read, never an empty statement', async () => {
    const res = await fetchFinancials('QCOM', answering(200, { hello: 'world' }));
    expect(res.status).toBe('unavailable');
  });

  it('is unavailable when the read throws', async () => {
    const boom = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    expect((await fetchFinancials('QCOM', boom)).status).toBe('unavailable');
  });
});
