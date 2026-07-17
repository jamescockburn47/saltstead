// The helm watch — pure, no THREE, no DOM. verify-helmwatch.mjs guards it.
//
// The helmsman (helmsman.js) covers the dull legs; the captain is pulled back to
// the wheel whenever a moment carries stakes (DESIGN pillar 1: a good sailor
// outruns a bad one). This decides WHEN, from signals the game already computes,
// and HOW:
//
//   SOFT — a contact or an opportunity. The helmsman hails and HOLDS her course;
//          the captain may take the helm (T) or stay below. (Encounter-gait
//          buys the time.)
//   HARD — a hazard the autopilot must never sail into. The helmsman rounds up
//          and will NOT proceed until the captain has the wheel.
//
// decide() is a pure priority sort over a normalised state; main.js samples the
// raw signals (contact range, coast distance, monster/zone flags) and reacts to
// the returned {mode, reason}.

export const SIGHT_R = 5000; // a sail on the horizon (merchants.LOOKOUT_R)
export const HUNT_R = 1600;  // a hunter has the wind of us and is closing
export const PILOT_R = 600;  // inside this coast distance, harbour/shoal pilotage

// s: {
//   kraken, whale, whirlpool, stormAhead, inTriangle, aground, overLand: bool
//   coastDist: number|null, nearPort, shoal: bool
//   hunterDist, contactDist: number|null
// }  (any field may be absent/null)
// -> { mode: 'hard' | 'soft' | 'none', reason: string }
export function decide(s = {}) {
  // HARD hazards — the autopilot must not sail into these — most urgent first
  if (s.kraken) return hard('the Kraken has hold — steer for the shallows');
  if (s.whale || s.whirlpool) return hard('a monster bears down — take the helm');
  if (s.stormAhead) return hard('a storm lies across the course');
  if (s.inTriangle) return hard('the compass is astray here — sail by eye');
  if (s.aground) return hard('she is on the sand');
  if (s.overLand) return hard('river water — pilot her yourself');
  if (Number.isFinite(s.coastDist) && s.coastDist < PILOT_R && (s.nearPort || s.shoal)) {
    return hard(s.nearPort ? 'harbour approach — take the helm' : 'shoal water ahead');
  }
  // SOFT contacts — she keeps sailing; the captain decides what to do
  if (Number.isFinite(s.hunterDist) && s.hunterDist < HUNT_R) return soft('a hunter closes — orders?');
  if (Number.isFinite(s.contactDist) && s.contactDist < SIGHT_R) return soft('sail on the horizon — orders?');
  return { mode: 'none', reason: '' };
}

const hard = (reason) => ({ mode: 'hard', reason });
const soft = (reason) => ({ mode: 'soft', reason });
