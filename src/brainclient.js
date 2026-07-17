// The crew brain's HTTP client — the ONLY module that talks to /brain.
// Moorstead's npc.js pattern: thin fetch wrappers, per-call AbortController
// timeouts, single JSON response (no streaming), and every failure returns
// a quiet null/false so the game degrades to "the brain's asleep" instead
// of breaking. The relay lives on the EVO behind saltstead.sovren.xyz;
// Vercel rewrites /brain/* there in prod and Vite proxies it in dev.

const BASE = '/brain';

async function req(path, opts = {}, timeoutMs = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, { ...opts, signal: ctl.signal });
    if (!res.ok) throw new Error(`brain ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// 3 s ping — cheap, called before the first hail of a session
export async function brainOnline() {
  try {
    const j = await req('/status', {}, 3000);
    return j && (j.status === 'ok' || j.status === 'online');
  } catch {
    return false;
  }
}

// one hand answers one question. Persona rides in the fields (the brain
// builds the voice); `context` carries the SHIP'S FACTS card + retrieved
// sea lore (crewchat.js) — all of it TRUE, none of it invented here.
// Returns { reply, name } or throws.
export async function talkCrew({ name, role, home, mood, message, playerName, context }) {
  return req('/api/talk/generic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name, role, village: home, mood,
      message, player_name: playerName || null, context,
    }),
  }, 90000);
}
