import { Icon } from './Icon';
import { Num } from './Num';

/** Screen header: mark + kicker + search/bell buttons + big title. */
export function AppHeader({
  kicker,
  title,
  unreadCount,
  onSearch,
  onNotifications,
}: {
  kicker: string;
  title: string;
  unreadCount: number;
  onSearch: () => void;
  onNotifications: () => void;
}) {
  return (
    <div
      style={{
        flex: 'none',
        padding: 'calc(14px + env(safe-area-inset-top)) 16px 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 24,
              height: 24,
              flex: 'none',
              borderRadius: 7,
              backgroundColor: 'var(--color-surface)',
              backgroundImage: 'url(/assets/shift-mark.png)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
          />
          <div
            className="text-muted"
            style={{
              fontSize: 'var(--text-row)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              flex: 1,
              fontWeight: 600,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {kicker}
          </div>
          <HeaderIconButton title="Search" onClick={onSearch}>
            <Icon name="search" strokeWidth={2.1} />
          </HeaderIconButton>
          <HeaderIconButton title="Notifications" onClick={onNotifications}>
            <Icon name="bell" />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  insetInlineEnd: -4,
                  minWidth: 17,
                  height: 17,
                  borderRadius: 9,
                  background: 'var(--down)',
                  color: '#fff',
                  fontSize: 'var(--text-micro)',
                  letterSpacing: 'var(--track-micro)',
                  lineHeight: 'var(--lead-micro)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Num>{unreadCount}</Num>
              </span>
            )}
          </HeaderIconButton>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-display)',
            letterSpacing: 'var(--track-display)',
            lineHeight: 'var(--lead-display)',
          }}
        >
          {title}
        </div>
      </div>
    </div>
  );
}

function HeaderIconButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className="header-icon-btn"
      onClick={onClick}
      style={{
        position: 'relative',
        width: 48,
        height: 48,
        display: 'grid',
        placeItems: 'center',
        border: '1px solid var(--color-divider)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        cursor: 'pointer',
        transition: 'background .2s ease, color .2s ease',
      }}
    >
      {children}
    </button>
  );
}
