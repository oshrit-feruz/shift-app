import { Card } from './Card';
import { DEMO_FLAGS } from '../data/demoAdapter';
import { useT } from '../i18n/useT';

/**
 * The label that keeps showcase mode honest.
 *
 * Renders nothing unless showcase mode is on, and sits directly above the
 * figures it describes rather than in a settings screen the reader is not
 * looking at. Invented numbers are only ever acceptable while they are
 * announced as invented — this component is that announcement, so any screen
 * that reads showcase data must render it.
 */
export function DemoBanner() {
  const t = useT();
  if (!DEMO_FLAGS.showcase) return null;
  return (
    <Card padding={12} gap={0}>
      <span style={{ fontSize: 18.5, color: 'var(--color-warn, var(--color-text))' }}>
        {t('demo.showcase')}
      </span>
    </Card>
  );
}
