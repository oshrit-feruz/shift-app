import { Card, CardTitle, Divider } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { MetricStrip } from '../components/MetricStrip';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonChart, SkeletonLine, SkeletonList, SkeletonText } from '../components/Skeleton';
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
  const setup = setupProgress(s);
  const pfSeries = demoService.series('home-pf', 60, 0.42, 2.2);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {beg && (
        <DataState
          state={portfolios.state}
          onRetry={portfolios.retry}
          skeleton={
            <Card padding={15} gap={0}>
              {/* Mirrors the loaded hero: 13px label, 42px/1.05 total,
                  15px change line, chart block, two 14px blurb lines. */}
              <SkeletonLine width={96} fontSize={13} bar={11} />
              <SkeletonLine width="66%" fontSize={42} lineHeight={1.05} bar={34} />
              <SkeletonLine width={172} fontSize={15} bar={13} />
              {/* 83, not the chart's 76: the AreaChart's inline SVG adds a
                  descender line box to its wrapper. Measured, not assumed. */}
              <SkeletonChart height={83} style={{ marginTop: 10 }} />
              <div style={{ marginTop: 10 }}>
                <SkeletonText lines={2} fontSize={14} />
              </div>
            </Card>
          }
        >
          {(pfs) => {
            const main = pfs.find((x) => x.id === 'blink');
            if (!main) {
              return (
                <Card padding={18} gap={8} style={{ textAlign: 'center', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{t('home.noPfTitle')}</span>
                  <p className="text-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
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
                <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 700 }}>{t('home.pfToday')}</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 42, lineHeight: 1.05, fontWeight: 700 }}>
                  <Num>{money(main.total)}</Num>
                </div>
                <div style={{ color: signalColor(main.dayPct), fontSize: 15, fontWeight: 600 }}>
                  <Num weight={600}>{`${main.dayPct >= 0 ? '+' : '−'}${money(Math.abs((main.total * main.dayPct) / 100))} · ${pct(main.dayPct)}`}</Num>
                </div>
                <div style={{ marginTop: 10 }}>
                  <AreaChart values={pfSeries} height={76} />
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5, margin: '10px 0 0', opacity: 0.85, fontWeight: 500 }}>
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
            <span style={{ fontSize: 15, fontWeight: 600 }}>{t('setup.banner')}</span>
            <span style={{ flex: 1 }} />
            <span style={{ color: 'var(--color-accent-200)', fontSize: 14 }}>{t('setup.resume')} ›</span>
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
          <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('home.trackSelf')}</span>
          <Tag variant="outline">{t('home.trackHere')}</Tag>
        </div>
        <p className="text-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
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
            <span style={{ fontSize: 15, fontWeight: 600, flex: 1, color: 'var(--color-accent-300)' }}>
              {t('home.trackAdvisor')}
            </span>
            <Tag variant="accent">{t('adv.tag')}</Tag>
          </div>
          <p className="text-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
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
              fontSize: 15,
            }}
          >
            ◉
          </span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13.5 }}>{t('home.startHere')}</span>
            <span className="text-muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>
              {t('home.startHereSub')}
            </span>
          </span>
          <span style={{ opacity: 0.5, fontSize: 15 }}>›</span>
        </Card>
      )}

      {!beg && (
        <MetricStrip
          metrics={[
            { label: language === 'he' ? 'שווי' : 'Value', value: '$48,214' },
            { label: language === 'he' ? 'יומי' : 'Day', value: '+0.86%', color: 'var(--up)' },
            { label: language === 'he' ? 'רווח פתוח' : 'Open P/L', value: '+$11.5k', color: 'var(--up)' },
            { label: 'Beta', value: '1.34' },
            { label: language === 'he' ? 'מזומן' : 'Cash', value: '14%' },
            { label: language === 'he' ? 'סיכון' : 'Risk', value: language === 'he' ? 'גבוה' : 'High', color: 'var(--color-accent-300)' },
          ]}
        />
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
        <DataState
          state={symbols.state}
          onRetry={symbols.retry}
          skeleton={<SkeletonList count={beg ? 4 : 6} leading={beg} />}
        >
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
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
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
                .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
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
                    <Num size={14} weight={600} style={{ width: 48 }}>
                      {x.ticker}
                    </Num>
                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        opacity: 0.8,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {beg ? x.why[language] : `${money(x.price)} · vol ${x.volume}`}
                    </span>
                    <Num size={13.5} style={{ color: signalColor(x.changePct) }}>
                      {pct(x.changePct)}
                    </Num>
                  </button>
                ))}
            </div>
          )}
        </DataState>
        <Button variant="ghost" fontSize={13} alignSelf="flex-start" onClick={() => dispatch({ type: 'go', screen: 'movers' })}>
          {t('home.allMovers')}
        </Button>
      </Card>

      {/* Earnings this week */}
      <Card padding={13} gap={7}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <CardTitle>{t('home.earnWeek')}</CardTitle>
          <Tag variant="neutral">3</Tag>
        </div>
        {beg && (
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            {t('home.earnHelp')}
          </p>
        )}
        {HOME_EARNINGS.map((e, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
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
              <div style={{ fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--acc-lite)', fontWeight: 500 }}>
                {language === 'he' ? 'אוג׳' : 'Aug'}
              </div>
              <Num size={16} weight={500} style={{ fontFamily: 'var(--font-heading)', color: 'var(--acc-mid)' }}>
                {e.day}
              </Num>
            </div>
            <div style={{ flex: 1, fontSize: 14 }}>{beg ? e.beg[language] : e.adv}</div>
            <Tag variant="outline" fontSize={12}>
              {t('home.afterClose')}
            </Tag>
          </div>
        ))}
      </Card>
    </div>
  );
}

const HOME_EARNINGS = [
  {
    day: '26',
    beg: { en: 'NVIDIA — its biggest report of the year', he: 'NVIDIA — הדוח הגדול שלה בשנה' },
    adv: 'NVDA · est EPS 1.24 · impl. move ±8.4%',
  },
  {
    day: '27',
    beg: { en: 'CrowdStrike — cybersecurity', he: 'CrowdStrike — אבטחת מידע' },
    adv: 'CRWD · est EPS 0.98 · impl. move ±9.1%',
  },
  {
    day: '28',
    beg: { en: 'Dell — PCs and AI servers', he: 'Dell — מחשבים ושרתי AI' },
    adv: 'DELL · est EPS 2.31 · impl. move ±7.2%',
  },
];
