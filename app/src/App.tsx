import { useLayoutEffect, useRef, useState } from 'react';
import { AppHeader } from './components/AppHeader';
import { TabBar } from './components/TabBar';
import { BackgroundShapes } from './components/BackgroundShapes';
import { useAppState, useDispatch, type Screen } from './state/appState';
import { useT } from './i18n/useT';
import type { StringKey } from './i18n/strings';
import { demoService } from './data/demoAdapter';
import { useLoadable } from './data/useLoadable';
import { HomeScreen } from './screens/Home';
import { StockScreen } from './screens/Stock';
import { PortfolioScreen } from './screens/Portfolio';
import { WatchlistScreen } from './screens/Watchlist';
import { MoversScreen } from './screens/Movers';
import { NewsScreen } from './screens/News';
import { MoreScreen } from './screens/More';
import { SettingsScreen } from './screens/Settings';
import { ConnectionsScreen } from './screens/Connections';
import { AdvisoryChat } from './screens/advisory/Chat';
import { AdvisoryDisclosure } from './screens/advisory/Disclosure';
import { AdvisoryRecommendation } from './screens/advisory/Recommendation';
import { AdvisoryConnect } from './screens/advisory/Connect';
import { AdvisoryFirstPurchase } from './screens/advisory/FirstPurchase';
import { LearnScreen } from './screens/onboarding/Learn';
import { StepsScreen } from './screens/onboarding/Steps';
import { OpenAccountScreen } from './screens/onboarding/OpenAccount';
import { FirstRunOverlay } from './screens/onboarding/FirstRunOverlay';
import { SignInScreen } from './screens/SignIn';
import { useAuth } from './auth/AuthProvider';
import { useRemoteSync } from './state/useRemoteSync';
import { useProviderLanguage } from './auth/useProviderLanguage';
import { useProfile } from './auth/ProfileProvider';
import { SearchOverlay } from './sheets/SearchOverlay';
import { NotificationsSheet } from './sheets/NotificationsSheet';
import { AlertSheet } from './sheets/AlertSheet';
import { useT as useTranslate } from './i18n/useT';
import { Button } from './components/Button';
import { SHELL_ID } from './components/Sheet';

const SCREENS: Record<Screen, (p: ScreenProps) => JSX.Element> = {
  home: HomeScreen,
  stock: StockScreen,
  pf: PortfolioScreen,
  watch: WatchlistScreen,
  movers: MoversScreen,
  news: NewsScreen,
  earnings: NewsScreen,
  compare: MoversScreen, // compare reachable from settings in a later pass; movers fallback unused
  more: MoreScreen,
  settings: SettingsScreen,
  connections: ConnectionsScreen,
  advChat: AdvisoryChat,
  advDisc: AdvisoryDisclosure,
  advDash: AdvisoryRecommendation,
  advConnect: AdvisoryConnect,
  advBuy: AdvisoryFirstPurchase,
  learn: LearnScreen,
  steps: StepsScreen,
  open: OpenAccountScreen,
};

export interface ScreenProps {
  openAlert: () => void;
}

/**
 * The app shell: header, the single shared scroll container every screen
 * renders into, the floating tab bar, and the sheets that can be opened from
 * more than one screen (search, notifications, price alert).
 *
 * Screens are swapped inside one scroll container rather than remounted per
 * route, which is why the scroll position has to be reset explicitly on
 * navigation — see the layout effect below.
 */
export function App() {
  const { session } = useAuth();
  // The gate, following the FirstRunOverlay precedent but as a branch: the
  // sign-in screen replaces the shell (there is nothing to navigate while
  // signed out). 'loading' gets a quiet splash rather than the sign-in
  // screen so an already-authenticated user never sees a sign-in flash;
  // 'unavailable' (missing env config) renders SignIn with everything
  // disabled and the honest reason — deliberately NOT a local-only fallback,
  // which would make the auth gate silently vanish on a misconfigured
  // deploy. Once signed in, the existing firstRunSeen/steps flow already
  // routes new users to onboarding and returning users to the dashboard.
  const content =
    session.status === 'loading' ? (
      <AuthSplash />
    ) : session.status === 'unavailable' || session.data == null ? (
      <SignInScreen />
    ) : (
      <AppShell />
    );
  return (
    <>
      {/* Always mounted, whatever the gate shows: the sync hook is also what
          resets app state on sign-out, and it can only see that transition
          if it survives the shell unmounting. */}
      <RemoteSync />
      {content}
    </>
  );
}

/** Boot state while the stored session is restored (or the OAuth redirect is
 *  consumed) — same gradient backdrop as SignInScreen so the brand mark
 *  doesn't pop in on top of a plain background once the real screen mounts.
 *  Usually sub-second, so the mark itself (rather than a spinner) carries the
 *  "this is Shift, please wait" message. */
function AuthSplash() {
  const t = useT();
  return (
    <div
      role="status"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'radial-gradient(120% 60% at 15% -6%, var(--g1) 0%, var(--g2) 55%)',
      }}
    >
      <img
        src="/assets/shift-mark.svg"
        alt="Shift"
        width={64}
        height={64}
        className="anim-mark-breathe"
        style={{ borderRadius: '50%', boxShadow: 'var(--shadow-lg)' }}
      />
      <span className="text-muted" style={{ fontSize: 13 }}>
        {t('data.loading')}
      </span>
    </div>
  );
}

/** Mounts the Supabase state sync inside the providers; renders nothing. */
function RemoteSync() {
  useRemoteSync();
  useProviderLanguage();
  return null;
}

function AppShell() {
  const s = useAppState();
  // The merged profile, so a user who renamed themselves is greeted by the
  // name they chose rather than the one Google holds.
  const { profile } = useProfile();
  const dispatch = useDispatch();
  const t = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  const symbols = useLoadable(() => demoService.symbols(), []);
  const currentSymbol =
    symbols.state.status === 'ok' ? symbols.state.data.find((x) => x.ticker === s.ticker) : undefined;

  const titleKey = `title.${s.screen}` as StringKey;
  const kickerKey = `kicker.${s.screen}` as StringKey;
  const title =
    s.screen === 'stock'
      ? (currentSymbol?.name ?? s.ticker)
      : s.screen === 'home'
        ? // The home title is the one greeting the user by name, so it cannot
          // come from the generic key lookup: it needs the name interpolated,
          // and a nameless variant when the provider gave us none.
          profile.firstName
          ? t('title.home', { name: profile.firstName })
          : t('title.homeAnon')
        : t(titleKey);
  const kicker = s.screen === 'stock' ? s.ticker : t(kickerKey);

  const unread = s.notificationsRead ? 0 : 2;
  const ScreenView = SCREENS[s.screen];

  // There is one shared scroll container across every screen (no per-route
  // remount), so without this a screen opens wherever the previous one left
  // scrollTop — e.g. arriving at a fresh stock page already scrolled halfway
  // down because that is where Home happened to be.
  const scrollRef = useRef<HTMLDivElement>(null);
  // useLayoutEffect, not useEffect: the reset has to land before the browser
  // paints. With a passive effect React is free to paint the newly mounted
  // screen first, which shows it for one frame at the *previous* screen's
  // scrollTop before it snaps to the top — the exact flash this is meant to
  // remove.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
    // Keyed on the ticker too: openStock can navigate stock -> stock (the
    // screen name never changes), and that still needs to land at the top.
  }, [s.screen, s.ticker]);

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        background: 'var(--g2)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'radial-gradient(120% 60% at 15% -6%, var(--g1) 0%, var(--g2) 55%)',
          color: 'var(--color-text)',
          position: 'relative',
          overflow: 'hidden',
          zIndex: 0,
        }}
        data-screen-label={s.screen}
        // Sheets portal here so they escape the screen's stacking context —
        // see components/Sheet.tsx.
        id={SHELL_ID}
      >
        <BackgroundShapes />
        <AppHeader
          kicker={kicker}
          title={title}
          unreadCount={unread}
          onSearch={() => setSearchOpen(true)}
          onNotifications={() => setNotifOpen(true)}
        />
        <div
          ref={scrollRef}
          className="scroll-y"
          style={{
            flex: 1,
            minHeight: 0,
            // Bottom padding clears the floating TabBar, which is out of flow.
            padding: '6px 16px calc(90px + env(safe-area-inset-bottom))',
          }}
        >
          <ScreenView openAlert={() => setAlertOpen(true)} />
        </div>
        <BackToStepsPill />
        <TabBar
          current={s.screen}
          onGo={(screen) => dispatch({ type: 'go', screen })}
          avatarUrl={profile.avatarUrl}
        />
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
        <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
        <AlertSheet open={alertOpen} onClose={() => setAlertOpen(false)} symbol={currentSymbol ?? null} />
        {!s.firstRunSeen && <FirstRunOverlay />}
      </div>
    </div>
  );
}

/** Floating "back to the steps" pill when a step opened another screen. */
function BackToStepsPill() {
  const s = useAppState();
  const dispatch = useDispatch();
  const t = useTranslate();
  if (!s.fromSteps || s.screen === 'steps') return null;
  return (
    <div
      style={{
        position: 'absolute',
        // Sits just above the floating TabBar, safe-area included.
        bottom: 'calc(86px + env(safe-area-inset-bottom))',
        insetInline: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 60,
        pointerEvents: 'none',
      }}
    >
      <Button
        variant="secondary"
        onClick={() => dispatch({ type: 'go', screen: 'steps' })}
        style={{
          pointerEvents: 'auto',
          padding: '10px 18px',
          borderRadius: 999,
          border: '1px solid var(--color-accent)',
          // A solid ground, not the 14%-alpha accent fill: this pill floats
          // over the background shapes, and a translucent fill let them read
          // straight through it, so the label was competing with a squiggle.
          background: 'var(--acc-fill)',
          color: 'var(--color-accent-200)',
          fontSize: 13,
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          minHeight: 0,
        }}
      >
        {t('steps.backTo')}
      </Button>
    </div>
  );
}
