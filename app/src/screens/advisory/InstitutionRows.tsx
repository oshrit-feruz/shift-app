import { useState } from 'react';
import { useAppState, useDispatch, type InstitutionKey } from '../../state/appState';
import { useTheme } from '../../theme/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n/strings';

interface Provider {
  label: { en: string; he: string };
  logo: string | null;
}

const INSTITUTIONS: Array<{
  key: InstitutionKey;
  label: StringKey;
  initial: { en: string; he: string };
  providers: Provider[];
}> = [
  {
    key: 'broker',
    label: 'conn.broker',
    initial: { en: 'B', he: 'B' },
    providers: [
      { label: { en: 'Blink', he: 'Blink' }, logo: '/assets/broker-blink.webp' },
      { label: { en: 'Interactive Brokers', he: 'Interactive Brokers' }, logo: '/assets/broker-ibkr.webp' },
      { label: { en: 'Colmex Pro', he: 'Colmex Pro' }, logo: '/assets/broker-colmex.webp' },
      { label: { en: 'Meitav Trade', he: 'מיטב טרייד' }, logo: '/assets/prov-meitav.webp' },
      { label: { en: 'Excellence Trade', he: 'אקסלנס טרייד' }, logo: '/assets/prov-excellence.webp' },
    ],
  },
  {
    key: 'bank',
    label: 'conn.bank',
    initial: { en: '₪', he: '₪' },
    providers: [
      { label: { en: 'Leumi', he: 'לאומי' }, logo: '/assets/prov-leumi.webp' },
      { label: { en: 'Hapoalim', he: 'הפועלים' }, logo: '/assets/prov-hapoalim.webp' },
      { label: { en: 'Discount', he: 'דיסקונט' }, logo: '/assets/prov-discount.svg' },
      { label: { en: 'Mizrahi-Tefahot', he: 'מזרחי-טפחות' }, logo: '/assets/prov-mizrahi.webp' },
      { label: { en: 'One Zero', he: 'One Zero' }, logo: '/assets/prov-onezero.webp' },
    ],
  },
  {
    key: 'pension',
    label: 'conn.pension',
    initial: { en: 'P', he: 'פ' },
    providers: [
      { label: { en: 'Menora Mivtachim', he: 'מנורה מבטחים' }, logo: '/assets/prov-menora.webp' },
      { label: { en: 'Harel', he: 'הראל' }, logo: '/assets/prov-harel.webp' },
      { label: { en: 'Migdal', he: 'מגדל' }, logo: '/assets/prov-migdal.webp' },
      { label: { en: 'The Phoenix', he: 'הפניקס' }, logo: '/assets/prov-phoenix.webp' },
      { label: { en: 'Altshuler Shaham', he: 'אלטשולר שחם' }, logo: '/assets/prov-altshuler.webp' },
    ],
  },
  {
    key: 'hisht',
    label: 'conn.hisht',
    initial: { en: 'K', he: 'ה' },
    providers: [
      { label: { en: 'Altshuler Shaham', he: 'אלטשולר שחם' }, logo: '/assets/prov-altshuler.webp' },
      { label: { en: 'Yelin Lapidot', he: 'ילין לפידות' }, logo: '/assets/prov-yelin.webp' },
      { label: { en: 'More', he: 'מור' }, logo: '/assets/prov-more.webp' },
      { label: { en: 'Analyst', he: 'אנליסט' }, logo: '/assets/prov-analyst.webp' },
      { label: { en: 'The Phoenix', he: 'הפניקס' }, logo: '/assets/prov-phoenix.webp' },
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
        const chosen =
          s.advConnections[inst.key] ??
          (inst.key === 'broker' && s.advBroker ? brokerName(s.advBroker) : undefined);
        const openNow = openKey === inst.key;
        return (
          <div
            key={inst.key}
            style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--color-divider)' }}
          >
            <button
              type="button"
              onClick={() => setOpenKey(openNow ? null : inst.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 54,
                padding: '9px 13px',
                background: 'transparent',
                border: 0,
                color: 'inherit',
                font: 'inherit',
                cursor: 'pointer',
                textAlign: 'start',
                width: '100%',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  flex: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-accent-900)',
                  color: 'var(--color-accent-200)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 17,
                  fontWeight: 600,
                }}
              >
                {inst.initial[language]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16.5 }}>{t(inst.label)}</span>
                <span className="text-muted" style={{ display: 'block', fontSize: 15.5 }}>
                  {chosen ?? t('conn.choose')}
                </span>
              </span>
              <span
                style={{
                  flex: 'none',
                  whiteSpace: 'nowrap',
                  padding: '7px 13px',
                  borderRadius: 999,
                  fontSize: 15.5,
                  ...(chosen
                    ? {
                        border: '1px solid var(--color-accent)',
                        background: 'var(--color-accent-900)',
                        color: 'var(--color-accent-200)',
                      }
                    : {
                        border: '1px solid var(--color-divider)',
                        background: 'var(--sunk)',
                        color: 'inherit',
                      }),
                }}
              >
                {chosen ? t('conn.connected') : openNow ? t('conn.close') : t('conn.connect')}
              </span>
            </button>
            {openNow && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 13px 13px' }}>
                {inst.providers.map((prov) => {
                  const label = prov.label[language];
                  const selected = chosen === label;
                  return (
                    <button
                      key={prov.label.en}
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'advConnect', inst: inst.key, provider: selected ? null : label });
                        setOpenKey(null);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '8px 13px',
                        borderRadius: 999,
                        font: 'inherit',
                        fontSize: 16,
                        cursor: 'pointer',
                        ...(selected
                          ? {
                              border: '1px solid var(--color-accent)',
                              background: 'var(--color-accent-800)',
                              color: 'var(--acc-pale)',
                            }
                          : {
                              border: '1px solid var(--color-divider)',
                              background: 'var(--sunk)',
                              color: 'inherit',
                            }),
                      }}
                    >
                      {prov.logo && (
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            flex: 'none',
                            borderRadius: 5,
                            backgroundColor: '#fff',
                            backgroundImage: `url(${prov.logo})`,
                            backgroundSize: 'contain',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'center',
                          }}
                        />
                      )}
                      {label}
                    </button>
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
