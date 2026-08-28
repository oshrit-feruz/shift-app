import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { ProfileProvider } from './auth/ProfileProvider';
import { AppStateProvider } from './state/appState';
import { ToastProvider } from './lib/ToastProvider';
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
            {/* Toasts are ephemeral UI, not persisted app state — see
                lib/ToastProvider.tsx — so its own provider, innermost. */}
            <ToastProvider>
              <App />
            </ToastProvider>
          </AppStateProvider>
        </ProfileProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
