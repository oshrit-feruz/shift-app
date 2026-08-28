import { Card, CardTitle } from '../../components/Card';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { LogoTile } from '../../components/TickerTile';
import { FlowStepper } from './FlowStepper';
import { InstitutionRows, brokerName } from './InstitutionRows';
import { useAppState, useDispatch } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import { BROKER_URLS } from '../../lib/brokerLinks';
import type { ScreenProps } from '../../App';

const BROKERS = [
  {
    key: 'blink' as const,
    name: 'Blink',
    logo: '/assets/broker-blink.webp',
    help: {
      en: 'Hebrew-first, a simple app, low minimums — the easy start.',
      he: 'בעברית, אפליקציה פשוטה, מינימום נמוך — ההתחלה הקלה.',
    },
  },
  {
    key: 'ibkr' as const,
    name: 'Interactive Brokers',
    logo: '/assets/broker-ibkr.png',
    help: {
      en: 'The widest market access, lowest fees at larger amounts.',
      he: 'הגישה הרחבה ביותר לשווקים, והעמלות הנמוכות בסכומים גדולים.',
    },
  },
  {
    key: 'colmex' as const,
    name: 'Colmex Pro',
    logo: '/assets/broker-colmex.webp',
    help: {
      en: 'Israeli service with phone support in Hebrew.',
      he: 'שירות ישראלי עם תמיכה טלפונית בעברית.',
    },
  },
];

/**
 * Broker selection + read-only account connections — one page, two behaviours:
 * inside the guided flow it shows the stepper and Continue/Skip; opened
 * standalone (Settings, portfolio CTAs) it shows only its own content and a
 * green Done. Broker account OPENING is a referral hand-off — it happens at
 * the broker, never inside Shift.
 */
export function AdvisoryConnect(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const flow = !s.advSolo;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <FlowStepper />
      <Card padding={13} gap={4}>
        <CardTitle>{t('conn.title')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          {flow ? t('conn.help') : t('conn.helpSolo')}
        </p>
      </Card>

      <Card padding={13} gap={9}>
        <CardTitle>{t('conn.brokerTitle')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
          {t('conn.brokerHelp')}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {BROKERS.map((b) => {
            const selected = s.advBroker === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => dispatch({ type: 'advBroker', broker: selected ? null : b.key })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  padding: '12px 13px',
                  borderRadius: 'var(--radius-md)',
                  font: 'inherit',
                  color: 'inherit',
                  cursor: 'pointer',
                  textAlign: 'start',
                  background: selected ? 'var(--color-accent-900)' : 'var(--color-surface)',
                  border: `1px solid ${selected ? 'var(--color-accent)' : 'var(--color-divider)'}`,
                }}
              >
                <LogoTile src={b.logo} size={34} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{b.name}</span>
                  <span className="text-muted" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45 }}>
                    {b.help[language]}
                  </span>
                </span>
                <span style={{ color: 'var(--color-accent)', fontSize: 14 }}>{selected ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
        {s.advBroker && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              padding: 11,
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-accent-700)',
              background: 'var(--sunk)',
            }}
          >
            <CardTitle size={13.5}>{t('conn.handoffTitle')}</CardTitle>
            <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
              {t('conn.handoffHelp')}
            </p>
            {/* Referral only: opening happens on the broker's own site. */}
            <Button
              variant="secondary"
              block
              minHeight={42}
              fontSize={13}
              onClick={() => window.open(BROKER_URLS[s.advBroker!], '_blank', 'noopener,noreferrer')}
            >
              {t('conn.openAt', { broker: brokerName(s.advBroker) })} ↗
            </Button>
          </div>
        )}
      </Card>

      <CardTitle size={15}>{t('conn.existing')}</CardTitle>
      <Card padding="4px 0" gap={0}>
        <InstitutionRows />
      </Card>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
        {t('conn.note')}
      </p>

      {flow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button
            block
            minHeight={46}
            onClick={() => dispatch({ type: 'advGoto', screen: 'advBuy', stage: 4 })}
          >
            {t('conn.continue')}
          </Button>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
            <Button
              variant="ghost"
              fontSize={14}
              onClick={() => dispatch({ type: 'advGoto', screen: 'advBuy', stage: 4 })}
            >
              {t('adv.skipStep')}
            </Button>
            <span style={{ width: 1, height: 14, background: 'var(--color-divider)' }} />
            <Button variant="ghost" fontSize={14} onClick={() => dispatch({ type: 'go', screen: 'home' })}>
              {t('adv.later')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="success"
          block
          minHeight={46}
          onClick={() => dispatch({ type: 'go', screen: 'home' })}
        >
          <Icon name="check" size={16} strokeWidth={2.4} />
          {t('conn.done')}
        </Button>
      )}
    </div>
  );
}
