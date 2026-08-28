import { useState } from 'react';
import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Tag } from '../components/Tag';
import { Num } from '../components/Num';
import { LogoTile } from '../components/TickerTile';
import { InstitutionRows } from './advisory/InstitutionRows';
import { NewPortfolioSheet } from '../sheets/NewPortfolioSheet';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import type { ScreenProps } from '../App';

const LINKED = [
  {
    logo: '/assets/broker-blink.webp',
    broker: 'Blink',
    acct: '••4821',
    detail: { en: 'Core · brokerage · 7 positions', he: 'Core · חשבון מסחר · 7 פוזיציות' },
    value: '$48,214.60',
  },
  {
    logo: '/assets/broker-ibkr.png',
    broker: 'Interactive Brokers',
    acct: '••7130',
    detail: { en: 'Global · margin · 4 positions', he: 'Global · מרווח · 4 פוזיציות' },
    value: '$12,905.11',
  },
  {
    logo: '/assets/broker-colmex.webp',
    broker: 'Colmex Pro',
    acct: '••2265',
    detail: { en: 'Dividend · cash · 4 positions', he: 'Dividend · מזומן · 4 פוזיציות' },
    value: '$21,470.02',
  },
];

export function ConnectionsScreen(_: ScreenProps) {
  const { language } = useTheme();
  const t = useT();
  const [newPfOpen, setNewPfOpen] = useState(false);

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <Card padding={13} gap={5}>
        <CardTitle>{t('connScreen.linked')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          {t('connScreen.linkedHelp')}
        </p>
      </Card>

      <Card padding="4px 0" gap={0}>
        {LINKED.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '11px 13px',
              borderTop: '1px solid var(--color-divider)',
            }}
          >
            <LogoTile src={c.logo} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14 }}>
                {c.broker}{' '}
                <span className="text-muted" style={{ fontSize: 13 }}>
                  <Num>{c.acct}</Num>
                </span>
              </span>
              <span
                className="text-muted"
                style={{
                  display: 'block',
                  fontSize: 12.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.detail[language]}
              </span>
            </span>
            <span
              style={{
                textAlign: 'end',
                whiteSpace: 'nowrap',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                alignItems: 'flex-end',
              }}
            >
              <Num size={14}>{c.value}</Num>
              <Tag variant="accent" fontSize={11}>
                {t('connScreen.live')}
              </Tag>
            </span>
          </div>
        ))}
      </Card>

      <Card padding="4px 0" gap={0}>
        <CardTitle>
          <span style={{ display: 'block', padding: '9px 13px 2px', fontSize: 15 }}>
            {t('connScreen.add')}
          </span>
        </CardTitle>
        <InstitutionRows />
      </Card>

      <Card padding={13} gap={7}>
        <CardTitle>{t('connScreen.theo')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
          {t('connScreen.theoHelp')}
        </p>
        <Button variant="secondary" block fontSize={13} minHeight={40} onClick={() => setNewPfOpen(true)}>
          {t('connScreen.newTheo')}
        </Button>
      </Card>

      <Card padding="4px 0" gap={0}>
        {(
          [
            ['connScreen.freq', 'connScreen.freqV'],
            ['connScreen.perms', 'connScreen.permsV'],
            ['connScreen.history', 'connScreen.historyV'],
          ] as const
        ).map(([k, v]) => (
          <div
            key={k}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              fontSize: 13,
              padding: '11px 13px',
              borderTop: '1px solid var(--color-divider)',
            }}
          >
            <span className="text-muted">{t(k)}</span>
            <span>{t(v)}</span>
          </div>
        ))}
      </Card>
      <NewPortfolioSheet open={newPfOpen} onClose={() => setNewPfOpen(false)} />
    </div>
  );
}
