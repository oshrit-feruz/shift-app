import { useState } from 'react';
import { AppBackground } from '../components/AppBackground';
import { Button } from '../components/Button';
import { AppleLogo } from '../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { isAppleEnabled } from '../lib/supabase';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The sign-in gate. Rendered *instead of* the app shell (no header, no tab
 * bar) — there is nothing to navigate while signed out, so it is not part of
 * the SCREENS map.
 *
 * OAuth only, by design: Google live now, Apple wired but disabled until the
 * Apple Developer credentials exist (see lib/supabase.ts isAppleEnabled). No
 * email/password on purpose.
 *
 * Honest states, mirroring DataState's visuals without a Loadable to wrap:
 *  - env vars missing → both buttons disabled + the bilingual reason;
 *  - button pressed  → that button swaps to "Redirecting…" and locks (the
 *    browser is about to navigate away; a spinner would be theater);
 *  - a failed attempt/callback → the unavailable-style block with retry.
 */
export function SignInScreen() {
  const { session, signInError, signInWithGoogle, signInWithApple, clearSignInError } = useAuth();
  const t = useT();
  const { language } = useTheme();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);

  const notConfigured = session.status === 'unavailable';

  const start = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    await (provider === 'google' ? signInWithGoogle() : signInWithApple());
    // Only reached when the redirect did NOT happen (pre-redirect failure) —
    // unlock so the user can try again.
    setBusy(null);
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--g2)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'radial-gradient(120% 60% at 15% -6%, var(--g1) 0%, var(--g2) 55%)',
          color: 'var(--color-text)',
          position: 'relative',
          overflow: 'hidden',
          padding: '24px 22px calc(24px + env(safe-area-inset-bottom))',
        }}
        data-screen-label="signIn"
      >
        <AppBackground />
        <div
          className="anim-fade-up"
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <span
            className="text-muted"
            style={{ fontSize: 'var(--text-body)', fontWeight: 600, letterSpacing: 0.4 }}
          >
            {t('auth.kicker')}
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-display)',
              letterSpacing: 'var(--track-display)',
              lineHeight: 'var(--lead-display)',
            }}
          >
            {t('auth.title')}
          </h1>
          <p
            className="text-muted"
            style={{ margin: '0 0 18px', fontSize: 'var(--text-row)', lineHeight: 1.5 }}
          >
            {t('auth.sub')}
          </p>

          <Button
            block
            minHeight={48}
            onClick={() => start('google')}
            disabled={notConfigured || busy != null}
          >
            {busy !== 'google' && (
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#fff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 'none',
                }}
              >
                <img src="/assets/logo-google.svg" alt="" width={13} height={13} />
              </span>
            )}
            {busy === 'google' ? t('auth.redirecting') : t('auth.google')}
          </Button>

          <Button
            block
            variant="secondary"
            minHeight={48}
            onClick={() => start('apple')}
            disabled={notConfigured || !isAppleEnabled || busy != null}
          >
            {busy !== 'apple' && <AppleLogo size={18} />}
            {busy === 'apple' ? t('auth.redirecting') : t('auth.apple')}
          </Button>
          {!isAppleEnabled && !notConfigured && (
            <span className="text-muted" style={{ fontSize: 'var(--text-caption)', textAlign: 'center' }}>
              {t('auth.appleSoon')}
            </span>
          )}

          {/* Why the buttons are dead — shown instead of letting them fail. */}
          {notConfigured && (
            <span
              className="text-muted"
              style={{ fontSize: 'var(--text-caption)', textAlign: 'center', lineHeight: 1.5 }}
            >
              {session.status === 'unavailable' && session.reason
                ? session.reason[language]
                : t('data.unavailableHelp')}
            </span>
          )}

          {signInError && (
            <div
              style={{
                textAlign: 'center',
                padding: '14px 0 0',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 'var(--text-row)' }}>{t('auth.errorTitle')}</span>
              <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
                {signInError[language]}
              </span>
              <Button variant="ghost" onClick={clearSignInError} alignSelf="center" fontSize={16}>
                {t('auth.retry')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
