import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages *project* pages serve from https://<user>.github.io/<repo>/,
// so assets must be requested under the repo sub-path in production.
// Dev server (and any non-Pages host) uses '/'.
// Override with AA_BASE when deploying under a different path.
const base = process.env.AA_BASE ?? (process.env.NODE_ENV === 'production' ? '/arcane-dominion/' : '/');

export default defineConfig({
  base,
  plugins: [svelte()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
});
