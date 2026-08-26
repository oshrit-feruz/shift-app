import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { useDispatch } from '../../state/appState';
import { useT } from '../../i18n/useT';

/**
 * Shown when a recommendation screen is reached without a complete,
 * deterministically-mapped answer set. The profile is NEVER defaulted —
 * an indeterminate state routes back to the questionnaire instead.
 */
export function ProfileGate() {
  const dispatch = useDispatch();
  const t = useT();
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <Card padding={16} gap={8}>
        <CardTitle>{t('adv.profileMissingTitle')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, lineHeight: 1.55 }}>
          {t('adv.profileMissingBody')}
        </p>
        <Button block minHeight={46} onClick={() => dispatch({ type: 'advGoto', screen: 'advChat' })}>
          {t('adv.profileMissingCta')}
        </Button>
      </Card>
    </div>
  );
}
