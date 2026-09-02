import { Card, CardTitle } from '../../components/Card';
import { Num } from '../../components/Num';
import { rsi } from '../../components/charts';
import { useT } from '../../i18n/useT';
import { compactCount, moneyOrDash } from '../../lib/format';
import type { Bar, Quote, StockStats } from '../../data/types';

/**
 * The key-statistics grid, for any ticker.
 *
 * Three sources meet here and the card is careful about which is which:
 * the live quote (open, previous close, day range), the published daily bars
 * (volume, average volume, RSI), and the provider's delayed extended quote
 * (market cap, the two P/Es, dividend yield, the 52-week range). Nothing is
 * derived from anything else — the grid used to divide the live price by a
 * sample-table P/E and publish the result as EPS, which is the most
 * convincing kind of invented number because half of it is real.
 *
 * Extracted from the stock screen so both stock pages can show it. A symbol
 * outside the app's ten-row sample table used to get no key statistics at
 * all, though every source above answers for any ticker.
 */
export function KeyStats({
  quote,
  bars,
  stats,
  beg,
}: Readonly<{
  quote: Quote | null;
  bars: Bar[] | null;
  stats: StockStats | null;
  beg: boolean;
}>) {
  const t = useT();
  return (
    <Card padding={12} gap={7}>
      <CardTitle>{beg ? t('stock.basics') : t('stock.keyStats')}</CardTitle>
      {beg ? (
        BEG_STATS(quote?.price ?? null, stats, bars?.at(-1)?.volume ?? null).map((row) => (
          <div key={row.k} style={{ padding: '7px 0', borderTop: '1px solid var(--color-divider)' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                fontSize: 'var(--text-row)',
              }}
            >
              <span>{row.k}</span>
              <Num>{row.v}</Num>
            </div>
            <div className="text-muted" style={{ fontSize: 'var(--text-caption)', marginTop: 2 }}>
              {row.help}
            </div>
          </div>
        ))
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 12px' }}>
          {ADV_STATS(quote, bars, stats).map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                fontSize: 'var(--text-caption)',
                padding: '2px 0',
              }}
            >
              <span className="text-muted">{k}</span>
              <Num>{v}</Num>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const BEG_STATS = (price: number | null, stats: StockStats | null, vol: number | null) => [
  // Every figure here is real. Company size and price-vs-earnings used to be
  // the prototype's, and are read per ticker from /api/stats; both render "—"
  // for a symbol that provider does not carry, which is every non-US listing
  // and every instrument with no earnings to divide by.
  { k: 'Price', v: moneyOrDash(price), help: 'What one share costs right now' },
  {
    k: 'Company size',
    v: statOrDash(stats?.marketCap, compactCount),
    help: 'Every share added together — market cap',
  },
  {
    k: 'Traded today',
    v: vol === null ? '—' : `${compactCount(vol)} shares`,
    help: 'How busy the stock is; high means lots of interest',
  },
  {
    k: 'Price vs earnings',
    v: statOrDash(stats?.pe, (v) => `${v.toFixed(1)}×`),
    help: 'Years of current profit to pay for the share',
  },
];

/**
 * One statistic, or the em dash we owe the reader when the provider has none.
 *
 * `undefined` and `null` both land here and mean different things upstream —
 * the read has not finished, or it finished and the provider carries nothing
 * for this symbol — but neither is a number, and the grid says so the same
 * way. Distinguishing them on screen would mean a loading skeleton per cell,
 * which is more motion than a slow-moving figure is worth.
 */
function statOrDash(v: number | null | undefined, format: (n: number) => string): string {
  return v === null || v === undefined ? '—' : format(v);
}

const ADV_STATS = (
  quote: Quote | null,
  bars: Bar[] | null,
  stats: StockStats | null,
): Array<[string, string]> => {
  // The newest published session, which is what volume is read from — the
  // live quote has no volume figure.
  const last = bars?.at(-1) ?? null;
  const rsiNow = bars ? ([...rsi(bars.map((b) => b.close))].reverse().find((v) => v !== null) ?? null) : null;
  // Average volume over the published window, not a frozen "162.4M" that was
  // the same figure for every stock in the app.
  const avgVol = bars ? bars.reduce((a, b) => a + b.volume, 0) / bars.length : null;

  const or = (v: string | null) => v ?? '—';

  return [
    // From the LIVE quote, not from the last published bar: the quote is
    // today's session as it stands, while the newest daily bar is yesterday's
    // once the market opens. Reading the open off a stale bar is how this grid
    // once showed an "Open 231.85" under a chart strip reading "O 232.80" for
    // the same stock.
    ['Open', or(quote && quote.open.toFixed(2))],
    ['Prev close', or(quote && quote.prevClose.toFixed(2))],
    ['Day range', or(quote && `${quote.dayLow.toFixed(2)}–${quote.dayHigh.toFixed(2)}`)],
    ['Volume', or(last && compactCount(last.volume))],
    ['Avg vol', or(avgVol === null ? null : compactCount(avgVol))],
    // From /api/stats, per ticker. The provider's delayed feed is the right
    // source for these and the wrong one for a price, so it supplies no price
    // here — the three rows above come from the live quote and these do not
    // pretend to describe the same instant.
    ['Mkt cap', statOrDash(stats?.marketCap, compactCount)],
    ['P/E', statOrDash(stats?.pe, (v) => v.toFixed(1))],
    ['Fwd P/E', statOrDash(stats?.forwardPE, (v) => v.toFixed(1))],
    // A fraction on the wire: 0.0216 is a 2.16% yield. See data/types.ts —
    // the provider's own docs call this a percent and its own data does not.
    ['Div yield', statOrDash(stats?.dividendYield, (v) => `${(v * 100).toFixed(2)}%`)],
    [
      '52w range',
      stats?.fiftyTwoWeekLow != null && stats?.fiftyTwoWeekHigh != null
        ? `${stats.fiftyTwoWeekLow.toFixed(2)}–${stats.fiftyTwoWeekHigh.toFixed(2)}`
        : '—',
    ],
    ['RSI(14)', or(rsiNow === null ? null : String(Math.round(rsiNow)))],
  ];
};
