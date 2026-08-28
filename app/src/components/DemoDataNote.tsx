import { useT } from '../i18n/useT';

/**
 * The standing label on screens whose figures are sample data.
 *
 * Prices are no longer among them: they come from the daily mirror and are
 * real (see data/recoveryDetector.ts). Day-change percentages, volumes,
 * charts, market caps and portfolio totals still come from `demoAdapter` —
 * plausible numbers, invented — and a reader looking at one screen has no way
 * to tell which kind sits in which row. The note names both halves for that
 * reason; a blanket "everything here is sample data" would now be false, and
 * would teach the reader to discount a real price.
 *
 * So each screen that renders sample figures says so, once, in place. It is
 * one muted line rather than a warning card because it should be readable
 * and permanent, not alarming — but it is never omitted, because a plausible
 * number that a reader takes for a real one is the failure this app is built
 * to avoid.
 */
export function DemoDataNote() {
  const t = useT();
  return (
    <p className="text-muted" style={{ fontSize: 12, margin: 0, padding: '0 2px', lineHeight: 1.45 }}>
      {t('demo.pricesNote')}
    </p>
  );
}
