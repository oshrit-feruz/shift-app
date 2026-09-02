import { useState } from 'react';
import { Card } from '../components/Card';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { TickerSparkline } from '../components/TickerSparkline';
import { TickerTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { SkeletonCard, SkeletonList } from '../components/Skeleton';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useLoadable } from '../data/useLoadable';
import { fetchMovers, type Board, type MoverRow } from '../data/movers';
import { relativeVolume } from '../data/stats';
import { compactCount, moneyOrDash, pctOrDash, signalColor } from '../lib/format';
import type { StringKey } from '../i18n/strings';
import type { ScreenProps } from '../App';

const TABS: Array<[Board, StringKey]> = [
  ['gainers', 'movers.gainers'],
  ['losers', 'movers.losers'],
  ['active', 'movers.active'],
];

/**
 * The sector chips, each mapped to the provider's own sector words.
 *
 * A translation table rather than a straight comparison because the two
 * vocabularies do not line up one to one: the app offers "Consumer" where the
 * provider splits Cyclical from Defensive, and "Financials" where it says
 * "Financial Services". Comparing the chip label to the field directly would
 * have quietly emptied both of those chips.
 *
 * FILTERED HERE RATHER THAN UPSTREAM, on purpose. The screener does accept a
 * sector filter, but one filter cannot express "either of these two", so the
 * Consumer chip would need a second query — and, more to the point, a chip
 * that re-ran the query would show the sector's own top hundred rather than
 * the movers of that sector within the board being looked at. The chips narrow
 * the board; that is what the screen says they do.
 *
 * A row the provider gives no sector for — an ETF, which has none — is on the
 * board and appears under "All" only. That is an absence, not a mismatch.
 */
const SECTORS: Array<[string, StringKey, readonly string[]]> = [
  ['All', 'sector.all', []],
  ['Technology', 'sector.tech', ['Technology']],
  ['Consumer', 'sector.consumer', ['Consumer Cyclical', 'Consumer Defensive']],
  ['Financials', 'sector.financials', ['Financial Services']],
  ['Energy', 'sector.energy', ['Energy']],
  ['Healthcare', 'sector.healthcare', ['Healthcare']],
];

/** How many cards beginner mode shows before the list stops being a summary. */
const BEGINNER_ROWS = 6;

/**
 * Market movers.
 *
 * EVERY NUMBER ON THIS SCREEN IS REAL, AND SO IS THE UNIVERSE BEHIND IT. Both
 * halves took work. The figures went first: the day change and price used to
 * come from the sample table, the Vol column was a frozen string per ticker,
 * and RVol was `1.1 + (ticker.length % 4) * 0.4` — a number derived from how
 * many letters the symbol has, printed with an "×" beside a real price.
 *
 * The universe went second, and it is why this screen used to sit behind the
 * sample-data switch even after its numbers were real. It ranked
 * `demoService.symbols()`, ten stocks somebody picked during design, so "market
 * movers" meant "the movers among those ten" — real figures over a hand-picked
 * universe, which is a more convincing wrong answer than obvious placeholders
 * are. It now ranks the US market through EODHD's screener (api/movers.ts),
 * so the gate is gone.
 *
 * THE ONE THING THE SOURCE CANNOT DO, said in the header rather than hidden:
 * the screener answers on the last completed session, so during a trading day
 * this board is yesterday's. Both columns come from that one session, which is
 * why the price here is the screener's close and not the live quote — a live
 * price beside a last-close change would be two moments under one label.
 */
export function MoversScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { mode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tab, setTab] = useState<Board>('gainers');
  const [sector, setSector] = useState('All');
  // One read per board, cached for half an hour client-side against a source
  // that recomputes once a day (data/movers.ts) — flipping tabs and coming
  // back costs nothing. No refresh interval for the same reason: a poll would
  // re-read the same session while implying it was live.
  const movers = useLoadable(() => fetchMovers(tab), [tab]);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <div style={{ display: 'flex', gap: 5 }}>
        {TABS.map(([board, key]) => (
          <Chip key={board} active={tab === board} onClick={() => setTab(board)}>
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
        state={movers.state}
        onRetry={movers.retry}
        skeleton={
          beg ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {Array.from({ length: BEGINNER_ROWS }, (_, i) => (
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
        {(board) => {
          const wanted = SECTORS.find(([k]) => k === sector)?.[2] ?? [];
          // The provider ranked the board; narrowing it keeps that order.
          const rows =
            wanted.length === 0
              ? board.rows
              : board.rows.filter((r) => r.sector !== null && wanted.includes(r.sector));

          if (rows.length === 0) return <EmptyState>{t('movers.empty')}</EmptyState>;

          return (
            <>
              {board.lastClose && (
                <p
                  className="text-muted"
                  style={{ fontSize: 'var(--text-caption)', margin: 0, textAlign: 'center' }}
                >
                  {t('movers.lastClose')}
                </p>
              )}
              {beg ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {rows.slice(0, BEGINNER_ROWS).map((x) => (
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
                          {x.name ?? ''}
                        </span>
                        <Num
                          size={23}
                          style={{ fontFamily: 'var(--font-heading)', color: signalColor(x.changePct) }}
                        >
                          {pctOrDash(x.changePct)}
                        </Num>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {/* This line used to carry a one-sentence explanation
                            of the move, written by hand for each of the ten
                            sample stocks. There is no such sentence for a
                            hundred rows the market picked, and inventing one
                            is the exact thing this screen stopped doing. What
                            replaces it is what we actually know: the close, and
                            how busy the session was. */}
                        <span style={{ fontSize: 'var(--text-body)', opacity: 0.76, flex: 1 }}>
                          {`${moneyOrDash(x.close)} · ${t('movers.colVol')} ${volumeOrDash(x.volume)}`}
                        </span>
                        <TickerSparkline ticker={x.ticker} />
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card padding="6px 10px 4px" gap={0}>
                  <table
                    style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-caption)' }}
                  >
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
                      {rows.map((x) => (
                        <tr
                          key={x.ticker}
                          style={{ cursor: 'pointer' }}
                          onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                        >
                          <Td align="start" strong>
                            {x.ticker}
                          </Td>
                          <Td>
                            <Num>{moneyOrDash(x.close)}</Num>
                          </Td>
                          <Td color={signalColor(x.changePct)}>
                            <Num>{pctOrDash(x.changePct)}</Num>
                          </Td>
                          <Td muted>
                            <Num>{volumeOrDash(x.volume)}</Num>
                          </Td>
                          <Td color="var(--color-accent-300)">
                            <Num>{rvolOrDash(x)}</Num>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </>
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
 * provider's 200-day average, both from the same screener row, and null
 * whenever either is missing or the average is zero (see relativeVolume): a
 * newly listed name has no history to be relative to, and dividing by that
 * zero would print "∞×".
 */
function rvolOrDash(row: MoverRow): string {
  const rvol = relativeVolume(row);
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
