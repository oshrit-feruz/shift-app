import { useState } from 'react';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { InstallDemo } from './InstallDemo';
import { useInstallPrompt, useInstallRoute } from '../lib/useInstall';
import { useT } from '../i18n/useT';

/**
 * The one way the app asks to be added to the home screen — used by the gate
 * screen (screens/InstallGate.tsx) and by the optional card in Settings.
 *
 * Only Chromium can do it in a tap; on iOS there is no install API at all, so
 * the alternative is the tap sequence itself. It is drawn rather than
 * described: each step is the glyph the user is looking for on their own
 * screen — Safari's Share box-with-an-arrow, the plus-in-a-screen of "Add to
 * Home Screen" — with two or three words beside it, because a paragraph
 * explaining where a button is takes longer to read than the button takes to
 * find. `installRoute()` picks between the routes; its table is unit-tested
 * in lib/install.test.ts.
 */
export function InstallSteps() {
  const t = useT();
  const { installed, promptInstall } = useInstallPrompt();
  const route = useInstallRoute();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}>
          {t('install.stepsTitle')}
        </span>
        <InstallDemo variant="ios" />
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          <Step n={1} icon="share" label={t('install.ios1')} />
          <Step n={2} icon="addSquare" label={t('install.ios2')} />
          <Step n={3} icon="check" label={t('install.ios3')} />
        </ol>
      </div>
    );
  }

  // The two menu routes get the same shape as the steps above — one glyph,
  // a few words — rather than a paragraph.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {route === 'manual' && <InstallDemo variant="menu" />}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
        {route === 'ios-other' ? (
          <Step icon="share" label={t('install.iosOther')} />
        ) : (
          <Step icon="dotsV" label={t('install.manual')} />
        )}
      </ol>
      {route === 'ios-other' && <OpenInSafariButton />}
    </div>
  );
}

/**
 * The one shortcut available to a user stuck in Chrome, Firefox or an in-app
 * webview on iOS: `x-safari-https:`, the scheme Safari registers, which hands
 * the current URL to Safari where the Share sheet actually carries "Add to
 * Home Screen".
 *
 * It is a best-effort hop, not a guarantee — some hosts swallow the
 * navigation, and nothing reports back either way — which is why the written
 * instruction above it stays put rather than being replaced by the button. It
 * is offered only over https: the scheme mirrors the page's own, and there is
 * no `x-safari-http:` worth sending anyone to.
 */
function OpenInSafariButton() {
  const t = useT();
  if (window.location.protocol !== 'https:') return null;
  return (
    <Button
      block
      minHeight={48}
      onClick={() => {
        const { host, pathname, search } = window.location;
        window.location.href = `x-safari-https://${host}${pathname}${search}`;
      }}
    >
      {t('install.openSafari')}
    </Button>
  );
}

/** One step: its number, the glyph to look for, and its name. */
function Step({ n, icon, label }: { n?: number; icon: IconName; label: string }) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {n != null && (
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            flex: 'none',
            borderRadius: '50%',
            border: '1px solid var(--color-divider)',
            color: 'var(--muted)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {n}
        </span>
      )}
      <span
        style={{
          width: 38,
          height: 38,
          flex: 'none',
          borderRadius: 11,
          background: 'var(--fill-selected)',
          color: 'var(--color-accent-300)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={21} />
      </span>
      <span style={{ fontSize: 'var(--text-row)', lineHeight: 1.4 }}>{label}</span>
    </li>
  );
}

function Note({ children }: { children: string }) {
  return (
    <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-row)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}
