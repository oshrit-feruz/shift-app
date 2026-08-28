import { useT } from '../i18n/useT';

/**
 * The standing label on screens whose figures are sample data.
 *
 * Prices, day-change percentages, charts, market caps and portfolio totals in
 * this app still come from `demoAdapter` — plausible numbers, invented. The
 * live surfaces (news, earnings, the Recovery Detector mirror) are real, and
 * a reader looking at one screen has no way to tell which kind they are on.
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
