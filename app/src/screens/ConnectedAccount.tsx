import { Card, CardTitle } from '../components/Card';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { ListRow, RowValues } from '../components/ListRow';
import { DataState, EmptyState } from '../components/DataState';
import { SkeletonCard } from '../components/Skeleton';
import { useLoadable } from '../data/useLoadable';
import { fetchConnectedAccounts } from '../data/snaptradeAccount';
import type { ConnectedAccount, ConnectedPosition } from '../data/types';
import { useT } from '../i18n/useT';
import { useTheme } from '../theme/ThemeProvider';
import { money, pct, signalColor } from '../lib/format';
import type { ScreenProps } from '../App';

/**
 * "חשבון מקושר (הדגמה)" — the founder-demo screen.
 *
 * It shows ONE real brokerage account, read live and read-only through
 * SnapTrade's free Personal tier. It is deliberately its own screen with its
 * own framing rather than a card folded into the portfolio: the point it
 * makes ("we can connect to a real brokerage account and read it") is a
 * different claim from the Core-Satellite recommendation or the Recovery
 * Detector's signals, and mixing it into either would blur what is real,
 * what is modelled and what is demo data.
 *
 * Every number here comes from the brokerage or is absent. A field the
 * brokerage did not report renders as "—" and the card says so; nothing is
 * estimated, derived or padded.
 */
export function ConnectedAccountScreen(_: ScreenProps) {
  const t = useT();
  const accounts = useLoadable(() => fetchConnectedAccounts(), []);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* Scope banner. This is the first thing on the screen on purpose: the
          screen shows real money, and it must be impossible to mistake a
          single-account founder demo for shipped multi-user account linking. */}
      <Card padding={13} gap={7}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <CardTitle>{t('live.title')}</CardTitle>
          <Tag variant="accent" fontSize={11}>
            {t('live.badge')}
          </Tag>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>
          {t('live.intro')}
        </p>
        <p
          style={{
            fontSize: 12.5,
            margin: 0,
            lineHeight: 1.55,
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-divider)',
            color: 'var(--muted)',
          }}
        >
          {t('live.notForUsers')}
        </p>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>
          {t('live.readOnly')}
        </p>
      </Card>

      <DataState
        state={accounts.state}
        onRetry={accounts.retry}
        skeleton={
          <>
            <SkeletonCard height={120} lines={2} />
            <SkeletonCard height={210} lines={4} />
          </>
        }
      >
        {(list) =>
          // Zero accounts is a true answer, not a failure: nothing has been
          // linked in SnapTrade's portal yet. It gets its own honest state
          // rather than the "unavailable" one, which would wrongly suggest
          // something broke.
          list.length === 0 ? (
            <Card padding={16} gap={6}>
              <span style={{ fontSize: 14 }}>{t('live.none')}</span>
              <span className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                {t('live.noneHelp')}
              </span>
            </Card>
          ) : (
            <>
              {list.map((account) => (
                <AccountCard key={account.id} account={account} />
              ))}
              <p className="text-muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.5, padding: '0 2px' }}>
                {t('live.unknownFields')}
              </p>
            </>
          )
        }
      </DataState>
    </div>
  );
}

/** A number the brokerage reported, or an explicit "—" when it did not. */
function Maybe({ value, format }: { value: number | null; format: (n: number) => string }) {
  if (value === null) return <span className="text-muted">—</span>;
  return <Num>{format(value)}</Num>;
}

/**
 * SnapTrade's `as_of` is an ISO timestamp. An unparseable one is shown
 * verbatim rather than dropped or guessed at — it is still a fact the
 * provider reported.
 */
function formatAsOf(iso: string, language: 'en' | 'he'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(language === 'he' ? 'he-IL' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function AccountCard({ account }: { account: ConnectedAccount }) {
  const t = useT();
  const { language } = useTheme();
  const title = [account.institution, account.name].filter(Boolean).join(' · ') || account.id;

  return (
    <>
      <Card padding={14} gap={9}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <CardTitle>{title}</CardTitle>
          {account.numberMasked && (
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              <Num>{account.numberMasked}</Num>
            </span>
          )}
        </div>
        <div className="text-muted" style={{ fontSize: 12.5 }}>
          {t('live.total')}
          {account.currency ? ` · ${account.currency}` : ''}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1.1 }}>
          <Maybe value={account.totalValue} format={(n) => money(n)} />
        </div>
        {/* How fresh this is, stated rather than implied. When the brokerage
            gave no timestamp the line simply says which route answered — it
            never claims an age we were not told. */}
        <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
          {account.source === 'realtime' ? t('live.freshRealtime') : t('live.freshDaily')}
          {account.asOf && ` · ${t('live.asOf', { when: formatAsOf(account.asOf, language) })}`}
        </div>
      </Card>

      <Card padding="13px 13px 4px" gap={4}>
        <CardTitle>{t('live.balances')}</CardTitle>
        {account.balances.length === 0 ? (
          <EmptyState>—</EmptyState>
        ) : (
          account.balances.map((balance, i) => (
            <ListRow
              key={`${balance.currency ?? 'balance'}-${i}`}
              title={balance.currency ?? t('live.cash')}
              subtitle={t('live.buyingPower')}
              right={
                <RowValues
                  main={<Maybe value={balance.cash} format={(n) => money(n)} />}
                  sub={<Maybe value={balance.buyingPower} format={(n) => money(n)} />}
                />
              }
              minHeight={46}
            />
          ))
        )}
      </Card>

      <Card padding="13px 13px 4px" gap={4}>
        <CardTitle>{t('live.positions')}</CardTitle>
        {account.positions.length === 0 ? (
          // A real account can legitimately hold nothing. That is shown as
          // genuinely empty, never as an error and never back-filled.
          <EmptyState>{t('live.noPositions')}</EmptyState>
        ) : (
          account.positions.map((position) => <PositionRow key={position.ticker} position={position} />)
        )}
      </Card>
    </>
  );
}

function PositionRow({ position }: { position: ConnectedPosition }) {
  const t = useT();
  // Derived only from two numbers the brokerage actually reported, and only
  // when the cost basis is non-zero. Otherwise there is no return to show.
  const basis = position.units !== null && position.avgCost !== null ? position.units * position.avgCost : null;
  const plPct = position.openPnl !== null && basis !== null && basis !== 0 ? (position.openPnl / basis) * 100 : null;

  return (
    <ListRow
      title={position.ticker}
      subtitle={
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          <Maybe value={position.units} format={(n) => `${n}`} /> {t('live.units')} ·{' '}
          <Maybe value={position.price} format={(n) => money(n)} />
        </span>
      }
      right={
        <RowValues
          main={<Maybe value={position.marketValue} format={(n) => money(n, 0)} />}
          sub={plPct === null ? <span className="text-muted">—</span> : <Num>{pct(plPct)}</Num>}
          subColor={plPct === null ? undefined : signalColor(plPct)}
        />
      }
      minHeight={50}
    />
  );
}
