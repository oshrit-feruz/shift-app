import { Card, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { AppleLogo } from '../components/Icon';
import { Toggle } from '../components/Toggle';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAppState, useDispatch, setupProgress } from '../state/appState';
import { useAuth } from '../auth/AuthProvider';
import { useProfile } from '../auth/ProfileProvider';
import { EditProfileSheet } from '../sheets/EditProfileSheet';
import { DeleteAccountSheet } from '../sheets/DeleteAccountSheet';
import { useTheme, type Signal, type Theme, type Language } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { DEMO_FLAGS } from '../data/demoFlags';
import { resetConnectedAccountCache } from '../data/appService';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, isPushOn, pushSupport, type PushSupport } from '../lib/push';
import type { StringKey } from '../i18n/strings';
import type { ScreenProps } from '../App';

export function SettingsScreen(_: ScreenProps) {
  const s = useAppState();
  const dispatch = useDispatch();
  const { mode, setMode, theme, setTheme, signal, setSignal, language, setLanguage } = useTheme();
  const t = useT();
  const setup = setupProgress(s);
  const { session, signOut } = useAuth();
  // The merged view — the user's own name and picture where they set them,
  // the provider's where they did not.
  const { profile } = useProfile();
  const user = session.status === 'ok' ? session.data?.user : undefined;
  const provider = user?.app_metadata?.provider;
  // `showcase` is gone from main — it became the `demoData` switch, which
  // DemoModeProvider owns. Only the two flags this screen still writes
  // directly are mirrored here.
  const [flags, setFlags] = useState({
    unavailable: DEMO_FLAGS.unavailable,
    liveAccount: DEMO_FLAGS.liveAccount,
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Push is the one channel that is real, and the toggle shows the real
  // state: permission granted, a subscription held, and its row stored where
  // the engine can find it (lib/push.ts). Read on arrival, never assumed.
  const userId = user?.id ?? null;
  const support = pushSupport();
  const [push, setPush] = useState<{ on: boolean; note: StringKey | null; busy: boolean }>({
    on: false,
    note: null,
    busy: false,
  });
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void isPushOn(userId).then((on) => {
      if (alive) setPush((p) => ({ ...p, on }));
    });
    return () => {
      alive = false;
    };
  }, [userId]);
  const pushNote = pushNoteFor(userId, support, push.note);
  const togglePush = (on: boolean) => {
    if (!userId || push.busy) return;
    setPush((p) => ({ ...p, busy: true }));
    if (on) {
      void enablePush(userId, language).then((err) =>
        setPush({ on: err === null, note: err === null ? null : PUSH_NOTE[err], busy: false }),
      );
    } else {
      void disablePush().then((ok) => setPush({ on: !ok, note: ok ? null : 'set.pushFailed', busy: false }));
    }
  };

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
          <CardTitle size={18}>{t('set.accountSection')}</CardTitle>
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
                  <span style={{ fontSize: 'var(--text-title)', fontWeight: 600 }}>{profile.fullName}</span>
                  <span
                    className="text-muted"
                    style={{
                      fontSize: 'var(--text-body)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {profile.email ?? user.id}
                  </span>
                </>
              ) : (
                // No display name from the provider — fall back to naming the
                // account by its email rather than inventing one.
                <span style={{ fontSize: 'var(--text-row)' }}>
                  {t('set.signedInAs', { email: profile.email ?? user.id })}
                </span>
              )}
              {(provider === 'google' || provider === 'apple') && (
                <span
                  className="text-muted"
                  style={{
                    fontSize: 'var(--text-caption)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {provider === 'google' ? (
                    <img src="/assets/logo-google.svg" alt="" width={12} height={12} />
                  ) : (
                    <AppleLogo size={12} />
                  )}
                  {t(provider === 'google' ? 'set.providerGoogle' : 'set.providerApple')}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" fontSize={16} onClick={() => setEditOpen(true)}>
              {t('set.editProfile')}
            </Button>
            <Button variant="ghost" fontSize={16} onClick={() => signOut()}>
              {t('set.signOut')}
            </Button>
          </div>
        </Card>
      )}

      {/* Mode pill */}
      <Card padding="10px 12px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--text-title)' }}>{t('set.modeRow')}</span>
          <div style={{ width: 200 }}>
            <SegmentedControl
              options={[
                { value: 'beginner', label: t('more.beginner') },
                { value: 'advanced', label: t('more.advanced') },
              ]}
              value={mode}
              onChange={setMode}
              fontSize={16}
            />
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0, lineHeight: 1.4 }}>
          {t('set.modeHelp')}
        </p>
      </Card>

      {/* Appearance */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={18}>{t('set.appearance')}</CardTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--text-row)' }}>{t('set.theme')}</span>
          <div style={{ width: 170 }}>
            <SegmentedControl<Theme>
              options={[
                { value: 'dark', label: t('set.themeDark') },
                { value: 'light', label: t('set.themeLight') },
              ]}
              value={theme}
              onChange={setTheme}
              fontSize={16}
            />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 'var(--text-row)' }}>{t('set.language')}</span>
          <div style={{ width: 170 }}>
            <SegmentedControl<Language>
              options={[
                { value: 'he', label: 'עברית' },
                { value: 'en', label: 'English' },
              ]}
              value={language}
              onChange={setLanguage}
              fontSize={16}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 'var(--text-row)' }}>{t('set.signal')}</span>
          <SegmentedControl<Signal>
            options={[
              { value: 'vivid', label: t('set.signalVivid') },
              { value: 'balanced', label: t('set.signalBalanced') },
              { value: 'muted', label: t('set.signalMuted') },
            ]}
            value={signal}
            onChange={setSignal}
            fontSize={16}
          />
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
            {t('set.signalHelp')}
          </p>
        </div>
      </Card>

      {/* Price-alert thresholds — informational only, opt-in, blank by default */}
      <Card padding="12px 13px" gap={9}>
        <CardTitle size={18}>{t('thresh.title')}</CardTitle>
        <div className="text-muted" style={{ fontSize: 'var(--text-caption)', lineHeight: 1.5 }}>
          {t('thresh.help')}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 9,
            borderTop: '1px solid var(--color-divider)',
            paddingTop: 9,
          }}
        >
          <div className="field">
            <label style={{ fontSize: 'var(--text-body)' }}>{t('thresh.up')}</label>
            <input
              className="input"
              type="number"
              placeholder="+%"
              value={s.alertUpThreshold}
              onChange={(e) => dispatch({ type: 'setThreshold', which: 'up', value: e.target.value })}
            />
          </div>
          <div className="field">
            <label style={{ fontSize: 'var(--text-body)' }}>{t('thresh.down')}</label>
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

      {/* Notifications. Push is real (see above). Email is listed so nobody
          looks for it, and says it is not available rather than offering a
          toggle that would store nothing. */}
      <Card padding="4px 0" gap={0}>
        <CardTitle size={18}>
          <span style={{ display: 'block', padding: '6px 12px 1px' }}>{t('set.notifSection')}</span>
        </CardTitle>
        <div style={CHANNEL_ROW}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{t('set.push')}</span>
            <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
              {t(pushNote ?? 'set.pushHelp')}
            </span>
          </span>
          {userId !== null && support === 'ready' && (
            <Toggle label={t('set.push')} on={push.on} onChange={togglePush} />
          )}
        </div>
        <div style={CHANNEL_ROW}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{t('set.email')}</span>
            <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
              {t('set.emailSoon')}
            </span>
          </span>
        </div>
      </Card>

      {/* Data & display — demo-state switch for the demo-backed surfaces.
          The old "no satellite positions" switch was removed when Satellite
          went live: its empty state is now whatever the engine actually
          reports, and a control that faked it would misrepresent live data. */}
      <Card padding="4px 0" gap={0}>
        <CardTitle size={18}>
          <span style={{ display: 'block', padding: '6px 12px 1px' }}>{t('set.dataSection')}</span>
        </CardTitle>
        {/* Sample data is the reader's own switch and lives in the More tab
            with the rest of what they control; what stays here is the QA
            switch, which is for us. */}
        <DemoFlagRow
          label={language === 'he' ? 'הדגמה: נתונים לא זמינים' : 'Demo: data unavailable'}
          help={
            language === 'he'
              ? 'מדמה כשל מקור נתונים — המסכים מציגים מצב "לא זמין" כן. לא חל על רשימת המועמדות היומית, שהיא נתונים חיים.'
              : 'Simulates a data-source failure — screens show the honest unavailable state. Does not apply to the daily candidates list, which is live.'
          }
          on={flags.unavailable}
          onChange={(v) => {
            DEMO_FLAGS.set('unavailable', v);
            setFlags({ ...flags, unavailable: v });
          }}
        />
        {/* Founder demo only. Off is the app exactly as it is today; on
            swaps the demo accounts for the one real brokerage account read
            through SnapTrade Personal, so the two can be shown side by side.
            The cache reset makes the flip immediate rather than serving the
            previous source's answer for the next few seconds. */}
        <DemoFlagRow
          label={t('live.setting')}
          help={t('live.settingHelp')}
          on={flags.liveAccount}
          onChange={(v) => {
            resetConnectedAccountCache();
            DEMO_FLAGS.set('liveAccount', v);
            setFlags({ ...flags, liveAccount: v });
          }}
        />
        {flags.liveAccount && (
          <SettingsLink
            accent
            label={t('more.snaptrade')}
            onClick={() => dispatch({ type: 'go', screen: 'snaptrade' })}
          />
        )}
      </Card>

      {/* Setup */}
      <Card padding="6px 0" gap={0}>
        <CardTitle size={18}>
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
        <Button variant="danger" alignSelf="flex-start" fontSize={16} onClick={() => setDeleteOpen(true)}>
          {t('set.deleteAcct')}
        </Button>
      )}
      <EditProfileSheet open={editOpen} onClose={() => setEditOpen(false)} />
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
      <span
        style={{
          flex: 1,
          fontSize: 'var(--text-row)',
          color: accent ? 'var(--color-accent-200)' : undefined,
        }}
      >
        {label}
      </span>
      {meta != null && (
        <span className="text-muted" style={{ fontSize: 'var(--text-body)' }}>
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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        padding: '8px 12px',
        borderTop: '1px solid var(--color-divider)',
      }}
    >
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-row)' }}>{label}</span>
        <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-caption)' }}>
          {help}
        </span>
      </span>
      <Toggle label={label} on={on} onChange={onChange} />
    </div>
  );
}

/** Why the push row cannot be toggled right now, or the last attempt's note, or nothing to say. */
function pushNoteFor(userId: string | null, support: PushSupport, note: StringKey | null): StringKey | null {
  if (userId === null) return 'set.pushSignIn';
  if (support !== 'ready') return PUSH_NOTE[support];
  return note;
}

/** What the push row says instead of a toggle, per reason it cannot be turned on. */
const PUSH_NOTE: Record<Exclude<PushSupport, 'ready'> | 'failed' | 'ready', StringKey> = {
  unsupported: 'set.pushUnsupported',
  denied: 'set.pushDenied',
  not_configured: 'set.pushNotConfigured',
  failed: 'set.pushFailed',
  ready: 'set.pushFailed',
};

const CHANNEL_ROW = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
  padding: '8px 12px',
  borderTop: '1px solid var(--color-divider)',
} as const;
