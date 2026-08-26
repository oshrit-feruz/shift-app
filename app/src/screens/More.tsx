import { Card, CardTitle } from '../components/Card';
import { Icon, type IconName } from '../components/Icon';
import { IconTile } from '../components/IconTile';
import { ListRow } from '../components/ListRow';
import { OptionCard } from '../components/OptionCard';
import { Tag } from '../components/Tag';
import { useDispatch, type Screen } from '../state/appState';
import { useTheme } from '../theme/ThemeProvider';
import { useT } from '../i18n/useT';
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

export function MoreScreen(_: ScreenProps) {
  const dispatch = useDispatch();
  const { mode, setMode } = useTheme();
  const t = useT();
  const beg = mode === 'beginner';

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card padding="10px 12px" gap={6}>
        <CardTitle size={14}>{t('more.viewMode')}</CardTitle>
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
        <p className="text-muted" style={{ fontSize: 'var(--fs-xs)', margin: 0 }}>
          {t('more.switchNote')}
        </p>
      </Card>

      <Card padding="6px 0" gap={0}>
        {LINKS.map((r) => (
          <ListRow
            key={r.screen}
            onClick={() => dispatch({ type: 'go', screen: r.screen })}
            minHeight={50}
            padding="11px 13px"
            leading={
              <IconTile size={33} variant="tint">
                <Icon name={r.icon} size={19} strokeWidth={1.7} />
              </IconTile>
            }
            title={<span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-medium)' }}>{t(r.label)}</span>}
            subtitle={t(r.help)}
            trailing={<span style={{ opacity: 0.4, fontSize: 'var(--fs-base)' }}>›</span>}
          />
        ))}
      </Card>

      <Card padding={13} gap={4}>
        <CardTitle>{t('more.screener')}</CardTitle>
        <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', margin: 0 }}>
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
    <OptionCard active={active} onClick={onClick}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)' }}>{name}</span>
        <Tag variant="outline" fontSize={12}>
          {badge}
        </Tag>
      </span>
      <span style={{ display: 'block', fontSize: 'var(--fs-sm)', opacity: 0.78, marginTop: 3 }}>{blurb}</span>
    </OptionCard>
  );
}
