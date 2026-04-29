import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Root-level Vite config that proxies to the frontend folder
// This allows v0 preview to detect and run the dev server
export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'frontend/src'),
    },
  },
});
