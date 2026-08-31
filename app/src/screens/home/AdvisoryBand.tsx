import { Tag } from '../../components/Tag';
import { Icon } from '../../components/Icon';
import { Num } from '../../components/Num';
import { useAppState, useDispatch, setupProgress } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { useLoadable } from '../../data/useLoadable';
import { demoService } from '../../data/demoAdapter';
import { mapProfile, PROFILES, type CoreCategory, type ProfileKey } from '../../lib/advisory';
import type { StringKey } from '../../i18n/strings';

/**
 * The advisory track's place on the home screen.
 *
 * It used to be a row inside the two-tracks card — the same weight as the
 * self-directed row, halfway down the page, behind a chevron — which is a
 * strange place for the one thing the product actually offers. And the flow's
 * result never came home at all: a client who had finished it saw the
 * identical page she saw before answering a single question.
 *
 * So this is the first block on the screen, and it is a band rather than a
 * card (see .band in base.css): edge to edge, on its own tint, no radius. On
 * a page of six floating glass panes, the thing that is *not* a floating pane
 * is what the eye lands on — which is how it outranks them without being
 * bigger than any of them.
 *
 * Two states, because the block has two jobs: invite, then report.
 */
export function AdvisoryBand() {
  const s = useAppState();
  const profile = mapProfile(s.advAnswers);
  return profile === null ? <Invitation /> : <Result profile={profile} />;
}

/** Before the four questions: two lines and a chevron. */
function Invitation() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const setup = setupProgress(s);
  return (
    <button
      type="button"
      className="band"
      onClick={() => dispatch({ type: 'advGoto', screen: setup.resumeScreen, solo: false })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span className="band-icon" aria-hidden="true">
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
    </button>
  );
}

/**
 * After it: the same band, in the same place, carrying the answer.
 *
 * The whole allocation is one ribbon rather than four labelled tracks — the
 * recommendation screen is where the bars belong, and here the shape of the
 * portfolio is the point, which fits in a line.
 */
function Result({ profile }: { profile: ProfileKey }) {
  const dispatch = useDispatch();
  const t = useT();
  const p = PROFILES[profile];
  const bands = [
    ...p.core.map((x, i) => ({
      key: x.category as string,
      pct: x.pct,
      label: t(SHORT[x.category]),
      color: BAND_COLORS[i % BAND_COLORS.length],
    })),
    ...(p.satellitePct > 0
      ? [
          {
            key: 'radar',
            pct: p.satellitePct,
            label: t('home.recRadar'),
            color: 'var(--color-accent-700)',
          },
        ]
      : []),
  ];
  return (
    <button
      type="button"
      className="band"
      onClick={() => dispatch({ type: 'advGoto', screen: 'advDash', solo: false })}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{t('home.recYours')}</span>
        <span style={{ color: 'var(--color-accent-300)', fontSize: 'var(--text-title)', fontWeight: 600 }}>
          {t(`profile.${profile}` as StringKey)}
        </span>
        <span style={{ flex: 1 }} />
        {p.satellitePct > 0 && <PassedTag />}
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
        {bands.map((b) => (
          <span key={b.key} style={{ display: 'block', width: `${b.pct}%`, background: b.color }} />
        ))}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
        {bands.map((b) => (
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
            {b.label}
          </span>
        ))}
      </div>
    </button>
  );
}

/**
 * How many names cleared today's checks — the live daily screen, the same call
 * the recommendation screen makes.
 *
 * Renders nothing at all while it is loading or if it fails, rather than a
 * skeleton or a retry: this is a badge on a summary, and a count that is
 * simply absent misleads nobody, where a placeholder number would.
 */
function PassedTag() {
  const t = useT();
  const sat = useLoadable(() => demoService.satelliteSignals(), []);
  if (sat.state.status !== 'ok') return null;
  return (
    <Tag variant="outline" fontSize={15}>
      {t('home.recPassed', { n: sat.state.data.length })}
    </Tag>
  );
}

/** The legend's short forms. The category names run to four words —
 *  "מדד שווקים מפותחים" — and a legend is read at a glance. */
const SHORT: Record<CoreCategory, StringKey> = {
  globalGovBonds: 'home.recBonds',
  developedIndex: 'home.recDeveloped',
  corporateBonds: 'home.recCorporate',
  cashEquivalents: 'home.recCash',
  sp500: 'home.recSp500',
  emergingIndex: 'home.recEmerging',
};

/** The rotating accent palette, as AllocationBar uses it. */
const BAND_COLORS = ['var(--color-accent)', 'var(--acc-lite)', 'var(--acc-dim)', 'var(--color-accent-700)'];
