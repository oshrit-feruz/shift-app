import { Icon, type IconName } from './Icon';
import { useT } from '../i18n/useT';

/**
 * A small phone that plays the install sequence on a loop.
 *
 * It exists because an arrow can only point at a toolbar, and a toolbar has
 * five buttons: it cannot say *which* one, or what the screen after it looks
 * like. The demo shows both — the button lighting up under a tap ring, then
 * the sheet that arrives, then the row to choose in it.
 *
 * Everything is drawn from the same tokens and stroke icons as the rest of
 * the app, not screenshotted: a screenshot of iOS ages with every release,
 * and would have to exist twice for the two languages. The other toolbar
 * buttons are deliberately abstract grey pills — only the button the user
 * needs is drawn as a real glyph, which is the whole point of the picture.
 *
 * Three CSS scenes on one shared timeline (see base.css `installScene`), with
 * no JS timer. `aria-hidden`: the numbered steps beside it say the same thing
 * to a screen reader, and a looping animation is not something to announce.
 */
export function InstallDemo({ variant }: Readonly<{ variant: 'ios' | 'menu' }>) {
  const t = useT();
  return (
    <div
      className="install-demo"
      aria-hidden="true"
      style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 6px' }}
    >
      <div style={{ position: 'relative', width: 206, height: 268 }}>
        {variant === 'ios' ? (
          <>
            {/* 1 — the Share button in Safari's bottom toolbar, pressed. */}
            <Scene delay="0s" caption={t('install.ios1')}>
              <PageLines />
              <Toolbar side="bottom" glyph="share" />
            </Scene>
            {/* 2 — the sheet it opens, and the row to pick in it. */}
            <Scene delay="-3s" caption={t('install.ios2')}>
              <PageLines />
              <Sheet rows={2} pick={{ icon: 'addSquare', label: t('install.ios2') }} />
            </Scene>
            {/* 3 — the confirm step, and where the app lands. */}
            <Scene delay="-6s" caption={t('install.ios3')}>
              <ConfirmBar label={t('install.ios3')} />
              <HomeScreen />
            </Scene>
          </>
        ) : (
          <>
            <Scene delay="0s" caption={t('install.demoMenu')}>
              <Toolbar side="top" glyph="dotsV" />
              <PageLines />
            </Scene>
            <Scene delay="-3s" caption={t('install.demoInstall')}>
              <Toolbar side="top" glyph="dotsV" tap={false} />
              <Menu pick={{ icon: 'addSquare', label: t('install.demoInstall') }} />
            </Scene>
            <Scene delay="-6s" caption={t('install.demoDone')}>
              <HomeScreen />
            </Scene>
          </>
        )}
      </div>
    </div>
  );
}

/** One frame of the loop: the phone, its screen, and a caption under it. */
function Scene({
  delay,
  caption,
  children,
}: Readonly<{ delay: string; caption: string; children: React.ReactNode }>) {
  return (
    <div
      className="install-scene"
      style={{
        animationDelay: delay,
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div
        style={{
          position: 'relative',
          flex: 1,
          width: 150,
          borderRadius: 20,
          border: '2px solid var(--color-divider)',
          background: 'var(--color-surface)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
      <span style={{ fontSize: 'var(--text-caption)', fontWeight: 600, color: 'var(--color-accent-300)' }}>
        {caption}
      </span>
    </div>
  );
}

/** Stand-in page content, so the phone reads as a phone showing a page. */
function PageLines() {
  return (
    <div style={{ padding: '14px 12px', display: 'grid', gap: 7 }}>
      {[100, 72, 88, 60].map((w, i) => (
        <span
          key={i}
          style={{ height: 6, width: `${w}%`, borderRadius: 3, background: 'var(--muted)', opacity: 0.25 }}
        />
      ))}
    </div>
  );
}

/** The browser bar: grey pills for every button except the one to press,
 *  which is drawn properly and wears the tap ring. */
function Toolbar({
  side,
  glyph,
  tap = true,
}: Readonly<{ side: 'top' | 'bottom'; glyph: IconName; tap?: boolean }>) {
  const pill = (
    <span style={{ width: 12, height: 4, borderRadius: 2, background: 'var(--muted)', opacity: 0.35 }} />
  );
  return (
    <div
      style={{
        position: 'absolute',
        insetInline: 0,
        [side]: 0,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 8px',
        background: 'var(--fill-selected)',
      }}
    >
      {side === 'bottom' ? (
        <>
          {pill}
          {pill}
          <PressedGlyph glyph={glyph} tap={tap} />
          {pill}
          {pill}
        </>
      ) : (
        <>
          {pill}
          {pill}
          {pill}
          <PressedGlyph glyph={glyph} tap={tap} />
        </>
      )}
    </div>
  );
}

/** The button being pressed: the glyph, lit, inside an expanding ring. */
function PressedGlyph({ glyph, tap }: Readonly<{ glyph: IconName; tap: boolean }>) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', color: 'var(--color-accent-300)' }}>
      {tap && (
        <span
          className="install-tap"
          style={{
            position: 'absolute',
            inset: -7,
            borderRadius: '50%',
            border: '2px solid var(--color-accent-300)',
          }}
        />
      )}
      <Icon name={glyph} size={19} strokeWidth={2} />
    </span>
  );
}

/** The share sheet, rising, with the row to choose highlighted. */
function Sheet({ rows, pick }: Readonly<{ rows: number; pick: { icon: IconName; label: string } }>) {
  return (
    <div
      className="install-rise"
      style={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        borderRadius: '12px 12px 0 0',
        background: 'var(--g1)',
        borderTop: '1px solid var(--color-divider)',
        padding: 8,
        display: 'grid',
        gap: 6,
      }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <span
          key={i}
          style={{ height: 8, width: '70%', borderRadius: 4, background: 'var(--muted)', opacity: 0.25 }}
        />
      ))}
      <Row {...pick} />
    </div>
  );
}

/** The Chromium menu, same idea as the sheet but hanging from the top. */
function Menu({ pick }: Readonly<{ pick: { icon: IconName; label: string } }>) {
  return (
    <div
      style={{
        position: 'absolute',
        insetInlineStart: 8,
        insetInlineEnd: 8,
        top: 34,
        borderRadius: 10,
        background: 'var(--g1)',
        border: '1px solid var(--color-divider)',
        padding: 7,
        display: 'grid',
        gap: 6,
      }}
    >
      <span style={{ height: 8, width: '60%', borderRadius: 4, background: 'var(--muted)', opacity: 0.25 }} />
      <Row {...pick} />
      <span style={{ height: 8, width: '45%', borderRadius: 4, background: 'var(--muted)', opacity: 0.25 }} />
    </div>
  );
}

/** The one row that matters, named and lit. */
function Row({ icon, label }: Readonly<{ icon: IconName; label: string }>) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 6px',
        borderRadius: 8,
        background: 'var(--fill-selected)',
        color: 'var(--color-accent-300)',
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      <Icon name={icon} size={13} strokeWidth={2} />
      {label}
    </span>
  );
}

/** The confirm bar at the top of iOS's "Add to Home Screen" sheet. */
function ConfirmBar({ label }: Readonly<{ label: string }>) {
  return (
    <div
      style={{
        position: 'absolute',
        insetInline: 0,
        top: 0,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        borderBottom: '1px solid var(--color-divider)',
      }}
    >
      <span style={{ width: 16, height: 4, borderRadius: 2, background: 'var(--muted)', opacity: 0.35 }} />
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          className="install-tap"
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: 999,
            border: '2px solid var(--color-accent-300)',
          }}
        />
        <span
          style={{
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--fill-selected)',
            color: 'var(--color-accent-300)',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      </span>
    </div>
  );
}

/** Where it ends up: the app's own icon, on a home screen. */
function HomeScreen() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        alignContent: 'center',
        justifyItems: 'center',
        gap: 10,
        padding: 12,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--muted)', opacity: 0.2 }}
        />
      ))}
      <img
        src="/assets/shift-icon-192.png"
        alt=""
        width={26}
        height={26}
        className="install-rise"
        style={{ width: 26, height: 26, borderRadius: 7 }}
      />
      <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--muted)', opacity: 0.2 }} />
    </div>
  );
}
