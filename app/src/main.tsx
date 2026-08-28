import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { ThemeProvider } from './theme/ThemeProvider';
import { AuthProvider } from './auth/AuthProvider';
import { AppStateProvider } from './state/appState';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* Auth outside app state: the session doesn't depend on app state,
          but the state sync (useRemoteSync) needs both. */}
      <AuthProvider>
        <AppStateProvider>
          <App />
        </AppStateProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
