import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileProvider } from './auth/ProfileProvider';
import { AppStateProvider } from './state/appState';
import { DemoModeProvider } from './lib/DemoModeProvider';
import { App } from './App';

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
              <App />
            </DemoModeProvider>
          </AppStateProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
