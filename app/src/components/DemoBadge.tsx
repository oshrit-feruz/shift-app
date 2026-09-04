import { useDemoMode } from '../lib/DemoModeProvider';
import { useT } from '../i18n/useT';

/**
 * Displays a persistent badge identifying when demo mode is enabled.
 *
 * @returns The demo-data badge when demo mode is enabled, or `null` otherwise.
 */
export function DemoBadge() {
  const demo = useDemoMode();
  const t = useT();
  if (!demo) return null;
  return (
    <div
      style={{
        position: 'absolute',
        // Clear of the tab bar, which is 10px + safe area from the bottom and
        // about 64 tall. The same shelf BackToStepsPill uses, so the two
        // cannot overlap: that pill only appears mid-onboarding, and this
        // badge sits at the opposite edge of the row.
        bottom: 'calc(86px + env(safe-area-inset-bottom))',
        insetInlineStart: 16,
        zIndex: 45,
        pointerEvents: 'none',
        display: 'flex',
      }}
    >
      <span
        // A live region would be wrong: this does not announce a change, it
        // is a standing fact about the screen. The label carries the whole
        // sentence for a screen reader, where the two-word visual shorthand
        // has no card beside it to be read with.
        aria-label={t('demo.badgeAria')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 11px',
          borderRadius: 999,
          fontSize: 'var(--text-caption)',
          fontWeight: 600,
          letterSpacing: 'var(--track-micro)',
          color: 'var(--color-accent-200)',
          background: 'var(--acc-fill)',
          border: '1px solid var(--color-accent-700)',
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            flex: 'none',
          }}
        />
        {t('demo.badge')}
      </span>
    </div>
  );
}
