import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { AllocationBar, ALLOC_COLORS } from '../../components/AllocationBar';
import { FlowStepper } from './FlowStepper';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
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
          <Tag variant="accent" fontSize={12}>
            {t('adv.tag')}
          </Tag>
          <Tag variant="outline" fontSize={12}>
            {t('adv.noAction')}
          </Tag>
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-2xl)' }}>{t('buy.title')}</div>
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, lineHeight: 1.5 }}>
          {t('buy.help')}
        </p>
      </Card>

      <Card padding={13} gap={9}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t(`profile.${profileKey}` as StringKey)}</CardTitle>
          <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
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
            />
          ))}
          {profile.satellitePct > 0 && (
            <div
              style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-sm)', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--color-divider)' }}
            >
              <Tag variant="accent" fontSize={12}>
                Recovery Detector
              </Tag>
              <span style={{ flex: 1 }}>Satellite</span>
              <Num size={13} style={{ color: 'var(--muted)' }}>
                {'$' + (profile.satellitePct * 100).toLocaleString('en-US')}
              </Num>
              <Num>{profile.satellitePct}%</Num>
            </div>
          )}
        </div>
      </Card>

      <Button block minHeight={46} onClick={() => dispatch({ type: 'advGoto', screen: 'home', stage: 5 })}>
        {t('buy.finish')}
      </Button>
      <Button variant="ghost" alignSelf="center" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
        {t('adv.later')}
      </Button>
    </div>
  );
}
