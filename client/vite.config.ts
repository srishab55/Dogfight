import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to another port, so the URL in the
    // README is always correct.
    strictPort: true,
  },
  build: {
    target: 'es2022',
    // Source maps make production stack traces readable in Chrome DevTools.
    sourcemap: true,
    // Babylon.js is large even when tree-shaken: the main chunk measured
    // 1.1 MB (276 KB gzipped) in Phase 0. The limit sits just above that, so
    // the warning still fires if the bundle grows unexpectedly.
    chunkSizeWarningLimit: 1_400,
  },
});
