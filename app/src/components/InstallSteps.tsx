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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {route === 'prompt' && (
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
      )}

      {/* Safari and the iOS browsers that borrow its Share sheet: the same
          three taps, drawn. */}
      {(route === 'ios-safari' || route === 'ios-browser') && (
        <>
          <InstallDemo variant="ios" />
          <span className="text-muted" style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}>
            {t('install.stepsTitle')}
          </span>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            <Step n={1} icon="share" label={t('install.ios1')} />
            <Step n={2} icon="addSquare" label={t('install.ios2')} />
            <Step n={3} icon="check" label={t('install.ios3')} />
          </ol>
        </>
      )}

      {/* The two one-line routes get the same shape as the steps — one glyph,
          a few words — rather than a paragraph. */}
      {route === 'ios-webview' && (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
          <Step icon="share" label={t('install.iosWebview')} />
        </ol>
      )}
      {route === 'manual' && (
        <>
          <InstallDemo variant="menu" />
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 10 }}>
            <Step icon="dotsV" label={t('install.manual')} />
          </ol>
        </>
      )}

      {/* Offered where the Share sheet may not carry "Add to Home Screen" —
          an in-app browser, or an iOS older than 16.4 — so that opening
          Safari is a paste rather than a URL typed from memory. */}
      {(route === 'ios-webview' || route === 'ios-browser') && <CopyLinkButton />}

      {/* Rendered outside the prompt branch on purpose: dismissing the native
          dialog spends the event, so the very next render has already fallen
          back to the manual route. Inside that branch this note could never
          appear. */}
      {dismissed && <Note>{t('install.dismissed')}</Note>}
    </div>
  );
}

/**
 * The one thing that helps a user stuck in Chrome, Firefox or an in-app
 * webview on iOS, where "Add to Home Screen" does not exist: put the address
 * on the clipboard, so opening Safari is a paste rather than typing a URL
 * from memory.
 *
 * It deliberately does NOT navigate anywhere. The obvious trick —
 * `x-safari-https:`, the scheme Safari registers — means feeding the current
 * location straight into a redirect, which is a client-side open-redirect
 * shape however narrow the intent, and it was only ever best-effort: some
 * hosts swallow the navigation and nothing reports back either way. Copying
 * is honest about what it did, and the user stays in control of where they go.
 */
function CopyLinkButton() {
  const t = useT();
  const [copied, setCopied] = useState(false);
  // No clipboard (an old webview, a permissions policy) → no button, rather
  // than one that fails silently. The written instruction above still stands.
  if (!navigator.clipboard) return null;
  return (
    <Button
      block
      minHeight={48}
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setCopied(true);
        } catch {
          // Denied or unavailable: say nothing changed rather than claim a
          // copy that did not happen.
          setCopied(false);
        }
      }}
    >
      {copied ? t('install.copied') : t('install.copyLink')}
    </Button>
  );
}

/** One step: its number, the glyph to look for, and its name. */
function Step({ n, icon, label }: Readonly<{ n?: number; icon: IconName; label: string }>) {
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

function Note({ children }: Readonly<{ children: string }>) {
  return (
    <p className="text-muted" style={{ margin: 0, fontSize: 'var(--text-row)', lineHeight: 1.5 }}>
      {children}
    </p>
  );
}
