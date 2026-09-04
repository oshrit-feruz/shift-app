import { Card, CardTitle } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { Tag } from '../components/Tag';
import { Toggle } from '../components/Toggle';
import { useDemoMode, useSetDemoMode } from '../lib/DemoModeProvider';
import { useDispatch, type Screen } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
import { useLinked } from '../data/useLinked';
import { InstallSteps } from '../components/InstallSteps';
import { useIsStandalone } from '../lib/useInstall';
import type { StringKey } from '../i18n/strings';
import type { ScreenProps } from '../App';

const LINKS: Array<{ screen: Screen; icon: IconName; label: StringKey; help: StringKey }> = [
  { screen: 'movers', icon: 'trend', label: 'more.movers', help: 'more.moversHelp' },
  { screen: 'steps', icon: 'steps', label: 'more.steps', help: 'more.stepsHelp' },
  { screen: 'learn', icon: 'library', label: 'more.learn', help: 'more.learnHelp' },
  { screen: 'open', icon: 'plus', label: 'more.open', help: 'more.openHelp' },
  { screen: 'connections', icon: 'grid', label: 'more.connections', help: 'more.connectionsHelp' },
  { screen: 'advChat', icon: 'list', label: 'more.advChat', help: 'more.advChatHelp' },
  { screen: 'settings', icon: 'settings', label: 'more.settings', help: 'more.settingsHelp' },
];

/**
 * The founder-demo connected-account screen. Kept out of LINKS because it is
 * listed only while the Settings switch is on — with the switch off the app
 * shows no trace of it, which is what makes the before/after comparison a
 * real comparison.
 */
const LIVE_LINK: (typeof LINKS)[number] = {
  screen: 'snaptrade',
  icon: 'grid',
  label: 'more.snaptrade',
  help: 'more.snaptradeHelp',
};

export function MoreScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { mode, setMode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';
  const demo = useDemoMode();
  const setDemo = useSetDemoMode();
  const live = useLinked();
  // Only in a browser tab. On a phone in production this screen is only
  // reachable from the installed app, so the card is really for desktop and
  // for builds where the gate is off — there is no point offering an install
  // to a window that is already the installed app.
  const standalone = useIsStandalone();
  const links = live ? [...LINKS, LIVE_LINK] : LINKS;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card padding="10px 12px" gap={6}>
        <CardTitle size={17}>{t('more.viewMode')}</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ModeCard
            active={beg}
            name={t('more.beginner')}
            badge={beg ? 'On' : 'Off'}
            blurb={t('more.begBlurb')}
            onClick={() => setMode('beginner')}
          />
          <ModeCard
            active={!beg}
            name={t('more.advanced')}
            badge={!beg ? 'On' : 'Off'}
            blurb={t('more.advBlurb')}
            onClick={() => setMode('advanced')}
          />
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
          {t('more.switchNote')}
        </p>
      </Card>

      {/* Sample data. One switch over everything the app can invent — the
          charts, the earnings screens, and every feature with no real source
          behind it — so a reader who would rather see a filled-in app than an
          honest gap can have one, by asking. On, it carries no disclaimer
          where it renders: the reader turned it on themselves. Off, each
          gated feature says so in its own place. */}
      <Card padding="10px 12px" gap={6}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-row)', fontWeight: 500 }}>
              {t('more.demoData')}
            </span>
            {/* What the switch is FOR, right under its name. It reads as a
                tool now rather than as a state the app happens to be in:
                off by default, turned on deliberately for a walkthrough. */}
            <span
              className="text-muted"
              style={{ display: 'block', fontSize: 'var(--text-caption)', marginTop: 2, lineHeight: 1.4 }}
            >
              {t('more.demoDataFor')}
            </span>
          </span>
          <Toggle label={t('more.demoData')} on={demo} onChange={setDemo} />
        </div>
        <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0, lineHeight: 1.45 }}>
          {t('more.demoDataHelp')}
        </p>
      </Card>

      {!standalone && (
        <Card padding="10px 12px" gap={8}>
          <CardTitle size={17}>{t('install.cardTitle')}</CardTitle>
          <p className="text-muted" style={{ fontSize: 'var(--text-caption)', margin: 0 }}>
            {t('install.cardHelp')}
          </p>
          <InstallSteps />
        </Card>
      )}

      <Card padding="6px 0" gap={0}>
        {links.map((r) => (
          <button
            key={r.screen}
            type="button"
            onClick={() => dispatch({ type: 'go', screen: r.screen })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              minHeight: 50,
              padding: '11px 13px',
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
                width: 33,
                height: 33,
                flex: 'none',
                borderRadius: 8,
                background: 'var(--fill-selected)',
                color: 'var(--color-accent-300)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name={r.icon} size={19} strokeWidth={1.7} />
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-row)', fontWeight: 500 }}>
                {t(r.label)}
              </span>
              <span className="text-muted" style={{ display: 'block', fontSize: 'var(--text-body)' }}>
                {t(r.help)}
              </span>
            </span>
            <span style={{ opacity: 0.4, fontSize: 'var(--text-title)' }}>›</span>
          </button>
        ))}
      </Card>

      <Card padding={13} gap={4}>
        <CardTitle>{t('more.screener')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--text-body)', margin: 0 }}>
          {t('more.screenerHelp')}
        </p>
      </Card>
    </div>
  );
}

function ModeCard({
  active,
  name,
  badge,
  blurb,
  onClick,
}: {
  active: boolean;
  name: string;
  badge: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="select-card"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'start',
        padding: 12,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        border: `1px solid ${active ? 'var(--color-accent)' : 'var(--color-divider)'}`,
        background: active ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'var(--sunk)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-row)', fontWeight: 600 }}>{name}</span>
        <Tag variant="outline" fontSize={15}>
          {badge}
        </Tag>
      </span>
      <span style={{ display: 'block', fontSize: 'var(--text-body)', opacity: 0.78, marginTop: 3 }}>
        {blurb}
      </span>
    </button>
  );
}
