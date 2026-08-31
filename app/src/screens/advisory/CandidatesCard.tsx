import { Card, CardTitle } from '../../components/Card';
import { Tag } from '../../components/Tag';
import { ListRow, RowValues } from '../../components/ListRow';
import { TickerTile } from '../../components/TickerTile';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonList } from '../../components/Skeleton';
import { BuyAtBrokerButton } from '../../components/BuyAtBrokerButton';
import { hasAnyTradeDeepLink } from '../../lib/brokerLinks';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { mapProfile, PROFILES } from '../../lib/advisory';
import { demoService } from '../../data/demoAdapter';
import { useLoadable } from '../../data/useLoadable';
import { money } from '../../lib/format';

/** Rendered in place of any numeric the live engine did not supply. */
const DASH = '—';

/** One caption paragraph — the card carries several and they share a look. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

/**
 * The stocks that passed today's checks, live from the daily screener mirror.
 *
 * Shared by the recommendation dashboard and the first-purchase simulation:
 * both show the same list under the same caveats, and when the wording of one
 * changes it must change in the other — a client who reads a softer version of
 * this card on one screen than on the other has been told two different things
 * about the same list.
 *
 * Ticker and price only. The engine's own figures (composite score, drawdown
 * from the 52-week high) are deliberately not shown: they read as precision a
 * client cannot act on. An empty list is an honest answer on a quiet day, not
 * a failure, so it gets its own state rather than being hidden.
 */
export function CandidatesCard() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const profile = PROFILES[mapProfile(s.advAnswers) ?? 'bal'];
  const sat = useLoadable(() => demoService.satelliteSignals(), []);

  return (
    <Card padding="13px 13px 4px" gap={7}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <CardTitle>{t('rec.satPositions')}</CardTitle>
        <span style={{ marginInlineStart: 'auto' }}>
          <Tag variant="outline" fontSize={15}>
            {t('rec.livePrices')}
          </Tag>
        </span>
      </div>
      {/* What the daily check actually is, then what this list is not. */}
      <Note>{t('rec.updatedDaily')}</Note>
      <Note>{t('rec.notAnOrder')}</Note>
      {/* With no individual-stock sleeve the picks are not advice for this
          profile, so say so rather than letting the list imply it. */}
      {profile.satellitePct === 0 && <Note>{t('rec.satInfoOnly')}</Note>}
      {/* Says plainly who executes, and — while no per-symbol link is
          configured — what the button will actually do. */}
      {s.advBroker && (
        <Note>
          {t('buy.handoffNote')}
          {!hasAnyTradeDeepLink() && ` ${t('buy.noDeepLink')}`}
        </Note>
      )}
      <DataState state={sat.state} onRetry={sat.retry} skeleton={<SkeletonList count={3} minHeight={52} />}>
        {(signals) =>
          signals.length === 0 ? (
            <EmptyState>{t('rec.noPositions')}</EmptyState>
          ) : (
            <>
              {signals.map((x) => (
                // A missing price renders as "—"; it is never guessed,
                // defaulted to zero, or back-filled.
                <ListRow
                  key={x.ticker}
                  leading={<TickerTile ticker={x.ticker} />}
                  title={x.ticker}
                  right={<RowValues main={x.price === null ? DASH : money(x.price)} />}
                  trailing={<BuyAtBrokerButton ticker={x.ticker} />}
                  minHeight={52}
                  onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                />
              ))}
            </>
          )
        }
      </DataState>
    </Card>
  );
}
