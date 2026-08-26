import { useState } from 'react';
import { Chip } from '../../components/Chip';
import { IconTile } from '../../components/IconTile';
import { ListRow } from '../../components/ListRow';
import { LogoTile } from '../../components/TickerTile';
import { useAppState, useDispatch, type InstitutionKey } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n/strings';

interface Provider {
  label: { en: string; he: string };
  logo: string | null;
}

const INSTITUTIONS: Array<{ key: InstitutionKey; label: StringKey; initial: { en: string; he: string }; providers: Provider[] }> = [
  {
    key: 'broker',
    label: 'conn.broker',
    initial: { en: 'B', he: 'B' },
    providers: [
      { label: { en: 'Blink', he: 'Blink' }, logo: '/assets/broker-blink.webp' },
      { label: { en: 'Interactive Brokers', he: 'Interactive Brokers' }, logo: '/assets/broker-ibkr.png' },
      { label: { en: 'Colmex Pro', he: 'Colmex Pro' }, logo: '/assets/broker-colmex.webp' },
      { label: { en: 'Meitav Trade', he: 'מיטב טרייד' }, logo: '/assets/prov-meitav.jpg' },
      { label: { en: 'Excellence Trade', he: 'אקסלנס טרייד' }, logo: '/assets/prov-excellence.jpg' },
    ],
  },
  {
    key: 'bank',
    label: 'conn.bank',
    initial: { en: '₪', he: '₪' },
    providers: [
      { label: { en: 'Leumi', he: 'לאומי' }, logo: '/assets/prov-leumi.png' },
      { label: { en: 'Hapoalim', he: 'הפועלים' }, logo: '/assets/prov-hapoalim.jpg' },
      { label: { en: 'Discount', he: 'דיסקונט' }, logo: '/assets/prov-discount.svg' },
      { label: { en: 'Mizrahi-Tefahot', he: 'מזרחי-טפחות' }, logo: '/assets/prov-mizrahi.jpg' },
      { label: { en: 'One Zero', he: 'One Zero' }, logo: '/assets/prov-onezero.png' },
    ],
  },
  {
    key: 'pension',
    label: 'conn.pension',
    initial: { en: 'P', he: 'פ' },
    providers: [
      { label: { en: 'Menora Mivtachim', he: 'מנורה מבטחים' }, logo: '/assets/prov-menora.webp' },
      { label: { en: 'Harel', he: 'הראל' }, logo: '/assets/prov-harel.png' },
      { label: { en: 'Migdal', he: 'מגדל' }, logo: '/assets/prov-migdal.png' },
      { label: { en: 'The Phoenix', he: 'הפניקס' }, logo: '/assets/prov-phoenix.png' },
      { label: { en: 'Altshuler Shaham', he: 'אלטשולר שחם' }, logo: '/assets/prov-altshuler.png' },
    ],
  },
  {
    key: 'hisht',
    label: 'conn.hisht',
    initial: { en: 'K', he: 'ה' },
    providers: [
      { label: { en: 'Altshuler Shaham', he: 'אלטשולר שחם' }, logo: '/assets/prov-altshuler.png' },
      { label: { en: 'Yelin Lapidot', he: 'ילין לפידות' }, logo: '/assets/prov-yelin.png' },
      { label: { en: 'More', he: 'מור' }, logo: '/assets/prov-more.png' },
      { label: { en: 'Analyst', he: 'אנליסט' }, logo: '/assets/prov-analyst.webp' },
      { label: { en: 'The Phoenix', he: 'הפניקס' }, logo: '/assets/prov-phoenix.png' },
    ],
  },
];

/** Read-only institution connection rows: broker / bank / pension / hishtalmut,
 *  each expanding to a provider picker. Shared by the advisory Connect step and
 *  the standalone Connections screen. */
export function InstitutionRows() {
  const s = useAppState();
  const dispatch = useDispatch();
  const { language } = useTheme();
  const t = useT();
  const [openKey, setOpenKey] = useState<InstitutionKey | null>(null);

  return (
    <>
      {INSTITUTIONS.map((inst) => {
        const chosen = s.advConnections[inst.key] ?? (inst.key === 'broker' && s.advBroker ? brokerName(s.advBroker) : undefined);
        const openNow = openKey === inst.key;
        return (
          <div key={inst.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <ListRow
              onClick={() => setOpenKey(openNow ? null : inst.key)}
              minHeight={54}
              padding="9px 13px"
              leading={
                <IconTile size={32} variant="tint" fontSize={14}>
                  <b>{inst.initial[language]}</b>
                </IconTile>
              }
              title={<span style={{ fontSize: 'var(--fs-sm)', fontWeight: 'var(--fw-regular)' }}>{t(inst.label)}</span>}
              subtitle={chosen ?? t('conn.choose')}
              trailing={
                <Chip active={!!chosen} well big>
                  {chosen ? t('conn.connected') : openNow ? t('conn.close') : t('conn.connect')}
                </Chip>
              }
            />
            {openNow && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 13px 13px' }}>
                {inst.providers.map((prov) => {
                  const label = prov.label[language];
                  const selected = chosen === label;
                  return (
                    <Chip
                      key={prov.label.en}
                      big
                      well
                      active={selected}
                      onClick={() => {
                        dispatch({ type: 'advConnect', inst: inst.key, provider: selected ? null : label });
                        setOpenKey(null);
                      }}
                    >
                      {prov.logo && <LogoTile src={prov.logo} size={18} />}
                      {label}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function brokerName(key: 'blink' | 'ibkr' | 'colmex'): string {
  return key === 'ibkr' ? 'Interactive Brokers' : key === 'colmex' ? 'Colmex Pro' : 'Blink';
}
