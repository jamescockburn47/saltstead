// Liveries — pure pixel + palette logic, no THREE, no DOM. verify-livery.mjs
// guards it; ship.js gives the colours to hulls and the flags to mastheads.
//
// The design brief: the two sides must be DISTINCTIVE AT A GLANCE, hull-down
// on the horizon, before you can count her guns.
//
//   PIRATE — near-black strakes, tanned storm-dark sails, blood-red trim,
//     and the black flag at the main: white skull over crossed bones.
//   NAVY  — blue-black topsides with the buff Nelson-chequer band, white
//     sails bleached to admiralty pattern, and the ensign: red cross,
//     blue canton.
//
// Everything an honest trader wears stays honest wood — the liveries read
// AGAINST the plain brown of the lanes.

export const LIVERIES = {
  pirate: {
    id: 'pirate',
    hullBase: [42, 34, 28],    // tarred strakes, near-black
    trimBase: [30, 24, 20],    // rails darker still
    stripe: 0x7a1f1f,          // a blood-red sheer band
    sails: 0x6e6252,           // storm-tanned canvas
    flag: 'black',
  },
  navy: {
    id: 'navy',
    hullBase: [30, 36, 48],    // blue-black man-o'-war topsides
    trimBase: [52, 42, 24],    // oiled oak rails
    stripe: 0xd8b25a,          // the buff chequer band
    sails: 0xf2efe4,           // admiralty-white canvas
    flag: 'ensign',
  },
};

export function liveryOf(id) {
  return LIVERIES[id] || null;
}

// ---- flags: tiny RGBA pixel fields, one per side ----
// 16x10, drawn by array — crisp at NearestFilter, zero assets.
export const FLAG_W = 16, FLAG_H = 10;

const put = (data, x, y, r, g, b) => {
  const i = (y * FLAG_W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
};

// the black flag: white skull over crossed bones on a black field
function blackFlag() {
  const data = new Uint8Array(FLAG_W * FLAG_H * 4);
  for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) put(data, x, y, 16, 16, 18);
  const W = (x, y) => put(data, x, y, 236, 236, 230);
  // the skull: a 4x3 dome with eye sockets and a jaw
  for (let x = 6; x <= 9; x++) { W(x, 2); W(x, 3); }
  W(6, 4); W(9, 4);              // cheeks (the sockets at 7,8 stay black)
  W(7, 5); W(8, 5);              // the jaw
  // crossed bones beneath
  W(4, 6); W(5, 7); W(6, 7); W(9, 7); W(10, 7); W(11, 6);
  W(4, 8); W(11, 8);
  return { w: FLAG_W, h: FLAG_H, data };
}

// the ensign: white field, red St George's cross, blue canton at the hoist
function ensignFlag() {
  const data = new Uint8Array(FLAG_W * FLAG_H * 4);
  for (let y = 0; y < FLAG_H; y++) for (let x = 0; x < FLAG_W; x++) put(data, x, y, 240, 238, 232);
  // the red cross, two pixels wide
  for (let x = 0; x < FLAG_W; x++) { put(data, x, 4, 190, 38, 34); put(data, x, 5, 190, 38, 34); }
  for (let y = 0; y < FLAG_H; y++) { put(data, 7, y, 190, 38, 34); put(data, 8, y, 190, 38, 34); }
  // the canton: blue with a white saltire hint
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) put(data, x, y, 32, 44, 96);
  put(data, 1, 1, 226, 228, 232); put(data, 2, 2, 226, 228, 232);
  put(data, 4, 1, 226, 228, 232); put(data, 3, 2, 226, 228, 232);
  return { w: FLAG_W, h: FLAG_H, data };
}

export function flagPixels(kind) {
  return kind === 'ensign' ? ensignFlag() : blackFlag();
}
