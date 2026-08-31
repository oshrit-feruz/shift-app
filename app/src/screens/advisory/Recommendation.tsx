import { useState } from 'react';
import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { GlitchMark } from '../../components/GlitchMark';
import { LiveBadge } from '../../components/LiveBadge';
import { RadarSweep } from '../../components/RadarSweep';
import { TickerTile } from '../../components/TickerTile';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonList } from '../../components/Skeleton';
import { BuyAtBrokerButton } from '../../components/BuyAtBrokerButton';
import { fundTicker, hasAnyTradeDeepLink } from '../../lib/brokerLinks';
import { money } from '../../lib/format';
import { FlowStepper } from './FlowStepper';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { useLoadable } from '../../data/useLoadable';
import { demoService } from '../../data/demoAdapter';
import { CORE_FUNDS, mapProfile, PROFILES } from '../../lib/advisory';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';
import type { ReactNode } from 'react';

const SAT_RULES: StringKey[] = ['rec.satRule1', 'rec.satRule2', 'rec.satRule3', 'rec.satRule4'];

/** The range the amount control covers, and the granularity it moves in. */
const MIN = 1000;
const MAX = 50000;
const STEP = 500;

/** How many of the day's names get a tile. Three fits a phone row without the
 *  logos and the buy buttons crowding; the rest are counted, not hidden. */
const TILES = 3;

/** The rotating accent palette used for allocation series (AllocationBar). */
const BAND_COLORS = ['var(--color-accent)', 'var(--acc-lite)', 'var(--acc-dim)', 'var(--color-accent-700)'];

/**
 * The recommendation: an index core plus, where the profile allows it, a small
 * rules-based sleeve of individual stocks — the Stock Radar.
 *
 * Two things shape how it reads. First, everything is in money rather than in
 * percentages: "40% developed-market index" is precise and means very little,
 * where "$4,000 in IEFA" is the same fact in the unit a client actually thinks
 * in. Nothing is assumed about how much she has — she drags an amount and
 * every figure on the screen follows it, under a line saying in as many words
 * that this is arithmetic on an allocation and not a forecast of a result.
 *
 * Second, the radar comes before the core. That is not the order of
 * importance — the core is the large majority of the portfolio — it is the
 * order of attention: the radar is the half that changes daily, so it is the
 * only reason to open this screen twice.
 *
 * Every line naming something buyable carries the hand-off to the client's
 * own broker. Shift executes nothing; the button opens the broker's site, and
 * carries no order size for the same reason the amounts here are labelled an
 * illustration.
 */
export function AdvisoryRecommendation(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const [amount, setAmount] = useState(10000);
  const profileKey = mapProfile(s.advAnswers) ?? 'bal';
  const profile = PROFILES[profileKey];
  const corePct = 100 - profile.satellitePct;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <FlowStepper />

      <Card padding={14} gap={10} outlined>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Tag variant="accent" fontSize={15}>
            {t('adv.tag')}
          </Tag>
          <Tag variant="outline" fontSize={15}>
            {t('adv.noAction')}
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-heading)',
              letterSpacing: 'var(--track-heading)',
              lineHeight: 'var(--lead-heading)',
            }}
          >
            {t(`profile.${profileKey}` as StringKey)}
          </span>
          {/* Beside the name rather than up with the tags: wrapped under two
              pills it landed on a line of its own, reading as a heading. */}
          <span style={{ marginInlineStart: 'auto' }}>
            <Button
              variant="ghost"
              fontSize={15.5}
              style={{ padding: 0 }}
              onClick={() => dispatch({ type: 'advReset' })}
            >
              {t('adv.redoChat')}
            </Button>
          </span>
        </div>
        {/* Label above, figure below, both starting at the same edge: side by
            side the number sits at the far end of the row, away from the words
            that say what it is. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span className="text-muted" style={{ fontSize: 'var(--text-row)' }}>
            {t('rec.ifInvested')}
          </span>
          <Num
            size="var(--text-display)"
            weight={700}
            block
            style={{
              fontFamily: 'var(--font-heading)',
              letterSpacing: 'var(--track-display)',
              lineHeight: 'var(--lead-display)',
            }}
          >
            {money(amount, 0)}
          </Num>
        </div>
        <AmountSlider value={amount} onChange={setAmount} />
        <Note>{t('rec.illustration')}</Note>
      </Card>

      {/* The daily half, first and framed.
          Shown for every profile, including the ones with no sleeve at all.
          The radar runs the same published rules over the same universe for
          everyone; what a profile decides is how much of a portfolio — if any
          — is allocated to what it finds. Hiding the list from a Conservative
          client would say the check does not happen for her, which is false.
          It says so in a line instead, and drops the money column, because
          nothing is allocated and "$0" against three names is a worse answer
          than no column at all. */}
      <RadarCard amount={(amount * profile.satellitePct) / 100} pct={profile.satellitePct} />

      {/* Core — a specific fund per category, not just a percentage. Fund
          names are placeholders pending product sign-off (lib/advisory.ts). */}
      <Card padding={13} gap={10}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('rec.core')}</CardTitle>
          <Num size={15.5} style={{ color: 'var(--muted)' }}>
            {corePct}%
          </Num>
          <span style={{ flex: 1 }} />
          <Num size="var(--text-title)" weight={700}>
            {money((amount * corePct) / 100, 0)}
          </Num>
        </div>
        <Note>{t('rec.coreHelp')}</Note>
        {profile.core.map((x, i) => {
          const fund = CORE_FUNDS[x.category];
          return (
            <div key={x.category} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    flex: 'none',
                    background: BAND_COLORS[i % BAND_COLORS.length],
                  }}
                />
                {/* Name and share on one line: the money is the row's subject,
                    so the percentage steps back to being its footnote. */}
                <span style={{ flex: 1, fontSize: 'var(--text-row)', minWidth: 0 }}>
                  {t(`core.${x.category}` as StringKey)}{' '}
                  <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
                    {x.pct}%
                  </Num>
                </span>
                <Num size="var(--text-row)" weight={600}>
                  {money((amount * x.pct) / 100, 0)}
                </Num>
              </div>
              {/* The fund and its hand-off share the line under the figure, the
                  way AllocationBar carries them — a row with a buy button is
                  exactly as tall as one without. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 26,
                  paddingInlineStart: 16,
                }}
              >
                <span style={{ flex: 1, fontSize: 'var(--text-caption)', color: 'var(--muted)' }}>
                  {fund ?? t('rec.noFund')}
                </span>
                <BuyAtBrokerButton ticker={fundTicker(fund)} />
              </div>
            </div>
          );
        })}
      </Card>

      <Button
        block
        minHeight={44}
        onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', stage: 3 })}
      >
        {t('rec.chooseBroker')}
      </Button>
      <Button
        variant="ghost"
        alignSelf="center"
        fontSize={16}
        onClick={() => dispatch({ type: 'go', screen: 'home' })}
      >
        {t('adv.later')}
      </Button>

      <Disclosures satellitePct={profile.satellitePct} broker={s.advBroker} />
    </div>
  );
}

/**
 * The Stock Radar: the names that cleared today's checks, live from the daily
 * screener mirror, with this amount's share of the sleeve against each.
 *
 * The split is even across whatever passed today, which is why the figure
 * against a name is derived rather than chosen: it is the sleeve divided by
 * the number of names, not a position size anyone picked for this client.
 *
 * An empty list is an honest answer on a quiet day, not a failure, so it gets
 * its own state rather than being hidden.
 */
function RadarCard({ amount, pct }: { amount: number; pct: number }) {
  const dispatch = useDispatch();
  const t = useT();
  const sat = useLoadable(() => demoService.satelliteSignals(), []);
  /** Whether this profile puts any money behind what the radar finds. */
  const allocated = pct > 0;

  return (
    // The band, not a card: the same full-bleed purple section the home screen
    // gives the advisory track, so the daily half of the recommendation is the
    // one thing on this screen that is not a floating glass pane. Static here
    // — it holds its own buttons, so the surface itself is not a target.
    <div className="band" style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <RadarSweep />
        <CardTitle>{t('rec.radar')}</CardTitle>
        <LiveBadge />
        {allocated && (
          <>
            <span style={{ flex: 1 }} />
            <Num size="var(--text-title)" weight={700}>
              {money(amount, 0)}
            </Num>
            <Num size={15.5} style={{ color: 'var(--muted)' }}>
              {pct}%
            </Num>
          </>
        )}
      </div>

      {/* Whose radar, and how often it runs — the brand's own mark inline,
          because this is the one screen where the product is the thing doing
          the looking. */}
      {/* The count, said plainly and at reading size. It is the whole point of
          the card, and on a profile with no sleeve it is the only figure the
          card carries at all. */}
      <RadarCount signals={sat.state.status === 'ok' ? sat.state.data.length : null} />
      {!allocated && (
        <p style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.55 }}>{t('rec.satInfoOnly')}</p>
      )}
      {/* The mark is the subject of this line, so it is set well above the
          words around it — at body size it read as a smudge, and at the line's
          own size it read as a word rather than as the brand. The line is one
          step up the scale to carry it. */}
      <p style={{ fontSize: 'var(--text-row)', margin: 0, lineHeight: 1.9, opacity: 0.9 }}>
        {t('rec.radarLineStart')} <GlitchMark height={28} />
        {t('rec.radarLineEnd')}
      </p>

      <DataState state={sat.state} onRetry={sat.retry} skeleton={<SkeletonList count={3} minHeight={52} />}>
        {(signals) =>
          signals.length === 0 ? (
            <EmptyState>{t('rec.noPositions')}</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', gap: 7 }}>
                {signals.slice(0, TILES).map((x) => (
                  <div
                    key={x.ticker}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 5,
                      padding: '10px 4px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-divider)',
                      background: 'var(--sunk)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 5,
                        minHeight: 44,
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        color: 'inherit',
                        font: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <TickerTile ticker={x.ticker} size={28} />
                      {/* With a sleeve, the tile leads with this amount's share
                        of it; without one, with the name and the live price.
                        A missing price renders as an em dash — never guessed,
                        never back-filled. */}
                      <Num size="var(--text-row)" weight={700}>
                        {/* The sleeve is split across every name that passed
                          today, not across the three with tiles — dividing by
                          the visible count would overstate each position on
                          any day more than three clear the checks. */}
                        {allocated ? money(amount / signals.length, 0) : x.ticker}
                      </Num>
                      <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
                        {allocated ? x.ticker : x.price === null ? '—' : money(x.price)}
                      </Num>
                    </button>
                    <BuyAtBrokerButton ticker={x.ticker} />
                  </div>
                ))}
              </div>
              {/* Only the first few names get a tile, so on a day when more
                  clear the checks the tiles no longer add up to the sleeve
                  above them. Say how many there are rather than letting three
                  of eight read as all of them. */}
              {signals.length > TILES && (
                <Note>{t('rec.radarShowing', { shown: TILES, total: signals.length })}</Note>
              )}
            </div>
          )
        }
      </DataState>
    </div>
  );
}

/**
 * How many names cleared the checks today, in the radar's own green with the
 * figure carrying the weight. Renders nothing until the read lands, or on a
 * day when nothing passed — the empty state below says that better than a
 * zero does.
 */
function RadarCount({ signals }: { signals: number | null }) {
  const t = useT();
  if (signals === null || signals === 0) return null;
  return (
    <p style={{ fontSize: 'var(--text-row)', margin: 0, fontWeight: 600 }}>
      {t('rec.radarPassed', { n: signals })}
    </p>
  );
}

/**
 * Everything the product rules require, said once, at the foot of the screen.
 *
 * It used to be spread across five cards and partly repeated, which is most of
 * what made the screen read as heavy. Collected is not buried: the two tags
 * that matter on arrival — informational only, nothing executed — stay at the
 * top of the screen, and this block keeps its own card and body-size type.
 */
function Disclosures({ satellitePct, broker }: { satellitePct: number; broker: string | null }) {
  const t = useT();
  return (
    <Card padding={13} gap={7}>
      <Note>{t('rec.coreSatIntro')}</Note>
      <Note>{t('rec.satHelp')}</Note>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {SAT_RULES.map((k) => (
          <div key={k} style={{ display: 'flex', gap: 8, fontSize: 'var(--text-caption)', lineHeight: 1.45 }}>
            <span style={{ color: 'var(--color-accent-200)', flex: 'none' }}>·</span>
            <span className="text-muted" style={{ flex: 1 }}>
              {t(k)}
            </span>
          </div>
        ))}
      </div>
      <Note>{t('rec.updatedDaily')}</Note>
      <Note>{t('rec.notAnOrder')}</Note>
      {/* With no individual-stock sleeve the radar is not advice for this
          profile, so say so rather than letting the card imply it. */}
      {satellitePct === 0 && <Note>{t('rec.satInfoOnly')}</Note>}
      {/* Says plainly who executes, and — while no per-symbol link is
          configured — what the button will actually do. */}
      {broker !== null && (
        <Note>
          {t('buy.handoffNote')}
          {!hasAnyTradeDeepLink() && ` ${t('buy.noDeepLink')}`}
        </Note>
      )}
      <Note>{t('rec.nextStepHelp')}</Note>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--sunk)',
        }}
      >
        <Tag variant="neutral" fontSize={15}>
          {t('adv.fromLibrary')}
        </Tag>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
          {t('rec.eduCoreBody')}
        </span>
      </div>
    </Card>
  );
}

/**
 * The amount, by drag.
 *
 * A native range input rather than a hand-built drag: it moves with a mouse, a
 * finger and the arrow keys, it announces itself to a screen reader, and it
 * mirrors itself under RTL without being asked. What is custom is the track
 * and the thumb (.amount-slider in base.css) — and the filled part of the
 * track, passed down as a percentage because a gradient has a physical
 * direction and this app runs in both.
 */
function AmountSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useT();
  const fill = ((value - MIN) / (MAX - MIN)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <input
        type="range"
        className="amount-slider"
        min={MIN}
        max={MAX}
        step={STEP}
        value={value}
        aria-label={t('rec.ifInvested')}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--fill' as string]: `${fill}%` }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
          {money(MIN, 0)}
        </Num>
        <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
          {money(MAX, 0)}
        </Num>
      </div>
    </div>
  );
}

/** One caption paragraph — the screen carries several and they share a look. */
function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}
