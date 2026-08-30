import type { ReactNode } from 'react';
import { Card } from './Card';
import { useT } from '../i18n/useT';
import type { StringKey } from '../i18n/strings';

/**
 * What a fabricated feature shows when sample data is off.
 *
 * Deliberately NOT DataState's 'unavailable' branch. That headline says the
 * data is not available *right now* — a claim about the world, an outage the
 * reader might retry. This is a claim about the app: the feature has no real
 * source behind it and never had one, so there is nothing to retry and
 * nothing being withheld. Two different sentences, two different components.
 *
 * `feature` is a StringKey rather than a plain string so the name here is the
 * same words the feature's own heading uses, in both languages, and cannot
 * drift from it when one of them is reworded.
 *
 * The Hebrew is an appositive — "{name} — רק בדמו" — rather than a sentence
 * with a verb. A verb would have to agree with the name, and the names run
 * across masculine and feminine, singular and plural (חלוקה, התראות,
 * מובילי שוק), with one of them ending in an adverb that cannot take a
 * predicate at all ("התיק שלך היום"). One interpolated template cannot be
 * made correct for all of them; this construction needs no agreement.
 */
export function DemoOnly({
  feature,
  card = true,
  children,
}: {
  /** The i18n key naming the feature — reuse its own title key. */
  feature: StringKey;
  /** false when the caller already sits inside a Card or a Sheet. */
  card?: boolean;
  /** Real controls that must stay reachable, e.g. "＋ Portfolio". */
  children?: ReactNode;
}) {
  const t = useT();
  const line = (
    <p className="text-muted" style={{ fontSize: 16.5, margin: 0, lineHeight: 1.5 }}>
      {t('demo.only', { feature: t(feature) })}
    </p>
  );
  if (!card) {
    return children ? (
      <>
        {line}
        {children}
      </>
    ) : (
      line
    );
  }
  return (
    <Card padding={13} gap={9}>
      {line}
      {children}
    </Card>
  );
}
