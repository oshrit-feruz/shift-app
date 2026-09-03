import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, resetTickerMapCache } from '../financials.js';
import { callRoute, itAnswersTheRouteBasics } from '../_lib/routeHarness.js';

/**
 * The route behind the Reports tab's statements. What matters here: a
 * ticker the SEC does not know is an answer about the ticker, a blocked or
 * failed read is an error and never an empty list, and the declared
 * User-Agent is required rather than invented.
 */

const tickerFile = {
  '0': { cik_str: 804328, ticker: 'QCOM', title: 'QUALCOMM INC/DE' },
};
const companyFacts = {
  cik: 804328,
  entityName: 'QUALCOMM INC/DE',
  facts: {
    'us-gaap': {
      Revenues: {
        units: {
          USD: [
            {
              start: '2024-09-30',
              end: '2025-09-28',
              val: 44_000,
              fy: 2025,
              fp: 'FY',
              form: '10-K',
              filed: '2025-11-05',
            },
            {
              start: '2026-03-30',
              end: '2026-06-28',
              val: 9_947,
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-29',
            },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            {
              start: '2026-03-30',
              end: '2026-06-28',
              val: 2_002,
              fy: 2026,
              fp: 'Q3',
              form: '10-Q',
              filed: '2026-07-29',
            },
          ],
        },
      },
    },
  },
};

/** A fetch that answers the ticker file and the facts by URL. */
function edgar(
  facts: { status: number; body?: unknown } = { status: 200, body: companyFacts },
): typeof fetch {
  return vi.fn(async (input: URL | string) => {
    const url = String(input);
    const isTickers = url.includes('company_tickers');
    const status = isTickers ? 200 : facts.status;
    const body = isTickers ? tickerFile : facts.body;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
  }) as unknown as typeof fetch;
}

const call = (query: Record<string, string | string[]>, fetchImpl: typeof fetch) =>
  callRoute(createHandler(1_000, fetchImpl), query);

beforeEach(() => {
  vi.stubEnv('SEC_USER_AGENT', 'Shift test@example.com');
  resetTickerMapCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/financials', () => {
  itAnswersTheRouteBasics((f) => createHandler(1_000, f), { symbol: 'QCOM' }, 'SEC_USER_AGENT', edgar());

  it('serves the filed statements, annual and quarterly apart', async () => {
    const res = await call({ symbol: 'qcom' }, edgar());
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      ticker: 'QCOM',
      listed: true,
      cik: '804328',
      entity: 'QUALCOMM INC/DE',
      source: 'sec:companyfacts',
    });
    const body = res._body as {
      annual: Array<{ revenue: number }>;
      quarterly: Array<{ revenue: number; netIncome: number }>;
    };
    expect(body.annual.map((r) => r.revenue)).toEqual([44_000]);
    expect(body.quarterly).toHaveLength(1);
    expect(body.quarterly[0]).toMatchObject({ revenue: 9_947, netIncome: 2_002, fp: 'Q3' });
    expect(res._headers['Cache-Control']).toContain('s-maxage');
  });

  it('declares itself to the SEC with the configured User-Agent', async () => {
    const fetchImpl = edgar();
    await call({ symbol: 'QCOM' }, fetchImpl);
    const calls = (fetchImpl as unknown as { mock: { calls: Array<[URL, RequestInit]> } }).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) {
      expect((init.headers as Record<string, string>)['User-Agent']).toBe('Shift test@example.com');
    }
  });

  it('answers "not listed" for a ticker the SEC file does not know — a fact, not a failure', async () => {
    const res = await call({ symbol: 'MDA.TO' }, edgar());
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ticker: 'MDA.TO', listed: false, annual: [], quarterly: [] });
  });

  it('reads a 404 on the facts as a filer with nothing tagged, not as an outage', async () => {
    const res = await call({ symbol: 'QCOM' }, edgar({ status: 404 }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ listed: false });
  });

  // The route's own contract says a filer with no US-GAAP facts answers
  // listed: false. Only the 404 path was honouring it, so an IFRS filer or a
  // fund — 200, a real CIK, no `us-gaap` key — came back listed with an empty
  // table, telling the reader "listed, no statements" where the truth is "no
  // US-GAAP statements to read".
  it('answers "not listed" for a 200 that carries no US-GAAP facts at all', async () => {
    const ifrs = { cik: 804328, entityName: 'A FOREIGN FILER', facts: { 'ifrs-full': {} } };
    const res = await call({ symbol: 'QCOM' }, edgar({ status: 200, body: ifrs }));
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ listed: false, annual: [], quarterly: [] });
    // Still says who it is: the CIK and name were read successfully, and
    // withholding them would claim less than the route actually knows.
    expect(res._body).toMatchObject({ cik: '804328', entity: 'A FOREIGN FILER' });
  });

  it('reports a blocked request as forbidden rather than as no statements', async () => {
    const res = await call({ symbol: 'QCOM' }, edgar({ status: 403 }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('upstream_forbidden');
  });

  it('reports a facts body it cannot read', async () => {
    const res = await call({ symbol: 'QCOM' }, edgar({ status: 200, body: { nope: true } }));
    expect(res._status).toBe(502);
    expect((res._body as { error: string }).error).toBe('bad_response');
  });

  it('refuses a malformed or repeated symbol', async () => {
    expect((await call({ symbol: 'not a ticker' }, edgar()))._status).toBe(400);
    expect((await call({ symbol: ['QCOM', 'NVDA'] }, edgar()))._status).toBe(400);
    expect((await call({}, edgar()))._status).toBe(400);
  });

  it('reads the ticker file once and reuses it', async () => {
    const fetchImpl = edgar();
    await call({ symbol: 'QCOM' }, fetchImpl);
    await call({ symbol: 'QCOM' }, fetchImpl);
    const urls = (fetchImpl as unknown as { mock: { calls: Array<[URL]> } }).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(urls.filter((u) => u.includes('company_tickers'))).toHaveLength(1);
  });
});
