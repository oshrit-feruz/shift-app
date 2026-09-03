import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { LogoTile } from '../components/TickerTile';
import { InstitutionRows } from './advisory/InstitutionRows';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { DataState } from '../components/DataState';
import { SkeletonList } from '../components/Skeleton';
import { useLoadable } from '../data/useLoadable';
import { fetchConnectedAccounts } from '../data/snaptradeAccount';
import { liveAccountIndex } from '../data/appService';
import type { ConnectedAccount, ConnectedConnection } from '../data/types';
import { useDispatch } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { money } from '../lib/format';
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
  const [newPfOpen, setNewPfOpen] = useState(false);
  const demo = useDemoMode();

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <Card padding={13} gap={5}>
        <CardTitle>{t('connScreen.linked')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
          {t('connScreen.linkedHelp')}
        </p>
      </Card>

      {/* Sample data on: the three demo brokers. Off: the one real account
          read through SnapTrade, or the honest reason there is none. */}
      {demo ? (
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
      ) : (
        <LiveLinkedAccounts />
      )}

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
 * The real connected account, read live and read-only through SnapTrade.
 *
 * Every state is rendered honestly and none falls back to the demo rows
 * above: loading, unavailable, a connection SnapTrade has disabled, a live
 * connection whose brokerage reports no accounts, and no connection at all.
 * The last two used to look identical, and they are different facts — one
 * says "go connect something", the other says "it is connected; the broker
 * has not reported yet".
 */
function LiveLinkedAccounts() {
  const t = useT();
  const accounts = useLoadable(() => fetchConnectedAccounts(), []);

  return (
    <DataState
      state={accounts.state}
      onRetry={accounts.retry}
      skeleton={
        <Card padding="4px 0" gap={0}>
          <div style={{ padding: '10px 13px 2px' }}>
            <SkeletonList count={1} leading minHeight={52} />
          </div>
        </Card>
      }
    >
      {({ accounts, connections }) => {
        // A disabled connection is reported whether or not other accounts
        // loaded: its figures are withheld, and silently omitting the whole
        // connection would read as "you never linked that".
        const dead = connections.filter((c) => c.disabled === true);
        const quiet = connections.filter((c) => c.disabled !== true);
        return (
          <>
            {dead.map((connection) => (
              <DisabledConnectionCard key={connection.id} connection={connection} />
            ))}
            {/* A connection that is live and reporting nothing is its own
                fact, and it used to vanish the moment ANY other account
                loaded — the branch below rendered account rows or connection
                cards, never both, so a second brokerage sitting empty
                disappeared from the screen entirely. Rendered on its own
                terms now: any active connection with no accounts of its own,
                whatever the rest of the list did. */}
            {quiet
              .filter((connection) => connection.accountCount === 0)
              .map((connection) => (
                <ConnectionCard key={connection.id} connection={connection} />
              ))}
            {accounts.length > 0 ? (
              <Card padding="4px 0" gap={0}>
                <div style={{ padding: '4px 13px 2px' }}>
                  {accounts.map((account) => (
                    <AccountRow
                      key={account.id}
                      account={account}
                      index={liveAccountIndex(
                        accounts.map((a) => a.id),
                        account.id,
                      )}
                    />
                  ))}
                </div>
                <p
                  className="text-muted"
                  style={{
                    fontSize: 'var(--text-caption)',
                    margin: 0,
                    padding: '4px 13px 10px',
                    lineHeight: 1.5,
                  }}
                >
                  {t('live.readOnly')}
                </p>
              </Card>
            ) : quiet.length === 0 && dead.length === 0 ? (
              <Card padding={16} gap={6}>
                <span style={{ fontSize: 'var(--text-row)' }}>{t('live.none')}</span>
                <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
                  {t('live.noneHelp')}
                </span>
              </Card>
            ) : (
              // Only the ones the block above did not already render: a
              // connection that claims accounts but delivered none is still
              // worth stating, and is not covered by the accountCount === 0
              // filter.
              quiet
                .filter((connection) => connection.accountCount !== 0)
                .map((connection) => <ConnectionCard key={connection.id} connection={connection} />)
            )}
          </>
        );
      }}
    </DataState>
  );
}

/**
 * One real account, as a row that opens the Portfolio tab. The total shown
 * here is the brokerage's own; a total it did not report is "—", never a
 * sum of the parts it did.
 */
function AccountRow({ account, index }: Readonly<{ account: ConnectedAccount; index: number }>) {
  const t = useT();
  const dispatch = useDispatch();
  return (
    <button
      type="button"
      onClick={() => {
        // Select this account BEFORE navigating. Going to 'pf' alone left
        // the tab on whichever portfolio pfIndex already held, so tapping
        // the second account opened the first one — or the aggregate.
        // A -1 means the ordering rule did not recognise the account, and
        // leaving the selection alone beats moving it to the wrong one.
        if (index >= 0) dispatch({ type: 'pfIndex', index });
        dispatch({ type: 'go', screen: 'pf' });
      }}
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
        <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>
          {account.institution ?? account.name ?? account.id}{' '}
          {account.numberMasked && (
            <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
              <Num>{account.numberMasked}</Num>
            </span>
          )}
        </span>
        <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
          {t('live.title')}
          {account.currency ? ` · ${account.currency}` : ''}
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
          <span className="text-muted" style={{ fontSize: 'var(--text-row)' }}>
            —
          </span>
        ) : (
          <Num size={17}>{money(account.totalValue)}</Num>
        )}
        <Tag variant="accent" fontSize={14}>
          {t('live.badge')}
        </Tag>
      </span>
    </button>
  );
}

/**
 * A connection SnapTrade has marked disabled.
 *
 * Its accounts are never fetched (see the API handler), because a disabled
 * connection keeps serving its last cached state and nothing says how old it
 * is. This card exists so that withholding is visible rather than silent.
 */
function DisabledConnectionCard({ connection }: Readonly<{ connection: ConnectedConnection }>) {
  const t = useT();
  const broker = connection.brokerage ?? connection.id;
  return (
    <Card padding={16} gap={7}>
      <span style={{ fontSize: 'var(--text-row)', color: 'var(--down)' }}>
        {t('live.connDisabledTitle', { broker })}
      </span>
      <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.55 }}>
        {t('live.connDisabledHelp')}
      </span>
    </Card>
  );
}

/**
 * A live connection that is reporting no accounts.
 *
 * Deliberately not the "nothing connected yet" card: the brokerage IS
 * connected, and this states what it actually said, so nobody goes looking
 * for a connection that already exists.
 */
function ConnectionCard({ connection }: Readonly<{ connection: ConnectedConnection }>) {
  const t = useT();
  const broker = connection.brokerage ?? connection.id;
  const state =
    connection.disabled === null ? null : connection.disabled ? t('live.connDisabled') : t('live.connActive');

  return (
    <Card padding={16} gap={7}>
      <span style={{ fontSize: 'var(--text-row)' }}>{t('live.connectedNoAccounts', { broker })}</span>
      <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.55 }}>
        {t('live.connectedNoAccountsHelp')}
      </span>
      {/* A delayed connection is answered from a cache, so "no accounts" may
          mean "the cache was never filled" rather than "the account is
          empty". Said only when SnapTrade actually reports that mode — it is
          not something to infer from the plan. */}
      {connection.dataFreshnessMode === 'delayed' && (
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.55 }}>
          {t('live.connectedNoAccountsDelayed')}
        </span>
      )}
      {state && (
        <span className="text-muted" style={{ fontSize: 'var(--text-caption)' }}>
          {t('live.connState', { state })}
          {connection.type ? ` · ${connection.type}` : ''}
          {connection.dataFreshnessMode ? ` · ${connection.dataFreshnessMode}` : ''}
        </span>
      )}
    </Card>
  );
}
