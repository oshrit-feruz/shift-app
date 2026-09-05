import { useDemoMode } from '../lib/DemoModeProvider';
import { useT } from '../i18n/useT';

/**
 * The standing "נתוני דמו" marker, shown on every screen whenever the
 * sample-data switch is on.
 *
 * WHY IT EXISTS. Sample data used to be the default, and the app leaned on
 * per-feature labels to say so. Now that it is off unless someone turns it
 * on, the situation it marks is different: a screen full of figures that
 * look real, in front of someone who may not be the person who flipped the
 * switch — a client at a walkthrough, whoever picks the phone up next. The
 * per-feature labels still say which cards are fabricated; this says the app
 * as a whole is in demo, without having to read a card.
 *
 * It carries the same two words as the switch itself (i18n more.demoData),
 * so a reader who wonders what it means finds the thing that turns it off
 * under the same name.
 *
 * Placed beside the tab bar rather than inside the scroll area on purpose:
 * it must not scroll away, because a claim about what the figures are is
 * worth exactly as much as its visibility. It sits above the bar and below
 * sheets (z-index 45, between the header's 40 and the bar's 50), and takes
 * no pointer events, so it can never swallow a tap meant for the row under
 * it.
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
