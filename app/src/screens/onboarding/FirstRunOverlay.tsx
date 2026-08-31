import { useState } from 'react';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { useDispatch } from '../../state/appState';
import { useTheme, type Language } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';

/**
 * First-run flow: language, then density. Purely display preferences —
 * nothing saved depends on either, and each step is skippable. On a genuinely
 * fresh session (no `firstRunSeen` flag) this always fires before the app is
 * usable; finishing (or skipping the density step) always routes into the
 * first-steps checklist — the app's one onboarding flow now that the App
 * Tour has been folded into it (see onboarding/Steps.tsx).
 *
 * Language and density both read/write the SAME `useTheme()` state that
 * Settings' own toggles use (see screens/Settings.tsx) — there is only ever
 * one language/mode value, so a choice made here is exactly what Settings
 * shows afterward, not a separate setting that could drift out of sync.
 */
export function FirstRunOverlay() {
  const dispatch = useDispatch();
  const { mode, setMode, language, setLanguage } = useTheme();
  const t = useT();
  const [step, setStep] = useState<'lang' | 'density'>('lang');

  const finish = () => {
    dispatch({ type: 'firstRunSeen' });
    dispatch({ type: 'go', screen: 'steps' });
  };
  const pickDensity = (m: 'beginner' | 'advanced') => {
    setMode(m);
    finish();
  };
  const pickLanguage = (l: Language) => {
    setLanguage(l);
    setStep('density');
  };

  const shell = (children: React.ReactNode) => (
    <div
      className="anim-fade-up"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 95,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 14,
        padding: '34px 20px',
      }}
    >
      {children}
    </div>
  );

  if (step === 'lang') {
    // Before a language is chosen there is no single language to write this
    // screen's copy in, so — deliberately, unlike every other screen — its
    // text is bilingual inline rather than sourced from strings.ts.
    return shell(
      <>
        <div>
          <div
            className="text-muted"
            style={{ fontSize: 'var(--text-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            Language · שפה
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-heading)',
              letterSpacing: 'var(--track-heading)',
              lineHeight: 'var(--lead-heading)',
              marginTop: 6,
            }}
          >
            בחירת שפה · Choose your language
          </div>
        </div>
        {(
          [
            ['he', 'עברית', 'Hebrew · RTL'],
            ['en', 'English', 'אנגלית · LTR'],
          ] as const
        ).map(([l, name, sub]) => (
          <button
            key={l}
            type="button"
            onClick={() => pickLanguage(l)}
            style={{
              textAlign: 'start',
              padding: 14,
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${language === l ? 'var(--color-accent)' : 'var(--color-divider)'}`,
              background: language === l ? 'var(--fill-selected)' : 'transparent',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{name}</span>
            <span
              className="text-muted"
              style={{ display: 'block', fontSize: 'var(--text-caption)', marginTop: 3 }}
            >
              {sub}
            </span>
          </button>
        ))}
      </>,
    );
  }

  return shell(
    <>
      <div>
        <div
          className="text-muted"
          style={{ fontSize: 'var(--text-caption)', letterSpacing: '.1em', textTransform: 'uppercase' }}
        >
          {t('firstRun.kicker')}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-heading)',
            letterSpacing: 'var(--track-heading)',
            lineHeight: 'var(--lead-heading)',
            marginTop: 6,
            whiteSpace: 'normal',
          }}
        >
          {t('firstRun.q')}
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: '8px 0 0' }}>
          {t('firstRun.help')}
        </p>
      </div>
      {(
        [
          ['beginner', t('more.beginner'), t('firstRun.begBadge'), t('firstRun.begBlurb'), false],
          ['advanced', t('more.advanced'), t('firstRun.advBadge'), t('firstRun.advBlurb'), true],
        ] as const
      ).map(([m, name, badge, blurb, dense]) => (
        <button
          key={m}
          type="button"
          onClick={() => pickDensity(m)}
          style={{
            textAlign: 'start',
            padding: 14,
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${mode === m ? 'var(--color-accent)' : 'var(--color-divider)'}`,
            background: mode === m ? 'var(--fill-selected)' : 'transparent',
            color: 'inherit',
            font: 'inherit',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{name}</span>
            <Tag variant="outline" fontSize={15}>
              {badge}
            </Tag>
          </span>
          <span style={{ display: 'block', fontSize: 'var(--text-body)', opacity: 0.78, marginTop: 5 }}>
            {blurb}
          </span>
          {/* density sketch */}
          <svg viewBox="0 0 260 44" style={{ width: '100%', height: 40, marginTop: 9 }} aria-hidden="true">
            {Array.from({ length: dense ? 9 : 4 }, (_, i) => (
              <rect
                key={i}
                x={dense ? (i % 3) * 88 : 0}
                y={dense ? Math.floor(i / 3) * 15 : i * 11}
                width={dense ? 74 : 150 + ((i * 47) % 100)}
                height={dense ? 4 : 6}
                rx="2"
                fill={i === 0 ? 'var(--color-accent)' : 'var(--line)'}
              />
            ))}
          </svg>
        </button>
      ))}
      <Button variant="ghost" alignSelf="center" fontSize={16} onClick={finish}>
        {t('firstRun.skip')}
      </Button>
    </>,
  );
}
