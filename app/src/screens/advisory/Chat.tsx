import { useEffect, useRef } from 'react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { ChatBubble } from '../../components/ChatBubble';
import { FlowStepper } from './FlowStepper';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { hardRule, mapProfile, type Answer } from '../../lib/advisory';
import { track } from '../../data/analytics';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';

/** The four questions; answer keys index into strings.ts. */
const QUESTIONS: Array<{ q: StringKey; opts: Array<[Answer, StringKey]> }> = [
  {
    q: 'adv.q1',
    opts: [
      [1, 'adv.q1a1'],
      [2, 'adv.q1a2'],
      [3, 'adv.q1a3'],
    ],
  },
  {
    q: 'adv.q2',
    opts: [
      [1, 'adv.q2a1'],
      [2, 'adv.q2a2'],
      [3, 'adv.q2a3'],
    ],
  },
  {
    q: 'adv.q3',
    opts: [
      [1, 'adv.q3a1'],
      [2, 'adv.q3a2'],
      [3, 'adv.q3a3'],
    ],
  },
  {
    q: 'adv.q4',
    opts: [
      [1, 'adv.q4a1'],
      [2, 'adv.q4a2'],
      [3, 'adv.q4a3'],
    ],
  },
];

const ANSWER_LABELS: StringKey[] = ['adv.ansHorizon', 'adv.ansRisk', 'adv.ansGoal', 'adv.ansSafety'];

export function AdvisoryChat(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const ans = s.advAnswers;
  const asking = ans.length < 4;
  const profileKey = mapProfile(ans);

  // The conversation grows downward past the fold, and the app scrolls in one
  // shared container — so without this the next question and the options that
  // answer it arrive off-screen, and the reply the motion promises is a reply
  // the user has to go looking for.
  //
  // Keyed on the number of answers, not on every render: the only thing that
  // adds a turn is an answer landing.
  // Top of the funnel: this screen opening IS the flow starting, so it is
  // recorded here rather than on the first answer — someone who arrives,
  // reads the questions and leaves is exactly the drop-off the baseline
  // needs to show. Counted once per session however often the screen
  // remounts; see data/analytics.ts.
  useEffect(() => track('reco_started'), []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const turns = ans.length;
  // The first paint is not a turn — the screen has just opened and belongs at
  // its top, showing the intro card. Only answers scroll.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    // Matches how spring.ts and base.css treat the setting: the outcome
    // without the journey, rather than no outcome at all.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' });
  }, [turns]);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FlowStepper />
      <Card padding="11px 13px" gap={3} outlined>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Tag variant="accent" fontSize={15}>
            {t('adv.tag')}
          </Tag>
          <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
            {t('adv.noAction')}
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
          {t('adv.chatIntro')}
        </p>
      </Card>

      {/* One keyed list over the questions reached so far, rather than a map
          over the answers plus a separate bubble for the one being asked.
          Split that way, answering moved a question from the second slot into
          the first — a different position in a different list, so React
          unmounted it and mounted a copy, and the question the user had just
          answered arrived a second time while the bubble below it silently
          swapped to the next one. Here a question keeps its key from the
          moment it is asked, so only genuinely new turns animate in. */}
      {QUESTIONS.slice(0, asking ? ans.length + 1 : ans.length).map((question, i) => (
        <span key={question.q} style={{ display: 'contents' }}>
          {/* The first question arrives with the screen; every later one is a
              reply to an answer, and waits the beat that makes it read as
              one. */}
          <ChatBubble who="bot" delayMs={i === 0 ? 0 : 140}>
            {t(question.q)}
          </ChatBubble>
          {ans[i] != null && (
            <ChatBubble who="me">{t(question.opts.find((o) => o[0] === ans[i])![1])}</ChatBubble>
          )}
        </span>
      ))}

      {asking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
          <div
            className="text-muted"
            style={{ fontSize: 'var(--text-caption)', letterSpacing: '.08em', textTransform: 'uppercase' }}
          >
            {t('adv.pickOne')}
          </div>
          {QUESTIONS[ans.length].opts.map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => dispatch({ type: 'advAnswer', value: v })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                minHeight: 46,
                padding: '11px 13px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-divider)',
                background: 'var(--sunk)',
                color: 'inherit',
                font: 'inherit',
                fontSize: 'var(--text-row)',
                cursor: 'pointer',
                textAlign: 'start',
              }}
            >
              <span style={{ flex: 1 }}>{t(label)}</span>
              <span style={{ opacity: 0.45, fontSize: 'var(--text-row)' }}>›</span>
            </button>
          ))}
        </div>
      )}

      {!asking && profileKey && (
        <>
          <Card padding={14} gap={9} highlight>
            <div
              className="text-muted"
              style={{ fontSize: 'var(--text-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              {t('adv.yourProfile')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--text-display)',
                letterSpacing: 'var(--track-display)',
                lineHeight: 'var(--lead-display)',
              }}
            >
              {t(`profile.${profileKey}` as StringKey)}
            </div>
            <p style={{ fontSize: 'var(--text-body)', lineHeight: 1.55, margin: 0, opacity: 0.85 }}>
              {t(`profile.${profileKey}.blurb` as StringKey)}
              {hardRule(ans) && ` ${t('profile.hardNote')}`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 2 }}>
              {ANSWER_LABELS.map((labelKey, i) => (
                <div
                  key={labelKey}
                  style={{
                    display: 'flex',
                    gap: 9,
                    fontSize: 'var(--text-body)',
                    padding: '5px 0',
                    borderTop: '1px solid var(--color-divider)',
                  }}
                >
                  <span className="text-muted" style={{ width: 78, flex: 'none' }}>
                    {t(labelKey)}
                  </span>
                  <span style={{ flex: 1 }}>
                    {ans[i] ? t(QUESTIONS[i].opts.find((o) => o[0] === ans[i])![1]) : '—'}
                  </span>
                </div>
              ))}
            </div>
            <span style={{ alignSelf: 'flex-start' }}>
              <Tag variant="outline" fontSize={15}>
                {t('adv.noAction')}
              </Tag>
            </span>
            <Button
              block
              minHeight={44}
              onClick={() => dispatch({ type: 'advGoto', screen: 'advDisc', stage: 1 })}
            >
              {t('adv.confirmProfile')}
            </Button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
              <Button variant="ghost" fontSize={16} onClick={() => dispatch({ type: 'advReset' })}>
                {t('adv.restart')}
              </Button>
              <Button variant="ghost" fontSize={16} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
                {t('adv.later')}
              </Button>
            </div>
          </Card>
          {/* Inline educational moment pulled from the library */}
          <Card padding="12px 13px" gap={5}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Tag variant="neutral" fontSize={15}>
                {t('adv.fromLibrary')}
              </Tag>
              <span style={{ fontSize: 'var(--text-row)', fontWeight: 600 }}>{t('adv.eduChatTitle')}</span>
            </div>
            <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.5 }}>
              {t('adv.eduChatBody')}
            </p>
            <Button
              variant="ghost"
              fontSize={15.5}
              alignSelf="flex-start"
              style={{ padding: 0 }}
              onClick={() => dispatch({ type: 'go', screen: 'learn' })}
            >
              {t('adv.openLibrary')}
            </Button>
          </Card>
        </>
      )}
      {/* The scroll target. A zero-height sentinel after everything rather
          than the last bubble: what the user needs in view is the new
          question AND the options that answer it, and only the end of the
          screen is reliably below both. */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  );
}
