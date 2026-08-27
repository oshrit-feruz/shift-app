import { useState } from 'react';
import { Card, CardTitle } from '../../components/Card';
import { Chip, ChipRail } from '../../components/Chip';
import { DataState, EmptyState } from '../../components/DataState';
import { Skeleton } from '../../components/Skeleton';
import { Num } from '../../components/Num';
import { Tag } from '../../components/Tag';
import { useT } from '../../i18n/useT';
import { useTheme } from '../../theme/ThemeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchWeekEarnings } from '../../data/earnings';
import { isoDate, pct, signalColor } from '../../lib/format';
import type { EarningsRow } from '../../data/types';

/**
 * This week's earnings calendar, from real data.
 *
 * The week is anchored Monday–Sunday (see data/earnings.ts) rather than "the
 * next seven days", so the day strip reads as a calendar week and Monday
 * stays Monday as the week goes on.
 *
 * A week with no reports is a legitimate empty state, not an error — plenty
 * of weeks outside reporting season genuinely have none. The provider being
 * down is 'unavailable' with a retry, and the two look different on purpose.
 */
export function CalendarTab({ watchlist }: { watchlist: string[] }) {
  const t = useT();
  const { language } = useTheme();
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const cal = useLoadable(() => fetchWeekEarnings(), []);

  return (
    <DataState
      state={cal.state}
      onRetry={cal.retry}
      skeleton={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} width={68} height={62} radius="var(--radius-md)" />
            ))}
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} padding="4px 0" gap={0}>
              <div style={{ padding: '9px 13px 6px' }}>
                <Skeleton width={90} height={11} />
              </div>
              {Array.from({ length: 2 }, (_, j) => (
                <div key={j} style={{ display: 'flex', gap: 10, padding: '10px 13px', borderTop: '1px solid var(--color-divider)' }}>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="38%" height={11} />
                    <Skeleton width="62%" height={9} />
                  </span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      }
    >
      {(rows) => {
        // Filter before grouping, so a filter that empties a day drops that
        // day's heading too rather than leaving a header with nothing under it.
        const filtered = onlyWatchlist ? rows.filter((r) => watchlist.includes(r.ticker)) : rows;

        const byDate = new Map<string, EarningsRow[]>();
        for (const r of filtered) {
          const list = byDate.get(r.reportDate);
          if (list) list.push(r);
          else byDate.set(r.reportDate, [r]);
        }
        const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
        const shown = day ? days.filter(([d]) => d === day) : days;

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <ChipRail>
              <Chip active={!onlyWatchlist} onClick={() => setOnlyWatchlist(false)}>
                {t('earn.allCompanies')}
              </Chip>
              <Chip active={onlyWatchlist} onClick={() => setOnlyWatchlist(true)}>
                {t('earn.myWatchlist')}
              </Chip>
            </ChipRail>

            {/* Day strip. Tapping a day filters to it; tapping it again
                clears, since a calendar's day picker toggles rather than
                being a one-way trip. */}
            {days.length > 0 && (
              <ChipRail>
                {days.map(([d, events]) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDay(day === d ? null : d)}
                    style={{
                      flex: 'none',
                      minWidth: 68,
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${day === d ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                      background: day === d ? 'var(--color-accent-900)' : 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div className="text-muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                      {weekdayLabel(d, language)}
                    </div>
                    <Num size={17} style={{ fontFamily: 'var(--font-heading)' }}>
                      {d.slice(8)}
                    </Num>
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      <Num>{String(events.length)}</Num>
                    </div>
                  </button>
                ))}
              </ChipRail>
            )}

            {shown.length === 0 ? (
              <Card padding={12} gap={8}>
                <EmptyState>{t(onlyWatchlist ? 'earn.noneMatch' : 'earn.weekEmpty')}</EmptyState>
              </Card>
            ) : (
              shown.map(([d, events]) => (
                <Card key={d} padding="4px 0" gap={0}>
                  <div style={{ padding: '9px 13px 4px' }}>
                    <CardTitle>{isoDate(d, language)}</CardTitle>
                  </div>
                  {events.map((e) => (
                    <EarningsRowView key={`${e.ticker}-${e.reportDate}`} row={e} t={t} />
                  ))}
                </Card>
              ))
            )}
          </div>
        );
      }}
    </DataState>
  );
}

/** Short weekday name for a bare YYYY-MM-DD, formatted in UTC so it does not
 *  shift a day for a viewer west of UTC. */
function weekdayLabel(iso: string, language: 'en' | 'he'): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}

function EarningsRowView({
  row,
  t,
}: {
  row: EarningsRow;
  t: (k: 'stock.epsEst' | 'stock.upcoming') => string;
}) {
  // No `actual` means the quarter has not been reported yet — the normal
  // state for anything ahead on the calendar, not missing data.
  const reported = row.actual !== null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 13px',
        borderTop: '1px solid var(--color-divider)',
      }}
    >
      <Tag variant="accent" fontSize={12}>
        {row.ticker}
      </Tag>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="text-muted" style={{ fontSize: 12.5, display: 'flex', gap: 6 }}>
          <span>
            {t('stock.epsEst')} <Num>{row.estimate === null ? '—' : row.estimate.toFixed(2)}</Num>
          </span>
          {row.timing && (
            <>
              <span>·</span>
              <Num>{row.timing}</Num>
            </>
          )}
        </span>
      </span>
      {reported && row.surprisePct !== null ? (
        <Num size={13} style={{ color: signalColor(row.surprisePct) }}>
          {pct(row.surprisePct, 1)}
        </Num>
      ) : (
        <Tag variant="outline" fontSize={11.5}>
          {t('stock.upcoming')}
        </Tag>
      )}
    </div>
  );
}
