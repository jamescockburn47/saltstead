// The graphics probe — pure decision logic, no THREE, no DOM.
// verify-gfxprobe.mjs guards it; main.js feeds it the machine's signals.
//
// The Spire's tier method (the Smooth Moor spec, Moot session): WebGPU is
// the honest capability signal — a machine whose browser stands up a WebGPU
// adapter in 2026 has a real GPU and current drivers; one that cannot is
// old metal, a blocklisted driver, or SOFTWARE GL pretending — exactly the
// machines that lag under the fine pipeline. The probe decides the opening
// tier; the FPS WATCHDOG (fpsVerdict) keeps it honest at runtime and only
// ever eases DOWN — a machine must never stutter while the game insists it
// shouldn't.
//
// The player's own hand always wins: an explicit stored 'fine'/'plain'
// outranks every signal. The watchdog's own downgrades store as
// 'auto-plain' so the next boot starts easy WITHOUT locking the player out
// of choosing fine again.

// ---- the opening tier ----
// signals: {
//   stored:      'fine' | 'plain' | 'auto-plain' | null   (localStorage)
//   touchPrimary: bool        (coarse pointer is the primary input)
//   webgpu:      true | false | null   (adapter probe; null = not yet known)
//   rendererStr: string|null  (WEBGL_debug_renderer_info UNMASKED_RENDERER)
//   deviceMemory: number|null (navigator.deviceMemory, GB)
//   cores:       number|null  (navigator.hardwareConcurrency)
// }
// Returns { tier: 'fine'|'plain', why } — why feeds the log and telemetry.
export function decideTier(sig = {}) {
  if (sig.stored === 'fine' || sig.stored === 'plain') {
    return { tier: sig.stored, why: 'chosen' };       // the player said so
  }
  if (sig.stored === 'auto-plain') {
    return { tier: 'plain', why: 'remembered-slow' }; // this ship lagged before
  }
  if (isSoftwareGL(sig.rendererStr)) {
    return { tier: 'plain', why: 'software-gl' };     // no GPU at all — the hard floor
  }
  if (Number.isFinite(sig.deviceMemory) && sig.deviceMemory <= 2) {
    return { tier: 'plain', why: 'low-memory' };
  }
  if (Number.isFinite(sig.cores) && sig.cores <= 2) {
    return { tier: 'plain', why: 'few-cores' };
  }
  if (sig.touchPrimary) {
    return { tier: 'plain', why: 'touch' };           // tablets open easy
  }
  if (sig.webgpu === true) return { tier: 'fine', why: 'webgpu' };
  if (sig.webgpu === false) return { tier: 'plain', why: 'no-webgpu' };
  return { tier: 'fine', why: 'unprobed' }; // optimistic until the adapter answers
}

// the software renderers that mean "no GPU": SwiftShader (Chrome's CPU
// fallback), llvmpipe/softpipe (Mesa's), and Windows' Basic Render Driver
export function isSoftwareGL(rendererStr) {
  return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(rendererStr || '');
}

// ---- the watchdog ----
// Sampled median fps over a settled window (the first SETTLE_S seconds are
// ignored — terrain streaming and shader warm-up lie about steady state).
export const SETTLE_S = 10;   // ignore the opening seconds
export const WINDOW_S = 6;    // judge on windows this long
export const SLOW_FINE = 27;  // fine below this is a stutter, not a style
export const SLOW_PLAIN = 22; // plain below this needs fewer pixels

// verdict for one settled window: 'hold' | 'drop-plain' | 'drop-pixels'
export function fpsVerdict(tier, medianFps) {
  if (!Number.isFinite(medianFps)) return 'hold';
  if (tier === 'fine' && medianFps < SLOW_FINE) return 'drop-plain';
  if (tier === 'plain' && medianFps < SLOW_PLAIN) return 'drop-pixels';
  return 'hold';
}

export function median(xs) {
  if (!xs || !xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
