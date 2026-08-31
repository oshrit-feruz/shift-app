import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import './picker.css';
import './proto.css';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ToastProvider } from '../components/Toast';
import { Harness } from './Harness';

/**
 * The prototype page's entry point — /proto-recs.html in `npm run dev`.
 *
 * Only two of the app's providers are here, and deliberately: ThemeProvider,
 * because every component reads the theme and the writing direction from it,
 * and ToastProvider, because the shell's out-of-scope controls answer with the
 * app's own toast. Auth and AppState are left out — app state hydrates from
 * (and writes back to) the same localStorage key the real app uses, and a
 * prototype must not be able to edit the reader's watchlist or advisory
 * progress. The variants carry their own state instead.
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
