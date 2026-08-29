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
import { useDemoMode } from '../../lib/DemoModeProvider';
import { useDispatch } from '../../state/appState';
import { fetchWeekEarnings } from '../../data/earnings';
import { isoDate, pct, signalColor } from '../../lib/format';
import { ROW_BUTTON_STYLE } from '../../lib/rowButton';
import type { EarningsRow } from '../../data/types';

/**
 * The week ahead's earnings calendar, from real data.
 *
 * The window runs from today (see data/earnings.ts), not from Monday: the
 * provider's market-wide feed carries only reports that have not happened
 * yet, so a Monday-anchored week spent most of itself in the past — by
 * Friday, four of its seven days could not be filled by anything.
 *
 * A week with no reports is a legitimate empty state, not an error — plenty
 * of weeks outside reporting season genuinely have none. The provider being
 * down is 'unavailable' with a retry, and the two look different on purpose.
 */
export function CalendarTab({ watchlist }: { watchlist: string[] }) {
  const t = useT();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const demo = useDemoMode();
  // `demo` is in the deps so flipping the switch re-reads at once, rather
  // than leaving the previous week's rows on screen until the next visit.
  const cal = useLoadable(() => fetchWeekEarnings(), [demo]);

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
                <div
                  key={j}
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '10px 13px',
                    borderTop: '1px solid var(--color-divider)',
                  }}
                >
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
      {(page) => {
        const rows = page.rows;
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
        const selected = activeDay(day, [...byDate.keys()]);
        const shown = selected ? days.filter(([d]) => d === selected) : days;

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
                    onClick={() => setDay(selected === d ? null : d)}
                    style={{
                      flex: 'none',
                      minWidth: 68,
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${selected === d ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                      background: selected === d ? 'var(--color-accent-900)' : 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      className="text-muted"
                      style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '.06em' }}
                    >
                      {weekdayLabel(d, language)}
                    </div>
                    <Num size={20} style={{ fontFamily: 'var(--font-heading)' }}>
                      {d.slice(8)}
                    </Num>
                    <div className="text-muted" style={{ fontSize: 14 }}>
                      <Num>{String(events.length)}</Num>
                    </div>
                  </button>
                ))}
              </ChipRail>
            )}

            {/* The provider's market-wide feed carries only reports that
                have not happened yet. Left unsaid, a reader who knows a
                company reported on Monday would read its absence — or a
                "scheduled" row — as the app being wrong rather than the feed
                being forward-looking.

                Not in demo mode: there the rows deliberately include
                reported results, so this sentence would be false — and a
                caveat that does not match what is on screen teaches a reader
                to stop reading the caveats. */}
            {!demo && (
              <span className="text-muted" style={{ fontSize: 15.5, padding: '0 2px' }}>
                {t('earn.scheduledOnly')}
              </span>
            )}

            {/* Say it plainly when the endpoint had more than it sent: a
                partial week rendered as the whole week is the quiet kind of
                inaccuracy this app exists to avoid. */}
            {page.truncated && (
              <Card padding={12} gap={0}>
                <span className="text-muted" style={{ fontSize: 15.5 }}>
                  {t('earn.truncated', { shown: rows.length, total: page.totalAvailable })}
                </span>
              </Card>
            )}

            {shown.length === 0 ? (
              <Card padding={12} gap={8}>
                {/* "Nothing matches" is a claim about the whole week, and it
                    is only ours to make when we have the whole week. On a
                    truncated response a watched ticker may sit in the rows
                    that were dropped, so say what is actually known. */}
                <EmptyState>{t(emptyMessageKey(onlyWatchlist, page.truncated))}</EmptyState>
              </Card>
            ) : (
              shown.map(([d, events]) => (
                <Card key={d} padding="4px 0" gap={0}>
                  <div style={{ padding: '9px 13px 4px' }}>
                    <CardTitle>{isoDate(d, language)}</CardTitle>
                  </div>
                  {events.map((e) => (
                    <EarningsRowView
                      key={`${e.ticker}-${e.reportDate}`}
                      row={e}
                      t={t}
                      onOpen={() => dispatch({ type: 'openStock', ticker: e.ticker })}
                    />
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

/**
 * The day selection that is still real, given the days actually on offer.
 *
 * A day picked before the scope changed can vanish from the filtered week —
 * switch to the watchlist and Tuesday may no longer carry a report. Keeping
 * that selection leaves the day strip with no chip highlighted and the list
 * empty: a filter is still applied and nothing on screen says so, which is
 * an empty screen the reader cannot explain or undo. A selection that is no
 * longer offered is therefore no selection.
 */
export function activeDay(day: string | null, available: string[]): string | null {
  return day !== null && available.includes(day) ? day : null;
}

/**
 * Which empty state is honest here.
 *
 * The filtered-to-nothing case depends on whether the week is complete: with
 * every row in hand, "no match" is a fact; with a truncated response it is a
 * guess dressed as one, because the ticker may be in the rows that were
 * dropped.
 */
export function emptyMessageKey(
  onlyWatchlist: boolean,
  truncated: boolean,
): 'earn.noneMatch' | 'earn.noneInShown' | 'earn.weekEmpty' {
  if (!onlyWatchlist) return 'earn.weekEmpty';
  return truncated ? 'earn.noneInShown' : 'earn.noneMatch';
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
  onOpen,
}: {
  row: EarningsRow;
  t: (k: 'stock.epsEst' | 'stock.upcoming') => string;
  onOpen: () => void;
}) {
  // No `actual` means the quarter has not been reported yet — the normal
  // state for anything ahead on the calendar, not missing data.
  const reported = row.actual !== null;
  return (
    // A button, not a div with a click handler: the row navigates, so it has
    // to be reachable and operable from the keyboard and announced as an
    // action. `type="button"` because this sits inside no form and must not
    // ever submit one.
    <button
      type="button"
      onClick={onOpen}
      style={{ ...ROW_BUTTON_STYLE, padding: '10px 13px', borderTop: '1px solid var(--color-divider)' }}
    >
      <Tag variant="accent" fontSize={15}>
        {row.ticker}
      </Tag>
      <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="text-muted" style={{ fontSize: 15.5, display: 'flex', gap: 6 }}>
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
      {/* Branch on REPORTED first. A quarter that has been reported but whose
          surprise figure is unavailable is still reported — labelling it
          "scheduled" would state a falsehood about a company that has already
          published. Missing surprise renders as the actual EPS, or an em dash
          when even that is absent. */}
      {reported ? (
        <Num size={16} style={{ color: row.surprisePct === null ? undefined : signalColor(row.surprisePct) }}>
          {row.surprisePct === null ? row.actual!.toFixed(2) : pct(row.surprisePct, 1)}
        </Num>
      ) : (
        <Tag variant="outline" fontSize={14.5}>
          {t('stock.upcoming')}
        </Tag>
      )}
    </button>
  );
}
