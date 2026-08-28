import { Card, CardTitle } from '../components/Card';
import { DemoDataNote } from '../components/DemoDataNote';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { ListRow, RowValues } from '../components/ListRow';
import { TickerTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { Skeleton, SkeletonLine } from '../components/Skeleton';
import { useAppState, useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

const ROW_ALERTS: Record<string, string[]> = {
  NVDA: ['$200 ▲', 'earn'],
  AMD: ['news'],
  TSLA: ['$300 ▼'],
  LLY: ['earn'],
};

export function WatchlistScreen({ openAlert }: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, language } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const symbols = useLoadable(() => demoService.symbols(), []);
  const earnLabel = language === 'he' ? 'דוח' : 'Earnings';
  const newsLabel = language === 'he' ? 'חדשות' : 'News';
  const savedAlerts = s.savedAlerts.map((alert) => {
    const notify = [alert.notifyBy.push ? t('alert.push') : '', alert.notifyBy.email ? t('alert.email') : '']
      .filter(Boolean)
      .join(', ');
    if (alert.kind === 'price') {
      return {
        id: alert.id,
        glyph: alert.condition === 'rise' ? '▲' : '▼',
        title: `${alert.ticker} ${t(alert.condition === 'rise' ? 'alert.rises' : 'alert.falls')} $${alert.value}`,
        detail: notify,
      };
    }
    if (alert.kind === 'news') {
      return {
        id: alert.id,
        glyph: '◎',
        title: `${alert.ticker} ${t('alert.newsType')} “${alert.value}”`,
        detail: notify,
      };
    }
    const remindKey =
      alert.remind === 'day' ? 'alert.dayBefore' : alert.remind === 'morning' ? 'alert.morningOf' : 'alert.whenLands';
    return {
      id: alert.id,
      glyph: '📅',
      title: `${alert.ticker} ${t('alert.earnType')}`,
      detail: `${t(remindKey)} · ${notify}`,
    };
  });
  const activeAlerts = [
    ...savedAlerts,
    ...ALERTS.map((alert, index) => ({
      id: `demo-${index}`,
      glyph: alert.glyph,
      title: alert.title[language],
      detail: alert.detail[language],
    })),
  ];

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DemoDataNote />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="text-muted" style={{ fontSize: 13, flex: 1 }}>
          {t('watch.sub')}
        </span>
        <Button fontSize={13} minHeight={36} onClick={openAlert}>
          ＋ {t('watch.newAlert')}
        </Button>
      </div>

      <Card padding="12px 13px 4px" gap={4}>
        <CardTitle>{t('watch.tracking')}</CardTitle>
        <DataState
          state={symbols.state}
          onRetry={symbols.retry}
          skeleton={
            <>
              {/* One row per watched ticker, and rows whose ticker carries
                  alert tags get the taller subtitle the tags will occupy —
                  a flat row height would leave the tagged ones short. */}
              {s.watchlist.map((ticker, i) => (
                <ListRow
                  key={ticker}
                  divider={i > 0}
                  minHeight={52}
                  leading={<Skeleton width={26} height={26} radius="var(--radius-sm)" />}
                  title={<SkeletonLine width="38%" fontSize={15} />}
                  subtitle={
                    <span style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                      {(ROW_ALERTS[ticker] ?? []).map((_, j) => (
                        <Skeleton key={j} width={j === 0 ? 58 : 44} height={25} radius={999} />
                      ))}
                    </span>
                  }
                  right={
                    <>
                      <SkeletonLine width={56} fontSize={14} />
                      <SkeletonLine width={38} fontSize={12.5} bar={9} />
                    </>
                  }
                  trailing={<Skeleton width={34} height={34} radius="var(--radius-sm)" />}
                />
              ))}
            </>
          }
        >
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
                      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                        {(ROW_ALERTS[x.ticker] ?? []).map((al, i) => (
                          <Tag key={i} variant="accent" fontSize={11}>
                            {al === 'earn' ? earnLabel : al === 'news' ? newsLabel : al}
                          </Tag>
                        ))}
                      </span>
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
                          fontSize: 15,
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
        {activeAlerts.map((a) => (
          <div key={a.id} style={{ display: 'flex', gap: 9, paddingTop: 8, borderTop: '1px solid var(--color-divider)' }}>
            <span
              style={{
                width: 24,
                height: 24,
                flex: 'none',
                borderRadius: 7,
                background: 'var(--color-accent-900)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
              }}
            >
              {a.glyph}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14 }}>{a.title}</div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {a.detail}
              </div>
            </div>
            <Button variant="ghost" fontSize={12.5} style={{ opacity: 0.7, padding: 0 }}>
              {t('watch.remove')}
            </Button>
          </div>
        ))}
        {beg && (
          <p className="text-muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            {t('watch.alertNudge')}
          </p>
        )}
      </Card>
    </div>
  );
}

const ALERTS = [
  { glyph: '▲', title: { en: 'NVDA rises above $200', he: 'NVDA עולה מעל $200' }, detail: { en: 'Push · created Aug 12', he: 'פוש · נוצר ב-12 באוג׳' } },
  { glyph: '📅', title: { en: 'NVDA earnings', he: 'דוח רבעוני של NVDA' }, detail: { en: 'Remind 1 day before · Nov 18', he: 'תזכורת יום לפני · 18 בנוב׳' } },
  { glyph: '◎', title: { en: 'AMD news mentions "MI400"', he: 'אזכור "MI400" בחדשות AMD' }, detail: { en: 'Push, major wires', he: 'פוש, סוכנויות ידיעות' } },
  { glyph: '▼', title: { en: 'TSLA falls below $300', he: 'TSLA יורד מתחת ל-$300' }, detail: { en: 'Push · created Jul 30', he: 'פוש · נוצר ב-30 ביולי' } },
];
