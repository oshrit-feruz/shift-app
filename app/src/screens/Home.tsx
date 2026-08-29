import { useMemo } from 'react';
import { Card, CardTitle, Divider } from '../components/Card';
import { DemoDataNote } from '../components/DemoDataNote';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { MetricStrip } from '../components/MetricStrip';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { Skeleton, SkeletonChart, SkeletonLine, SkeletonList, SkeletonText } from '../components/Skeleton';
import { ProgressTrack } from '../components/Progress';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { fetchWeekEarnings } from '../data/earnings';
import { DemoBanner } from '../components/DemoBanner';
import { money, moneyOrDash, pct, signalColor } from '../lib/format';
import { ROW_BUTTON_STYLE } from '../lib/rowButton';
import type { ScreenProps } from '../App';

export function HomeScreen({ openSearch }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const symbols = useLoadable(() => demoService.symbols(), []);
  const portfolios = useLoadable(() => demoService.portfolios(), []);
  // The preview shows the user's own list — the same rows the watchlist tab
  // does, capped. It used to show the top of the sample symbol table, which
  // looked identical whether or not the user had followed anything.
  const watched = useLoadable(() => demoService.watchRows(s.watchlist), [s.watchlist.join(',')]);
  const setup = setupProgress(s);
  // Deterministic for a given key, so compute the walk once, not per render.
  const pfSeries = useMemo(() => demoService.series('home-pf', 60, 0.42, 2.2), []);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DemoDataNote />
      {beg && (
        <DataState
          state={portfolios.state}
          onRetry={portfolios.retry}
          skeleton={
            <Card padding={15} gap={0}>
              {/* Mirrors the loaded hero: 18px label, 42px/1.05 total,
                  15px change line, chart block, two 14px blurb lines. */}
              <SkeletonLine width={96} fontSize={19} bar={11} />
              <SkeletonLine width="66%" fontSize={43} lineHeight={1.05} bar={34} />
              <SkeletonLine width={172} fontSize={18} bar={13} />
              {/* 83, not the chart's 76: the AreaChart's inline SVG adds a
                  descender line box to its wrapper. Measured, not assumed. */}
              <SkeletonChart height={83} style={{ marginTop: 10 }} />
              <div style={{ marginTop: 10 }}>
                <SkeletonText lines={2} fontSize={17} />
              </div>
            </Card>
          }
        >
          {(pfs) => {
            const main = pfs.find((x) => x.id === 'blink');
            if (!main) {
              return (
                <Card padding={18} gap={8} style={{ textAlign: 'center', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 19 }}>
                    {t('home.noPfTitle')}
                  </span>
                  <p className="text-muted" style={{ fontSize: 17, margin: 0, lineHeight: 1.5 }}>
                    {t('home.noPfHelp')}
                  </p>
                  <Button
                    onClick={() =>
                      dispatch({
                        type: 'advGoto',
                        screen: 'advConnect',
                        solo: true,
                      })
                    }
                    style={{ marginTop: 6 }}
                  >
                    {t('rec.chooseBroker')}
                  </Button>
                </Card>
              );
            }
            return (
              <Card padding={15} gap={0}>
                <div style={{ fontSize: 19, opacity: 0.75, fontWeight: 600 }}>{t('home.pfToday')}</div>
                <div
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: 43,
                    lineHeight: 1.05,
                    fontWeight: 700,
                  }}
                >
                  <Num>{money(main.total)}</Num>
                </div>
                <div
                  style={{
                    color: signalColor(main.dayPct),
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  <Num
                    weight={600}
                  >{`${main.dayPct >= 0 ? '+' : '−'}${money(Math.abs((main.total * main.dayPct) / 100))} · ${pct(main.dayPct)}`}</Num>
                </div>
                <div style={{ marginTop: 10 }}>
                  <AreaChart values={pfSeries} height={76} />
                </div>
                <p
                  style={{
                    fontSize: 17,
                    lineHeight: 1.5,
                    margin: '10px 0 0',
                    opacity: 0.85,
                    fontWeight: 500,
                  }}
                >
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
            dispatch({
              type: 'advGoto',
              screen: setup.resumeScreen,
              solo: false,
            })
          }
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{t('setup.banner')}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--color-accent-200)', fontSize: 17 }}>{t('setup.resume')} ›</span>
          </div>
          <ProgressTrack pct={setup.pct} label={t('setup.stepOf', { n: setup.stepLabel })} />
        </Card>
      )}

      {/* Two tracks */}
      <Card padding={16} gap={10}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 26,
              height: 26,
              flex: 'none',
              borderRadius: 8,
              background: 'var(--sunk)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--color-accent-200)',
            }}
            aria-hidden="true"
          >
            <Icon name="trend" size={14} />
          </span>
          <span style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>{t('home.trackSelf')}</span>
          <Tag variant="outline">{t('home.trackHere')}</Tag>
        </div>
        <p className="text-muted" style={{ fontSize: 17, margin: 0, lineHeight: 1.5 }}>
          {t('home.trackSelfSub')}
        </p>
        <Divider />
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'advGoto',
              screen: setup.resumeScreen,
              solo: false,
            })
          }
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
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                flex: 'none',
                borderRadius: 8,
                background: 'var(--color-accent-800)',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--color-accent-200)',
              }}
              aria-hidden="true"
            >
              <Icon name="list" size={14} />
            </span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 600,
                flex: 1,
                color: 'var(--color-accent-300)',
              }}
            >
              {t('home.trackAdvisor')}
            </span>
            <Tag variant="accent">{t('adv.tag')}</Tag>
          </div>
          <p className="text-muted" style={{ fontSize: 17, margin: 0, lineHeight: 1.5 }}>
            {t('home.trackAdvisorSub')}
          </p>
        </button>
      </Card>

      {beg && (
        <Card padding={13} highlight row gap={11} onClick={() => dispatch({ type: 'go', screen: 'learn' })}>
          <span
            style={{
              width: 30,
              height: 30,
              flex: 'none',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-accent-800)',
              color: 'var(--color-accent-200)',
              display: 'grid',
              placeItems: 'center',
              fontSize: 18,
            }}
          >
            ◉
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 19.5 }}>{t('home.startHere')}</span>
            <span className="text-muted" style={{ display: 'block', fontSize: 17.5, marginTop: 2 }}>
              {t('home.startHereSub')}
            </span>
          </span>
          <span style={{ opacity: 0.5, fontSize: 19 }}>›</span>
        </Card>
      )}

      {!beg && (
        <MetricStrip
          metrics={[
            { label: language === 'he' ? 'שווי' : 'Value', value: '$48,214' },
            {
              label: language === 'he' ? 'יומי' : 'Day',
              value: '+0.86%',
              color: 'var(--up)',
            },
            {
              label: language === 'he' ? 'רווח פתוח' : 'Open P/L',
              value: '+$11.5k',
              color: 'var(--up)',
            },
            { label: 'Beta', value: '1.34' },
            { label: language === 'he' ? 'מזומן' : 'Cash', value: '14%' },
            {
              label: language === 'he' ? 'סיכון' : 'Risk',
              value: language === 'he' ? 'גבוה' : 'High',
              color: 'var(--color-accent-300)',
            },
          ]}
        />
      )}

      {/* Watchlist preview */}
      <Card padding="13px 13px 4px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('home.watchlist')}</CardTitle>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" fontSize={16} onClick={() => dispatch({ type: 'go', screen: 'watch' })}>
            {t('home.seeAll')}
          </Button>
        </div>
        <DataState
          state={watched.state}
          onRetry={watched.retry}
          skeleton={<SkeletonList count={Math.min(s.watchlist.length || 1, beg ? 4 : 6)} leading={beg} />}
        >
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState>
                <div style={{ fontSize: 16.5 }}>{t('home.watchlistEmpty')}</div>
                <Button
                  variant="ghost"
                  fontSize={16}
                  alignSelf="center"
                  style={{ marginTop: 2 }}
                  onClick={openSearch}
                >
                  ＋ {t('home.watchlistAdd')}
                </Button>
              </EmptyState>
            ) : (
              <>
                {rows.slice(0, beg ? 4 : 6).map((x) => (
                  <ListRow
                    key={x.ticker}
                    leading={beg ? <TickerTile ticker={x.ticker} /> : undefined}
                    title={x.ticker}
                    subtitle={
                      beg ? (x.plain?.[language] ?? x.name ?? undefined) : (x.name ?? x.sector ?? undefined)
                    }
                    right={
                      <RowValues
                        main={moneyOrDash(x.quote?.price)}
                        sub={x.demoChangePct === null ? undefined : pct(x.demoChangePct)}
                        subColor={x.demoChangePct === null ? undefined : signalColor(x.demoChangePct)}
                      />
                    }
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                  />
                ))}
              </>
            )
          }
        </DataState>
      </Card>

      {/* Movers preview */}
      <Card padding={13} gap={8}>
        <CardTitle>{beg ? t('home.moversBeg') : t('home.moversAdv')}</CardTitle>
        {beg && (
          <p className="text-muted" style={{ fontSize: 17, margin: 0 }}>
            {t('home.moversHelp')}
          </p>
        )}
        <DataState
          state={symbols.state}
          onRetry={symbols.retry}
          skeleton={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Array.from({ length: beg ? 3 : 5 }, (_, i) => (
                <Skeleton key={i} height={44} radius="var(--radius-md)" />
              ))}
            </div>
          }
        >
          {(syms) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {syms
                .slice()
                .sort((a, b) => Math.abs(b.demo.changePct) - Math.abs(a.demo.changePct))
                .slice(0, beg ? 3 : 5)
                .map((x) => (
                  <button
                    key={x.ticker}
                    type="button"
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      minHeight: 44,
                      padding: '8px 11px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-divider)',
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'start',
                    }}
                  >
                    <Num size={17} weight={600} style={{ width: 48 }}>
                      {x.ticker}
                    </Num>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 18,
                        opacity: 0.8,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {beg ? x.why[language] : `${moneyOrDash(x.quote?.price)} · vol ${x.demo.volume}`}
                    </span>
                    <Num size={18} style={{ color: signalColor(x.demo.changePct) }}>
                      {pct(x.demo.changePct)}
                    </Num>
                  </button>
                ))}
            </div>
          )}
        </DataState>
        <Button
          variant="ghost"
          fontSize={16}
          alignSelf="flex-start"
          onClick={() => dispatch({ type: 'go', screen: 'movers' })}
        >
          {t('home.allMovers')}
        </Button>
      </Card>

      {/* Earnings ahead — the same live source as the calendar tab.
          This card used to render a hard-coded list of three companies with
          invented implied moves, presented exactly like real data. It was the
          last place in the app where fabricated figures were shown as fact. */}
      <EarningsAhead />
    </div>
  );
}

/**
 * The next few earnings reports, from the live calendar.
 *
 * Deliberately bounded to three: the home screen is a summary, and the
 * calendar tab is where the whole week lives. Loading and failure are the
 * shared DataState, so an outage reads as an outage rather than as a quiet
 * week — and showcase mode carries its label, like every other surface that
 * can render illustrative figures.
 */
const HOME_EARNINGS_SHOWN = 3;

function EarningsAhead() {
  const t = useT();
  const { language } = useTheme();
  const dispatch = useDispatch();
  const cal = useLoadable(() => fetchWeekEarnings(), []);

  return (
    <Card padding={13} gap={7}>
      <DataState state={cal.state} onRetry={cal.retry} skeleton={<SkeletonList count={3} />}>
        {(page) => {
          const next = page.rows.slice(0, HOME_EARNINGS_SHOWN);
          return (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <CardTitle>{t('home.earnWeek')}</CardTitle>
                {/* The real count, not a fixed number: the badge used to say
                    "3" whatever the week held. On a truncated response the
                    rows in hand are fewer than the reports that exist, and
                    the count is a claim about the week, not about what fitted
                    in the payload. */}
                <Tag variant="neutral">{String(page.truncated ? page.totalAvailable : page.rows.length)}</Tag>
              </div>
              <DemoBanner />
              {next.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 16, margin: 0 }}>
                  {t('earn.weekEmpty')}
                </p>
              ) : (
                next.map((e) => (
                  <button
                    key={`${e.ticker}-${e.reportDate}`}
                    type="button"
                    onClick={() => dispatch({ type: 'openStock', ticker: e.ticker })}
                    style={{
                      ...ROW_BUTTON_STYLE,
                      padding: '7px 0',
                      borderTop: '1px solid var(--color-divider)',
                    }}
                  >
                    <div
                      style={{
                        width: 55,
                        height: 55,
                        flex: 'none',
                        textAlign: 'center',
                        padding: 4,
                        border: '1px dashed var(--color-text)',
                        borderRadius: 8,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 15.5,
                          letterSpacing: '.06em',
                          textTransform: 'uppercase',
                          color: 'var(--acc-lite)',
                          fontWeight: 500,
                        }}
                      >
                        {monthLabel(e.reportDate, language)}
                      </div>
                      <Num
                        size={22}
                        weight={500}
                        style={{
                          fontFamily: 'var(--font-heading)',
                          color: 'var(--acc-mid)',
                        }}
                      >
                        {e.reportDate.slice(8)}
                      </Num>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        fontSize: 17,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <span>{e.ticker}</span>
                      {e.estimate !== null && (
                        <span className="text-muted" style={{ fontSize: 15.5 }}>
                          {t('stock.epsEst')} <Num>{e.estimate.toFixed(2)}</Num>
                        </span>
                      )}
                    </div>
                    {/* Only claimed when the provider actually said so — the
                        old card labelled every row "after close". */}
                    {e.timing === 'AMC' && (
                      <Tag variant="outline" fontSize={15}>
                        {t('home.afterClose')}
                      </Tag>
                    )}
                    {e.timing === 'BMO' && (
                      <Tag variant="outline" fontSize={15}>
                        {t('home.beforeOpen')}
                      </Tag>
                    )}
                  </button>
                ))
              )}
              <Button
                variant="ghost"
                fontSize={16}
                alignSelf="flex-start"
                onClick={() => dispatch({ type: 'go', screen: 'earnings' })}
              >
                {t('home.allEarnings')}
              </Button>
            </>
          );
        }}
      </DataState>
    </Card>
  );
}

/** Short month name for the date box, in the reader's language. */
function monthLabel(iso: string, language: 'en' | 'he'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}
