import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 6000, target: 'es2022' },
  server: { port: 5173 },
});
