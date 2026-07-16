// verify-feedback: the report pipeline to the harbourmaster's ledger is
// headless-safe and honest — context snapshots never throw without a DOM,
// quiet telemetry is capped and swallows every failure (including poisoned
// error objects), and submitFeedback posts exactly the shape the ledger
// files (dash-app.py /feedback).
import {
  feedbackPid, gatherContext, reportQuiet, submitFeedback,
} from '../src/feedback.js';
import { latLonToWorld } from '../src/earth.js';

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error('  FAIL:', msg); failed++; } };

// pid: storage is blocked headless — the session fallback must be stable
{
  const a = feedbackPid(), b = feedbackPid();
  ok(typeof a === 'string' && a.length >= 8, 'a pid is minted without storage');
  ok(a === b, 'the fallback pid holds steady for the session');
}

// context: bare (title screen, no DOM) — never throws, carries the page
{
  const ctx = gatherContext(null, 'title');
  ok(ctx.page === 'title', 'the page rides along');
  ok(typeof ctx.url === 'string' && typeof ctx.ua === 'string', 'url/ua degrade to strings headless');
  ok(!('pos' in ctx), 'no game, no position');
}

// context: mid-voyage — position, day, gold and a lat/lon all snapshot
{
  const nassau = latLonToWorld(25.06, -77.34);
  const game = { ship: { x: nassau.x, z: nassau.z }, mode: 'helm', t: 100, dayStart: 86400 * 2.5, gold: 340.6 };
  const ctx = gatherContext(game, 'at-sea');
  ok(ctx.state === 'helm', 'the mode is the state');
  ok(ctx.day === 2, 'the voyage day is whole');
  ok(ctx.gold === 341, 'gold is rounded, not truncated');
  ok(ctx.pos.x === Math.round(nassau.x) && ctx.pos.z === Math.round(nassau.z), 'position is metres, rounded');
  ok(/^25\.\d+,-77\.\d+$/.test(ctx.loc), `loc reads back near Nassau (${ctx.loc})`);
}

// quiet telemetry: fire-and-forget, capped, and it must NEVER throw
{
  const posts = [];
  globalThis.fetch = (url, opts) => { posts.push({ url, body: JSON.parse(opts.body) }); return Promise.resolve(); };
  ok(reportQuiet('rigging', new Error('parted')) === true, 'the first quiet report goes out');
  ok(posts.length === 1 && posts[0].url === '/dash/feedback', 'it posts to the ledger door');
  ok(posts[0].body.kind === 'bug', 'quiet reports file as bugs');
  ok(posts[0].body.message.startsWith('[quiet:rigging]'), 'the tag prefixes the message for triage');
  ok(posts[0].body.message.includes('parted'), 'the error text rides along');
  // a poisoned error object must not leak out of the catch it came from
  const poison = { get message() { throw new Error('trap'); } };
  ok(reportQuiet('poison', poison) === true, 'a poisoned error still reports');
  ok(posts[1].body.message.includes('unknown') || posts[1].body.message.length > 0, 'it degrades to something printable');
  // the cap: a leaky loop cannot flood the ledger
  let sent = 0;
  for (let i = 0; i < 20; i++) if (reportQuiet('flood', 'x')) sent++;
  ok(sent === 3, `the session cap holds at 5 total (3 left after 2 spent, sent ${sent})`);
  ok(posts.length === 5, 'no more than five quiet posts a session');
  // fetch gone entirely: still no throw
  delete globalThis.fetch;
  let threw = false;
  try { reportQuiet('nofetch', 'x'); } catch { threw = true; }
  ok(!threw, 'no fetch, no throw — telemetry never makes owt worse');
}

// submitFeedback: the body is exactly what the ledger files
{
  let posted = null;
  globalThis.fetch = (url, opts) => {
    posted = { url, method: opts.method, body: JSON.parse(opts.body) };
    return Promise.resolve({ json: () => Promise.resolve({ ok: true, msg: 'noted' }) });
  };
  const d = await submitFeedback({
    kind: 'feedback', message: 'the sea is too wet', email: 'a@b.se', name: 'Anne',
    context: { page: 'title' }, pid: 'p-test',
  });
  ok(d.ok === true && d.msg === 'noted', 'the ledger answer comes back whole');
  ok(posted.url === '/dash/feedback' && posted.method === 'POST', 'one door: POST /dash/feedback');
  const b = posted.body;
  ok(b.pid === 'p-test' && b.kind === 'feedback' && b.message === 'the sea is too wet'
    && b.email === 'a@b.se' && b.name === 'Anne' && b.context.page === 'title',
    'every field rides the wire unmangled');
  delete globalThis.fetch;
}

if (failed) { console.error(`verify-feedback: ${failed} FAILED`); process.exit(1); }
console.log('verify-feedback OK');
