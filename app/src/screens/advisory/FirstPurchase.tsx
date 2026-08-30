import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { AllocationBar, ALLOC_COLORS } from '../../components/AllocationBar';
import { FlowStepper } from './FlowStepper';
import { CandidatesCard } from './CandidatesCard';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { BuyAtBrokerButton } from '../../components/BuyAtBrokerButton';
import { fundTicker } from '../../lib/brokerLinks';
import { CORE_FUNDS, mapProfile, PROFILES } from '../../lib/advisory';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';

/** First-purchase SIMULATION — an order-list preview. Nothing is bought here;
 *  execution happens at the user's own broker. */
export function AdvisoryFirstPurchase(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const profileKey = mapProfile(s.advAnswers) ?? 'bal';
  const profile = PROFILES[profileKey];

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
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-heading)' }}>
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
                {t('rec.dailyTag')}
              </Tag>
              <span style={{ flex: 1 }}>{t('rec.satellite')}</span>
              <Num size={16} style={{ color: 'var(--muted)' }}>
                {'$' + (profile.satellitePct * 100).toLocaleString('en-US')}
              </Num>
              <Num>{profile.satellitePct}%</Num>
            </div>
          )}
        </div>
      </Card>

      {/* The individual-stock side of the same order list — the very card
          the recommendation screen shows, caveats included. */}
      <CandidatesCard />

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
