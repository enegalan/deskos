import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { programsPlugin } from './vite-plugin-programs';

export default defineConfig({
  plugins: [react(), programsPlugin()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@window-manager': resolve(__dirname, 'window-manager'),
      '@system': resolve(__dirname, 'system'),
      '@programs': resolve(__dirname, 'programs'),
      '@components': resolve(__dirname, 'components'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
  },
});
