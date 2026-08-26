import { Card, CardTitle } from '../components/Card';
import { ListRow } from '../components/ListRow';
import { Button } from '../components/Button';
import { Toggle } from '../components/Toggle';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useTheme, type Signal, type Theme, type Language } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { DEMO_FLAGS } from '../data/demoAdapter';
import { useState } from 'react';
import type { ScreenProps } from '../App';

export function SettingsScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, setMode, theme, setTheme, signal, setSignal, language, setLanguage } = useTheme();
  const t = useT();
  const setup = setupProgress(s);
  const [flags, setFlags] = useState({ unavailable: DEMO_FLAGS.unavailable, satEmpty: DEMO_FLAGS.satEmpty });
  const [notif, setNotif] = useState({ push: true, email: true, sms: false, digest: true, movers: false });

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* Mode pill */}
      <Card padding="10px 12px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--fs-base)' }}>{t('set.modeRow')}</span>
          <div style={{ width: 200 }}>
            <SegmentedControl
              options={[
                { value: 'beginner', label: t('more.beginner') },
                { value: 'advanced', label: t('more.advanced') },
              ]}
              value={mode}
              onChange={setMode}
              fontSize={13}
            />
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0, lineHeight: 1.4 }}>
          {t('set.modeHelp')}
        </p>
      </Card>

      {/* Appearance */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={15}>{t('set.appearance')}</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--fs-md)' }}>{t('set.theme')}</span>
          <div style={{ width: 170 }}>
            <SegmentedControl<Theme>
              options={[
                { value: 'dark', label: t('set.themeDark') },
                { value: 'light', label: t('set.themeLight') },
              ]}
              value={theme}
              onChange={setTheme}
              fontSize={13}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--fs-md)' }}>{t('set.language')}</span>
          <div style={{ width: 170 }}>
            <SegmentedControl<Language>
              options={[
                { value: 'he', label: 'עברית' },
                { value: 'en', label: 'English' },
              ]}
              value={language}
              onChange={setLanguage}
              fontSize={13}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--fs-md)' }}>{t('set.signal')}</span>
          <SegmentedControl<Signal>
            options={[
              { value: 'vivid', label: t('set.signalVivid') },
              { value: 'balanced', label: t('set.signalBalanced') },
              { value: 'muted', label: t('set.signalMuted') },
            ]}
            value={signal}
            onChange={setSignal}
            fontSize={13}
          />
          <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
            {t('set.signalHelp')}
          </p>
        </div>
      </Card>

      {/* Price-alert thresholds — informational only, opt-in, blank by default */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={15}>{t('thresh.title')}</CardTitle>
        <div className="text-muted" style={{ fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
          {t('thresh.help')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--color-divider)', paddingTop: 9 }}>
          <div className="field">
            <label style={{ fontSize: 'var(--fs-sm)' }}>{t('thresh.up')}</label>
            <input
              className="input"
              type="number"
              placeholder="+%"
              value={s.alertUpThreshold}
              onChange={(e) => dispatch({ type: 'setThreshold', which: 'up', value: e.target.value })}
            />
          </div>
          <div className="field">
            <label style={{ fontSize: 'var(--fs-sm)' }}>{t('thresh.down')}</label>
            <input
              className="input"
              type="number"
              placeholder="−%"
              value={s.alertDownThreshold}
              onChange={(e) => dispatch({ type: 'setThreshold', which: 'down', value: e.target.value })}
            />
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card padding="4px 0" gap={0}>
        <CardTitle size={15}>
          <span style={{ display: 'block', padding: '6px 12px 1px' }}>{t('set.notifSection')}</span>
        </CardTitle>
        {(
          [
            ['push', { en: 'Push notifications', he: 'התראות פוש' }, { en: 'Price, news and earnings alerts', he: 'מחיר, חדשות ודוחות' }],
            ['email', { en: 'Email', he: 'אימייל' }, { en: 'Same alerts to noa.k@example.com', he: 'אותן התראות ל-noa.k@example.com' }],
            ['sms', { en: 'SMS', he: 'מסרון' }, { en: 'Price thresholds only', he: 'רק רף מחיר' }],
            ['digest', { en: 'Morning digest', he: 'תקציר בוקר' }, { en: 'One message at 08:00', he: 'הודעה אחת ב-08:00' }],
            ['movers', { en: 'Unusual movers', he: 'תנועות חריגות' }, { en: 'Watchlist moves over 5%', he: 'תנועה מעל 5% בווטצ׳ליסט' }],
          ] as const
        ).map(([k, label, help]) => (
          <ListRow
            key={k}
            minHeight={44}
            padding="8px 12px"
            title={<span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>{label[language]}</span>}
            subtitle={help[language]}
            trailing={<Toggle on={notif[k]} onChange={(v) => setNotif({ ...notif, [k]: v })} />}
          />
        ))}
      </Card>

      {/* Data & display — includes demo-state switches (honest-state demos) */}
      <Card padding="4px 0" gap={0}>
        <CardTitle size={15}>
          <span style={{ display: 'block', padding: '6px 12px 1px' }}>{t('set.dataSection')}</span>
        </CardTitle>
        <DemoFlagRow
          label={language === 'he' ? 'הדגמה: נתונים לא זמינים' : 'Demo: data unavailable'}
          help={
            language === 'he'
              ? 'מדמה כשל מקור נתונים — המסכים מציגים מצב "לא זמין" כן'
              : 'Simulates a data-source failure — screens show the honest unavailable state'
          }
          on={flags.unavailable}
          onChange={(v) => {
            DEMO_FLAGS.set('unavailable', v);
            setFlags({ ...flags, unavailable: v });
          }}
        />
        <DemoFlagRow
          label={language === 'he' ? 'הדגמה: אין פוזיציות Satellite' : 'Demo: no satellite positions'}
          help={
            language === 'he'
              ? 'מציג את מצב הריק הכן בהמלצה — בלי נתוני דמה'
              : 'Shows the honest empty state on the recommendation — no placeholder rows'
          }
          on={flags.satEmpty}
          onChange={(v) => {
            DEMO_FLAGS.set('satEmpty', v);
            setFlags({ ...flags, satEmpty: v });
          }}
        />
      </Card>

      {/* Setup */}
      <Card padding="6px 0" gap={0}>
        <CardTitle size={15}>
          <span style={{ display: 'block', padding: '8px 13px 2px' }}>{t('setup.section')}</span>
        </CardTitle>
        {setup.incomplete && (
          <SettingsLink
            accent
            label={t('setup.banner')}
            meta={t('setup.stepOf', { n: setup.stepLabel })}
            onClick={() => dispatch({ type: 'advGoto', screen: setup.resumeScreen, solo: false })}
          />
        )}
        <SettingsLink
          label={t('setup.instRow')}
          onClick={() => dispatch({ type: 'advGoto', screen: 'advConnect', solo: true })}
        />
        <SettingsLink label={t('setup.tourRow')} onClick={() => dispatch({ type: 'go', screen: 'tour' })} />
      </Card>

      <Button variant="ghost" alignSelf="flex-start" fontSize={13} style={{ color: 'var(--down)' }}>
        {t('set.deleteAcct')}
      </Button>
    </div>
  );
}

function SettingsLink({
  label,
  meta,
  onClick,
  accent,
}: {
  label: string;
  meta?: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <ListRow
      onClick={onClick}
      minHeight={46}
      padding="10px 13px"
      title={
        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)', color: accent ? 'var(--color-accent-200)' : undefined }}>
          {label}
        </span>
      }
      right={
        meta != null ? (
          <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {meta}
          </span>
        ) : undefined
      }
      trailing={<span style={{ opacity: 0.45 }}>›</span>}
    />
  );
}

function DemoFlagRow({
  label,
  help,
  on,
  onChange,
}: {
  label: string;
  help: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <ListRow
      minHeight={44}
      padding="8px 12px"
      title={<span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-regular)' }}>{label}</span>}
      subtitle={help}
      trailing={<Toggle on={on} onChange={onChange} />}
    />
  );
}
