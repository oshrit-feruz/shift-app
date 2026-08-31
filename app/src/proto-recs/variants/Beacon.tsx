import { Card } from '../../components/Card';
import { Tag } from '../../components/Tag';
import { Icon } from '../../components/Icon';
import { Num } from '../../components/Num';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useToast } from '../../components/Toast';
import { HomeScaffold } from '../HomeScaffold';
import { CANDIDATES, CORE, SATELLITE_PCT, c, type VariantProps } from '../content';

/**
 * BEACON — the axis is placement, not size.
 *
 * The advisory track is the smallest block on the page and the first one on
 * it: one strip above the portfolio hero, before anything else the user came
 * for. The bet is that being first is worth more than being big, and that a
 * regulated recommendation earns attention by sitting in the right place
 * rather than by shouting.
 *
 * Because the track now has a place of its own, the two-tracks card below
 * keeps only its self-directed half — the advisory row there would be the
 * same invitation twice on one screen.
 */
export function Beacon({ phase, setPhase }: VariantProps) {
  return (
    <HomeScaffold
      top={phase === 'new' ? <Invitation onStart={() => setPhase('done')} /> : <Result />}
      tracks="self"
    />
  );
}

/** Before the flow: two lines and a chevron, in the one highlight treatment
 *  the system allows — and this is the screen's only use of it. */
function Invitation({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <Card padding="11px 13px" gap={3} highlight onClick={onStart}>
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
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{t('home.trackAdvisor')}</span>
        <Tag variant="accent" fontSize={15}>
          {t('adv.tag')}
        </Tag>
        <span style={{ flex: 1 }} />
        <span style={{ opacity: 0.5, fontSize: 'var(--text-title)' }}>›</span>
      </div>
      <p
        className="text-muted"
        style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.5, paddingInlineStart: 34 }}
      >
        {t('home.trackAdvisorSub')}
      </p>
    </Card>
  );
}

/** The bands of the ribbon: the Balanced core plus its satellite sleeve. */
const BANDS = [
  ...CORE.map((x) => ({ pct: x.pct, color: x.color, key: shortKey(x.category) })),
  { pct: SATELLITE_PCT, color: 'var(--color-accent-700)', key: 'shortSingles' as const },
];

function shortKey(category: (typeof CORE)[number]['category']) {
  if (category === 'developedIndex') return 'shortDeveloped' as const;
  if (category === 'sp500') return 'shortSp500' as const;
  return 'shortBonds' as const;
}

/**
 * After the flow: the same strip, in the same slot, now carrying the answer.
 * The whole allocation is one 8px ribbon rather than four labelled tracks —
 * the recommendation screen is where the bars belong; here the shape of the
 * portfolio is the point, and it fits in a line.
 */
function Result() {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
    <Card padding="11px 13px" gap={8} outlined onClick={() => toast(c('outOfScope', language))}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{c('beaconYours', language)}</span>
        <span style={{ color: 'var(--color-accent-300)', fontSize: 'var(--text-title)', fontWeight: 600 }}>
          {t('profile.bal')}
        </span>
        <span style={{ flex: 1 }} />
        <Tag variant="outline" fontSize={15}>
          {c('beaconPassed', language, { n: CANDIDATES.length })}
        </Tag>
        <span style={{ opacity: 0.5, fontSize: 'var(--text-title)' }}>›</span>
      </div>
      <span
        style={{
          display: 'flex',
          gap: 2,
          height: 8,
          width: '100%',
          borderRadius: 4,
          overflow: 'hidden',
          background: 'var(--line)',
        }}
      >
        {BANDS.map((b) => (
          <span
            key={b.key}
            className="proto-ribbon-seg"
            style={{ display: 'block', width: `${b.pct}%`, background: b.color }}
          />
        ))}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {BANDS.map((b) => (
          <span
            key={b.key}
            className="text-muted"
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 'var(--text-caption)' }}
          >
            <span
              aria-hidden="true"
              style={{ width: 7, height: 7, borderRadius: 2, background: b.color, flex: 'none' }}
            />
            <Num size="var(--text-caption)">{b.pct}%</Num>
            {c(b.key, language)}
          </span>
        ))}
      </div>
    </Card>
  );
}
