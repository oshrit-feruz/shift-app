import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the app under /shift-app/; local dev and other
  // hosts stay at the root.
  base: process.env.GHPAGES ? '/shift-app/' : '/',
  plugins: [react()],
})
