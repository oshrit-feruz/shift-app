import { useState } from 'react';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { SkeletonList } from '../components/Skeleton';
import { useDispatch } from '../state/appState';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dispatch = useDispatch();
  const t = useT();
  const [q, setQ] = useState('');
  const symbols = useLoadable(() => demoService.symbols(), []);
  if (!open) return null;
  const query = q.trim().toLowerCase();

  return (
    <div
      className="anim-fade-up"
      style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ flex: 'none', padding: 'calc(14px + env(safe-area-inset-top)) 16px 10px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <label style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', insetInlineStart: 10, top: 11, opacity: 0.5, pointerEvents: 'none' }}>
            <Icon name="search" size={15} strokeWidth={2} />
          </span>
          <input
            className="input"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            style={{ paddingInlineStart: 32, height: 38, minHeight: 38, fontSize: 14 }}
          />
        </label>
        <Button
          variant="ghost"
          fontSize={13}
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
              ? syms.filter((x) => x.ticker.toLowerCase().includes(query) || x.name.toLowerCase().includes(query))
              : syms.slice(0, 5);
            return (
              <>
                <div className="text-muted" style={{ fontSize: 12.5, letterSpacing: '.09em', textTransform: 'uppercase', padding: '6px 0' }}>
                  {query ? t('search.matches', { n: hits.length }) : t('search.recent')}
                </div>
                {hits.map((x) => (
                  <ListRow
                    key={x.ticker}
                    leading={<TickerTile ticker={x.ticker} size={26} />}
                    title={x.ticker}
                    subtitle={`${x.name} · ${x.sector}`}
                    right={<RowValues main={money(x.price)} sub={pct(x.changePct)} subColor={signalColor(x.changePct)} />}
                    minHeight={52}
                    onClick={() => {
                      dispatch({ type: 'openStock', ticker: x.ticker });
                      setQ('');
                      onClose();
                    }}
                  />
                ))}
                {query && hits.length === 0 && (
                  <div style={{ padding: '34px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14 }}>
                      {t('search.noMatch')} “{q}”
                    </div>
                    <div className="text-muted" style={{ fontSize: 13, marginTop: 4 }}>
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
