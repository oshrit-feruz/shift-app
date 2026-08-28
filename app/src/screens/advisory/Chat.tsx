import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { ChatBubble } from '../../components/ChatBubble';
import { FlowStepper } from './FlowStepper';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { hardRule, mapProfile, type Answer } from '../../lib/advisory';
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

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <FlowStepper />
      <Card padding="11px 13px" gap={3} outlined>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Tag variant="accent" fontSize={12}>
            {t('adv.tag')}
          </Tag>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {t('adv.noAction')}
          </span>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
          {t('adv.chatIntro')}
        </p>
      </Card>

      {ans.map((v, i) => (
        <span key={i} style={{ display: 'contents' }}>
          <ChatBubble who="bot">{t(QUESTIONS[i].q)}</ChatBubble>
          <ChatBubble who="me">{t(QUESTIONS[i].opts.find((o) => o[0] === v)![1])}</ChatBubble>
        </span>
      ))}
      {asking && <ChatBubble who="bot">{t(QUESTIONS[ans.length].q)}</ChatBubble>}

      {asking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, paddingTop: 2 }}>
          <div
            className="text-muted"
            style={{ fontSize: 12.5, letterSpacing: '.08em', textTransform: 'uppercase' }}
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
                fontSize: 14,
                cursor: 'pointer',
                textAlign: 'start',
              }}
            >
              <span style={{ flex: 1 }}>{t(label)}</span>
              <span style={{ opacity: 0.45, fontSize: 14 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {!asking && profileKey && (
        <>
          <Card padding={14} gap={9} highlight>
            <div
              className="text-muted"
              style={{ fontSize: 12.5, letterSpacing: '.1em', textTransform: 'uppercase' }}
            >
              {t('adv.yourProfile')}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1.1 }}>
              {t(`profile.${profileKey}` as StringKey)}
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, opacity: 0.85 }}>
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
                    fontSize: 13,
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
              <Tag variant="outline" fontSize={12}>
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
              <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'advReset' })}>
                {t('adv.restart')}
              </Button>
              <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
                {t('adv.later')}
              </Button>
            </div>
          </Card>
          {/* Inline educational moment pulled from the library */}
          <Card padding="12px 13px" gap={5}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Tag variant="neutral" fontSize={12}>
                {t('adv.fromLibrary')}
              </Tag>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{t('adv.eduChatTitle')}</span>
            </div>
            <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              {t('adv.eduChatBody')}
            </p>
            <Button
              variant="ghost"
              fontSize={12.5}
              alignSelf="flex-start"
              style={{ padding: 0 }}
              onClick={() => dispatch({ type: 'go', screen: 'learn' })}
            >
              {t('adv.openLibrary')}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
