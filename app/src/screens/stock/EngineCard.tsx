import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { Tag } from '../../components/Tag';
import { useT } from '../../i18n/useT';
import { useLoadable } from '../../data/useLoadable';
import { fetchRankingRow } from '../../data/recoveryDetector';
import { money, pct } from '../../lib/format';

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
              <Tag variant={r.signal === 'BUY' ? 'up' : r.signal === 'SKIP' ? 'down' : 'neutral'}>
                {r.signal}
              </Tag>
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
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    fontSize: 12.5,
                    padding: '5px 0',
                    borderTop: '1px solid var(--color-divider)',
                  }}
                >
                  <span className="text-muted">{k}</span>
                  <Num>{v}</Num>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </DataState>
  );
}
