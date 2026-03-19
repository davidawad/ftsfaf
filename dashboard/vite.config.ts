import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { DASHBOARD_DEV_PORT, DASHBOARD_SERVER_PORT } from './lib/constants';

export default defineConfig({
  plugins: [react()],
  server: {
    port: DASHBOARD_DEV_PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${DASHBOARD_SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
