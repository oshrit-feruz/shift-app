import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { ListRow, RowValues } from '../components/ListRow';
import { LogoTile } from '../components/TickerTile';
import { DataState } from '../components/DataState';
import { InstitutionRows, brokerName } from './advisory/InstitutionRows';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { useAppState } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { demoService } from '../data/demoAdapter';
import { useLoadable } from '../data/useLoadable';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

export function ConnectionsScreen(_: ScreenProps) {
  const s = useAppState();
  const { language } = useTheme();
  const t = useT();
  const [newPfOpen, setNewPfOpen] = useState(false);
  const portfolios = useLoadable(() => demoService.portfolios(), []);
  // Only accounts the user actually connected appear here — nothing is
  // pre-linked, and every number comes from the (demo) data service.
  const connectedBroker = s.advConnections.broker ?? (s.advBroker ? brokerName(s.advBroker) : null);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <Card padding={13} gap={5}>
        <CardTitle>{t('connScreen.linked')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
          {t('connScreen.linkedHelp')}
        </p>
      </Card>

      <Card padding="4px 0" gap={0}>
        <DataState state={portfolios.state} onRetry={portfolios.retry}>
          {(pfs) => {
            const linked = pfs.filter((x) => x.kind === 'linked' && x.broker === connectedBroker);
            if (linked.length === 0) {
              return (
                <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, padding: '10px 13px', lineHeight: 1.5 }}>
                  {t('connScreen.none')}
                </p>
              );
            }
            return (
              <>
                {linked.map((c) => (
                  <ListRow
                    key={c.id}
                    padding="11px 13px"
                    leading={<LogoTile src={c.logo} />}
                    title={
                      <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>
                        {c.broker}{' '}
                        <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
                          <Num>{c.acct}</Num>
                        </span>
                      </span>
                    }
                    subtitle={t('pf.synced', { when: c.syncedAgo?.[language] ?? '' })}
                    right={
                      <span style={{ whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                        <RowValues main={money(c.total)} sub={pct(c.dayPct)} subColor={signalColor(c.dayPct)} />
                        <Tag variant="neutral" fontSize={11}>
                          {t('data.demo')}
                        </Tag>
                      </span>
                    }
                  />
                ))}
              </>
            );
          }}
        </DataState>
      </Card>

      <Card padding="4px 0" gap={0}>
        <CardTitle>
          <span style={{ display: 'block', padding: '9px 13px 2px', fontSize: 'var(--fs-base)' }}>{t('connScreen.add')}</span>
        </CardTitle>
        <InstitutionRows />
      </Card>

      <Card padding={13} gap={7}>
        <CardTitle>{t('connScreen.theo')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
          {t('connScreen.theoHelp')}
        </p>
        <Button variant="secondary" block fontSize={13} minHeight={40} onClick={() => setNewPfOpen(true)}>
          {t('connScreen.newTheo')}
        </Button>
      </Card>

      <Card padding="4px 0" gap={0}>
        {(
          [
            ['connScreen.freq', 'connScreen.freqV'],
            ['connScreen.perms', 'connScreen.permsV'],
            ['connScreen.history', 'connScreen.historyV'],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 'var(--fs-sm)', padding: '11px 13px', borderTop: '1px solid var(--color-divider)' }}
          >
            <span className="text-muted">{t(k)}</span>
            <span>{t(v)}</span>
          </div>
        ))}
      </Card>
      <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
    </div>
  );
}
