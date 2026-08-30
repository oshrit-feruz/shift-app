import { BackgroundShapes } from '../components/BackgroundShapes';
import { InstallSteps } from '../components/InstallSteps';
import { Icon } from '../components/Icon';
import { useInstallRoute } from '../lib/useInstall';
import { useT } from '../i18n/useT';

/**
 * The home-screen gate: rendered *instead of* everything else — before the
 * sign-in screen, so a phone that cannot run the app is never asked to
 * authenticate first.
 *
 * It appears only where it can be passed: production builds, on a touch
 * device, in a browser tab (lib/install.ts). A desktop browser and every dev
 * or preview build render the app as before.
 *
 * There is deliberately no "continue anyway": the point of the rule is that
 * the browser tab is not a supported surface, and an escape hatch would make
 * it one. What the screen owes the user instead is the way out, which is why
 * the iOS copy is the literal tap sequence rather than a shrug.
 */
export function InstallGateScreen() {
  const t = useT();
  const route = useInstallRoute();
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
        data-screen-label="installGate"
      >
        <BackgroundShapes />
        <div
          className="anim-fade-up"
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <img
            src="/assets/shift-mark.png"
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            style={{ width: 56, height: 56, borderRadius: 14, marginBottom: 4 }}
          />
          <span
            className="text-muted"
            style={{ fontSize: 'var(--text-body)', fontWeight: 600, letterSpacing: 0.4 }}
          >
            {t('install.kicker')}
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-heading)',
              fontSize: 'var(--text-display)',
              lineHeight: 1.2,
            }}
          >
            {t('install.title')}
          </h1>
          <p
            className="text-muted"
            style={{ margin: '0 0 18px', fontSize: 'var(--text-row)', lineHeight: 1.5 }}
          >
            {t('install.sub')}
          </p>

          <InstallSteps />

          <p
            className="text-muted"
            style={{ margin: '18px 0 0', fontSize: 'var(--text-caption)', lineHeight: 1.5 }}
          >
            {t('install.already')}
          </p>
        </div>

        {/* Only for iOS Safari, and only because the thing it points at is
            really there: the Share button sits in Safari's bottom toolbar, a
            few pixels below this arrow. Drawing it for any other browser
            would point at nothing. */}
        {route === 'ios-safari' && <SharePointer />}
      </div>
    </div>
  );
}

/** The arrow at the bottom edge, aimed at Safari's own Share button. */
function SharePointer() {
  const t = useT();
  return (
    <div
      className="install-nudge"
      style={{
        position: 'absolute',
        insetInline: 0,
        bottom: 'calc(10px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        color: 'var(--color-accent-300)',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600 }}>{t('install.pointer')}</span>
      <Icon name="arrowDown" size={26} strokeWidth={2.2} />
    </div>
  );
}
