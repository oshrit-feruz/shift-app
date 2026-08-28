import { describe, expect, it } from 'vitest';
import { fetchConnectedAccounts } from './snaptradeAccount';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ACCOUNT = {
  id: 'acc-1',
  name: 'Individual',
  numberMasked: '••4321',
  institution: 'Interactive Brokers',
  currency: 'USD',
  totalValue: 1000,
  asOf: '2026-08-28T14:30:00Z',
  source: 'realtime' as const,
  balances: [{ currency: 'USD', cash: 100, buyingPower: 200 }],
  positions: [
    {
      ticker: 'AAPL',
      description: 'Apple Inc.',
      units: 4,
      price: 200,
      marketValue: 800,
      avgCost: 150,
      openPnl: 200,
      currency: 'USD',
    },
  ],
};

describe('freshness and source', () => {
  it('carries the brokerage fetch time and the route that answered', async () => {
    const r = await fetchConnectedAccounts(async () => res({ accounts: [ACCOUNT] }));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].asOf).toBe('2026-08-28T14:30:00Z');
    expect(r.data.accounts[0].source).toBe('realtime');
  });

  it('defaults to the weaker daily claim when the source is absent or unrecognised', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ accounts: [{ ...ACCOUNT, source: undefined, asOf: undefined }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].source).toBe('daily');
    expect(r.data.accounts[0].asOf).toBeNull();
  });
});

describe('fetchConnectedAccounts', () => {
  it('returns the real account on a well-formed response', async () => {
    const r = await fetchConnectedAccounts(async () => res({ accounts: [ACCOUNT] }));
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts).toEqual([ACCOUNT]);
  });

  it('treats zero connected accounts as a real ok, not an error', async () => {
    const r = await fetchConnectedAccounts(async () => res({ accounts: [] }));
    expect(r).toEqual({ status: 'ok', data: { accounts: [], connections: [] } });
  });

  it('carries a live connection that reported no accounts, so it is not read as "nothing connected"', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({
        accounts: [],
        connections: [
          {
            id: 'conn-1',
            brokerage: 'Interactive Brokers',
            disabled: false,
            type: 'read',
            dataFreshnessMode: 'realtime',
            accountCount: 0,
          },
        ],
      }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts).toEqual([]);
    expect(r.data.connections).toHaveLength(1);
    expect(r.data.connections[0]).toMatchObject({ brokerage: 'Interactive Brokers', disabled: false });
  });

  it('drops a connection row with no id rather than half-rendering it', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ accounts: [], connections: [{ brokerage: 'Ghost' }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.connections).toEqual([]);
  });

  it('reports a missing-credentials fault with its own specific reason', async () => {
    const r = await fetchConnectedAccounts(async () => res({ error: 'not_configured' }, 500));
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason?.he).toContain('אינם מוגדרים');
  });

  it('reports rejected credentials distinctly from an unreachable service', async () => {
    const rejected = await fetchConnectedAccounts(async () => res({ error: 'upstream_unauthorized' }, 502));
    const unreachable = await fetchConnectedAccounts(async () => res({ error: 'upstream_unavailable' }, 502));
    expect(rejected.status).toBe('unavailable');
    expect(unreachable.status).toBe('unavailable');
    if (rejected.status !== 'unavailable' || unreachable.status !== 'unavailable') return;
    expect(rejected.reason).not.toEqual(unreachable.reason);
  });

  it('falls back to the generic reason when an error body is not JSON', async () => {
    const r = await fetchConnectedAccounts(async () =>
      ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('not json');
        },
      }) as unknown as Response,
    );
    expect(r.status).toBe('unavailable');
  });

  it('reports an unrecognised shape rather than guessing at it', async () => {
    const r = await fetchConnectedAccounts(async () => res({ accounts: 'nope' }));
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason?.en).toMatch(/shape/);
  });

  it('reports a network failure as unavailable and never as demo data', async () => {
    const r = await fetchConnectedAccounts(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(r.status).toBe('unavailable');
  });

  it('drops a position with no ticker instead of rendering a blank row', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ accounts: [{ ...ACCOUNT, positions: [{ units: 1 }, ACCOUNT.positions[0]] }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].positions.map((p) => p.ticker)).toEqual(['AAPL']);
  });

  it('keeps an unreported number as null rather than coercing it to zero', async () => {
    const r = await fetchConnectedAccounts(async () =>
      res({ accounts: [{ ...ACCOUNT, totalValue: undefined, positions: [{ ticker: 'NVDA' }] }] }),
    );
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.data.accounts[0].totalValue).toBeNull();
    expect(r.data.accounts[0].positions[0]).toMatchObject({ ticker: 'NVDA', units: null, price: null, marketValue: null });
  });

  it('drops an account with no id — it could not be addressed or trusted', async () => {
    const r = await fetchConnectedAccounts(async () => res({ accounts: [{ name: 'ghost' }] }));
    expect(r).toEqual({ status: 'ok', data: { accounts: [], connections: [] } });
  });
});
