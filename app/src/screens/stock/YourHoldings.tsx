import { Card, CardTitle } from '../../components/Card';
import { Num } from '../../components/Num';
import { DataState } from '../../components/DataState';
import { SkeletonList } from '../../components/Skeleton';
import { ListRow, RowValues } from '../../components/ListRow';
import { useAppState, useDispatch } from '../../state/appState';
import { useDemoMode } from '../../lib/DemoModeProvider';
import { useLoadable } from '../../data/useLoadable';
import { fetchYourPositions } from '../../lib/holdings';
import { useT } from '../../i18n/useT';
import { money, moneyOrDash, pctOrDash, signalColor } from '../../lib/format';

/**
 * What the reader owns of this ticker, across every portfolio.
 *
 * Extracted from the stock screen so both stock pages can show it, and that
 * is the point rather than tidiness: the ledger prices any ticker the reader
 * chose to record, while the page that used to be the only one carrying this
 * card rendered for ten symbols. Someone who bought a name off the screener
 * opened its page and saw no position at all — their own money, missing from
 * the one screen that exists to talk about that stock.
 *
 * Renders nothing when there is no position, rather than an empty card
 * announcing an absence nobody asked about.
 */
export function YourHoldings({ ticker }: Readonly<{ ticker: string }>) {
  const t = useT();
  const s = useAppState();
  const dispatch = useDispatch();
  const demo = useDemoMode();
  const positions = useLoadable(
    () => fetchYourPositions(ticker, s.manualTransactions, s.manualPortfolios),
    [ticker, s.manualTransactions, s.manualPortfolios, demo],
  );

  return (
    <DataState
      state={positions.state}
      onRetry={positions.retry}
      skeleton={<SkeletonList count={1} leading={false} minHeight={46} />}
    >
      {(rows) =>
        rows.length === 0 ? null : (
          <Card padding="12px 13px 4px" gap={7}>
            <CardTitle>{t('stock.yourHoldings')}</CardTitle>
            {rows.map(({ portfolio, holding, index }) => (
              <ListRow
                key={portfolio.id}
                title={portfolio.kind === 'manual' ? portfolio.name : `${portfolio.broker}`}
                subtitle={<Num>{`${holding.shares} sh · avg ${money(holding.avgCost)}`}</Num>}
                right={
                  <RowValues
                    main={moneyOrDash(holding.value, 0)}
                    sub={pctOrDash(holding.plPct)}
                    subColor={signalColor(holding.plPct)}
                  />
                }
                minHeight={46}
                // Select this row's account first: the Portfolio tab renders
                // whichever portfolio pfIndex points at, so navigating without
                // setting it opens whichever account was last looked at rather
                // than the one just tapped.
                onClick={() => {
                  dispatch({ type: 'pfIndex', index });
                  dispatch({ type: 'go', screen: 'pf' });
                }}
              />
            ))}
          </Card>
        )
      }
    </DataState>
  );
}
