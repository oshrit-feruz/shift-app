import { useState } from 'react';
import { Card, CardTitle } from '../../components/Card';
import { DataState, EmptyState } from '../../components/DataState';
import { SegmentedControl } from '../../components/SegmentedControl';
import { SkeletonCard } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { Tag } from '../../components/Tag';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchFinancials } from '../../data/financials';
import type { FinancialStatementRow } from '../../data/types';
import type { StringKey } from '../../i18n/strings';
import { compactMoney, isoDate, signalColor } from '../../lib/format';

type Span = 'annual' | 'quarterly';

/**
 * The lines shown, in statement order: income statement, cash flow, balance
 * sheet. `eps` is the one figure that is per share rather than a total.
 */
const LINES: Array<{ key: keyof FinancialStatementRow & string; label: StringKey; perShare?: boolean }> = [
  { key: 'revenue', label: 'fin.revenue' },
  { key: 'grossProfit', label: 'fin.grossProfit' },
  { key: 'operatingIncome', label: 'fin.operatingIncome' },
  { key: 'netIncome', label: 'fin.netIncome' },
  { key: 'eps', label: 'fin.eps', perShare: true },
  { key: 'operatingCashFlow', label: 'fin.operatingCashFlow' },
  { key: 'assets', label: 'fin.assets' },
  { key: 'liabilities', label: 'fin.liabilities' },
  { key: 'equity', label: 'fin.equity' },
  { key: 'cash', label: 'fin.cash' },
];

/**
 * A company's filed statements — the numbers behind the "reports" the tab
 * is named for — as a table of periods, newest first, annual or quarterly.
 *
 * Every cell is a figure the company filed, and the column says in which
 * filing. A line the filing lacks is "—", and so is a whole line no filing
 * has: it is left in place rather than hidden, because "this company files
 * no gross profit" is itself something a reader learns from the table.
 *
 * The quarterly view has no fourth quarters and says so under the table:
 * a 10-K carries the year, not Q4, and computing Q4 from the year less
 * three quarters would be a figure nobody filed.
 */
export function FinancialStatements({ ticker }: Readonly<{ ticker: string }>) {
  const t = useT();
  const { language } = useTheme();
  const [span, setSpan] = useState<Span>('annual');
  const f = useLoadable(() => fetchFinancials(ticker), [ticker]);

  return (
    <DataState state={f.state} onRetry={f.retry} skeleton={<SkeletonCard height={260} lines={6} />}>
      {(d) => {
        const rows = span === 'annual' ? d.annual : d.quarterly;
        return (
          <Card padding={12} gap={9}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CardTitle>{t('stock.statements')}</CardTitle>
              <Tag variant="outline" fontSize={11}>
                SEC
              </Tag>
            </div>
            {!d.listed ? (
              <EmptyState>{t('stock.notSecListed')}</EmptyState>
            ) : (
              <>
                <SegmentedControl<Span>
                  options={[
                    { value: 'annual', label: t('stock.annual') },
                    { value: 'quarterly', label: t('stock.quarterly') },
                  ]}
                  value={span}
                  onChange={setSpan}
                  fontSize={14.5}
                />
                {rows.length === 0 ? (
                  <EmptyState>{t('stock.statementsEmpty')}</EmptyState>
                ) : (
                  <StatementTable rows={rows} span={span} language={language} />
                )}
                <p
                  className="text-muted"
                  style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5, margin: 0 }}
                >
                  {t('stock.statementsNote')}
                  {span === 'quarterly' && rows.length > 0 ? ` ${t('stock.q4Note')}` : ''}
                </p>
              </>
            )}
          </Card>
        );
      }}
    </DataState>
  );
}

/** The period a column is: "FY2025", or "Q3 FY2026", from the filer's own labels. */
function periodLabel(row: FinancialStatementRow, span: Span): string {
  const year = row.fy ?? Number(row.periodEnd.slice(0, 4));
  if (span === 'annual') return `FY${year}`;
  return row.fp ? `${row.fp} FY${year}` : row.periodEnd;
}

/**
 * The table itself. Wide by nature — one column per period — so it scrolls
 * inside its own container rather than pushing the page; the line labels
 * stay put at the leading edge.
 */
function StatementTable({
  rows,
  span,
  language,
}: Readonly<{ rows: FinancialStatementRow[]; span: Span; language: 'en' | 'he' }>) {
  const t = useT();
  const cell = { padding: '6px 8px', whiteSpace: 'nowrap' as const, textAlign: 'end' as const };
  return (
    <div style={{ overflowX: 'auto', margin: '0 -12px', padding: '0 12px' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-caption)', minWidth: '100%' }}>
        <thead>
          <tr>
            <th
              style={{
                ...cell,
                textAlign: 'start',
                position: 'sticky',
                insetInlineStart: 0,
                background: 'var(--color-surface)',
              }}
            />
            {rows.map((row) => (
              <th key={row.periodEnd} style={{ ...cell, fontWeight: 600, verticalAlign: 'bottom' }}>
                <Num>{periodLabel(row, span)}</Num>
                <span className="text-muted" style={{ display: 'block', fontWeight: 400 }}>
                  {isoDate(row.periodEnd, language)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LINES.map((line) => (
            <tr key={line.key} style={{ borderTop: '1px solid var(--color-divider)' }}>
              <td
                className="text-muted"
                style={{
                  ...cell,
                  textAlign: 'start',
                  position: 'sticky',
                  insetInlineStart: 0,
                  background: 'var(--color-surface)',
                }}
              >
                {t(line.label)}
              </td>
              {rows.map((row) => {
                const v = row[line.key];
                const n = typeof v === 'number' ? v : null;
                return (
                  <td
                    key={row.periodEnd}
                    style={{ ...cell, color: n !== null && n < 0 ? signalColor(n) : undefined }}
                  >
                    <Num>{n === null ? '—' : line.perShare ? n.toFixed(2) : compactMoney(n)}</Num>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--color-divider)' }}>
            <td
              className="text-muted"
              style={{
                ...cell,
                textAlign: 'start',
                position: 'sticky',
                insetInlineStart: 0,
                background: 'var(--color-surface)',
              }}
            />
            {rows.map((row) => (
              <td key={row.periodEnd} className="text-muted" style={{ ...cell, fontSize: 11 }}>
                {t('stock.filedAs', { date: isoDate(row.filed, language), form: row.form })}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
