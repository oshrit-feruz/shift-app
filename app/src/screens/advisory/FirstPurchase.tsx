import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { AllocationBar, ALLOC_COLORS } from '../../components/AllocationBar';
import { FlowStepper } from './FlowStepper';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { ListRow, RowValues } from '../../components/ListRow';
import { TickerTile } from '../../components/TickerTile';
import { DataState, EmptyState } from '../../components/DataState';
import { SkeletonList } from '../../components/Skeleton';
import { BuyAtBrokerButton } from '../../components/BuyAtBrokerButton';
import { fundTicker, hasAnyTradeDeepLink } from '../../lib/brokerLinks';
import { demoService } from '../../data/demoAdapter';
import { useLoadable } from '../../data/useLoadable';
import { money, pct, signalColor } from '../../lib/format';
import { CORE_FUNDS, mapProfile, PROFILES } from '../../lib/advisory';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';

/** Rendered in place of any numeric the live engine did not supply. */
const DASH = '—';

/** First-purchase SIMULATION — an order-list preview. Nothing is bought here;
 *  execution happens at the user's own broker. */
export function AdvisoryFirstPurchase(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const profileKey = mapProfile(s.advAnswers) ?? 'bal';
  const profile = PROFILES[profileKey];
  const sat = useLoadable(() => demoService.satelliteSignals(), []);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <FlowStepper />
      <Card padding={14} gap={7} outlined>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Tag variant="accent" fontSize={15}>
            {t('adv.tag')}
          </Tag>
          <Tag variant="outline" fontSize={15}>
            {t('adv.noAction')}
          </Tag>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-heading)',
            letterSpacing: 'var(--track-heading)',
            lineHeight: 'var(--lead-heading)',
          }}
        >
          {t('buy.title')}
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.5 }}>
          {t('buy.help')}
        </p>
      </Card>

      <Card padding={13} gap={9}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t(`profile.${profileKey}` as StringKey)}</CardTitle>
          <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
            {t('buy.example')}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profile.core.map((c, i) => (
            <AllocationBar
              key={c.category}
              name={t(`core.${c.category}` as StringKey)}
              pct={c.pct}
              fund={CORE_FUNDS[c.category]}
              amount={'$' + (c.pct * 100).toLocaleString('en-US')}
              colorVar={ALLOC_COLORS[i % ALLOC_COLORS.length]}
              action={<BuyAtBrokerButton ticker={fundTicker(CORE_FUNDS[c.category])} />}
            />
          ))}
          {profile.satellitePct > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                fontSize: 'var(--text-body)',
                alignItems: 'center',
                paddingTop: 6,
                borderTop: '1px solid var(--color-divider)',
              }}
            >
              <Tag variant="accent" fontSize={15}>
                Recovery Detector
              </Tag>
              <span style={{ flex: 1 }}>Satellite</span>
              <Num size={16} style={{ color: 'var(--muted)' }}>
                {'$' + (profile.satellitePct * 100).toLocaleString('en-US')}
              </Num>
              <Num>{profile.satellitePct}%</Num>
            </div>
          )}
        </div>
      </Card>

      {/* The satellite side of the same order list. Gated exactly like the
          recommendation screen: with no satellite sleeve these are shown as
          information, never as part of this profile's purchase. */}
      <Card padding="13px 13px 4px" gap={7}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('rec.satPositions')}</CardTitle>
          <span style={{ marginInlineStart: 'auto' }}>
            <Tag variant="outline" fontSize={15}>
              {t('rec.livePrices')}
            </Tag>
          </span>
        </div>
        {profile.satellitePct === 0 && (
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
            {t('rec.satInfoOnly')}
          </p>
        )}
        {s.advBroker && (
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.5 }}>
            {t('buy.handoffNote')}
            {!hasAnyTradeDeepLink() && ` ${t('buy.noDeepLink')}`}
          </p>
        )}
        <DataState state={sat.state} onRetry={sat.retry} skeleton={<SkeletonList count={3} minHeight={52} />}>
          {(signals) =>
            signals.length === 0 ? (
              <EmptyState>{t('rec.noPositions')}</EmptyState>
            ) : (
              <>
                {signals.map((x) => {
                  const priceStr = x.price === null ? DASH : money(x.price);
                  const ddStr = x.drawdownPct === null ? DASH : pct(-x.drawdownPct, 1);
                  return (
                    <ListRow
                      key={x.ticker}
                      leading={<TickerTile ticker={x.ticker} />}
                      title={x.ticker}
                      subtitle={<Num>{`${t('rec.fromHigh')} ${ddStr}`}</Num>}
                      right={
                        <RowValues
                          main={priceStr}
                          sub={ddStr}
                          subColor={x.drawdownPct === null ? 'var(--muted)' : signalColor(-x.drawdownPct)}
                        />
                      }
                      trailing={<BuyAtBrokerButton ticker={x.ticker} />}
                      minHeight={52}
                      onClick={() => dispatch({ type: 'openStock', ticker: x.ticker })}
                    />
                  );
                })}
              </>
            )
          }
        </DataState>
      </Card>

      <Button block minHeight={46} onClick={() => dispatch({ type: 'advGoto', screen: 'home', stage: 5 })}>
        {t('buy.finish')}
      </Button>
      <Button
        variant="ghost"
        alignSelf="center"
        fontSize={16}
        onClick={() => dispatch({ type: 'go', screen: 'home' })}
      >
        {t('adv.later')}
      </Button>
    </div>
  );
}
