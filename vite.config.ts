import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { programsPlugin } from './vite-plugin-programs';
import { pageTitlePlugin } from './vite-plugin-page-title';
import { imagesPlugin } from './vite-plugin-images';

export default defineConfig({
  plugins: [react(), programsPlugin(), imagesPlugin(), pageTitlePlugin()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'core'),
      '@window-manager': resolve(__dirname, 'window-manager'),
      '@programs': resolve(__dirname, 'programs'),
      '@components': resolve(__dirname, 'components'),
      '@file-system': resolve(__dirname, 'file-system'),
      '@wallpapers': resolve(__dirname, 'wallpapers'),
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
