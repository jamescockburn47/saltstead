// Deterministic 2D value noise — pure, seedless-stable (invariant: never
// Math.random for anything that must match across clients).

export function hash2f(x, z) {
  let h = (Math.round(x * 8192) | 0) * 374761393 + (Math.round(z * 8192) | 0) * 668265263;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

// a true [0,1) roll for loot tables and spawn dice: hash2f empirically lands
// in [0, 0.5) (fine for interpolated noise, which only needs relative
// variation), so double it. hash2f itself must NEVER change — the whole
// terrain's determinism hangs off it (invariant 6).
export function unit2(x, z) {
  return Math.min(0.999999, hash2f(x, z) * 2);
}

export function valueNoise2(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2f(ix, iz), b = hash2f(ix + 1, iz);
  const c = hash2f(ix, iz + 1), d = hash2f(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// fractal sum, ~[0,1]
export function fbm2(x, z, octaves = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * valueNoise2(x * f, z * f);
    amp *= 0.5; f *= 2.03;
  }
  return v;
}
