import { useLocation, useNavigate } from 'react-router-dom';

/** Bottom tab bar per the mockup — only tabs whose screens exist in this
 *  phase (advisor and account come in later phases; no placeholder routes). */
export default function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 0',
    color: active ? 'var(--color-accent)' : 'var(--color-neutral-500)',
  });

  return (
    <nav
      style={{
        flex: 'none',
        display: 'flex',
        borderTop: '1px solid var(--color-divider)',
        padding: '8px 8px 14px',
        background: 'var(--color-bg)',
      }}
    >
      <button style={tabStyle(pathname.startsWith('/actions'))} onClick={() => navigate('/actions')}>
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
          <path d="M4 6h9M4 12h9M4 18h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M17.3 5.3l1.3 1.3L21 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 10.5 }}>פעולות</span>
      </button>
      <button style={tabStyle(pathname === '/dashboard')} onClick={() => navigate('/dashboard')}>
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" aria-hidden="true">
          <path d="M4 20V12M12 20V4M20 20V9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: 10.5 }}>תיק</span>
      </button>
    </nav>
  );
}
