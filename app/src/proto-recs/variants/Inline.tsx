import { useState } from 'react';
import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { AllocationBar } from '../../components/AllocationBar';
import { ProgressDots } from '../../components/Progress';
import { useToast } from '../../components/Toast';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { HomeScaffold } from '../HomeScaffold';
import { CORE, SATELLITE_PCT, c, type VariantProps } from '../content';
import type { StringKey } from '../../i18n/strings';

/**
 * INLINE — the axis is the interaction model: the flow itself lives on the
 * home page.
 *
 * The other two variants are doors to the advisory flow. This one is the
 * first room of it. The four questions are answered in place, one card, one
 * question at a time, and the profile appears in the same card when the
 * fourth answer lands — the user is never sent anywhere to find out what
 * happens next.
 *
 * It sits under the portfolio hero rather than above it: it is a commitment
 * of a minute, and the money the user opened the app for comes first.
 */
export function Inline({ phase, setPhase }: VariantProps) {
  return <HomeScaffold afterHero={<Block phase={phase} setPhase={setPhase} />} tracks="none" />;
}

/** The four questions, as lib/advisory.ts scores them — product strings, in
 *  product order (horizon, risk reaction, goal, safety net). */
const QUESTIONS: Array<{ q: StringKey; answers: StringKey[] }> = [
  { q: 'adv.q1', answers: ['adv.q1a1', 'adv.q1a2', 'adv.q1a3'] },
  { q: 'adv.q2', answers: ['adv.q2a1', 'adv.q2a2', 'adv.q2a3'] },
  { q: 'adv.q3', answers: ['adv.q3a1', 'adv.q3a2', 'adv.q3a3'] },
  { q: 'adv.q4', answers: ['adv.q4a1', 'adv.q4a2', 'adv.q4a3'] },
];

function Block({ phase, setPhase }: VariantProps) {
  const [step, setStep] = useState(0);
  const [away, setAway] = useState(false);

  if (phase === 'done') return <Result />;
  // "Continue later" cannot simply remove the card: the page would then hold
  // no way back into the flow at all. It collapses to the thinnest possible
  // line instead, which is also the honest shape of a track the user has
  // declined for now.
  if (away) return <Collapsed onBack={() => setAway(false)} />;

  return (
    <Question
      step={step}
      onAnswer={() => (step === QUESTIONS.length - 1 ? setPhase('done') : setStep(step + 1))}
      onLater={() => setAway(true)}
    />
  );
}

function Question({ step, onAnswer, onLater }: { step: number; onAnswer: () => void; onLater: () => void }) {
  const t = useT();
  const { language } = useTheme();
  const { q, answers } = QUESTIONS[step];
  return (
    <Card padding={14} gap={11} highlight>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-title)', fontWeight: 600, flex: 1 }}>
          {t('home.trackAdvisor')}
        </span>
        <Tag variant="accent" fontSize={15}>
          {t('adv.tag')}
        </Tag>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ display: 'flex' }}>
          <ProgressDots total={QUESTIONS.length} current={step} />
        </span>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {c('inlineQuestionOf', language, { n: step + 1 })}
        </span>
      </div>
      {/* Two lines' worth of room, held whether the question needs it or not,
          so answering never makes the card jump under the finger that is
          still on it. */}
      <p
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-title)',
          lineHeight: 1.45,
          margin: 0,
          minHeight: 48,
        }}
      >
        {t(q)}
      </p>
      {/* Keyed on the step: React mounts fresh rows per question, which is
          what replays the entrance. There is no exit — an outgoing animation
          would put 120ms between the tap and the next question, and this is a
          four-tap flow where that lag is the whole feel of it. */}
      <div key={step} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {answers.map((a) => (
          <button
            key={a}
            type="button"
            className="proto-rise"
            onClick={onAnswer}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              minHeight: 44,
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-divider)',
              background: 'var(--sunk)',
              color: 'inherit',
              font: 'inherit',
              fontSize: 'var(--text-row)',
              lineHeight: 1.4,
              cursor: 'pointer',
              textAlign: 'start',
            }}
          >
            {t(a)}
          </button>
        ))}
      </div>
      <Button variant="ghost" alignSelf="center" fontSize={16} onClick={onLater}>
        {t('adv.later')}
      </Button>
    </Card>
  );
}

function Collapsed({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { language } = useTheme();
  return (
    <Card padding="11px 13px" row gap={8} onClick={onBack}>
      <span style={{ fontSize: 'var(--text-row)', flex: 1 }}>{t('home.trackAdvisorSub')}</span>
      <span style={{ color: 'var(--color-accent-300)', fontSize: 'var(--text-row)', fontWeight: 500 }}>
        {c('inlineResume', language)} ›
      </span>
    </Card>
  );
}

/** The fourth answer lands and the same card becomes the answer: the profile,
 *  what it holds, and one way onward. */
function Result() {
  const t = useT();
  const { language } = useTheme();
  const toast = useToast();
  return (
    <Card padding={14} gap={10} outlined>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <CardTitle>{c('inlineProfileIs', language, { name: t('profile.bal') })}</CardTitle>
        <span style={{ marginInlineStart: 'auto' }}>
          <Tag variant="accent" fontSize={15}>
            {t('adv.tag')}
          </Tag>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CORE.map((x) => (
          <AllocationBar
            key={x.category}
            name={t(`core.${x.category}` as StringKey)}
            pct={x.pct}
            colorVar={x.color}
          />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {t('rec.satellite')}
        </span>
        <Num size="var(--text-caption)" style={{ color: 'var(--muted)' }}>
          {SATELLITE_PCT}%
        </Num>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {t('rec.ofPortfolio')}
        </span>
      </div>
      <Button block minHeight={44} onClick={() => toast(c('outOfScope', language))}>
        {c('inlineSeeFull', language)}
      </Button>
    </Card>
  );
}
