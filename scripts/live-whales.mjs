// Live proof for the whales of 2026-07-26. Boots the game as a guest in
// headless Chrome, finds a real pod on the mid-Atlantic whaling grounds, and
// proves the three things the owner's report and the feature turn on:
//
//   (a) THE BUG IS DEAD. The whale holds a WORLD course. Put the helm hard
//       over with the ship stopped and her world position must not move (the
//       old ship-relative offset swung her a couple of hundred metres round
//       the hull); sail three hundred metres and she must NOT come along, and
//       her own displacement must lie along her OWN reported heading.
//   (b) SHE RUNS THE WHOLE CYCLE — blow, awash cruise, the sounding with the
//       flukes clear of the water, and a real absence in the deep. Read off the
//       scene graph itself, not the maths: the fluke MESH's world height, which
//       is its root at the median notch — the tips stand about a metre higher
//       still, so every fluke figure printed below is the conservative one.
//   (c) SHE RIDES THE SWELL — her drawn height tracks the game's own
//       waveHeight at her own position while the sea moves metres under her.
//
// Screenshots land in media/. Not part of the verify gate (needs a dev server):
//   npm run dev                      (terminal 1)
//   node scripts/live-whales.mjs     (terminal 2)
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const URL = process.argv[2] || 'http://localhost:5173';
const OUT = resolve('media');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL') + ' - ' + msg);
  if (!cond) failed++;
};

const browser = await puppeteer.launch({
  headless: true,
  args: ['--window-size=1600,900', '--enable-gpu'],
  defaultViewport: { width: 1600, height: 900 },
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) pageErrors.push(t);
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.type('#invitename', 'WhaleTest');
  await page.click('#btnguest');
  await page.waitForSelector('#btnnew', { visible: true });
  await page.click('#btnnew');
  await page.waitForSelector('#btnpirate', { visible: true });
  await page.click('#btnpirate');
  await page.waitForFunction('!!window.saltstead', { timeout: 30000 });
  await sleep(4000);
  await page.evaluate(() => document.querySelector('#briefingclose')?.click());
  await sleep(400);

  // late morning, weather pinned clear, so every shot is readable — the SWELL
  // is untouched (seaBandsFor still runs off the wind), which the swell-riding
  // measurement below depends on
  await page.evaluate(async () => {
    const { DAY_LENGTH } = await import('/src/skymath.js');
    const g = window.saltstead;
    window.__pin = () => { g.dayStart = 0.38 * DAY_LENGTH - g.t; };
    window.__pin();
    g.weatherLock = true;
    g.weatherState = 'clear';
  });

  // ---- find a real pod on the whaling grounds and sail up to her ----
  // lay the ship on the pod's beam at `off` metres and aim the camera past her
  // own quarter at the animal (camOff swings the ship out of the line of
  // sight), so every shot carries the sloop for scale
  await page.evaluate(async () => {
    const W = await import('/src/whales.js');
    window.__W = W;
    const g = window.saltstead;
    window.__place = (off = 55, camOff = 0.3, dist = 30, pitch = 0.22, ahead = false) => {
      const p = W.podPose(window.__pod, g.t);
      // abeam of her course, to seaward of her track — or right ahead of her,
      // which is the bearing that shows the flukes' full span when she sounds
      const bx = ahead ? Math.sin(p.heading) : Math.cos(p.heading);
      const bz = ahead ? Math.cos(p.heading) : -Math.sin(p.heading);
      g.ship.x = p.x + bx * off;
      g.ship.z = p.z + bz * off;
      g.ship.speed = 0;
      g.ship.yaw = p.heading;   // sailing her course, so she lies on the beam
      g.geoClock = 0;
      const dx = p.x - g.ship.x, dz = p.z - g.ship.z;
      g.cam.yaw = Math.atan2(-dx, -dz) + camOff;
      g.cam.pitch = pitch;
      g.cam.targetDist = dist; g.cam.dist = dist;
      return p;
    };
    // put the leader at a chosen point of her cycle: the world clock jumps at
    // most one period, and the pod has travelled by the time she surfaces —
    // which is the whole point of the sounding
    window.__jump = (u) => {
      const pod = window.__pod;
      let tt = W.WHALE_PERIOD * (u - pod.phase0 - W.memberPhase(pod, 0));
      while (tt < g.t) tt += W.WHALE_PERIOD;
      g.t = tt;
      window.__pin();
    };
    window.__lead = () => {
      const r = g.wildlife.whaleReport();
      if (!r) return null;
      const m = r.members[0];
      return { ...m, surf: g.waveAt(m.x, m.z, g.t) };
    };
    // the encounter gait, and the instrument main.js reads to set it
    window.__gait = () => {
      const d = g.wildlife.whaleDist(g.ship.x, g.ship.z);
      return { gait: g.lastGait, whaleD: Number.isFinite(d) ? d : -1, up: !!g.wildlife.whaleUp };
    };
  });

  const found = await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const W = window.__W;
    const g = window.saltstead;
    const base = latLonToWorld(30, -42); // the mid-Atlantic grounds
    let pick = null;
    for (const r of [8000, 20000, 40000, 70000]) {
      const list = W.podsNear(g.t, base.x, base.z, r);
      pick = list.find((e) => e.pod.n >= 3) || list[0] || null;
      if (pick) break;
    }
    if (!pick) return null;
    window.__pod = pick.pod;
    window.__place(110, 0.25, 60);
    return {
      id: pick.pod.id, n: pick.pod.n, speed: pick.pod.speed,
      R: pick.pod.R, spread: pick.pod.spread,
    };
  });
  ok(!!found, `a pod found on the grounds (${found ? `${found.id}, ${found.n} whales, ${found.speed.toFixed(2)} m/s` : 'none'})`);
  if (!found) throw new Error('no pod on the whaling grounds');
  await sleep(2500); // the layer's streaming poll + a few frames of settling

  const first = await page.evaluate(() => {
    const g = window.saltstead;
    const r = g.wildlife.whaleReport();
    return r && {
      ...r,
      shipX: g.ship.x, shipZ: g.ship.z, yaw: g.ship.yaw, t: g.t,
      dist: g.wildlife.whaleDist(g.ship.x, g.ship.z),
      coastDist: g.coastDist,
      lens: r.members.map((m) => m.len),
    };
  });
  ok(!!first, 'the pod has bodies in the scene');
  if (!first) throw new Error('the layer bodied no pod — nothing left to prove');
  ok(first.members.length === found.n, `every animal is bodied (${first.members.length}/${found.n})`);
  ok(Math.max(...first.lens) > 17, `and they are whale-sized (longest ${Math.max(...first.lens).toFixed(1)} m against a 9 m sloop)`);
  ok(first.dist < 300, `she is alongside (${first.dist.toFixed(0)} m off)`);

  // ---- (a1) THE HELM GOES HARD OVER AND SHE DOES NOT MOVE ----
  // the killer test: under the old ship-relative offset a quarter-turn of the
  // helm slewed the animal ~2 x 170 m around the hull
  const helm = await page.evaluate(async () => {
    const g = window.saltstead;
    const before = { ...g.wildlife.whaleAt, t: g.t };
    const relBefore = Math.atan2(before.x - g.ship.x, before.z - g.ship.z) - g.ship.yaw;
    g.ship.speed = 0;
    g.ship.yaw += Math.PI / 2;             // hard a-starboard, dead in the water
    await new Promise((r) => setTimeout(r, 1200));
    const after = { ...g.wildlife.whaleAt, t: g.t };
    const relAfter = Math.atan2(after.x - g.ship.x, after.z - g.ship.z) - g.ship.yaw;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    return {
      moved: Math.hypot(after.x - before.x, after.z - before.z),
      dt: after.t - before.t,
      speed: after.speed,
      relTurn: Math.abs(wrap(relAfter - relBefore)),
    };
  });
  ok(helm.moved < helm.dt * 4 + 2,
    `the helm hard over moves her ${helm.moved.toFixed(1)} m in ${helm.dt.toFixed(1)} s — her own swimming, nothing more`);
  ok(helm.relTurn > 1.3,
    `her bearing RELATIVE to the ship swung ${(helm.relTurn * 57.3).toFixed(0)}° with the helm — she is not carried round on it`);

  // ---- (a2) SHE HOLDS HER OWN COURSE WHILE THE SHIP SAILS ----
  const sail = await page.evaluate(async () => {
    const g = window.saltstead;
    const w0 = { ...g.wildlife.whaleAt };
    const s0 = { x: g.ship.x, z: g.ship.z };
    // put the wind on her beam and crack on
    g.ship.yaw = g.wind.from + Math.PI / 2;
    g.ship.trim = 0.5;
    const t0 = g.t;
    await new Promise((r) => setTimeout(r, 26000));
    const w1 = { ...g.wildlife.whaleAt };
    const s1 = { x: g.ship.x, z: g.ship.z };
    const elapsed = g.t - t0;
    const wd = Math.hypot(w1.x - w0.x, w1.z - w0.z);
    const sd = Math.hypot(s1.x - s0.x, s1.z - s0.z);
    // the direction she actually travelled, against the heading she reports
    const track = Math.atan2(w1.x - w0.x, w1.z - w0.z);
    const err = Math.atan2(Math.sin(track - w0.heading), Math.cos(track - w0.heading));
    return {
      elapsed, wd, sd, headingErr: Math.abs(err),
      podSpeed: window.__pod.speed,
      offsetChange: Math.hypot((w1.x - s1.x) - (w0.x - s0.x), (w1.z - s1.z) - (w0.z - s0.z)),
      dist: g.wildlife.whaleDist(g.ship.x, g.ship.z),
    };
  });
  ok(sail.sd > 150, `the ship made ${sail.sd.toFixed(0)} m in ${sail.elapsed.toFixed(0)} s`);
  ok(sail.wd < sail.elapsed * sail.podSpeed * 1.3 + 5,
    `the whale made ${sail.wd.toFixed(0)} m — her own ${sail.podSpeed.toFixed(2)} m/s, not the ship's way`);
  ok(sail.wd < sail.sd * 0.6, 'she did not come along for the ride');
  ok(sail.headingErr < 0.35,
    `and she travelled along her OWN heading (${(sail.headingErr * 57.3).toFixed(1)}° off her reported course)`);
  ok(sail.offsetChange > 80,
    `her station off the hull changed by ${sail.offsetChange.toFixed(0)} m — the ship sailed PAST her`);

  // ---- (b) THE WHOLE CYCLE, act by act ----
  // jump the world clock to put the leader in each act, re-lay the ship on her
  // (the pod has travelled while the clock jumped, which is the point) and read
  // what the SCENE GRAPH says she is doing. `settle` frames let the layer catch
  // up; `hold` waits for a named moment to peak, so the shots are the moment
  // and not a second after it.
  const act = async (phase, opts = {}) => {
    const { off = 55, camOff = 0.3, dist = 30, pitch = 0.22, at = 0.5, ahead = false } = opts;
    return page.evaluate(async ([k, o]) => {
      const W = window.__W;
      const g = window.saltstead;
      const lo = W.PHASE[k][0], hi = W.PHASE[k][1];
      window.__jump(lo + (hi - lo) * o.at);
      window.__place(o.off, o.camOff, o.dist, o.pitch, o.ahead);
      await new Promise((r) => setTimeout(r, 1300));
      return window.__lead();
    }, [phase, { off, camOff, dist, pitch, at, ahead }]);
  };
  // wait (up to ms) for the leader's metric to cross a threshold — the blow's
  // jet and the sounding's flukes are instants, not phases
  const holdFor = async (metric, min, ms = 6000) => {
    const got = await page.waitForFunction(
      ([which, m]) => {
        const l = window.__lead();
        if (!l) return false;
        const v = which === 'fluke' ? l.flukeY - l.surf : l.blow;
        return v >= m ? l : false;
      },
      { timeout: ms, polling: 90 }, [metric, min]).catch(() => null);
    return got ? got.jsonValue() : null;
  };

  // at 0.32 of the blow phase the settling frames land square on the second
  // breath's peak — she is blowing as the shutter opens, not a second after
  const blow = await act('blow', { at: 0.32, off: 48, dist: 26 });
  ok(blow.phase === 'blow', `she comes up and blows (phase ${blow.phase})`);
  ok(blow.y - blow.surf > -1.2, `her back is awash (${(blow.y - blow.surf).toFixed(2)} m under the local surface)`);
  const jet = await holdFor('blow', 0.75, 9000);
  ok(!!jet, `the spout stands hard off her blowhole (jet ${jet ? jet.blow.toFixed(2) : 'missed'})`);
  await page.screenshot({ path: join(OUT, 'whale-blow.png') });
  console.log('  shot - media/whale-blow.png');

  // A POD ALONGSIDE IS AN ENCOUNTER: with her up and fifty metres off, the fair
  // current must be dead, so the meeting happens at human speed in blue water
  // where the gait would otherwise be ten
  const nearGait = await page.evaluate(() => window.__gait());
  ok(nearGait.up && nearGait.whaleD > 0 && nearGait.whaleD < 200,
    `she is up and ${nearGait.whaleD.toFixed(0)} m off`);
  ok(nearGait.gait < 2,
    `the fair current slackens for her (gait ${nearGait.gait.toFixed(2)} in blue water)`);

  const cruise = await act('cruise', { at: 0.35, off: 52, dist: 28 });
  ok(cruise.phase === 'cruise', `then the long shallow cruise (phase ${cruise.phase})`);
  ok(cruise.blow === 0, 'and no spout while she cruises');
  await page.screenshot({ path: join(OUT, 'whale-cruise.png') });
  console.log('  shot - media/whale-cruise.png');

  // ---- the whole pod, in formation, while they are all up ----
  // the clearance law as DRAWN, from world positions: every pair clear either
  // fore-and-aft by their combined half-lengths or abeam by their combined
  // half-beams (a cow and her calf pass abeam at a couple of metres, which is
  // why a raw centre-distance threshold is the wrong instrument)
  const form = await page.evaluate(async () => {
    const g = window.saltstead;
    window.__place(85, 0.22, 46, 0.30);
    await new Promise((r) => setTimeout(r, 1300));
    const r = g.wildlife.whaleReport();
    const h = r.pod.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    let slack = Infinity, minSep = Infinity;
    for (let i = 0; i < r.members.length; i++) {
      for (let j = i + 1; j < r.members.length; j++) {
        const a = r.members[i], b = r.members[j];
        const dx = a.x - b.x, dz = a.z - b.z;
        const along = Math.abs(dx * fx + dz * fz);
        const across = Math.abs(dx * fz - dz * fx);
        const need = (a.len + b.len) / 2;
        slack = Math.min(slack, Math.max(along - need, across - (a.len + b.len) * window.__W.HALF_BEAM));
        minSep = Math.min(minSep, Math.hypot(dx, dz));
      }
    }
    return {
      slack, minSep, n: r.members.length,
      lens: r.members.map((m) => +m.len.toFixed(1)),
      up: r.members.filter((m) => m.visible).length,
      phases: r.members.map((m) => m.phase),
    };
  });
  ok(form.slack > 0,
    `the pod swims loose, never through itself (tightest clearance ${form.slack.toFixed(1)} m, closest centres ${form.minSep.toFixed(1)} m)`);
  ok(form.up === form.n, `the whole pod is up together (${form.up}/${form.n}, phases ${[...new Set(form.phases)].join('+')})`);
  console.log(`  note - pod lengths: ${form.lens.join(', ')} m`);
  await page.screenshot({ path: join(OUT, 'whale-pod.png') });
  console.log('  shot - media/whale-pod.png');

  // (c) RIDING THE SWELL — hold her in the cruise and watch her against the
  // game's own wave field at her own position
  const swell = await page.evaluate(async () => {
    const g = window.saltstead;
    const ys = [], surfs = [], offs = [];
    for (let i = 0; i < 70; i++) {
      const m = g.wildlife.whaleReport().members[0];
      const s = g.waveAt(m.x, m.z, g.t);
      ys.push(m.y); surfs.push(s); offs.push(m.y - s);
      await new Promise((r) => setTimeout(r, 90));
    }
    const span = (a) => Math.max(...a) - Math.min(...a);
    return { ySpan: span(ys), surfSpan: span(surfs), offSpan: span(offs), n: ys.length };
  });
  ok(swell.surfSpan > 0.4, `the sea moved ${swell.surfSpan.toFixed(2)} m under her over the sample`);
  ok(swell.ySpan > 0.35, `and she rose and fell ${swell.ySpan.toFixed(2)} m with it`);
  ok(swell.offSpan < swell.surfSpan * 0.6,
    `her trim held to the LOCAL surface (${swell.offSpan.toFixed(2)} m of wander against ${swell.surfSpan.toFixed(2)} m of sea)`);

  // THE SOUNDING: come in a little before the arch tops out and hold for the
  // instant the flukes are highest
  const sound = await act('sound',
    { at: 0.3, off: 52, camOff: 0.3, dist: 26, pitch: 0.14, ahead: true });
  ok(sound.phase === 'sound', `she sounds (phase ${sound.phase}, pitch ${sound.pitch.toFixed(2)} rad)`);
  const arch = await holdFor('fluke', 4.5, 5000) || sound;
  ok(arch.flukeY - arch.surf > 3,
    `THE FLUKE ROOT STANDS ${(arch.flukeY - arch.surf).toFixed(1)} m OUT OF THE WATER, tips higher again (a ${arch.len.toFixed(1)} m animal)`);
  ok(arch.y - arch.surf < 0, 'while her body goes down');
  await page.screenshot({ path: join(OUT, 'whale-sounding.png') });
  console.log('  shot - media/whale-sounding.png');

  const deep = await act('deep', { off: 95, dist: 34 });
  ok(deep.phase === 'deep', `and then she is gone (phase ${deep.phase})`);
  ok(!deep.visible, 'nothing left on the surface — a real absence');
  ok(deep.y - deep.surf < -20, `she is ${(deep.surf - deep.y).toFixed(0)} m down`);
  // and the fair current comes back: crawling past empty water is no encounter
  const deepGait = await page.evaluate(() => window.__gait());
  ok(!deepGait.up && deepGait.whaleD < 0,
    'with the pod down she stops counting as a contact');
  ok(deepGait.gait > 4, `and the sea runs again (gait ${deepGait.gait.toFixed(2)})`);
  await page.screenshot({ path: join(OUT, 'whale-deep.png') });
  console.log('  shot - media/whale-deep.png');

  // the pod surfaces again somewhere ELSE — the whole point of the absence
  const resurface = await page.evaluate(async () => {
    const W = window.__W;
    const g = window.saltstead;
    const pod = window.__pod;
    const a = W.podPose(pod, g.t);
    const b = W.podPose(pod, g.t + W.WHALE_PERIOD * 0.42); // deep -> up again
    return Math.hypot(b.x - a.x, b.z - a.z);
  });
  ok(resurface > 100, `she surfaces ${resurface.toFixed(0)} m further along her course`);

  // ---- the White Whale still works, and is not glued to the hull either ----
  const white = await page.evaluate(async () => {
    const { latLonToWorld } = await import('/src/earth.js');
    const g = window.saltstead;
    const w = latLonToWorld(-38.37, -74.03); // Mocha Island — her water
    g.ship.x = w.x; g.ship.z = w.z; g.ship.speed = 0; g.geoClock = 0;
    await new Promise((r) => setTimeout(r, 3000));
    const zone = g.zone && g.zone.legend.id;
    const r0 = g.wildlife.whaleReport();
    if (!r0) return { zone, report: null };
    const before = { ...g.wildlife.whaleAt };
    g.ship.yaw += Math.PI;                  // put her about, dead in the water
    await new Promise((r) => setTimeout(r, 1200));
    const after = { ...g.wildlife.whaleAt };
    const m = g.wildlife.whaleReport().members[0];
    // frame her: her own spec drives the clock jump, and the ship lies on her
    // beam while she blows (her anchor will stalk the new berth in its own time)
    window.__pod = g.wildlife.whalePod;
    window.__jump(0.16);
    window.__place(60, 0.26, 32, 0.30);
    await new Promise((r) => setTimeout(r, 1600));
    return {
      zone, kind: r0.kind, n: r0.n, len: m.len,
      swung: Math.hypot(after.x - before.x, after.z - before.z),
      dist: g.wildlife.whaleDist(g.ship.x, g.ship.z),
    };
  });
  ok(white.zone === 'white-whale', `Mocha is her water (zone ${white.zone})`);
  ok(white.kind === 'white' && white.n === 1, 'she works alone');
  ok(white.len > 25, `and she is a mountain of an animal (${white.len} m)`);
  ok(white.swung < 30,
    `putting the ship about does not swing her either (${white.swung.toFixed(1)} m while the hull turned 180°)`);
  await page.screenshot({ path: join(OUT, 'whale-white.png') });
  console.log(`  shot - media/whale-white.png (${white.dist.toFixed(0)} m off)`);

  ok(pageErrors.length === 0,
    `no page errors (${pageErrors.length ? pageErrors.slice(0, 3).join(' | ') : 'clean'})`);
} finally {
  await browser.close();
}

if (failed) { console.error(`live-whales: ${failed} FAILED`); process.exit(1); }
console.log('live-whales: OK — the pod holds a world course, runs the whole sounding cycle, and rides the swell');
