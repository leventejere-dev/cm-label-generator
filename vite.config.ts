/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Base path handling for GitHub Pages.
 *
 * - Local dev / custom domain / Netlify / Vercel  -> base "/"
 * - GitHub Pages project site (user.github.io/REPO) -> base "/REPO/"
 *
 * Set VITE_BASE_PATH in the build environment (the GitHub Actions workflow
 * does this automatically from the repository name).
 *
 * Routing uses HashRouter, so no server-side rewrite rules are ever required.
 */
const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdf-lib'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // required to open the dev server from a phone on the same LAN
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: false,
  },
});
