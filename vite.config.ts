import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { staticGamesPlugin } from './plugins/staticGamesPlugin';

export default defineConfig({
  plugins: [react(), staticGamesPlugin()],
  server: {
    port: 3000,
    open: false
  },
  build: {
    rollupOptions: {
      input: {
        home: 'index.html',
        admin: 'admin/index.html',
        waitdog: 'games/waitdog/index.html',
        lottery: 'games/lottery/index.html',
        forge: 'games/forge/index.html',
        bonpuri: 'games/bonpuri/index.html'
      }
    }
  }
});
