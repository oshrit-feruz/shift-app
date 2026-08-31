import { useT } from '../i18n/useT';

/**
 * The green "live" pill — a lit dot and the word.
 *
 * Deliberately not a Tag variant: every other tag in the system is a static
 * label, and this one is a state. It is also the only green thing on a screen
 * where green means "up", so it is used in exactly one place — the radar's own
 * header — and never as decoration on something that is not live.
 *
 * The dot breathes rather than blinking: a hard on/off in the corner of a
 * screen full of numbers reads as an error indicator.
 */
export function LiveBadge() {
  const t = useT();
  return (
    <span className="live-badge">
      <span className="live-dot" aria-hidden="true" />
      {t('rec.radarLive')}
    </span>
  );
}
