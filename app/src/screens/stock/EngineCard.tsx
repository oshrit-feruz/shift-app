import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { DetailRow } from '../../components/DetailRow';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { Tag } from '../../components/Tag';
import { useT } from '../../i18n/useT';
import { useLoadable } from '../../data/useLoadable';
import { fetchRankingRow } from '../../data/recoveryDetector';
import { money } from '../../lib/format';
import type { TagVariant } from '../../components/Tag';
import type { StringKey } from '../../i18n/strings';

/** The engine's verdict as a tag tone and a plain-language label. A lookup
 *  rather than chained ternaries so an added verdict is one line here and
 *  cannot silently fall through to the wrong colour. The raw BUY/WATCH/SKIP
 *  words are engine vocabulary and never reach the screen: "BUY" in
 *  particular would read as an instruction, which this is not. */
const SIGNAL_TONE: Record<'BUY' | 'WATCH' | 'SKIP', TagVariant> = {
  BUY: 'up',
  WATCH: 'neutral',
  SKIP: 'down',
};

const SIGNAL_LABEL: Record<'BUY' | 'WATCH' | 'SKIP', StringKey> = {
  BUY: 'stock.sigBuy',
  WATCH: 'stock.sigWatch',
  SKIP: 'stock.sigSkip',
};

/**
 * Today's rules check for this ticker, read from the daily mirrored ranking
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
            {r?.signal && <Tag variant={SIGNAL_TONE[r.signal]}>{t(SIGNAL_LABEL[r.signal])}</Tag>}
          </div>

          {r === null ? (
            <EmptyState>{t('stock.notRanked')}</EmptyState>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Only figures a reader can place. The engine's drawdown and
                  composite score are deliberately left out: they look precise
                  without telling anyone what to do with them. */}
              <DetailRow
                label={t('stock.high52w')}
                value={<Num>{r.high52w === null ? '—' : money(r.high52w)}</Num>}
              />
              <p
                className="text-muted"
                style={{ fontSize: 'var(--text-caption)', margin: '4px 0 0', lineHeight: 1.5 }}
              >
                {t('stock.checkedDaily')}
              </p>
            </div>
          )}
        </Card>
      )}
    </DataState>
  );
}
