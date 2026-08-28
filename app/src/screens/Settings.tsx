import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { Toggle } from '../components/Toggle';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useAuth } from '../auth/AuthProvider';
import { DeleteAccountSheet } from '../sheets/DeleteAccountSheet';
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
  const { session, profile, signOut } = useAuth();
  const user = session.status === 'ok' ? session.data?.user : undefined;
  const provider = user?.app_metadata?.provider;
  const [flags, setFlags] = useState({ unavailable: DEMO_FLAGS.unavailable, showcase: DEMO_FLAGS.showcase });
  const [notif, setNotif] = useState({ push: true, email: true, sms: false, digest: true, movers: false });
  const [deleteOpen, setDeleteOpen] = useState(false);
  // The address alerts would actually go to, rather than the prototype's
  // invented one. Built inline as a bilingual pair to match the other rows in
  // this list; the no-email branch is reachable only for a provider that
  // returns none, and says so instead of naming a stand-in address.
  const emailHelp = profile.email
    ? { en: `Same alerts to ${profile.email}`, he: `אותן התראות ל-${profile.email}` }
    : { en: 'Same alerts to your sign-in email', he: 'אותן התראות לאימייל שאיתו נכנסת' };

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* Account, first: signing out is a routine action, and buried at the
          foot of a long scroll it read as missing entirely. Deletion stays at
          the bottom — destructive and rare, it should not sit under the
          thumb next to the everyday control. Sign-out itself resets the app
          state (useRemoteSync watches the session), so nothing here has to
          remember to clear the previous user's slice. */}
      {user && (
        <Card padding="12px 13px" gap={9}>
          <CardTitle size={15}>{t('set.accountSection')}</CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            {profile.avatarUrl && (
              <img
                src={profile.avatarUrl}
                alt=""
                width={44}
                height={44}
                // Google's avatar host answers 403 when a referrer from an
                // unregistered origin is sent, which shows up as a silently
                // broken image on the deployed app but not in dev.
                referrerPolicy="no-referrer"
                style={{ borderRadius: '50%', flex: 'none', objectFit: 'cover' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              {profile.fullName ? (
                <>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{profile.fullName}</span>
                  <span
                    className="text-muted"
                    style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {profile.email ?? user.id}
                  </span>
                </>
              ) : (
                // No display name from the provider — fall back to naming the
                // account by its email rather than inventing one.
                <span style={{ fontSize: 14 }}>
                  {t('set.signedInAs', { email: profile.email ?? user.id })}
                </span>
              )}
              {(provider === 'google' || provider === 'apple') && (
                <span className="text-muted" style={{ fontSize: 12.5 }}>
                  {t(provider === 'google' ? 'set.providerGoogle' : 'set.providerApple')}
                </span>
              )}
            </div>
          </div>
          <Button variant="secondary" alignSelf="flex-start" fontSize={13} onClick={() => signOut()}>
            {t('set.signOut')}
          </Button>
        </Card>
      )}

      {/* Mode pill */}
      <Card padding="10px 12px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 15 }}>{t('set.modeRow')}</span>
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
        <p className="text-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>
          {t('set.modeHelp')}
        </p>
      </Card>

      {/* Appearance */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={15}>{t('set.appearance')}</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14 }}>{t('set.theme')}</span>
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
          <span style={{ flex: 1, fontSize: 14 }}>{t('set.language')}</span>
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
          <span style={{ fontSize: 14 }}>{t('set.signal')}</span>
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
          <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
            {t('set.signalHelp')}
          </p>
        </div>
      </Card>

      {/* Price-alert thresholds — informational only, opt-in, blank by default */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={15}>{t('thresh.title')}</CardTitle>
        <div className="text-muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
          {t('thresh.help')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, borderTop: '1px solid var(--color-divider)', paddingTop: 9 }}>
          <div className="field">
            <label style={{ fontSize: 13 }}>{t('thresh.up')}</label>
            <input
              className="input"
              type="number"
              placeholder="+%"
              value={s.alertUpThreshold}
              onChange={(e) => dispatch({ type: 'setThreshold', which: 'up', value: e.target.value })}
            />
          </div>
          <div className="field">
            <label style={{ fontSize: 13 }}>{t('thresh.down')}</label>
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
            ['email', { en: 'Email', he: 'אימייל' }, emailHelp],
            ['sms', { en: 'SMS', he: 'מסרון' }, { en: 'Price thresholds only', he: 'רק רף מחיר' }],
            ['digest', { en: 'Morning digest', he: 'תקציר בוקר' }, { en: 'One message at 08:00', he: 'הודעה אחת ב-08:00' }],
            ['movers', { en: 'Unusual movers', he: 'תנועות חריגות' }, { en: 'Watchlist moves over 5%', he: 'תנועה מעל 5% בווטצ׳ליסט' }],
          ] as const
        ).map(([k, label, help]) => (
          <div
            key={k}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 12px', borderTop: '1px solid var(--color-divider)' }}
          >
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14 }}>{label[language]}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>
                {help[language]}
              </span>
            </span>
            <Toggle label={label[language]} on={notif[k]} onChange={(v) => setNotif({ ...notif, [k]: v })} />
          </div>
        ))}
      </Card>

      {/* Data & display — demo-state switch for the demo-backed surfaces.
          The old "no satellite positions" switch was removed when Satellite
          went live: its empty state is now whatever the engine actually
          reports, and a control that faked it would misrepresent live data. */}
      <Card padding="4px 0" gap={0}>
        <CardTitle size={15}>
          <span style={{ display: 'block', padding: '6px 12px 1px' }}>{t('set.dataSection')}</span>
        </CardTitle>
        {/* Showcase mode: illustrative earnings figures, to show what a paid
            data plan renders. Labelled on every screen that shows it — see
            components/DemoBanner. */}
        <DemoFlagRow
          label={t('set.showcaseRow')}
          help={t('set.showcaseHelp')}
          on={flags.showcase}
          onChange={(v) => {
            DEMO_FLAGS.set('showcase', v);
            setFlags({ ...flags, showcase: v });
          }}
        />
        <DemoFlagRow
          label={language === 'he' ? 'הדגמה: נתונים לא זמינים' : 'Demo: data unavailable'}
          help={
            language === 'he'
              ? 'מדמה כשל מקור נתונים — המסכים מציגים מצב "לא זמין" כן. לא חל על פוזיציות Satellite, שהן נתונים חיים.'
              : 'Simulates a data-source failure — screens show the honest unavailable state. Does not apply to Satellite positions, which are live.'
          }
          on={flags.unavailable}
          onChange={(v) => {
            DEMO_FLAGS.set('unavailable', v);
            setFlags({ ...flags, unavailable: v });
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
        <SettingsLink label={t('setup.tourRow')} onClick={() => dispatch({ type: 'go', screen: 'steps' })} />
      </Card>

      {/* Opens the confirmation sheet; nothing is deleted from this click. */}
      {user && (
        <Button
          variant="danger"
          alignSelf="flex-start"
          fontSize={13}
          onClick={() => setDeleteOpen(true)}
        >
          {t('set.deleteAcct')}
        </Button>
      )}
      <DeleteAccountSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} />
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
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        minHeight: 46,
        padding: '10px 13px',
        border: 0,
        borderTop: '1px solid var(--color-divider)',
        background: 'transparent',
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        textAlign: 'start',
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: accent ? 'var(--color-accent-200)' : undefined }}>{label}</span>
      {meta != null && (
        <span className="text-muted" style={{ fontSize: 13 }}>
          {meta}
        </span>
      )}
      <span style={{ opacity: 0.45 }}>›</span>
    </button>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 12px', borderTop: '1px solid var(--color-divider)' }}>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14 }}>{label}</span>
        <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>
          {help}
        </span>
      </span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}
