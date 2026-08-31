import { useMemo } from 'react';
import { Card, CardTitle, Divider } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { MetricStrip } from '../components/MetricStrip';
import { ListRow } from '../components/ListRow';
import { WatchRowValues } from '../components/WatchRowValues';
import { TickerTile } from '../components/TickerTile';
import { DataState, EmptyState } from '../components/DataState';
import { Skeleton, SkeletonChart, SkeletonLine, SkeletonList, SkeletonText } from '../components/Skeleton';
import { ProgressTrack } from '../components/Progress';
import { DemoOnly } from '../components/DemoOnly';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { appService } from '../data/appService';
import { useDemoFlag } from '../data/useDemoFlag';
import { useLoadable } from '../data/useLoadable';
import { PRICE_REFRESH_MS } from '../data/quotes';
import { fetchWeekEarnings } from '../data/earnings';
import { useDemoMode } from '../lib/DemoModeProvider';
import { money, moneyOrDash, pct, pctOrDash, signalColor } from '../lib/format';
import { ROW_BUTTON_STYLE } from '../lib/rowButton';
import type { ScreenProps } from '../App';

export function HomeScreen({ openSearch }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  // The preview shows the user's own list — the same rows the watchlist tab
  // does, capped. It used to show the top of the sample symbol table, which
  // looked identical whether or not the user had followed anything.
  const watched = useLoadable(
    () => demoService.watchRows(s.watchlist),
    [s.watchlist.join(',')],
    PRICE_REFRESH_MS,
  );
  const setup = setupProgress(s);
  const demo = useDemoMode();
  const live = useDemoFlag('liveAccount');

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* A real connected account outranks the sample-data switch: it is
          not sample data, so the hero shows even with that switch off. */}
      {beg && (live || demo ? <HeroPortfolio /> : <DemoOnly feature="home.pfToday" />)}

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
            <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{t('setup.banner')}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--color-accent-200)', fontSize: 'var(--text-row)' }}>
              {t('setup.resume')} ›
            </span>
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
          <span style={{ fontSize: 'var(--text-title)', fontWeight: 600, flex: 1 }}>
            {t('home.trackSelf')}
          </span>
          <Tag variant="outline">{t('home.trackHere')}</Tag>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5 }}>
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
                fontSize: 'var(--text-title)',
                fontWeight: 600,
                flex: 1,
                color: 'var(--color-accent-300)',
              }}
            >
              {t('home.trackAdvisor')}
            </span>
            <Tag variant="accent">{t('adv.tag')}</Tag>
          </div>
          <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5 }}>
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
              fontSize: 'var(--text-title)',
            }}
          >
            ◉
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-title)' }}>{t('home.startHere')}</span>
            <span
              className="text-muted"
              style={{ display: 'block', fontSize: 'var(--text-row)', marginTop: 2 }}
            >
              {t('home.startHereSub')}
            </span>
          </span>
          <span style={{ opacity: 0.5, fontSize: 'var(--text-title)' }}>›</span>
        </Card>
      )}

      {!beg && (demo ? <MetricStripDemo /> : <DemoOnly feature="home.pfToday" />)}

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
                <div style={{ fontSize: 'var(--text-body)' }}>{t('home.watchlistEmpty')}</div>
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
                    right={<WatchRowValues row={x} />}
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                  />
                ))}
              </>
            )
          }
        </DataState>
      </Card>

      {demo ? <MoversPreview beg={beg} /> : <DemoOnly feature="title.movers" />}

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
 * week.
 */
const HOME_EARNINGS_SHOWN = 3;

function EarningsAhead() {
  const t = useT();
  const demo = useDemoMode();
  const { language } = useTheme();
  const dispatch = useDispatch();
  const cal = useLoadable(() => fetchWeekEarnings(), [demo]);

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
              {next.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0 }}>
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
                          fontSize: 'var(--text-caption)',
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
                        fontSize: 'var(--text-row)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                      }}
                    >
                      <span>{e.ticker}</span>
                      {e.estimate !== null && (
                        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
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

/**
 * The beginner hero: total, day change, value line and the blurb under it.
 * Every figure is invented — the total is the demo Blink account, the line a
 * seeded walk — so it sits behind the switch, in its own component so the
 * fetch does not run at all when the switch is off.
 */
function HeroPortfolio() {
  const dispatch = useDispatch();
  const t = useT();
  // Re-fetched when the founder-demo live-account switch flips, so the
  // headline follows the same source as the Portfolio tab.
  const live = useDemoFlag('liveAccount');
  const portfolios = useLoadable(() => appService.portfolios(), [live]);
  // Deterministic for a given key, so compute the walk once, not per render.
  const pfSeries = useMemo(() => demoService.series('home-pf', 60, 0.42, 2.2), []);

  return (
    <>
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
          // The first linked account, not a hardcoded id: with the demo
          // switch off that is still Blink (the demo adapter lists it
          // first), and with it on it is the real connected account, so the
          // hero follows whichever source is in effect instead of falling to
          // the "no portfolio" state.
          const main = pfs.find((x) => x.kind === 'linked');
          if (!main) {
            return (
              <Card padding={18} gap={8} style={{ textAlign: 'center', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-title)' }}>
                  {t('home.noPfTitle')}
                </span>
                <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5 }}>
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
              <div style={{ fontSize: 'var(--text-title)', opacity: 0.75, fontWeight: 600 }}>
                {t('home.pfToday')}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: 'var(--text-hero)',
                  letterSpacing: 'var(--track-hero)',
                  lineHeight: 'var(--lead-hero)',
                  fontWeight: 700,
                }}
              >
                <Num>{moneyOrDash(main.total)}</Num>
              </div>
              {/* The day change and the chart are the demo adapter's seeded
                  series. Over a real connected account they would be invented
                  performance under a real total, so with the live-account
                  switch on they give way to a statement of what is known. */}
              {live ? (
                <p
                  className="text-muted"
                  style={{ fontSize: 'var(--text-row)', lineHeight: 1.5, margin: '8px 0 0' }}
                >
                  {t('live.noHistory')}
                </p>
              ) : (
                <>
                  <div
                    style={{
                      color: signalColor(main.dayPct),
                      fontSize: 'var(--text-title)',
                      fontWeight: 600,
                    }}
                  >
                    {/* The change line needs both halves: a day percentage with
                        no total behind it has no currency figure to put beside
                        it, and inventing one from a total we do not have is the
                        thing this app exists not to do. */}
                    <Num weight={600}>{dayChangeLine(main.total, main.dayPct)}</Num>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <AreaChart values={pfSeries} height={76} />
                  </div>
                </>
              )}
              <p
                style={{
                  fontSize: 'var(--text-row)',
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
    </>
  );
}

/** The advanced-mode counterpart of the hero — six hard-coded figures. */
function MetricStripDemo() {
  const { language } = useTheme();

  return (
    <>
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
    </>
  );
}

/**
 * The movers preview: the biggest movers by the day's ACTUAL change, from the
 * live quote, same as the Movers screen. The volume printed beside the price
 * is still a demo figure — the provider's quote carries no volume — and is
 * the only fabricated number left on this card.
 */
function MoversPreview({ beg }: { beg: boolean }) {
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const symbols = useLoadable(() => demoService.symbols(), [], PRICE_REFRESH_MS);

  return (
    <>
      {/* Movers preview */}
      <Card padding={13} gap={8}>
        <CardTitle>{beg ? t('home.moversBeg') : t('home.moversAdv')}</CardTitle>
        {beg && (
          <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0 }}>
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
                // Biggest absolute move first. A symbol the provider could
                // not price has no move to rank and sorts last, rather than
                // counting as a 0% day it never had.
                .sort((a, b) => {
                  const x = a.quote?.changePct ?? null;
                  const y = b.quote?.changePct ?? null;
                  if (x === null && y === null) return 0;
                  if (x === null) return 1;
                  if (y === null) return -1;
                  return Math.abs(y) - Math.abs(x);
                })
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
                        fontSize: 'var(--text-title)',
                        opacity: 0.8,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {beg ? x.why[language] : `${moneyOrDash(x.quote?.price)} · vol ${x.demo.volume}`}
                    </span>
                    <Num size={18} style={{ color: signalColor(x.quote?.changePct) }}>
                      {pctOrDash(x.quote?.changePct)}
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
    </>
  );
}

/**
 * "+$412.18 · +0.86%" for the hero, or "—" when either half is unknown.
 *
 * Both are needed: the currency figure is derived from the total, so a day
 * percentage without one cannot be turned into money without inventing the
 * portfolio's size.
 */
function dayChangeLine(total: number | null, dayPct: number | null): string {
  if (dayPct === null) return '—';
  if (total === null) return pct(dayPct);
  return `${dayPct >= 0 ? '+' : '−'}${money(Math.abs((total * dayPct) / 100))} · ${pct(dayPct)}`;
}
