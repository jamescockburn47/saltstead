// verify-telemetry: the muster-book beacons are honest and harmless — the
// payload is exactly what the ledger files (dash-app.py /visit), a visit fires
// once per page-load and a play once per session however many doors are
// pressed, and with no fetch at all nothing throws. Headless, no DOM.
import { SITE, visitPayload, logVisit, logPlay, _resetForVerify } from '../src/telemetry.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// the payload: exactly the shape the ledger's /visit door accepts
{
  const v = visitPayload('visit', 'p-test');
  ok(v.site === 'saltstead' && SITE === 'saltstead', 'the site names the game');
  ok(v.kind === 'visit' && v.pid === 'p-test', 'kind and pid ride the wire');
  ok(visitPayload('play', 'p').kind === 'play', 'a play files as a play');
  ok(visitPayload('gibberish', 'p').kind === 'visit', 'an unknown kind degrades to a visit');
  ok(typeof visitPayload('visit').pid === 'string' && visitPayload('visit').pid.length >= 8,
    'no pid given — the feedback pid is minted');
}

// one visit per page-load, one play per session — however hard the keys are pressed
{
  const posts = [];
  globalThis.fetch = (url, opts) => {
    posts.push({ url, body: JSON.parse(opts.body), keepalive: opts.keepalive });
    return Promise.resolve();
  };
  _resetForVerify();
  ok(logVisit() === true, 'the first visit beacon goes out');
  ok(logVisit() === false && logVisit() === false, 'refreshless re-calls are swallowed');
  ok(logPlay() === true, 'the first play beacon goes out');
  ok(logPlay() === false, 'a second voyage the same session is not a second player');
  ok(posts.length === 2, 'exactly two beacons a session');
  ok(posts.every((p) => p.url === '/dash/visit' && p.keepalive === true),
    'one door — POST /dash/visit, keepalive so it survives the page');
  ok(posts[0].body.kind === 'visit' && posts[1].body.kind === 'play', 'a visit, then a play');
  ok(posts[0].body.site === 'saltstead' && posts[0].body.pid === posts[1].body.pid,
    'same browser, same pid, same site');
  delete globalThis.fetch;
}

// no fetch at all: still no throw — the muster book never makes owt worse
{
  _resetForVerify();
  let threw = false;
  try { logVisit(); logPlay(); } catch { threw = true; }
  ok(!threw, 'no fetch, no throw');
}

if (failed) { console.error(`verify-telemetry: ${failed} FAILED`); process.exit(1); }
console.log('verify-telemetry OK');
