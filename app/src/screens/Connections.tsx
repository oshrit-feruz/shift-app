import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { LogoTile } from '../components/TickerTile';
import { InstitutionRows } from './advisory/InstitutionRows';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { DataState, EmptyState } from '../components/DataState';
import { SkeletonList } from '../components/Skeleton';
import { useLinkStatus } from '../data/useLinked';
import { useLoadable } from '../data/useLoadable';
import { fetchConnectedAccounts } from '../data/snaptradeAccount';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { money } from '../lib/format';
import { ConnectBrokerage } from '../components/ConnectBrokerage';
import { DemoOnly } from '../components/DemoOnly';
import { useDemoMode } from '../lib/DemoModeProvider';
import type { ScreenProps } from '../App';

const LINKED = [
  {
    logo: '/assets/broker-blink.webp',
    broker: 'Blink',
    acct: '••4821',
    detail: { en: 'Core · brokerage · 7 positions', he: 'Core · חשבון מסחר · 7 פוזיציות' },
    value: '$48,214.60',
  },
  {
    logo: '/assets/broker-ibkr.webp',
    broker: 'Interactive Brokers',
    acct: '••7130',
    detail: { en: 'Global · margin · 4 positions', he: 'Global · מרווח · 4 פוזיציות' },
    value: '$12,905.11',
  },
  {
    logo: '/assets/broker-colmex.webp',
    broker: 'Colmex Pro',
    acct: '••2265',
    detail: { en: 'Dividend · cash · 4 positions', he: 'Dividend · מזומן · 4 פוזיציות' },
    value: '$21,470.02',
  },
];

export function ConnectionsScreen(_: ScreenProps) {
  const { language } = useTheme();
  const t = useT();
  // Three states, not two. `unknown` is the moment before the first read
  // lands — most visibly on the way back from the connection portal, where
  // treating it as "not linked" would offer a connect button to someone who
  // has just connected an account.
  const status = useLinkStatus();
  const live = status === 'linked';
  const [newPfOpen, setNewPfOpen] = useState(false);
  const demo = useDemoMode();

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* A connected brokerage account outranks the sample-data switch: it
          is not sample data, so it shows even with that switch off. */}
      {live || demo ? (
        <>
          <Card padding={13} gap={5}>
            <CardTitle>{t('connScreen.linked')}</CardTitle>
            <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
              {t('connScreen.linkedHelp')}
            </p>
          </Card>

          {/* Once a real account is connected, the three sample brokers give
              way to it. They are illustrations of what this list looks like
              full; a real account is the thing itself, and the two must never
              appear in the same list. */}
          {live ? (
            <LiveLinkedAccounts />
          ) : (
            <Card padding="4px 0" gap={0}>
              {LINKED.map((c, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 13px',
                    borderTop: '1px solid var(--color-divider)',
                  }}
                >
                  <LogoTile src={c.logo} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>
                      {c.broker}{' '}
                      <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
                        <Num>{c.acct}</Num>
                      </span>
                    </span>
                    <span
                      className="text-muted"
                      style={{
                        display: 'block',
                        fontSize: 'var(--text-caption)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.detail[language]}
                    </span>
                  </span>
                  <span
                    style={{
                      textAlign: 'end',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      alignItems: 'flex-end',
                    }}
                  >
                    <Num size={17}>{c.value}</Num>
                    <Tag variant="accent" fontSize={14}>
                      {t('connScreen.live')}
                    </Tag>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </>
      ) : (
        <DemoOnly feature="connScreen.linked" />
      )}

      {/* The way in. Only once we KNOW there is nothing connected — with an
          account linked, the connection is managed on its own screen, next to
          the figures it produces, and while the answer is still unknown this
          waits rather than guessing. */}
      {status === 'unlinked' && <ConnectBrokerage />}

      <Card padding="4px 0" gap={0}>
        <CardTitle>
          <span style={{ display: 'block', padding: '9px 13px 2px', fontSize: 'var(--text-title)' }}>
            {t('connScreen.add')}
          </span>
        </CardTitle>
        <InstitutionRows />
      </Card>

      <Card padding={13} gap={7}>
        <CardTitle>{t('connScreen.theo')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
          {t('connScreen.theoHelp')}
        </p>
        <Button variant="secondary" block fontSize={16} minHeight={40} onClick={() => setNewPfOpen(true)}>
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
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 'var(--text-body)',
              padding: '11px 13px',
              borderTop: '1px solid var(--color-divider)',
            }}
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

/**
 * The user's real connected accounts in the linked-accounts list, in place of
 * the sample brokers.
 *
 * Each row links to the connected-account screen, so a total shown here can
 * always be traced to the per-field view that marks what the brokerage did
 * not report. Loading, unavailable and "nothing connected yet" are all
 * rendered honestly — a failure here never falls back to the sample rows
 * above.
 */
function LiveLinkedAccounts() {
  const t = useT();
  const dispatch = useDispatch();
  const accounts = useLoadable(() => fetchConnectedAccounts(), []);

  return (
    <Card padding="4px 0" gap={0}>
      <div style={{ padding: '10px 13px 2px' }}>
        <DataState
          state={accounts.state}
          onRetry={accounts.retry}
          skeleton={<SkeletonList count={1} leading minHeight={52} />}
        >
          {({ accounts }) =>
            accounts.length === 0 ? (
              <EmptyState>{t('live.none')}</EmptyState>
            ) : (
              <>
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => dispatch({ type: 'go', screen: 'snaptrade' })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      width: '100%',
                      padding: '9px 0',
                      border: 0,
                      background: 'transparent',
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textAlign: 'start',
                    }}
                  >
                    <LogoTile src={null} label={(account.institution ?? 'A').slice(0, 2).toUpperCase()} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14 }}>
                        {account.institution ?? account.name ?? account.id}{' '}
                        {account.numberMasked && (
                          <span className="text-muted" style={{ fontSize: 13 }}>
                            <Num>{account.numberMasked}</Num>
                          </span>
                        )}
                      </span>
                      <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>
                        {t('live.title')}
                      </span>
                    </span>
                    <span
                      style={{
                        textAlign: 'end',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                        alignItems: 'flex-end',
                      }}
                    >
                      {account.totalValue === null ? (
                        <span className="text-muted" style={{ fontSize: 14 }}>
                          —
                        </span>
                      ) : (
                        <Num size={14}>{money(account.totalValue)}</Num>
                      )}
                      <Tag variant="accent" fontSize={11}>
                        {t('live.badge')}
                      </Tag>
                    </span>
                  </button>
                ))}
              </>
            )
          }
        </DataState>
      </div>
    </Card>
  );
}
