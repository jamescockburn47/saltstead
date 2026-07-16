// Dev-only: proxy the dash to the EVO tunnel so invite claims work from
// localhost:5173 exactly as they do behind Vercel's /dash rewrite in prod.
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/dash': {
        target: 'https://saltstead.sovren.xyz',
        changeOrigin: true,
      },
    },
  },
});
