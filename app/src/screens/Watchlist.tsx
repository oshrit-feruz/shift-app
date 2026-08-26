import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { ListRow, RowValues } from '../components/ListRow';
import { IconTile } from '../components/IconTile';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

export function WatchlistScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const symbols = useLoadable(() => demoService.symbols(), []);
  const earnLabel = language === 'he' ? 'דוח' : 'Earnings';
  const newsLabel = language === 'he' ? 'חדשות' : 'News';
  const alertTags = (ticker: string): string[] =>
    s.alerts
      .filter((a) => a.ticker === ticker)
      .map((a) =>
        a.kind === 'price' ? `$${a.level ?? '—'} ${a.direction === 'fall' ? '▼' : '▲'}` : a.kind === 'earn' ? earnLabel : newsLabel,
      );

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="text-muted" style={{ fontSize: 'var(--fs-sm)', flex: 1 }}>
          {t('watch.sub', { alerts: s.alerts.length, tracked: s.watchlist.length })}
        </span>
        <Button fontSize={13} minHeight={36} onClick={openAlert}>
          ＋ {t('watch.newAlert')}
        </Button>
      </div>

      <Card padding="12px 13px 4px" gap={4}>
        <CardTitle>{t('watch.tracking')}</CardTitle>
        <DataState state={symbols.state} onRetry={symbols.retry}>
          {(syms) => (
            <>
              {syms
                .filter((x) => s.watchlist.includes(x.ticker))
                .map((x) => (
                  <ListRow
                    key={x.ticker}
                    leading={<TickerTile ticker={x.ticker} size={26} />}
                    title={x.ticker}
                    subtitle={
                      alertTags(x.ticker).length > 0 ? (
                        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                          {alertTags(x.ticker).map((al, i) => (
                            <Tag key={i} variant="accent" fontSize={11}>
                              {al}
                            </Tag>
                          ))}
                        </span>
                      ) : undefined
                    }
                    right={<RowValues main={money(x.price)} sub={pct(x.changePct)} subColor={signalColor(x.changePct)} />}
                    trailing={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAlert();
                        }}
                        style={{
                          width: 34,
                          height: 34,
                          flex: 'none',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--color-divider)',
                          background: 'transparent',
                          color: 'var(--color-accent)',
                          fontSize: 'var(--fs-base)',
                          cursor: 'pointer',
                        }}
                        aria-label={t('watch.newAlert')}
                      >
                        ＋
                      </button>
                    }
                    minHeight={50}
                    onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                  />
                ))}
            </>
          )}
        </DataState>
      </Card>

      <Card padding={13} gap={8}>
        <CardTitle>{t('watch.activeAlerts')}</CardTitle>
        {s.alerts.length === 0 ? (
          <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: '2px 0 6px' }}>
            {t('watch.noAlerts')}
          </p>
        ) : (
          s.alerts.map((a) => (
            <ListRow
              key={a.id}
              align="start"
              padding="8px 0 0"
              minHeight={0}
              leading={
                <IconTile size={24} variant="tint" fontSize={12}>
                  {a.kind === 'price' ? (a.direction === 'fall' ? '▼' : '▲') : a.kind === 'earn' ? '📅' : '◎'}
                </IconTile>
              }
              title={
                <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>
                  {a.kind === 'price'
                    ? t(a.direction === 'fall' ? 'alertRow.fall' : 'alertRow.rise', { ticker: a.ticker, level: `$${a.level ?? '—'}` })
                    : t(a.kind === 'earn' ? 'alertRow.earn' : 'alertRow.news', { ticker: a.ticker })}
                </span>
              }
              subtitle={t('alertRow.created', { date: a.created })}
              trailing={
                <Button
                  variant="ghost"
                  fontSize={12.5}
                  style={{ opacity: 0.7, padding: 0 }}
                  onClick={() => dispatch({ type: 'removeAlert', id: a.id })}
                >
                  {t('watch.remove')}
                </Button>
              }
            />
          ))
        )}
        {beg && (
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: '4px 0 0' }}>
            {t('watch.alertNudge')}
          </p>
        )}
      </Card>
    </div>
  );
}

