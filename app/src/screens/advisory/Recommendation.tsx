import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tag } from '../../components/Tag';
import { Num } from '../../components/Num';
import { AllocationBar, ALLOC_COLORS } from '../../components/AllocationBar';
import { ListRow, RowValues } from '../../components/ListRow';
import { TickerTile } from '../../components/TickerTile';
import { DataState, EmptyState } from '../../components/DataState';
import { FlowStepper } from './FlowStepper';
import { ProfileGate } from './ProfileGate';
import { useAppState, useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import { CORE_FUNDS, mapProfile, PROFILES } from '../../lib/advisory';
import { demoService } from '../../data/demoAdapter';
import { useLoadable } from '../../data/useLoadable';
import { money, pct, signalColor } from '../../lib/format';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';

const SAT_RULES: StringKey[] = ['rec.satRule1', 'rec.satRule2', 'rec.satRule3', 'rec.satRule4', 'rec.satRule5'];

/** The Core-Satellite recommendation dashboard. */
export function AdvisoryRecommendation(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useT();
  const profileKey = mapProfile(s.advAnswers);
  const sat = useLoadable(() => demoService.satellitePositions(), []);
  if (!profileKey) return <ProfileGate />;
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--fs-2xl)' }}>{t(`profile.${profileKey}` as StringKey)}</div>
          <span style={{ marginInlineStart: 'auto' }}>
            <Button variant="ghost" fontSize={12.5} style={{ padding: 0 }} onClick={() => dispatch({ type: 'advReset' })}>
              {t('adv.redoChat')}
            </Button>
          </span>
        </div>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.55, margin: 0, opacity: 0.85 }}>{t('rec.coreSatIntro')}</p>
      </Card>

      {/* Core — specific fund per category, not just a percentage. Fund names
          are placeholders pending product sign-off (see lib/advisory.ts). */}
      <Card padding={13} gap={9}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <CardTitle>{t('rec.core')}</CardTitle>
          <Num size={12.5} style={{ color: 'var(--muted)' }}>
            {100 - profile.satellitePct}%
          </Num>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0, lineHeight: 1.5 }}>
          {t('rec.coreHelp')}
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--sunk)' }}>
          <Tag variant="neutral" fontSize={12}>
            {t('adv.fromLibrary')}
          </Tag>
          <span className="text-muted" style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
            {t('rec.eduCoreBody')}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {profile.core.map((c, i) => (
            <AllocationBar
              key={c.category}
              name={t(`core.${c.category}` as StringKey)}
              pct={c.pct}
              fund={CORE_FUNDS[c.category]}
              colorVar={ALLOC_COLORS[i % ALLOC_COLORS.length]}
            />
          ))}
        </div>
      </Card>

      {profile.satellitePct > 0 && (
        <>
          <Card padding={13} gap={9} outlined>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <CardTitle>{t('rec.satellite')}</CardTitle>
              <Num size={12.5} style={{ color: 'var(--muted)' }}>
                {profile.satellitePct}%
              </Num>
              <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                {t('rec.ofPortfolio')}
              </span>
              <span style={{ marginInlineStart: 'auto' }}>
                <Tag variant="accent" fontSize={12}>
                  Recovery Detector
                </Tag>
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0, lineHeight: 1.5 }}>
              {t('rec.satHelp')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {SAT_RULES.map((k) => (
                <div key={k} style={{ display: 'flex', gap: 8, fontSize: 'var(--fs-xs)', lineHeight: 1.45 }}>
                  <span style={{ color: 'var(--color-accent-200)', flex: 'none' }}>·</span>
                  <span className="text-muted" style={{ flex: 1 }}>
                    {t(k)}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* Live positions: ticker, entry, current, % change — no day count.
              Honest empty state when the engine holds nothing. */}
          <Card padding="13px 13px 4px" gap={7}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <CardTitle>{t('rec.satOpenPositions')}</CardTitle>
              <span style={{ marginInlineStart: 'auto' }}>
                <Tag variant="outline" fontSize={12}>
                  {t('rec.livePrices')}
                </Tag>
              </span>
            </div>
            <DataState state={sat.state} onRetry={sat.retry}>
              {(positions) =>
                positions.length === 0 ? (
                  <EmptyState>{t('rec.noPositions')}</EmptyState>
                ) : (
                  <>
                    {positions.map((x) => {
                      const pl = ((x.currentPrice - x.entryPrice) / x.entryPrice) * 100;
                      return (
                        <ListRow
                          key={x.ticker}
                          leading={<TickerTile ticker={x.ticker} />}
                          title={x.ticker}
                          subtitle={<Num>{`${t('rec.entry')} ${money(x.entryPrice)}`}</Num>}
                          right={<RowValues main={money(x.currentPrice)} sub={pct(pl, 1)} subColor={signalColor(pl)} />}
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
        </>
      )}

      <Card padding={13} gap={8}>
        <CardTitle>{t('rec.nextStep')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, lineHeight: 1.5 }}>
          {t('rec.nextStepHelp')}
        </p>
        <Button block minHeight={44} onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', stage: 3 })}>
          {t('rec.chooseBroker')}
        </Button>
        <Button variant="ghost" alignSelf="center" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          {t('adv.later')}
        </Button>
      </Card>
    </div>
  );
}
