import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { DetailRow } from '../../components/DetailRow';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { Tag } from '../../components/Tag';
import { useT } from '../../i18n/useT';
import { useLoadable } from '../../data/useLoadable';
import { fetchRankingRow } from '../../data/recoveryDetector';
import { money, pct } from '../../lib/format';
import type { TagVariant } from '../../components/Tag';

/** The engine's verdict as a tag tone. A lookup rather than chained
 *  ternaries so an added verdict is one line here and cannot silently fall
 *  through to the wrong colour. */
const SIGNAL_TONE: Record<'BUY' | 'WATCH' | 'SKIP', TagVariant> = {
  BUY: 'up',
  WATCH: 'neutral',
  SKIP: 'down',
};

/**
 * The engine's own view of this ticker, read from the daily mirrored ranking
 * (no Render round trip — see data/recoveryDetector.ts).
 *
 * Three outcomes, and the middle one is the reason this is a card rather
 * than part of the page header:
 * - unavailable → the snapshot is missing or stale; DataState says which.
 * - ok(null)    → the snapshot is fine, this stock just is not in the
 *   100-name ranking. That is the common case for most symbols and is not a
 *   failure, so it reads as "not covered today" with no retry — there is
 *   nothing to retry.
 * - ok(row)     → the real figures.
 *
 * Every number here is nullable at the source and renders as "—" when
 * absent. None of them are back-filled from the demo adapter: this card is
 * either showing what the engine actually published or saying it has
 * nothing, which is the whole point of it being separate from the
 * demo-backed statistics above.
 */
export function EngineCard({ ticker }: { ticker: string }) {
  const t = useT();
  const row = useLoadable(() => fetchRankingRow(ticker), [ticker]);

  return (
    <DataState state={row.state} onRetry={row.retry} skeleton={<SkeletonCard height={120} lines={2} />}>
      {(r) => (
        <Card padding={12} gap={8}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <CardTitle>{t('stock.engineTitle')}</CardTitle>
            {r?.signal && (
              <Tag variant={SIGNAL_TONE[r.signal]}>{r.signal}</Tag>
            )}
          </div>

          {r === null ? (
            <EmptyState>{t('stock.notRanked')}</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(
                [
                  [t('stock.drawdown'), r.drawdownPct === null ? '—' : pct(-Math.abs(r.drawdownPct), 1)],
                  [t('stock.high52w'), r.high52w === null ? '—' : money(r.high52w)],
                  [t('stock.score'), r.compositeScore === null ? '—' : r.compositeScore.toFixed(3)],
                ] as const
              ).map(([k, v]) => (
                <DetailRow key={k} label={k} value={<Num>{v}</Num>} />
              ))}
            </div>
          )}
        </Card>
      )}
    </DataState>
  );
}
