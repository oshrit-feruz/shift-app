import { Card, CardTitle } from '../../components/Card';
import { DataState } from '../../components/DataState';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchFundamentals } from '../../data/fundamentals';
import { compactMoney, isoDate, pct, signalColor } from '../../lib/format';

/**
 * The "דוחות" tab: filed results for one ticker, straight from SEC EDGAR via
 * the engine.
 *
 * Branches purely on the engine's own `status` field (handled in
 * data/fundamentals.ts) — a ticker with no filings on record is a normal,
 * expected answer for an ETF or a non-US listing, and reads as an honest
 * "no filed figures" rather than as a malfunction.
 *
 * The filing date and form are rendered alongside the number, never
 * optionally: the engine documents this figure as display-only and NOT
 * point-in-time, so "revenue was $X" on its own would imply a currency the
 * number does not have. "$X, as filed on this date in this form" is the
 * honest version of the same fact.
 *
 * The load can take up to ~60s on a cold Render instance, so this leans on
 * DataState's skeleton rather than a spinner that would look stuck.
 */
export function ReportsTab({ ticker }: { ticker: string }) {
  const t = useT();
  const { language } = useTheme();
  const f = useLoadable(() => fetchFundamentals(ticker), [ticker]);

  return (
    <DataState state={f.state} onRetry={f.retry} skeleton={<SkeletonCard height={168} lines={3} />}>
      {(d) => (
        <Card padding={12} gap={9}>
          <CardTitle>{t('stock.reportsTitle')}</CardTitle>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, flexWrap: 'wrap' }}>
            <Num size={26} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
              {d.revenue === null ? '—' : compactMoney(d.revenue)}
            </Num>
            {d.yoyPct !== null && (
              <Num size={14} style={{ color: signalColor(d.yoyPct) }}>
                {pct(d.yoyPct, 1)}
              </Num>
            )}
          </div>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: -4 }}>
            {t('stock.revenue')}
            {d.yoyPct !== null ? ` · ${t('stock.yoy')}` : ''}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(
              [
                [t('stock.periodEnd'), isoDate(d.periodEnd, language), null],
                [t('stock.filedOn'), isoDate(d.filed, language), d.form],
              ] as const
            ).map(([k, date, form]) => (
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
                {/* The date is NOT wrapped in <Num>: a localized Hebrew date
                    ("25 בפבר׳ 2026") is Hebrew text, and forcing LTR
                    isolation on it reverses the word order on screen. Only
                    the Latin form code needs isolating, and it needs its own
                    — sharing one wrapper with the date made the two collide
                    and render as "K-בפבר׳ 2026 · 10 25". */}
                <span style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                  <span>{date}</span>
                  {form && (
                    <>
                      <span className="text-muted">·</span>
                      <Num>{form}</Num>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>

          <p className="text-muted" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>
            {t('stock.reportsNote')}
            {d.source ? ` · ${d.source}` : ''}
          </p>
        </Card>
      )}
    </DataState>
  );
}
