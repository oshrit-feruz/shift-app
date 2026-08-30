import { useState } from 'react';
import { Card } from '../components/Card';
import { Num } from '../components/Num';
import { Chip, ChipRail } from '../components/Chip';
import { TickerSparkline } from '../components/TickerSparkline';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { SkeletonCard, SkeletonList } from '../components/Skeleton';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { moneyOrDash, pct, signalColor } from '../lib/format';
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

export function MoversScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const [tab, setTab] = useState('Gainers');
  const [sector, setSector] = useState('All');
  const symbols = useLoadable(() => demoService.symbols(), []);

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
          const pool = syms
            .slice()
            .sort((a, b) =>
              tab === 'Losers'
                ? a.demo.changePct - b.demo.changePct
                : tab === 'Most active'
                  ? parseFloat(b.demo.volume) - parseFloat(a.demo.volume)
                  : b.demo.changePct - a.demo.changePct,
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
                        style={{ fontFamily: 'var(--font-heading)', color: signalColor(x.demo.changePct) }}
                      >
                        {pct(x.demo.changePct)}
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
                      <Td color={signalColor(x.demo.changePct)}>
                        <Num>{pct(x.demo.changePct)}</Num>
                      </Td>
                      <Td muted>
                        <Num>{x.demo.volume}</Num>
                      </Td>
                      <Td color="var(--color-accent-300)">
                        <Num>{(1.1 + (x.ticker.length % 4) * 0.4).toFixed(1)}×</Num>
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
