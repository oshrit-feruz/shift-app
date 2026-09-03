import { useTheme } from '../theme/ThemeProvider';

/**
 * A failed action, stated in place: what did not happen, and why.
 *
 * The `reason` is the bilingual message the data layer produced, which is
 * always specific — "sign in again" and "try again in a moment" ask different
 * things of the reader, and a component that flattened them to "something went
 * wrong" would throw away the part that tells them what to do.
 *
 * Renders nothing when there is no reason, so a caller can pass its error
 * state straight in without a conditional of its own.
 */
export function ReasonNote({
  title,
  reason,
}: Readonly<{ title: string; reason: { en: string; he: string } | null }>) {
  const { language } = useTheme();
  if (!reason) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 'var(--text-row)' }}>{title}</span>
      <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
        {reason[language]}
      </span>
    </div>
  );
}
