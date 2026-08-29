import { useState } from 'react';
import { useDismissAnimation } from '../lib/useDismissAnimation';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/ListRow';
import { WatchRowValues } from '../components/WatchRowValues';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { SkeletonList } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';

/**
 * Full-screen ticker search — and the app's one way onto the watchlist.
 *
 * Opens over the current screen rather than navigating, so dismissing it
 * returns the user exactly where they were. With no query it lists a few
 * symbols instead of nothing, so the overlay is never an empty box on open.
 *
 * Every row carries an add/added toggle, so a stock can be followed without a
 * detour through its page, and the searchable set is the whole universe the
 * app can price (data/demoAdapter.searchUniverse) rather than the ten rows of
 * the sample table — a watchlist you may only fill from ten names is a demo
 * with extra steps.
 */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { mounted, closing } = useDismissAnimation(open, 170);
  // The body (and its symbols fetch) exists only while the overlay is
  // actually shown — the always-mounted wrapper must not fetch on app boot.
  if (!mounted) return null;
  return <SearchOverlayBody closing={closing} onClose={onClose} />;
}

function SearchOverlayBody({ closing, onClose }: { closing: boolean; onClose: () => void }) {
  const dispatch = useDispatch();
  const s = useAppState();
  const t = useT();
  const [q, setQ] = useState('');
  const symbols = useLoadable(() => demoService.searchUniverse(), []);
  const query = q.trim().toLowerCase();

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
            style={{ paddingInlineStart: 32, height: 38, minHeight: 38, fontSize: 19 }}
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
          {(syms) => {
            const hits = query
              ? syms.filter(
                  (x) =>
                    x.ticker.toLowerCase().includes(query) ||
                    (x.name?.toLowerCase().includes(query) ?? false),
                )
              : // With no query, what the user already follows is the most
                // useful thing to show — it is also where they come to remove
                // one. Falling back to the first few symbols keeps the
                // overlay from opening empty for someone with no list yet.
                s.watchlist.length > 0
                ? syms.filter((x) => s.watchlist.includes(x.ticker))
                : syms.slice(0, 5);
            return (
              <>
                <div
                  className="text-muted"
                  style={{
                    fontSize: 15.5,
                    letterSpacing: '.09em',
                    textTransform: 'uppercase',
                    padding: '6px 0',
                  }}
                >
                  {query
                    ? t('search.matches', { n: hits.length })
                    : s.watchlist.length > 0
                      ? t('watch.tracking')
                      : t('search.recent')}
                </div>
                {hits.map((x) => {
                  const watched = s.watchlist.includes(x.ticker);
                  return (
                    <ListRow
                      key={x.ticker}
                      leading={<TickerTile ticker={x.ticker} size={26} />}
                      title={x.ticker}
                      subtitle={x.name ? `${x.name} · ${x.sector}` : t('search.rankedOnly')}
                      right={<WatchRowValues row={x} />}
                      trailing={
                        <button
                          type="button"
                          // The row itself opens the stock page; this does not.
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'toggleWatch', ticker: x.ticker });
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
                            fontSize: 15,
                            border: `1px solid ${watched ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                            background: watched ? 'var(--color-accent-900)' : 'transparent',
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
                    <div style={{ fontSize: 17 }}>
                      {t('search.noMatch')} “{q}”
                    </div>
                    <div className="text-muted" style={{ fontSize: 16, marginTop: 4 }}>
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
