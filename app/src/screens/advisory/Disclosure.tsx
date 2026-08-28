import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { FlowStepper } from './FlowStepper';
import { useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n/strings';
import type { ScreenProps } from '../../App';

const POINTS: StringKey[] = ['disc.p1', 'disc.p2', 'disc.p3', 'disc.p4'];

/** The four-point disclosure gate before the recommendation is shown. */
export function AdvisoryDisclosure(_: ScreenProps) {
  const dispatch = useDispatch();
  const t = useT();
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <FlowStepper />
      <Card padding={14} gap={6}>
        <CardTitle>{t('disc.title')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 16, margin: 0, lineHeight: 1.55 }}>
          {t('disc.lead')}
        </p>
      </Card>
      <Card padding="4px 0" gap={0}>
        {POINTS.map((k, i) => (
          <div
            key={k}
            style={{
              display: 'flex',
              gap: 10,
              padding: '11px 13px',
              borderTop: '1px solid var(--color-divider)',
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                flex: 'none',
                borderRadius: 6,
                background: 'var(--color-accent-900)',
                color: 'var(--color-accent-200)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 15,
              }}
            >
              {i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 16.5, lineHeight: 1.5 }}>{t(k)}</span>
          </div>
        ))}
      </Card>
      <Button block minHeight={46} onClick={() => dispatch({ type: 'advGoto', screen: 'advDash', stage: 2 })}>
        {t('disc.cta')}
      </Button>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
        <Button
          variant="ghost"
          fontSize={16}
          onClick={() => dispatch({ type: 'advGoto', screen: 'advChat' })}
        >
          {t('adv.back')}
        </Button>
        <Button variant="ghost" fontSize={16} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          {t('adv.later')}
        </Button>
      </div>
    </div>
  );
}
