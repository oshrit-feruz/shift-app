import { Tag } from '../../components/Tag';
import { RadarSweep } from '../../components/RadarSweep';
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
  // The answers alone are not the recommendation. `advAnswer` fills
  // `advAnswers` without touching `advStage`, so a client who answered the
  // fourth question and left the chat has a mappable profile she has never
  // been shown — and reporting it here would also hand her a way into the
  // dashboard around the disclosure step, which the flow puts before it on
  // purpose. Stage 2 is set by Disclosure's own continue button, so it is
  // exactly "she has accepted the disclosure and reached her recommendation".
  const delivered = profile !== null && s.advStage >= ADV_STAGE_DASHBOARD;
  return delivered && profile !== null ? <Result profile={profile} /> : <Invitation />;
}

/** `advStage` once Disclosure has handed the client to the recommendation
 *  (screens/advisory/Disclosure.tsx dispatches this stage with the screen). */
const ADV_STAGE_DASHBOARD = 2;

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
      <RadarLine wording="rec.radarPassed" />
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
      {/* Shown whatever the profile holds, for the reason the recommendation
          screen shows the list itself: the radar runs the same rules over the
          same names for everyone, and a profile decides how much of a
          portfolio — if any — goes behind what it finds. Only the wording
          changes: with a sleeve this is her own radar's result, without one it
          is simply what today's check turned up. */}
      <RadarLine wording={p.satellitePct > 0 ? 'home.radarYours' : 'rec.radarPassed'} />
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
 * How many names cleared today's checks, with the turning dish beside them —
 * the live daily screen, the same call the recommendation screen makes.
 *
 * It is on the band in both states on purpose. The radar is the half of the
 * recommendation that changes daily, and a client who has never opened the
 * flow has no way of knowing there is anything moving in there; this is the
 * only thing on the home screen that says so.
 *
 * Renders nothing while it is loading, if it fails, or on a day when nothing
 * passed. A count that is simply absent misleads nobody, where a placeholder
 * number would — and "0 passed today" is a true sentence that reads on a home
 * screen as a broken feature rather than as a quiet market.
 */
function RadarLine({ wording }: { wording: 'home.radarYours' | 'rec.radarPassed' }) {
  const t = useT();
  const sat = useLoadable(() => demoService.satelliteSignals(), []);
  if (sat.state.status !== 'ok' || sat.state.data.length === 0) return null;
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 'var(--text-row)',
        fontWeight: 500,
      }}
    >
      {/* The dish rides in a 26px slot — the width of the band's icon plate —
          so this line's text starts on the same edge as the line above it
          rather than a few pixels short of it. */}
      <span style={{ width: 26, flex: 'none', display: 'grid', placeItems: 'center' }}>
        <RadarSweep size={20} />
      </span>
      {t(wording, { n: sat.state.data.length })}
    </span>
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
