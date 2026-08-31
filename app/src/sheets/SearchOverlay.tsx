import { useRef, useState } from 'react';
import { useDismissAnimation } from '../lib/useDismissAnimation';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/ListRow';
import { WatchRowValues } from '../components/WatchRowValues';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { SkeletonList } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useBackGuard } from '../state/backStack';
import { useT } from '../i18n/useT';
import { useToast } from '../components/Toast';
import { demoService } from '../data/demoAdapter';
import { fetchQuotes } from '../data/quotes';
import { useLoadable } from '../data/useLoadable';
import type { WatchRow } from '../data/types';

/**
 * How many visible rows are priced at once.
 *
 * Matches the batch the quote route accepts in one request, so a long result
 * list costs one round trip rather than several. Rows past it render "—",
 * which is honest and, at twenty-five deep in a search result, unseen.
 */
const PRICED_ROWS = 25;

/**
 * Full-screen ticker search — and the app's one way onto the watchlist.
 *
 * Opens over the current screen rather than navigating, so dismissing it
 * returns the user exactly where they were. With no query it lists a few
 * symbols instead of nothing, so the overlay is never an empty box on open.
 *
 * Every row carries an add/added toggle, so a stock can be followed without a
 * detour through its page, and the searchable set is the whole universe the
 * app knows of (data/demoAdapter.searchUniverse) rather than the ten rows of
 * the sample table — a watchlist you may only fill from ten names is a demo
 * with extra steps.
 *
 * PRICES ARE FETCHED FOR THE VISIBLE ROWS ONLY. The universe is a hundred-odd
 * tickers and a live quote costs one provider request each, so it arrives
 * unpriced and the handful of rows actually on screen are priced here. A row
 * whose quote has not landed yet — or could not be read — renders "—" rather
 * than a stale price for a symbol the reader just typed.
 */
/** Rows whose ticker or company name contains the (already lowercased) query. */
function matches(rows: WatchRow[], query: string): WatchRow[] {
  return rows.filter(
    (x) => x.ticker.toLowerCase().includes(query) || (x.name?.toLowerCase().includes(query) ?? false),
  );
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Not built on Sheet (it is a full-screen overlay, not a bottom sheet), so
  // it claims the back press itself — otherwise back would close the app from
  // over the search field.
  useBackGuard(open, onClose);
  const { mounted, closing } = useDismissAnimation(open);
  // The body (and its symbols fetch) exists only while the overlay is
  // actually shown — the always-mounted wrapper must not fetch on app boot.
  if (!mounted) return null;
  return <SearchOverlayBody closing={closing} onClose={onClose} />;
}

/**
 * The overlay's contents, split from the wrapper above so that mounting them —
 * and with them the symbol fetch — happens only while the overlay is actually
 * open, rather than on every app boot.
 */
function SearchOverlayBody({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const dispatch = useDispatch();
  const s = useAppState();
  const t = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  // The watchlist is passed in so a followed ticker the daily ranking has
  // since dropped is still findable here — search is where someone goes to
  // take it off, and a symbol search cannot reach what the universe omits.
  //
  // Snapshotted at mount rather than tracked: the searchable set must not be
  // rebuilt every time the user adds a stock, or the list they are working
  // through would refetch under their hands. The body is mounted fresh each
  // time the overlay opens, so the snapshot is never stale for long.
  const universeFor = useRef(s.watchlist).current;
  const symbols = useLoadable(() => demoService.searchUniverse(universeFor), []);
  const query = q.trim().toLowerCase();

  // The rows the list will actually render, computed here rather than inside
  // the render prop so their prices can be fetched. Quotes are cached per
  // ticker for a few seconds, so typing through a result set re-reads almost
  // nothing.
  const rows = symbols.state.status === 'ok' ? symbols.state.data : [];
  const hits = query ? matches(rows, query) : rows.slice(0, 5);
  const priced = hits.slice(0, PRICED_ROWS).map((x) => x.ticker);
  const quotes = useLoadable(() => fetchQuotes(priced), [priced.join(',')]);
  const quoteFor = (ticker: string) =>
    quotes.state.status === 'ok' ? (quotes.state.data[ticker] ?? null) : null;

  return (
    <div
      className={closing ? 'anim-fade-out' : 'anim-fade-up'}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 'none',
          padding: 'calc(14px + env(safe-area-inset-top)) 16px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <label style={{ position: 'relative', flex: 1 }}>
          <span
            style={{
              position: 'absolute',
              insetInlineStart: 10,
              top: 11,
              opacity: 0.5,
              pointerEvents: 'none',
            }}
          >
            <Icon name="search" size={15} strokeWidth={2} />
          </span>
          <input
            className="input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            // 16px, not smaller: this field autoFocuses on open, and any
            // input under 16px makes iOS Safari zoom the page in on focus.
            style={{ paddingInlineStart: 32, height: 38, minHeight: 38, fontSize: 'var(--text-title)' }}
          />
        </label>
        <Button
          variant="ghost"
          fontSize={16}
          onClick={() => {
            setQ('');
            onClose();
          }}
        >
          {t('alert.cancel')}
        </Button>
      </div>
      <div className="scroll-y" style={{ flex: 1, minHeight: 0, padding: '2px 16px 22px' }}>
        <DataState
          state={symbols.state}
          onRetry={symbols.retry}
          skeleton={<SkeletonList count={5} minHeight={52} firstDivider />}
        >
          {() => {
            // One list, whatever the user follows. An earlier version swapped
            // in the watchlist once it had anything on it, so adding a stock
            // replaced the list being browsed with a list of one — the row
            // the user had just tapped. The list stays put; the row's own
            // button is what changes to say it was added.
            const heading = query ? t('search.matches', { n: hits.length }) : t('search.recent');
            return (
              <>
                <div
                  className="text-muted"
                  style={{
                    fontSize: 'var(--text-caption)',
                    letterSpacing: '.09em',
                    textTransform: 'uppercase',
                    padding: '6px 0',
                  }}
                >
                  {heading}
                </div>
                {hits.map((x) => {
                  const watched = s.watchlist.includes(x.ticker);
                  return (
                    <ListRow
                      key={x.ticker}
                      leading={<TickerTile ticker={x.ticker} size={26} />}
                      title={x.ticker}
                      subtitle={x.name ? `${x.name} · ${x.sector}` : t('search.rankedOnly')}
                      right={<WatchRowValues row={{ ...x, quote: quoteFor(x.ticker) }} />}
                      trailing={
                        <button
                          type="button"
                          // The row itself opens the stock page; this does not.
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'toggleWatch', ticker: x.ticker });
                            // The overlay covers the watchlist, so the row it
                            // just changed is not on screen to speak for itself.
                            toast(t(watched ? 'toast.removed' : 'toast.added', { ticker: x.ticker }));
                          }}
                          aria-pressed={watched}
                          aria-label={t(watched ? 'search.removeAria' : 'search.addAria', {
                            ticker: x.ticker,
                          })}
                          style={{
                            flex: 'none',
                            minHeight: 32,
                            padding: '0 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            font: 'inherit',
                            fontSize: 'var(--text-caption)',
                            border: `1px solid ${watched ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                            background: watched ? 'var(--fill-selected)' : 'transparent',
                            color: watched ? 'var(--color-accent-200)' : 'var(--color-accent)',
                          }}
                        >
                          {watched ? `✓ ${t('search.added')}` : `＋ ${t('search.add')}`}
                        </button>
                      }
                      minHeight={52}
                      onClick={() => {
                        dispatch({ type: 'openStock', ticker: x.ticker });
                        setQ('');
                        onClose();
                      }}
                    />
                  );
                })}
                {query && hits.length === 0 && (
                  <div style={{ padding: '34px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--text-row)' }}>
                      {t('search.noMatch')} “{q}”
                    </div>
                    <div className="text-muted" style={{ fontSize: 'var(--text-body)', marginTop: 4 }}>
                      {t('search.noMatchHelp')}
                    </div>
                  </div>
                )}
              </>
            );
          }}
        </DataState>
      </div>
    </div>
  );
}
