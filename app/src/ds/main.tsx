import React from 'react';
import ReactDOM from 'react-dom/client';
import '../styles/tokens.css';
import '../styles/base.css';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DesignSystemPage } from './DesignSystemPage';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <DesignSystemPage />
    </ThemeProvider>
  </React.StrictMode>,
);
