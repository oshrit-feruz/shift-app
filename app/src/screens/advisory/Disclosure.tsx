import { Card, CardTitle } from '../../components/Card';
import { IconTile } from '../../components/IconTile';
import { ListRow } from '../../components/ListRow';
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
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, lineHeight: 1.55 }}>
          {t('disc.lead')}
        </p>
      </Card>
      <Card padding="4px 0" gap={0}>
        {POINTS.map((k, i) => (
          <ListRow
            key={k}
            align="start"
            minHeight={0}
            padding="11px 13px"
            leading={
              <IconTile size={20} variant="tint" fontSize={12}>
                {i + 1}
              </IconTile>
            }
            title={
              <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-regular)', lineHeight: 1.5, whiteSpace: 'normal' }}>
                {t(k)}
              </span>
            }
          />
        ))}
      </Card>
      <Button block minHeight={46} onClick={() => dispatch({ type: 'advGoto', screen: 'advDash', stage: 2 })}>
        {t('disc.cta')}
      </Button>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
        <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'advGoto', screen: 'advChat' })}>
          {t('adv.back')}
        </Button>
        <Button variant="ghost" fontSize={13} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
          {t('adv.later')}
        </Button>
      </div>
    </div>
  );
}
