import { Card, CardTitle, Divider } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { MetricStrip } from '../components/MetricStrip';
import { ListRow, RowValues } from '../components/ListRow';
import { IconTile } from '../components/IconTile';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { ProgressTrack } from '../components/Progress';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

export function HomeScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const symbols = useLoadable(() => demoService.symbols(), []);
  const portfolios = useLoadable(() => demoService.portfolios(), []);
  const metrics = useLoadable(() => demoService.portfolioMetrics(), []);
  const earnings = useLoadable(() => demoService.earnings(), []);
  const setup = setupProgress(s);
  const pfSeries = demoService.series('home-pf', 60, 0.42, 2.2);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {beg && (
        <DataState state={portfolios.state} onRetry={portfolios.retry}>
          {(pfs) => {
            const main = pfs.find((x) => x.id === 'blink');
            if (!main) {
              return (
                <Card padding={18} gap={8} style={{ textAlign: 'center', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-xl)' }}>{t('home.noPfTitle')}</span>
                  <p className="text-muted" style={{ fontSize: 'var(--fs-md)', margin: 0, lineHeight: 1.5 }}>
                    {t('home.noPfHelp')}
                  </p>
                  <Button
                    onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', solo: true })}
                    style={{ marginTop: 6 }}
                  >
                    {t('rec.chooseBroker')}
                  </Button>
                </Card>
              );
            }
            return (
              <Card padding={15} gap={0}>
                <div style={{ fontSize: 'var(--fs-sm)', opacity: 0.75, fontWeight: 'var(--fw-bold)' }}>{t('home.pfToday')}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-num-lg)', lineHeight: 1.05, fontWeight: 'var(--fw-bold)' }}>
                  <Num>{money(main.total)}</Num>
                </div>
                <div style={{ color: 'var(--up)', fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)' }}>
                  <Num weight={600}>{`+${money((main.total * main.dayPct) / 100)} · ${pct(main.dayPct)}`}</Num>
                </div>
                <div style={{ marginTop: 10 }}>
                  <AreaChart values={pfSeries} height={76} />
                </div>
                <p style={{ fontSize: 'var(--fs-md)', lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85, fontWeight: 'var(--fw-medium)' }}>
                  {t('home.pfBlurb')}
                </p>
              </Card>
            );
          }}
        </DataState>
      )}

      {setup.showBanner && (
        <Card
          padding="11px 13px"
          gap={6}
          highlight
          onClick={() =>
            dispatch({ type: 'advGoto', screen: setup.resumeScreen, solo: false })
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)' }}>{t('setup.banner')}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--color-accent-200)', fontSize: 'var(--fs-md)' }}>{t('setup.resume')} ›</span>
          </div>
          <ProgressTrack pct={setup.pct} label={t('setup.stepOf', { n: setup.stepLabel })} />
        </Card>
      )}

      {/* Two tracks */}
      <Card padding={16} gap={10}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconTile size={26} variant="sunk">
            <Icon name="trend" size={14} />
          </IconTile>
          <span style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)', flex: 1 }}>{t('home.trackSelf')}</span>
          <Tag variant="outline">{t('home.trackHere')}</Tag>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--fs-md)', margin: 0, lineHeight: 1.5 }}>
          {t('home.trackSelfSub')}
        </p>
        <Divider />
        <button
          type="button"
          onClick={() => dispatch({ type: 'advGoto', screen: setup.resumeScreen, solo: false })}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            border: 0,
            background: 'transparent',
            textAlign: 'start',
            font: 'inherit',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            minHeight: 44,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <IconTile size={26} variant="accent">
              <Icon name="list" size={14} />
            </IconTile>
            <span style={{ fontSize: 'var(--fs-base)', fontWeight: 'var(--fw-semibold)', flex: 1, color: 'var(--color-accent-300)' }}>
              {t('home.trackAdvisor')}
            </span>
            <Tag variant="accent">{t('adv.tag')}</Tag>
          </div>
          <p className="text-muted" style={{ fontSize: 'var(--fs-md)', margin: 0, lineHeight: 1.5 }}>
            {t('home.trackAdvisorSub')}
          </p>
        </button>
      </Card>

      {beg && (
        <Card
          padding={13}
          highlight
          row
          gap={11}
          onClick={() => dispatch({ type: 'go', screen: 'learn' })}
        >
          <IconTile size={30} variant="accent" fontSize={15}>
            ◉
          </IconTile>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>{t('home.startHere')}</span>
            <span className="text-muted" style={{ display: 'block', fontSize: 'var(--fs-xs)', marginTop: 2 }}>
              {t('home.startHereSub')}
            </span>
          </span>
          <span style={{ opacity: 0.5, fontSize: 'var(--fs-base)' }}>›</span>
        </Card>
      )}

      {!beg && (
        <DataState state={metrics.state} onRetry={metrics.retry}>
          {(m) => (
            <MetricStrip
              metrics={[
                { label: language === 'he' ? 'שווי' : 'Value', value: money(m.total, 0) },
                { label: language === 'he' ? 'יומי' : 'Day', value: pct(m.dayPct), color: signalColor(m.dayPct) },
                {
                  label: language === 'he' ? 'רווח פתוח' : 'Open P/L',
                  value: `${m.openPl >= 0 ? '+' : '−'}$${(Math.abs(m.openPl) / 1000).toFixed(1)}k`,
                  color: signalColor(m.openPl),
                },
                { label: 'Beta', value: m.beta.toFixed(2) },
                { label: language === 'he' ? 'מזומן' : 'Cash', value: `${m.cashPct}%` },
                { label: language === 'he' ? 'סיכון' : 'Risk', value: m.risk[language], color: 'var(--color-accent-300)' },
              ]}
            />
          )}
        </DataState>
      )}

      {/* Watchlist preview */}
      <Card padding="13px 13px 4px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('home.watchlist')}</CardTitle>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'watch' })}>
            {t('home.seeAll')}
          </Button>
        </div>
        <DataState state={symbols.state} onRetry={symbols.retry}>
          {(syms) => (
            <>
              {syms.slice(0, beg ? 4 : 6).map((x) => (
                <ListRow
                  key={x.ticker}
                  leading={beg ? <TickerTile ticker={x.ticker} /> : undefined}
                  title={x.ticker}
                  subtitle={beg ? x.plain[language] : `${x.marketCap} · P/E ${x.pe.toFixed(1)}`}
                  right={
                    <RowValues main={money(x.price)} sub={pct(x.changePct)} subColor={signalColor(x.changePct)} />
                  }
                  onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                />
              ))}
            </>
          )}
        </DataState>
      </Card>

      {/* Movers preview */}
      <Card padding={13} gap={8}>
        <CardTitle>{beg ? t('home.moversBeg') : t('home.moversAdv')}</CardTitle>
        {beg && (
          <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>
            {t('home.moversHelp')}
          </p>
        )}
        <DataState state={symbols.state} onRetry={symbols.retry}>
          {(syms) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {syms
                .slice()
                .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
                .slice(0, beg ? 3 : 5)
                .map((x) => (
                  <ListRow
                    key={x.ticker}
                    boxed
                    minHeight={44}
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                    leading={
                      <Num size={14} weight={600} style={{ width: 48 }}>
                        {x.ticker}
                      </Num>
                    }
                    title={
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 'var(--fw-regular)',
                          opacity: 0.8,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {beg ? x.why[language] : `${money(x.price)} · vol ${x.volume}`}
                      </span>
                    }
                    right={
                      <Num size={13.5} style={{ color: signalColor(x.changePct) }}>
                        {pct(x.changePct)}
                      </Num>
                    }
                  />
                ))}
            </div>
          )}
        </DataState>
        <Button variant="ghost" fontSize={13} alignSelf="flex-start" onClick={() => dispatch({ type: 'go', screen: 'movers' })}>
          {t('home.allMovers')}
        </Button>
      </Card>

      {/* Earnings this week */}
      <DataState state={earnings.state} onRetry={earnings.retry}>
        {(rows) => {
          const week = rows.slice(0, 3);
          return (
      <Card padding={13} gap={7}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CardTitle>{t('home.earnWeek')}</CardTitle>
          <Tag variant="neutral">{week.length}</Tag>
        </div>
        {beg && (
          <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>
            {t('home.earnHelp')}
          </p>
        )}
        {week.map((e, i) => (
          <ListRow
            key={i}
            padding="7px 0"
            leading={
              <div
                style={{
                  width: 55,
                  height: 55,
                  flex: 'none',
                  textAlign: 'center',
                  padding: 4,
                  border: '1px dashed var(--color-text)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ fontSize: 'var(--fs-xs)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--acc-lite)', fontWeight: 'var(--fw-medium)' }}>
                  {e.date.split(' ')[0]}
                </div>
                <Num size={16} weight={500} style={{ fontFamily: 'var(--font-heading)', color: 'var(--acc-mid)' }}>
                  {e.date.split(' ')[1] ?? ''}
                </Num>
              </div>
            }
            title={
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>
                {beg ? `${e.name} (${e.ticker})` : `${e.ticker} · est EPS ${e.epsEst} · impl. move ${e.impliedMove}`}
              </span>
            }
            trailing={
              <Tag variant="outline" fontSize={12}>
                {e.when === 'AMC' ? t('home.afterClose') : t('home.beforeOpen')}
              </Tag>
            }
          />
        ))}
      </Card>
          );
        }}
      </DataState>
    </div>
  );
}

