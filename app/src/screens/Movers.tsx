import { useState } from 'react';
import { Card } from '../components/Card';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { TickerSparkline } from '../components/TickerSparkline';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { DemoOnly } from '../components/DemoOnly';
import { useDemoMode } from '../lib/DemoModeProvider';
import { SkeletonCard, SkeletonList } from '../components/Skeleton';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { PRICE_REFRESH_MS } from '../data/quotes';
import { fetchStatsFor, relativeVolume } from '../data/stats';
import { compactCount, moneyOrDash, pctOrDash, signalColor } from '../lib/format';
import type { StockStats, SymbolInfo } from '../data/types';
import type { StringKey } from '../i18n/strings';
import type { ScreenProps } from '../App';

const TABS: Array<[string, StringKey]> = [
  ['Gainers', 'movers.gainers'],
  ['Losers', 'movers.losers'],
  ['Most active', 'movers.active'],
];

const SECTORS: Array<[string, StringKey]> = [
  ['All', 'sector.all'],
  ['Technology', 'sector.tech'],
  ['Consumer', 'sector.consumer'],
  ['Financials', 'sector.financials'],
  ['Energy', 'sector.energy'],
  ['Healthcare', 'sector.healthcare'],
];

/**
 * Split so the hooks below never run with sample data off.
 *
 * EVERY NUMBER ON THIS SCREEN IS REAL NOW. The day change comes from the live
 * quote, the price beside it from the same quote, and the Vol column, the
 * RVol column and the "Most active" ranking from /api/stats — the session's
 * volume and the provider's average daily volume. What those replaced is
 * worth naming: the volume was a frozen string per ticker, and RVol was
 * `1.1 + (ticker.length % 4) * 0.4`, a number derived from how many letters
 * the symbol has and printed with an "×" beside a real price.
 *
 * THE GATE STAYS ANYWAY, and for a different reason than before. This screen
 * ranks `demoService.symbols()` — the app's ten-row sample table — so it is
 * "the movers among ten sample stocks", not the market's. Real figures over a
 * hand-picked universe would be a more convincing wrong answer than obvious
 * placeholders were, which is exactly the trade this app does not make. The
 * gate lifts when the universe is real: EODHD's screener is on this plan and
 * can rank the actual market, though it answers on the last completed session
 * rather than intraday, and picking sensible filters (a price floor, a volume
 * floor, primary listings only) is a product decision rather than a wiring
 * one — sorted naively by day change it returns sub-penny OTC listings.
 */
export function MoversScreen(props: ScreenProps) {
  const demo = useDemoMode();
  return demo ? <MoversBody {...props} /> : <DemoOnly feature="title.movers" />;
}

function MoversBody(_: ScreenProps) {
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tab, setTab] = useState('Gainers');
  const [sector, setSector] = useState('All');
  const symbols = useLoadable(() => demoService.symbols(), [], PRICE_REFRESH_MS);
  // Volume and its average, per ticker, from /api/stats. Read for the whole
  // table in one request rather than per row: the route batches natively, and
  // the "Most active" ranking needs every row's volume before it can order any
  // of them. A ticker the provider does not carry is simply absent, which the
  // Vol and RVol columns render as "—".
  const tickers = symbols.state.status === 'ok' ? symbols.state.data.map((x) => x.ticker) : [];
  // No refresh interval, unlike the quotes above: these are shared for
  // fifteen minutes client-side (data/stats.ts) against a feed that is
  // itself delayed by about as long, so a thirty-second poll would only
  // re-read the same cached numbers while claiming to be live.
  const statsRead = useLoadable(() => fetchStatsFor(tickers), [tickers.join(',')]);
  const stats = statsRead.state.status === 'ok' ? statsRead.state.data : {};

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {TABS.map(([k, key]) => (
          <Chip key={k} active={tab === k} onClick={() => setTab(k)}>
            {t(key)}
          </Chip>
        ))}
      </div>
      <ChipRail>
        {SECTORS.map(([k, key]) => (
          <Chip key={k} active={sector === k} onClick={() => setSector(k)}>
            {t(key)}
          </Chip>
        ))}
      </ChipRail>

      <DataState
        state={symbols.state}
        onRetry={symbols.retry}
        skeleton={
          beg ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonCard key={i} height={78} lines={1} padding={12} />
              ))}
            </div>
          ) : (
            <Card padding="6px 10px 4px" gap={0}>
              <SkeletonList count={8} leading={false} subtitle={false} minHeight={34} firstDivider />
            </Card>
          )
        }
      >
        {(syms) => {
          // A symbol the provider could not price has no day change to rank by,
          // so it sorts to the bottom of Gainers and Losers alike rather than
          // being treated as a flat 0% — which would place it in the middle
          // of the board, among the stocks that genuinely did not move.
          const byChange = (a: SymbolInfo, b: SymbolInfo, sign: 1 | -1) => {
            const x = a.quote?.changePct ?? null;
            const y = b.quote?.changePct ?? null;
            if (x === null && y === null) return 0;
            if (x === null) return 1;
            if (y === null) return -1;
            return sign * (y - x);
          };
          // Same rule as byChange, for the same reason: a ticker whose volume
          // we do not have has not "traded nothing", so it sorts to the bottom
          // rather than into the middle of the board as a zero.
          const byVolume = (a: SymbolInfo, b: SymbolInfo) => {
            const x = stats[a.ticker]?.volume ?? null;
            const y = stats[b.ticker]?.volume ?? null;
            if (x === null && y === null) return 0;
            if (x === null) return 1;
            if (y === null) return -1;
            return y - x;
          };
          const pool = syms
            .slice()
            .sort((a, b) =>
              tab === 'Losers'
                ? byChange(a, b, -1)
                : tab === 'Most active'
                  ? byVolume(a, b)
                  : byChange(a, b, 1),
            );
          const filtered = sector === 'All' ? pool : pool.filter((x) => x.sector === sector);

          if (beg) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {filtered.slice(0, 6).map((x) => (
                  <Card
                    key={x.ticker}
                    padding={12}
                    gap={5}
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <TickerTile ticker={x.ticker} size={26} />
                      <Num size={17} weight={600}>
                        {x.ticker}
                      </Num>
                      <span
                        className="text-muted"
                        style={{
                          fontSize: 'var(--text-body)',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {x.name}
                      </span>
                      <Num
                        size={23}
                        style={{
                          fontFamily: 'var(--font-heading)',
                          color: signalColor(x.quote?.changePct),
                        }}
                      >
                        {pctOrDash(x.quote?.changePct)}
                      </Num>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 'var(--text-body)', opacity: 0.76, flex: 1 }}>
                        {x.why[language]}
                      </span>
                      <TickerSparkline ticker={x.ticker} />
                    </div>
                  </Card>
                ))}
              </div>
            );
          }

          return (
            <Card padding="6px 10px 4px" gap={0}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}>
                <thead>
                  <tr>
                    <Th align="start">{t('movers.colSym')}</Th>
                    <Th>{t('movers.colLast')}</Th>
                    <Th>{t('movers.colChg')}</Th>
                    <Th>{t('movers.colVol')}</Th>
                    <Th>RVol</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((x) => (
                    <tr
                      key={x.ticker}
                      style={{ cursor: 'pointer' }}
                      onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                    >
                      <Td align="start" strong>
                        {x.ticker}
                      </Td>
                      <Td>
                        <Num>{moneyOrDash(x.quote?.price)}</Num>
                      </Td>
                      <Td color={signalColor(x.quote?.changePct)}>
                        <Num>{pctOrDash(x.quote?.changePct)}</Num>
                      </Td>
                      <Td muted>
                        <Num>{volumeOrDash(stats[x.ticker]?.volume)}</Num>
                      </Td>
                      <Td color="var(--color-accent-300)">
                        <Num>{rvolOrDash(stats[x.ticker])}</Num>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        }}
      </DataState>
    </div>
  );
}

/** The session's volume, or the dash owed when the provider carries none. */
function volumeOrDash(volume: number | null | undefined): string {
  return volume === null || volume === undefined ? '—' : compactCount(volume);
}

/**
 * Relative volume, or a dash.
 *
 * This column used to read `1.1 + (ticker.length % 4) * 0.4` — a number
 * derived from how many letters the symbol has, rendered with an "×" beside a
 * real price and a real day change. It is now the session's volume over the
 * provider's average daily volume, both from one snapshot, and null whenever
 * either is missing or the average is zero (see relativeVolume).
 */
function rvolOrDash(stats: StockStats | undefined): string {
  const rvol = relativeVolume(stats);
  return rvol === null ? '—' : `${rvol.toFixed(1)}×`;
}

function Th({ children, align = 'end' }: { children: React.ReactNode; align?: 'start' | 'end' }) {
  return (
    <th
      className="text-muted"
      style={{
        textAlign: align,
        fontWeight: 500,
        padding: '8px 4px',
        borderBottom: '1px solid var(--color-divider)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'end',
  strong,
  muted,
  color,
}: {
  children: React.ReactNode;
  align?: 'start' | 'end';
  strong?: boolean;
  muted?: boolean;
  color?: string;
}) {
  return (
    <td
      className={muted ? 'text-muted' : undefined}
      style={{
        textAlign: align,
        padding: '9px 4px',
        borderBottom: '1px solid var(--color-divider)',
        fontWeight: strong ? 600 : undefined,
        color,
      }}
    >
      {children}
    </td>
  );
}
