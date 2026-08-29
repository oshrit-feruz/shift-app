import { Card, CardTitle } from '../../components/Card';
import { DataState } from '../../components/DataState';
import { DetailRow } from '../../components/DetailRow';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchFundamentals } from '../../data/fundamentals';
import { fetchTickerEarnings } from '../../data/earnings';
import { useDemoMode } from '../../lib/DemoModeProvider';
import { EmptyState } from '../../components/DataState';
import { Tag } from '../../components/Tag';
import type { EarningsRow } from '../../data/types';
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
            <Num size={27} style={{ fontFamily: 'var(--font-heading)', lineHeight: 1 }}>
              {d.revenue === null ? '—' : compactMoney(d.revenue)}
            </Num>
            {d.yoyPct !== null && (
              <Num size={17} style={{ color: signalColor(d.yoyPct) }}>
                {pct(d.yoyPct, 1)}
              </Num>
            )}
          </div>
          <div className="text-muted" style={{ fontSize: 'var(--text-caption)', marginTop: -4 }}>
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
              <DetailRow
                key={k}
                label={k}
                /* The date is NOT wrapped in <Num>: a localized Hebrew date
                   ("25 בפבר׳ 2026") is Hebrew text, and forcing LTR isolation
                   on it reverses the word order on screen. Only the Latin form
                   code needs isolating, and it needs its own — sharing one
                   wrapper with the date made the two collide and render as
                   "K-בפבר׳ 2026 · 10 25". */
                value={
                  <>
                    <span>{date}</span>
                    {form && (
                      <>
                        <span className="text-muted">·</span>
                        <Num>{form}</Num>
                      </>
                    )}
                  </>
                }
              />
            ))}
          </div>

          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5, margin: 0 }}>
            {t('stock.reportsNote')}
            {d.source ? ` · ${d.source}` : ''}
          </p>
        </Card>
      )}
    </DataState>
  );
}

/**
 * Reported quarters for one ticker, newest first, from the earnings calendar.
 *
 * A separate card and a separate request from the filed-revenue one above on
 * purpose: they answer different questions from different sources (SEC EDGAR
 * revenue vs. consensus EPS and the surprise against it), and either can be
 * unavailable without taking the other down with it. Folding them together
 * would mean one provider having a bad day blanks the whole tab.
 *
 * A quarter that has not been reported yet carries no `actual` — it is shown
 * as scheduled rather than hidden, because "when is the next report" is one
 * of the questions this card exists to answer.
 */
export function EarningsHistory({ ticker }: { ticker: string }) {
  const t = useT();
  const demo = useDemoMode();
  const { language } = useTheme();
  const e = useLoadable(() => fetchTickerEarnings(ticker), [ticker, demo]);

  return (
    <DataState state={e.state} onRetry={e.retry} skeleton={<SkeletonCard height={190} lines={4} />}>
      {(page) => {
        const rows = page.rows;
        // Newest first: the most recent quarter is what someone opened this
        // for, and older ones are context below it.
        const sorted = [...rows].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
        return (
          <Card padding={12} gap={8}>
            <CardTitle>{t('stock.history')}</CardTitle>
            {sorted.length === 0 ? (
              <EmptyState>{t('stock.historyEmpty')}</EmptyState>
            ) : (
              sorted.map((row) => <QuarterRow key={row.reportDate} row={row} language={language} t={t} />)
            )}
          </Card>
        );
      }}
    </DataState>
  );
}

/** Beat / miss / in line — zero is none of the first two. */
export function surpriseLabel(
  pctValue: number,
  t: (k: 'stock.beat' | 'stock.miss' | 'stock.inline') => string,
): string {
  if (pctValue > 0) return t('stock.beat');
  if (pctValue < 0) return t('stock.miss');
  return t('stock.inline');
}

function QuarterRow({
  row,
  language,
  t,
}: {
  row: EarningsRow;
  language: 'en' | 'he';
  t: (k: 'stock.upcoming' | 'stock.epsEst' | 'stock.beat' | 'stock.miss' | 'stock.inline') => string;
}) {
  // No `actual` means the quarter is scheduled, not that data is missing.
  const reported = row.actual !== null;
  return (
    <div style={{ paddingTop: 7, borderTop: '1px solid var(--color-divider)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--text-body)' }}>{isoDate(row.reportDate, language)}</span>
        {row.timing && (
          <Num size={14.5} style={{ color: 'var(--muted)' }}>
            {row.timing}
          </Num>
        )}
        {!reported && (
          <Tag variant="outline" fontSize={14.5}>
            {t('stock.upcoming')}
          </Tag>
        )}
        <span style={{ flex: 1 }} />
        {/* Exactly meeting the estimate is its own outcome. `>= 0` called it a
            beat, so a company that landed precisely on consensus read as
            "0.0% מעל הצפי" — a claim about the result that is simply not
            true. Zero gets its own label and the neutral colour. */}
        {reported && row.surprisePct !== null && (
          <Num
            size={18.5}
            style={{ color: row.surprisePct === 0 ? undefined : signalColor(row.surprisePct) }}
          >
            {`${pct(row.surprisePct, 1)} ${surpriseLabel(row.surprisePct, t)}`}
          </Num>
        )}
      </div>
      <div className="text-muted" style={{ fontSize: 'var(--text-caption)', marginTop: 2, display: 'flex', gap: 6 }}>
        <Num>{reported ? row.actual!.toFixed(2) : '—'}</Num>
        <span>·</span>
        <span>
          {t('stock.epsEst')} <Num>{row.estimate === null ? '—' : row.estimate.toFixed(2)}</Num>
        </span>
      </div>
    </div>
  );
}
