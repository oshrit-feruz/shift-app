import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileProvider } from './auth/ProfileProvider';
import { AppStateProvider } from './state/appState';
import { DemoModeProvider } from './lib/DemoModeProvider';
import { ToastProvider } from './components/Toast';
import { App } from './App';
import { startInstallPromptCapture } from './lib/useInstall';
import { migrateLegacyDemoDefault } from './data/demoFlags';
import { loadAppConfig } from './data/appConfig';

// Before the first render: Chromium fires `beforeinstallprompt` once, early,
// and a listener registered inside a component effect can miss it — which
// would leave the install screen showing menu instructions on a browser that
// could have done it in one tap.
startInstallPromptCapture();

// Before the first render, and before anything reads the sample-data switch:
// the default is OFF now, and an install that was already running with it ON
// must keep it rather than have the new default reach backwards. See
// migrateLegacyDemoDefault. Idempotent, so running it every load is free.
migrateLegacyDemoDefault();

// Before the first render, because the first-run overlay consumes it: the
// runtime switch that says whether new readers may enter the entry
// experiment. Fire and forget — an unanswered read leaves it off, which is
// the app's behaviour before PR 2, so nothing here needs to be awaited.
void loadAppConfig();

// The empty service worker (public/sw.js) — registered only in built output,
// where it is what makes the app installable at all; in `npm run dev` it
// would sit between Vite and the page for no gain. Registration failing is
// not worth surfacing: the install screen's manual instructions still work.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* Auth outside app state: the session doesn't depend on app state,
          but the state sync (useRemoteSync) needs both. */}
      <AuthProvider>
        {/* Inside auth (it reads the session) and outside app state, which
            knows nothing about the user's profile. */}
        <ProfileProvider>
          <AppStateProvider>
            {/* The React mirror of the sample-data switch. Screens read it
                into their useLoadable deps so a flip re-fetches at once. */}
            <DemoModeProvider>
              {/* Inside app state so any screen can raise a toast, and outside
                  the shell so a toast survives a screen change. */}
              <ToastProvider>
                <App />
              </ToastProvider>
            </DemoModeProvider>
          </AppStateProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
