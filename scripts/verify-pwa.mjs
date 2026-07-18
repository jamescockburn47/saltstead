// verify-pwa: the installable shell is seaworthy — the manifest parses and
// names the ship, both icons are real PNGs at their declared sizes, the page
// links the manifest, the shell only registers in prod, and the service worker
// the build emits never caches the brain or the dash and falls back to the
// index when the tide (network) is out. Source-level, no build needed.
import { readFileSync } from 'node:fs';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// the manifest: parses, and carries what an install prompt needs
{
  let m = null;
  try { m = JSON.parse(read('public/manifest.webmanifest')); } catch { /* falls through */ }
  ok(m !== null, 'manifest.webmanifest parses as JSON');
  if (m) {
    ok(m.name === 'Saltstead' && m.short_name, 'the manifest names the game');
    ok(m.start_url === '/', 'start_url is the harbour mouth (/)');
    ok(m.display === 'fullscreen', 'display is fullscreen — no browser chrome at sea');
    ok(Array.isArray(m.icons) && m.icons.length >= 2, 'at least two icons declared');
  }
}

// the icons: real PNGs, IHDR width matching the declared size
{
  for (const size of [192, 512]) {
    let buf = null;
    try { buf = readFileSync(new URL(`../public/icons/icon-${size}.png`, import.meta.url)); } catch { /* falls through */ }
    ok(buf !== null, `icon-${size}.png exists (run scripts/gen-icons.mjs)`);
    if (buf) {
      ok(buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
        `icon-${size}.png starts with the PNG signature`);
      ok(buf.readUInt32BE(16) === size && buf.readUInt32BE(20) === size,
        `icon-${size}.png IHDR is ${size}x${size}`);
    }
  }
}

// the page: links the manifest and paints the chrome the sea's colour
{
  const html = read('index.html');
  ok(html.includes('rel="manifest"') && html.includes('/manifest.webmanifest'),
    'index.html links the manifest');
  ok(html.includes('name="theme-color"') && html.includes('#0a1622'),
    'index.html sets theme-color to the night sea');
}

// the registration: prod only — dev has no sw.js and must never cache
{
  const main = read('src/main.js');
  ok(main.includes("serviceWorker.register('/sw.js')"), 'main.js registers /sw.js');
  ok(main.includes('import.meta.env.PROD'), 'registration is gated behind import.meta.env.PROD');
}

// the worker the build emits: right name, live lines stay off the cache,
// and a dead network still lands you on the index
{
  const cfg = read('vite.config.js');
  ok(cfg.includes("fileName: 'sw.js'"), "vite.config.js emits 'sw.js'");
  ok(cfg.includes('NETWORK_ONLY') && cfg.includes('brain') && cfg.includes('dash'),
    'the worker network-onlys /brain and /dash — live lines, never cached');
  ok(cfg.includes("'navigate'") && cfg.includes("caches.match('/index.html')"),
    "navigations fall back to the cached '/index.html' when offline");
  ok(cfg.includes("'saltstead-v' + pkg.version"), 'the cache name rolls with the version');
}

if (failed) { console.error(`verify-pwa: ${failed} FAILED`); process.exit(1); }
console.log('verify-pwa OK');
