import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  // Same-origin proxy for the live Recovery Detector engine: the browser
  // calls /rd/... and the dev server forwards it, so CORS never enters the
  // picture. Production mirrors this via the rewrite in vercel.json.
  server: {
    proxy: {
      '/rd': {
        target: 'https://stock-screener-7lvr.onrender.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rd/, ''),
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        ds: fileURLToPath(new URL('./ds.html', import.meta.url)),
      },
    },
  },
});
