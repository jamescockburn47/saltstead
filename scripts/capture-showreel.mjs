// Capture the marketing showreel headlessly: boot the game in headless
// Chrome, board as a guest, run saltstead.showreel() (src/showreel.js), and
// land the downloaded .webm in media/. Also grabs a title-screen still while
// the diorama is up. Needs a dev server already listening (or pass a URL):
//   npm run dev            (terminal 1)
//   node scripts/capture-showreel.mjs [url]   (terminal 2)
// puppeteer is a devDependency only — nothing ships to the client bundle.

import puppeteer from 'puppeteer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1920,1080', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[showreel]') || m.type() === 'error') console.log('  page:', t);
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', {
    behavior: 'allow', downloadPath: OUT, eventsEnabled: true,
  });

  console.log('loading', URL);
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // the title diorama needs a few seconds to look its best (foam, sails)
  await sleep(6000);
  await page.screenshot({ path: join(OUT, 'title-screen.png') });
  console.log('title still  ->', join(OUT, 'title-screen.png'));

  // board as a guest on a fresh voyage
  await page.type('#invitename', 'Showreel');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  // the choice of colours: the reel sails the black flag
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(8000); // spawn terrain streams in before the first warp

  console.log('running the reel (a few minutes of real time)\u2026');
  const done = new Promise((res) => {
    cdp.on('Browser.downloadProgress', (e) => { if (e.state === 'completed') res(); });
  });
  const result = await page.evaluate(() => window.saltstead.showreel());
  console.log('reel:', result);
  await Promise.race([done, sleep(30000)]); // the blob download lands
  await sleep(1500);

  const webms = readdirSync(OUT).filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, t: statSync(join(OUT, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!webms.length) throw new Error('no .webm landed in media/');
  const size = statSync(join(OUT, webms[0].f)).size;
  console.log(`showreel     -> ${join(OUT, webms[0].f)} (${(size / 1e6).toFixed(1)} MB)`);
} finally {
  await browser.close();
}
