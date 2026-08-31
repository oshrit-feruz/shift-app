import { useMemo, type ReactNode } from 'react';
import { Card, CardTitle, Divider } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Icon } from '../components/Icon';
import { Num } from '../components/Num';
import { AreaChart } from '../components/AreaChart';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { useToast } from '../components/Toast';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { demoService } from '../data/demoAdapter';
import { money, pct, signalColor } from '../lib/format';
import { ACCOUNT, c } from './content';

/**
 * The rest of the home page, so a variant is judged where it will live rather
 * than on a blank stage: the greeting's portfolio hero above it, the watchlist
 * and movers below it, the tab bar cutting the page off at the bottom.
 *
 * Everything here is the real component library reading the real tokens, and
 * every figure is the demo adapter's — Blink's total, the symbol table's
 * prices — so the page reads exactly as the app does with sample data on.
 */
export function HomeScaffold({
  top,
  afterHero,
  tracks,
}: {
  /** Above the portfolio hero — the first thing under the greeting. */
  top?: ReactNode;
  /** Under the hero, where the two-tracks card sits today. */
  afterHero?: ReactNode;
  /** Whether the two-tracks card is still carrying the advisory half, only
   *  the self-directed half, or is gone entirely because the variant replaced
   *  it. */
  tracks: 'both' | 'self' | 'none';
}) {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {top}
      <HeroPortfolio />
      {afterHero}
      {tracks !== 'none' && <TracksCard withAdvisor={tracks === 'both'} />}
      <WatchlistPreview />
      <MoversPreview />
    </div>
  );
}

function HeroPortfolio() {
  const t = useT();
  const series = useMemo(() => demoService.series('home-pf', 60, 0.42, 2.2), []);
  return (
    <Card padding={15} gap={0}>
      <div style={{ fontSize: 'var(--text-title)', opacity: 0.75, fontWeight: 600 }}>{t('home.pfToday')}</div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-hero)',
          letterSpacing: 'var(--track-hero)',
          lineHeight: 'var(--lead-hero)',
          fontWeight: 700,
        }}
      >
        <Num>{ACCOUNT.total}</Num>
      </div>
      <div style={{ color: signalColor(ACCOUNT.dayPct), fontSize: 'var(--text-title)', fontWeight: 600 }}>
        <Num weight={600}>{ACCOUNT.dayLine}</Num>
      </div>
      <div style={{ marginTop: 10 }}>
        <AreaChart values={series} height={76} />
      </div>
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
}

/** The card home shows today. `withAdvisor` false is the half that is left
 *  once a variant has given the advisory track a place of its own. */
function TracksCard({ withAdvisor }: { withAdvisor: boolean }) {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
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
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600, flex: 1 }}>{t('home.trackSelf')}</span>
        <Tag variant="outline">{t('home.trackHere')}</Tag>
      </div>
      <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5 }}>
        {t('home.trackSelfSub')}
      </p>
      {withAdvisor && (
        <>
          <Divider />
          <button
            type="button"
            onClick={() => toast(c('outOfScope', language))}
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
        </>
      )}
    </Card>
  );
}

const WATCHED = [
  {
    ticker: 'AAPL',
    name: 'Apple',
    plain: { en: 'iPhone, Mac and services', he: 'אייפון, מק ושירותים' },
    price: 226.79,
    changePct: 0.42,
  },
  {
    ticker: 'MSFT',
    name: 'Microsoft',
    plain: { en: 'Windows, Office and Azure cloud', he: 'ווינדוס, אופיס וענן Azure' },
    price: 508.12,
    changePct: -0.67,
  },
  {
    ticker: 'TEVA',
    name: 'Teva',
    plain: { en: 'Generic medicines maker', he: 'יצרנית תרופות גנריות' },
    price: 18.42,
    changePct: 1.21,
  },
];

function WatchlistPreview() {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
    <Card padding="13px 13px 4px" gap={6}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <CardTitle>{t('home.watchlist')}</CardTitle>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" fontSize={16} onClick={() => toast(c('outOfScope', language))}>
          {t('home.seeAll')}
        </Button>
      </div>
      {WATCHED.map((x) => (
        <ListRow
          key={x.ticker}
          leading={<TickerTile ticker={x.ticker} />}
          title={x.ticker}
          subtitle={x.plain[language]}
          right={
            <RowValues main={money(x.price)} sub={pct(x.changePct)} subColor={signalColor(x.changePct)} />
          }
          onClick={() => toast(c('outOfScope', language))}
        />
      ))}
    </Card>
  );
}

const MOVERS = [
  {
    ticker: 'AMD',
    why: { en: 'Beat expectations on data-centre chips', he: 'הכתה את הציפיות בשבבים למרכזי נתונים' },
    changePct: 4.86,
  },
  {
    ticker: 'TSLA',
    why: { en: 'Deliveries below the analyst consensus', he: 'מסירות מתחת לקונצנזוס האנליסטים' },
    changePct: -3.18,
  },
  {
    ticker: 'NVDA',
    why: { en: 'Data-centre revenue guide above consensus', he: 'תחזית הכנסות ממרכזי נתונים מעל הקונצנזוס' },
    changePct: 2.31,
  },
];

function MoversPreview() {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
    <Card padding={13} gap={8}>
      <CardTitle>{t('home.moversBeg')}</CardTitle>
      <p className="text-muted" style={{ fontSize: 'var(--text-row)', margin: 0 }}>
        {t('home.moversHelp')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {MOVERS.map((x) => (
          <button
            key={x.ticker}
            type="button"
            onClick={() => toast(c('outOfScope', language))}
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
              {x.why[language]}
            </span>
            <Num size={18} style={{ color: signalColor(x.changePct) }}>
              {pct(x.changePct)}
            </Num>
          </button>
        ))}
      </div>
      <Button
        variant="ghost"
        fontSize={16}
        alignSelf="flex-start"
        onClick={() => toast(c('outOfScope', language))}
      >
        {t('home.allMovers')}
      </Button>
    </Card>
  );
}
