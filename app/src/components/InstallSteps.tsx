import { useState } from 'react';
import { Button } from './Button';
import { installRoute } from '../lib/install';
import { useInstallPrompt } from '../lib/useInstall';
import { useT } from '../i18n/useT';

/**
 * The one way the app asks to be added to the home screen — used by the gate
 * screen (screens/InstallGate.tsx) and by the optional card in Settings.
 *
 * Only Chromium can do it in a tap; on iOS there is no install API at all, so
 * the honest alternative is the exact sequence of taps rather than a button
 * that would have to pretend. `installRoute()` picks between them, and its
 * table is unit-tested in lib/install.test.ts.
 */
export function InstallSteps() {
  const t = useT();
  const { canPrompt, installed, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const nav = window.navigator;
  const route = installRoute({ canPrompt, ua: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0 });

  if (installed) {
    return <Note>{t('install.done')}</Note>;
  }

  if (route === 'prompt') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button
          block
          minHeight={48}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const outcome = await promptInstall();
            setBusy(false);
            // 'accepted' is reported by the appinstalled event instead, which
            // is the browser's own confirmation rather than our optimism.
            setDismissed(outcome === 'dismissed');
          }}
        >
          {busy ? t('install.working') : t('install.cta')}
        </Button>
        {dismissed && <Note>{t('install.dismissed')}</Note>}
      </div>
    );
  }

  if (route === 'ios-safari') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 'var(--text-row)', fontWeight: 600 }}>{t('install.stepsTitle')}</span>
        <ol style={{ margin: 0, paddingInlineStart: 20, display: 'grid', gap: 8 }}>
          <Step>{t('install.ios1')}</Step>
          <Step>{t('install.ios2')}</Step>
          <Step>{t('install.ios3')}</Step>
        </ol>
      </div>
    );
  }

  return <Note>{t(route === 'ios-other' ? 'install.iosOther' : 'install.manual')}</Note>;
}

function Step({ children }: { children: string }) {
  return <li style={{ fontSize: 'var(--text-row)', lineHeight: 1.5 }}>{children}</li>;
}

function Note({ children }: { children: string }) {
  return (
    <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-row)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}
