// Dev-only: proxy the dash to the EVO tunnel so invite claims work from
// localhost:5173 exactly as they do behind Vercel's /dash rewrite in prod.
// Build-only: emitServiceWorker() writes sw.js — the PWA offline shell —
// precaching the hashed bundle so the game installs and opens offline.
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const SW_TEMPLATE = `// Generated at build by vite.config.js — the offline shell. Do not edit by hand.
const CACHE = '__CACHE__';
const PRECACHE = __PRECACHE__;
const NETWORK_ONLY = [/^\\/brain(\\/|$)/, /^\\/dash(\\/|$)/];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (NETWORK_ONLY.some((rx) => rx.test(url.pathname))) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const cp = r.clone(); caches.open(CACHE).then((c) => c.put('/index.html', cp)); return r;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok && url.pathname.startsWith('/assets/')) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
`;

function emitServiceWorker() {
  return {
    name: 'emit-service-worker',
    generateBundle(_, bundle) {
      const hashed = Object.keys(bundle).filter((f) => f.startsWith('assets/'));
      const precache = ['/', '/index.html', '/manifest.webmanifest', ...hashed.map((f) => '/' + f)];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: SW_TEMPLATE
          .replace('__CACHE__', 'saltstead-v' + pkg.version)
          .replace('__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  plugins: [emitServiceWorker()],
  server: {
    proxy: {
      '/dash': {
        target: 'https://saltstead.sovren.xyz',
        changeOrigin: true,
      },
      '/brain': {
        target: 'https://saltstead.sovren.xyz',
        changeOrigin: true,
      },
    },
  },
});
