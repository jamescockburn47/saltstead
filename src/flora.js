// Flora — procedural plant geometry, pure, no THREE, no DOM. Guarded inside
// verify-shoredecor.mjs; shoredecorlayer.js stamps the output into each
// cell's merged mesh.
//
// The Spire roof garden's lesson (Moot src/veg, itself on the LAAS grammar):
// a tree is a GROWN skeleton, not a cone on a stick — a wandering trunk with
// lean, branches with droop, foliage hung on the structure — and every
// instance is unique because the cell mesh is merged anyway (uniqueness
// costs nothing when nothing is instanced). Kept low-poly and flat-shaded:
// tubes are 4-5 sided, canopies are jittered icosahedra, fronds are folded
// strips — the Saltstead identity, grown instead of stamped.
//
// Every vertex carries a WIND weight: [flex 0..1, reserved] — 0 at the
// rooted base, rising to the canopy and frond tips. The scene layer's
// material sways vertices by it (lean ∝ strength², per-plant natural
// frequency, gusts scale amplitude — the Spire wind laws).
//
// Deterministic per seed (invariant 6): same seed, same tree, every client.

// ---- tiny deterministic rng (mulberry32) ----
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- icosahedron (unit) ----
const IT = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, IT, 0], [1, IT, 0], [-1, -IT, 0], [1, -IT, 0],
  [0, -1, IT], [0, 1, IT], [0, -1, -IT], [0, 1, -IT],
  [IT, 0, -1], [IT, 0, 1], [-IT, 0, -1], [-IT, 0, 1],
].map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
});
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

// ---- the emitting builder ----
function newBuf() {
  return { p: [], n: [], c: [], w: [] };
}

function tri(buf, a, b, c, col, wa, wb, wc) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const [v, w] of [[a, wa], [b, wb], [c, wc]]) {
    buf.p.push(v[0], v[1], v[2]);
    buf.n.push(nx, ny, nz);
    buf.c.push(col[0], col[1], col[2]);
    buf.w.push(w);
  }
}

// a jittered squashed icosahedron — the canopy blob
function blob(buf, rng, cx, cy, cz, rx, ry, rz, jitter, col, flex) {
  const v = ICO_V.map(([x, y, z]) => {
    const j = 1 + (rng() - 0.5) * 2 * jitter;
    return [cx + x * rx * j, cy + y * ry * j, cz + z * rz * j];
  });
  for (const [a, b, c] of ICO_F) {
    tri(buf, v[a], v[b], v[c], col, flex, flex, flex);
  }
}

// a tapered tube along a polyline — trunk or branch. sides 4-5, flat-shaded.
// flexFn(t) gives the wind weight along the run.
function tube(buf, pts, r0, r1, sides, col, flexFn) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1);
    const r = r0 + (r1 - r0) * t;
    // frame: horizontal-ish perp of the local direction
    const j = Math.min(pts.length - 2, i);
    const dx = pts[j + 1][0] - pts[j][0], dy = pts[j + 1][1] - pts[j][1], dz = pts[j + 1][2] - pts[j][2];
    const dl = Math.hypot(dx, dy, dz) || 1;
    const ax = dx / dl, ay = dy / dl, az = dz / dl;
    let px = -az, py = 0, pz = ax; // cross(dir, up)-ish
    const pl = Math.hypot(px, py, pz) || 1;
    px /= pl; pz /= pl;
    const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;
    const ring = [];
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      ring.push([
        pts[i][0] + px * ca + qx * sa,
        pts[i][1] + py * ca + qy * sa,
        pts[i][2] + pz * ca + qz * sa,
      ]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    const w0 = flexFn(i / (rings.length - 1));
    const w1 = flexFn((i + 1) / (rings.length - 1));
    for (let s = 0; s < sides; s++) {
      const s2 = (s + 1) % sides;
      tri(buf, rings[i][s], rings[i + 1][s], rings[i][s2], col, w0, w1, w0);
      tri(buf, rings[i][s2], rings[i + 1][s], rings[i + 1][s2], col, w0, w1, w1);
    }
  }
}

// a drooping folded frond strip — palm and fern leaves
function frond(buf, rng, bx, by, bz, az, len, width, tilt, droop, col, flexBase) {
  const segs = 2;
  const dirx = Math.sin(az), dirz = Math.cos(az);
  let px = bx, py = by, pz = bz;
  let ang = tilt; // radians above horizontal at the base
  const sl = len / segs;
  let prev = null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * (1 - t * 0.55);
    const fold = width * 0.4; // the V-fold depth
    // strip cross-section: left rib, spine (lifted), right rib
    const lx = -dirz * w, lz = dirx * w;
    const row = [
      [px + lx, py - fold, pz + lz],
      [px, py, pz],
      [px - lx, py - fold, pz - lz],
    ];
    const flex = flexBase * (0.55 + 0.45 * t);
    if (prev) {
      const pf = flexBase * (0.55 + 0.45 * (t - 1 / segs));
      tri(buf, prev[0], row[1], row[0], col, pf, flex, flex);
      tri(buf, prev[0], prev[1], row[1], col, pf, pf, flex);
      tri(buf, prev[1], row[2], row[1], col, pf, flex, flex);
      tri(buf, prev[1], prev[2], row[2], col, pf, pf, flex);
    }
    prev = row;
    if (i < segs) {
      px += dirx * Math.cos(ang) * sl;
      pz += dirz * Math.cos(ang) * sl;
      py += Math.sin(ang) * sl;
      ang -= droop * (0.6 + rng() * 0.8); // the arch
    }
  }
}

// a grown trunk polyline: wander + lean, base at origin
function growTrunk(rng, h, segs, wander, leanX, leanZ) {
  const pts = [[0, 0, 0]];
  let x = 0, y = 0, z = 0;
  let dx = leanX * 0.5, dy = 1, dz = leanZ * 0.5;
  const sl = h / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    dx += (rng() - 0.5) * wander + leanX * (1.4 - t) * 0.12;
    dz += (rng() - 0.5) * wander + leanZ * (1.4 - t) * 0.12;
    const l = Math.hypot(dx, dy, dz);
    x += (dx / l) * sl; y += (dy / l) * sl; z += (dz / l) * sl;
    pts.push([x, y, z]);
  }
  return pts;
}

const BARK = [0.36, 0.27, 0.19];
const BARK_PALE = [0.5, 0.42, 0.3];

const hueShift = (c, rng, k) => {
  const g = 1 + (rng() - 0.5) * k;
  const y = 1 + (rng() - 0.5) * k * 0.6;
  return [c[0] * y, c[1] * g, c[2] * (2 - g) * 0.5 + c[2] * 0.5];
};

// ---- the species ----
// Each returns a buffer of a plant grown at the origin, y-up, in metres.

function conifer(rng) {
  const buf = newBuf();
  const h = 5.5 + rng() * 3.5;
  const lean = (rng() - 0.5) * 0.1;
  const trunk = growTrunk(rng, h * 0.92, 4, 0.05, lean, (rng() - 0.5) * 0.1);
  tube(buf, trunk, 0.16 + h * 0.012, 0.03, 4, BARK, (t) => 0.06 + 0.3 * t * t);
  // stacked whorl tiers, each a low ring cone — the spruce silhouette
  const tiers = 3 + Math.floor(rng() * 2);
  const green = hueShift([0.14, 0.32, 0.18], rng, 0.3);
  for (let k = 0; k < tiers; k++) {
    const t0 = 0.28 + (k / tiers) * 0.62;
    const ti = Math.min(trunk.length - 1, Math.floor(t0 * (trunk.length - 1)));
    const [cx, cy, cz] = trunk[ti];
    const r = (1.5 + rng() * 0.5) * (1 - t0 * 0.72) * (h / 6.5);
    const ch = h * 0.24 * (1 + rng() * 0.3);
    const sides = 6;
    const apex = [cx + (rng() - 0.5) * 0.2, cy + ch, cz + (rng() - 0.5) * 0.2];
    const flex = 0.18 + 0.55 * t0;
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2, a1 = ((s + 1) / sides) * Math.PI * 2;
      const j0 = 1 + (rng() - 0.5) * 0.3, j1 = 1 + (rng() - 0.5) * 0.3;
      const p0 = [cx + Math.sin(a0) * r * j0, cy - ch * 0.16, cz + Math.cos(a0) * r * j0];
      const p1 = [cx + Math.sin(a1) * r * j1, cy - ch * 0.16, cz + Math.cos(a1) * r * j1];
      tri(buf, p0, p1, apex, green, flex, flex, flex + 0.2);
    }
  }
  return buf;
}

function broadleaf(rng) {
  const buf = newBuf();
  const h = 4.2 + rng() * 3.0;
  const leanX = (rng() - 0.5) * 0.24, leanZ = (rng() - 0.5) * 0.24;
  const trunk = growTrunk(rng, h * 0.62, 4, 0.12, leanX, leanZ);
  tube(buf, trunk, 0.15 + h * 0.014, 0.06, 5, BARK, (t) => 0.05 + 0.28 * t);
  const top = trunk[trunk.length - 1];
  // branches reach from the upper trunk, each carrying its own blob
  const nBr = 2 + Math.floor(rng() * 3);
  const green = hueShift([0.2, 0.4, 0.17], rng, 0.34);
  const blobs = [[top[0], top[1] + h * 0.16, top[2], 1.15]];
  let az = rng() * Math.PI * 2;
  for (let b = 0; b < nBr; b++) {
    az += 2.4 + (rng() - 0.5) * 0.8;
    const t0 = 0.55 + rng() * 0.4;
    const ti = Math.min(trunk.length - 1, Math.floor(t0 * (trunk.length - 1)));
    const base = trunk[ti];
    const reach = h * (0.28 + rng() * 0.2);
    const up = 0.45 + rng() * 0.35;
    const tip = [
      base[0] + Math.sin(az) * reach,
      base[1] + reach * up,
      base[2] + Math.cos(az) * reach,
    ];
    const mid = [
      (base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2 + 0.15, (base[2] + tip[2]) / 2,
    ];
    tube(buf, [base, mid, tip], 0.07, 0.03, 4, BARK, (t) => 0.2 + 0.35 * t);
    blobs.push([tip[0], tip[1] + 0.3, tip[2], 0.75 + rng() * 0.35]);
  }
  for (const [bx, by, bz, k] of blobs) {
    const r = (0.95 + rng() * 0.55) * k * (h / 6);
    blob(buf, rng, bx, by, bz, r, r * (0.68 + rng() * 0.2), r, 0.22,
      hueShift(green, rng, 0.16), 0.5 + rng() * 0.35);
  }
  return buf;
}

function palm(rng) {
  const buf = newBuf();
  const h = 4.6 + rng() * 2.6;
  const leanA = rng() * Math.PI * 2;
  const lean = 0.16 + rng() * 0.22;
  const trunk = growTrunk(rng, h, 5, 0.03, Math.sin(leanA) * lean, Math.cos(leanA) * lean);
  tube(buf, trunk, 0.13, 0.07, 4, BARK_PALE, (t) => 0.04 + 0.5 * t * t);
  const top = trunk[trunk.length - 1];
  const nFr = 7 + Math.floor(rng() * 3);
  const green = hueShift([0.15, 0.42, 0.2], rng, 0.3);
  let az = rng() * Math.PI * 2;
  for (let f = 0; f < nFr; f++) {
    az += 2.39996 + (rng() - 0.5) * 0.3; // golden angle
    frond(buf, rng, top[0], top[1] + 0.1, top[2], az,
      1.9 + rng() * 0.9, 0.24 + rng() * 0.08,
      0.75 - (f % 3) * 0.32, 0.5, hueShift(green, rng, 0.14), 0.85);
  }
  return buf;
}

function scrub(rng) {
  const buf = newBuf();
  const n = 2 + Math.floor(rng() * 2);
  const green = hueShift([0.3, 0.38, 0.2], rng, 0.36);
  for (let i = 0; i < n; i++) {
    const r = 0.32 + rng() * 0.35;
    blob(buf, rng, (rng() - 0.5) * 0.8, r * 0.7, (rng() - 0.5) * 0.8,
      r, r * 0.75, r, 0.3, hueShift(green, rng, 0.2), 0.3 + rng() * 0.2);
  }
  return buf;
}

function fern(rng) {
  const buf = newBuf();
  const n = 5 + Math.floor(rng() * 3);
  const green = hueShift([0.1, 0.34, 0.14], rng, 0.3);
  let az = rng() * Math.PI * 2;
  for (let f = 0; f < n; f++) {
    az += 2.39996 + (rng() - 0.5) * 0.4;
    frond(buf, rng, 0, 0.12, 0, az, 0.9 + rng() * 0.5, 0.14,
      1.0, 0.85, hueShift(green, rng, 0.16), 0.9);
  }
  return buf;
}

const SPECIES = { conifer, broadleaf, palm, scrub, fern };
export const FLORA_KINDS = Object.keys(SPECIES);

// upper bound the scene layer sizes buffers against (verify holds it)
export const FLORA_MAX_VERTS = 900;

// grow one plant: kind + seed -> { p, n, c, w } flat Float32Arrays
// (positions, flat normals, colours, wind flex per vertex), origin at the
// root, y up, metres. Deterministic.
export function buildPlant(kind, seed) {
  const grow = SPECIES[kind];
  if (!grow) return null;
  const buf = grow(makeRng(seed));
  return {
    p: new Float32Array(buf.p),
    n: new Float32Array(buf.n),
    c: new Float32Array(buf.c),
    w: new Float32Array(buf.w),
  };
}
