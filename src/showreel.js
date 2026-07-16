// A cinematic legend tour — hero shots across the world for marketing footage.
// Moorstead's showreel (src/showreel.js there), re-rigged for a game whose
// star is a ship: every beat warps the sloop to a storied water, sets the sky
// and the weather, then slowly orbits HER while the canvas records to a clean
// .webm — no HUD, no chrome, because captureStream reads the WebGL buffer,
// not the page. Run it from the live console:
//   saltstead.showreel()        — records the default reel and downloads it
//   saltstead.showreelStop()    — aborts after the current beat
//
// The recorder is PAUSED over every warp+settle so terrain streaming never
// makes the cut — the beats join as clean hard cuts.

import { latLonToWorld } from './earth.js';
import { DAY_LENGTH } from './skymath.js';

export const clamp01 = (t) => Math.max(0, Math.min(0.999, t));

// The default reel: the game's whole pitch in seven beats — the golden-hour
// sloop, the lying Triangle, the whirlpool, the Kraken rising, the red dragon
// of Wales, the ghost of the Cape, and the working night sky.
// frac: time of day (0 midnight, 0.28 dawn, 0.5 noon, 0.745 golden, 0.95 night).
// day: which day of the accelerated moon-month (skymath MOON_MONTH_DAYS) —
//   day 6 puts a FULL MOON in the sky, so a night beat is moonlit, not black.
// weather: forced { state, gloom } for the beat (null = leave the live sky).
// dist/height frame the orbit; az0->az1 (radians) is the slow sweep.
export const DEFAULT_BEATS = [
  { name: 'Golden hour off Port Royal', lat: 17.55, lon: -76.6, frac: 0.745,
    weather: { state: 'clear', gloom: 0 }, dist: 16, height: 5, az0: 2.2, az1: 3.1 },
  { name: 'The Bermuda Triangle', lat: 25.5, lon: -70.0, frac: 0.5,
    weather: { state: 'fog', gloom: 0.75 }, dist: 22, height: 8, az0: -0.6, az1: 0.2 },
  // shot from high overhead so the whole spinning scar is in frame — the
  // core takes the ship, which is exactly the footage
  { name: 'The Corryvreckan whirlpool', lat: 56.155, lon: -5.75, frac: 0.6,
    weather: { state: 'overcast', gloom: 0.45 }, dist: 55, height: 120, az0: 1.2, az1: 2.0 },
  // the zone's south-west rim: the only water in it both inside the legend's
  // reach AND deep enough (coastDist > 600) for main.js to wake the beast
  { name: 'The Kraken rises', lat: 61.2, lon: -9.6, frac: 0.7, sec: 12,
    weather: { state: 'overcast', gloom: 0.5 }, dist: 26, height: 9, az0: 0.4, az1: 1.3 },
  { name: 'Y Ddraig Goch over the Irish Sea', lat: 53.3, lon: -4.9, frac: 0.72, sec: 9,
    weather: { state: 'clear', gloom: 0 }, dist: 28, height: 10, az0: 2.9, az1: 3.6, lookUp: 8 },
  // storm alone gates her in (legendfx dutchmanSails) — keep the last light of
  // dusk so her glowing hull reads against the sea instead of pitch black
  { name: 'The Flying Dutchman rounds the Cape', lat: -34.35, lon: 18.42, frac: 0.75,
    weather: { state: 'storm', gloom: 0.7 }, dist: 24, height: 8, az0: -1.0, az1: -0.2 },
  { name: 'Under a full moon, mid-Atlantic', lat: 24.0, lon: -45.0, frac: 0.97, day: 6,
    weather: { state: 'clear', gloom: 0 }, dist: 18, height: 6, az0: 0.9, az1: 1.7 },
];

// PURE: the camera pose for a beat at sweep fraction u (0..1), orbiting the
// anchor (x, z) at sea. The altitude is FIXED for the whole sweep — the sea
// is its own level datum, so the orbit glides instead of stepping. lookUp
// raises the gaze (for a beat whose subject circles overhead).
export function cameraPose(beat, u, x, z) {
  const az = beat.az0 + (beat.az1 - beat.az0) * Math.max(0, Math.min(1, u));
  return {
    x: x + Math.sin(az) * beat.dist,
    y: beat.height,
    z: z + Math.cos(az) * beat.dist,
    lookAt: { x, y: beat.lookUp != null ? beat.lookUp : 2.2, z },
  };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// force the drawing buffer to an exact size (1920x1080) so the capture is a
// true 16:9 1080p regardless of window/DPR; restored on end
function forceSize(g, w, h) {
  g.camera.aspect = w / h;
  g.camera.updateProjectionMatrix();
  g.renderer.setPixelRatio(1);
  g.renderer.setSize(w, h, false); // false: buffer only, leave CSS layout
}
function restoreSize(g) {
  g.camera.aspect = innerWidth / innerHeight;
  g.camera.updateProjectionMatrix();
  g.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  g.renderer.setSize(innerWidth, innerHeight);
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function stopShowreel(g) {
  g._showreelAbort = true;
  return 'stopping after this beat';
}

// Drive the whole reel. Returns a promise that resolves when done (or aborted).
export async function runShowreel(g, opts = {}) {
  if (g._showreelRunning) return 'a showreel is already running (saltstead.showreelStop() ends it)';

  const beats = opts.beats || DEFAULT_BEATS;
  const beatMs = (opts.beatSec != null ? opts.beatSec : 7) * 1000;
  const settleMs = (opts.settleSec != null ? opts.settleSec : 4.5) * 1000;
  const fps = opts.fps != null ? opts.fps : 60;
  const record = opts.record !== false;
  const force1080 = opts.force1080 !== false;

  g._showreelRunning = true;
  g._showreelAbort = false;

  // stash everything we touch, to put back at the end
  const saved = {
    ship: { x: g.ship.x, z: g.ship.z, yaw: g.ship.yaw, trim: g.ship.trim,
      speed: g.ship.speed, rudder: g.ship.rudder },
    dayStart: g.dayStart, hull: { ...g.hull }, crippled: g.crippled,
    gold: g.gold, kraken: g.kraken, krakenDone: g.krakenDone,
    dragon: g.dragon, dragonDone: g.dragonDone, saveClock: g.saveClock,
    weatherState: g.weatherState, gloom: g.gloom, mode: g.mode,
  };
  g.saveClock = 1e9;              // no autosave writes a warped voyage
  g.weatherLock = true;           // the beats own the sky, not Open-Meteo
  document.body.classList.add('reel');
  if (force1080) forceSize(g, 1920, 1080);

  let recorder = null; const chunks = [];
  if (record) {
    try {
      const stream = g.renderer.domElement.captureStream(fps);
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
        .find((m) => window.MediaRecorder.isTypeSupported(m)) || 'video/webm';
      recorder = new window.MediaRecorder(stream,
        { mimeType: mime, videoBitsPerSecond: opts.bitrate || 12000000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.start();
      recorder.pause();           // resume only while a beat is held
    } catch (e) {
      console.warn('[showreel] recording unavailable, running preview only:', e);
      recorder = null;
    }
  }

  const orbit = (beat) => new Promise((res) => {
    const start = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - start)
        / (beat.sec != null ? beat.sec * 1000 : beatMs));
      g.photoCam = cameraPose(beat, u, g.ship.x, g.ship.z);
      if (u >= 1 || g._showreelAbort) return res();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  try {
    for (let i = 0; i < beats.length && !g._showreelAbort; i++) {
      const b = beats[i];
      // the sky: dayStart is the voyage's clock offset, so aim it at the frac.
      // b.day picks the day of the moon-month too (day 6 = full moon), so keep
      // the ABSOLUTE target instead of folding it into one day.
      if (b.frac != null) {
        let target = ((b.day || 0) + clamp01(b.frac)) * DAY_LENGTH - g.t;
        while (target < 0) target += 12 * DAY_LENGTH; // one whole moon-month
        g.dayStart = target;
      }
      if (b.weather) { g.weatherState = b.weather.state; g.gloom = b.weather.gloom; }
      // warp the sloop: gentle way on, sail drawing, tiller lashed. The
      // monsters need no cue — the Kraken and the dragon wake by geography
      // (main.js zone triggers), which is the whole point of warping there.
      const p = latLonToWorld(b.lat, b.lon);
      g.ship.x = p.x; g.ship.z = p.z;
      g.ship.yaw = g.windBase.from + 2.1; // a quarter reach: the sail sets full
      g.ship.trim = 0.8; g.ship.speed = 2.5; g.ship.rudder = 0;
      g.geoClock = 0;                     // re-sample coast/zone at once
      g.photoCam = cameraPose(b, 0, g.ship.x, g.ship.z);
      console.log(`[showreel] beat ${i + 1}/${beats.length}: ${b.name}`);
      await sleep(settleMs);              // terrain streams OFF-camera (recorder paused)
      if (g._showreelAbort) break;
      if (recorder) recorder.resume();
      await orbit(b);
      if (recorder) recorder.pause();
    }
  } finally {
    if (recorder && recorder.state !== 'inactive') {
      await new Promise((res) => { recorder.onstop = res; recorder.stop(); });
      if (chunks.length) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        downloadBlob(new Blob(chunks, { type: chunks[0].type || 'video/webm' }),
          `saltstead-showreel-${stamp}.webm`);
      }
    }
    // put the voyage back the way we found it
    if (force1080) restoreSize(g);
    document.body.classList.remove('reel');
    g.photoCam = null;
    g.weatherLock = false;
    Object.assign(g.ship, saved.ship);
    g.dayStart = saved.dayStart;
    Object.assign(g.hull, saved.hull);
    g.crippled = saved.crippled;
    g.gold = saved.gold;
    g.kraken = saved.kraken; g.krakenDone = saved.krakenDone;
    g.dragon = saved.dragon; g.dragonDone = saved.dragonDone;
    g.weatherState = saved.weatherState; g.gloom = saved.gloom;
    g.saveClock = Math.min(saved.saveClock, 20);
    g.geoClock = 0;
    g._showreelRunning = false;
    console.log('[showreel] done — the clip should be downloading if recording was on.');
  }
  return `showreel finished (${beats.length} beats)`;
}
