// The hulls — procedural low-poly geometry, flat-shaded, zero assets.
// buildShip(def) raises any rung of the shipwright's ladder from its yard
// row (shipyard.js): the sloop's proportions scaled by the spec's frame
// (shipframe.js frameFor), then dressed by the def — masts, SQUARE courses
// for the big hulls, a sterncastle for the galleon, and a visible row of
// CANNON at the gun posts main.js actually fires from. Returns
// { group, deck, setSail, setLantern, setAnchor, setHelm } — group carries
// position + attitude, the captain is parented to `deck` so the whole ship is
// one moving frame, setLantern lights the masthead after dark, setAnchor lets
// the ground tackle go (catted anchor swaps for a cable run out the hawse),
// setHelm(rudder) spins the wheel / sweeps the tiller with the live helm.

import * as THREE from 'three';
import { SLOOP } from './shipphysics.js';
import { frameFor, gunPosts, holdFor } from './shipframe.js';
import { tackSign } from './sailing.js';
import { woodPixels } from './woodgrain.js';
import { flagPixels } from './livery.js';

// wood tones now live as RGB bases in the woodMat calls below
const SAILC = 0xe8e0cc, ROPE = 0x3a2c1c;

function mat(color) { return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 8 }); }

// plank texture from the pure pixel generator (woodgrain.js) — NearestFilter
// keeps the seams crisp at low-poly scale, sRGB because the palette is authored
// by eye. rotate=true turns the planks 90° (deck planks run fore-and-aft).
function woodTex(opts, { rotate = false, repeat = [1, 1] } = {}) {
  const { w, h, data } = woodPixels(opts);
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  if (rotate) { tex.center.set(0.5, 0.5); tex.rotation = Math.PI / 2; }
  tex.needsUpdate = true;
  return tex;
}

function woodMat(opts, texOpts) {
  return new THREE.MeshPhongMaterial({
    map: woodTex(opts, texOpts), flatShading: true, shininess: 8,
  });
}

// hull: a box tapered toward the bow and pinched at the keel — five minutes
// of vertex pushing beats any asset file. D is the walkable deck frame, s
// the hull's scale against the unit sloop. hullBase: the strake palette —
// honest trade wood by default; a livery (livery.js) paints her side's colours.
function buildHull(D, s, hullBase = [110, 74, 47]) {
  const L = D.maxZ - D.minZ + 1.6 * s, W = (D.maxX + 0.35 * s) * 2, H = 1.7 * s;
  // 12 z-segments: the old 6 made the bow a stepped snout — the entry needs
  // enough stations to read as a CURVE
  const geo = new THREE.BoxGeometry(W, H, L, 1, 1, 12);
  const pos = geo.attributes.position;
  const zMax = L / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    let sx = 1;
    const t = z / zMax;
    // the entry: a long easy taper that sharpens toward the stem — a fine
    // bow, not a shovel. Below the waterline it hollows further (the
    // cutwater), so the forefoot knifes instead of ploughing.
    if (t > 0.15) {
      const u = (t - 0.15) / 0.85;
      sx *= 1 - 0.96 * u ** 2.1;
      if (y < 0) sx *= 1 - 0.5 * u;
    }
    if (t < -0.7) sx *= 0.82;                                   // stern tuck
    if (y < 0) sx *= 0.55;                                      // keel pinch
    pos.setX(i, pos.getX(i) * sx);
    if (y > 0) {
      // the sheer line: an easy rise forward to the stem head, a small lift
      // at the quarterdeck — the classic saucer profile, not a flat slab
      if (t > 0.3) pos.setY(i, y + 0.42 * s * ((t - 0.3) / 0.7) ** 1.5);
      else if (t < -0.6) pos.setY(i, y + 0.14 * s * ((-t - 0.6) / 0.4));
    } else if (t > 0.55) {
      // the forefoot sweeps UP toward the stem — no more square box corner
      // dragging ahead of the bow
      pos.setY(i, y + (H * 0.42) * ((t - 0.55) / 0.45) ** 1.7);
    }
  }
  geo.computeVertexNormals();
  // strakes: 8 plank courses up the topsides, grain running bow to stern
  return new THREE.Mesh(geo, woodMat({ base: hullBase, nPlanks: 8, seed: 7 }));
}

// THE HOLD — a whole environment below the weather deck for hulls that
// carry one (shipyard.js below: true, brig and up). Built to the same frame
// main.js walks (shipframe.js holdFor), so every plank the captain sees is
// a wall he genuinely cannot pass: sole, ribs, deck beams overhead, cargo
// stacked deterministically, cannon housed at the gun posts on the fighting
// classes, and a companionway ladder up to a hatch you can find from above.
function buildBelowDecks(D, s, def, spec, railMat, sparMat) {
  const H = holdFor(spec);
  const g = new THREE.Group();
  const w = H.maxX - H.minX, l = H.maxZ - H.minZ;
  const midZ = (H.maxZ + H.minZ) / 2;
  const wallH = D.y - 0.12 * s - H.y; // sole to the underside of the deck

  // the sole: hold planking, laid fore-and-aft like the deck above
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.12 * s, l),
    woodMat({ base: [122, 94, 61], nPlanks: 9, seed: 23, vary: 0.12 }, { rotate: true }));
  sole.position.set(0, H.y - 0.06 * s, midZ);
  g.add(sole);

  // walls — thick boxes overlapping sole, ceiling and each other, so the
  // room is LIGHT-TIGHT: no seam ever leaks sky or sea into the hold (their
  // faces read from the inside; the hull's own shell culls away when the
  // lens is within her)
  const skinMat = woodMat({ base: [96, 68, 42], nPlanks: 7, seed: 29, vary: 0.14 });
  // walls run from below the sole up INTO the deck planking (top at
  // D.y - 0.04s, inside the plank slab) — sealed above and below, and never
  // poking through the weather deck
  const sealH = wallH + 0.38 * s;
  const sealY = H.y - 0.3 * s + sealH / 2;
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.34 * s, sealH, l + 0.8 * s), skinMat);
    wall.position.set(side * (w / 2 + 0.14 * s), sealY, midZ);
    g.add(wall);
  }
  for (const [z] of [[H.minZ - 0.2 * s], [H.maxZ + 0.2 * s]]) {
    const bulk = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1.0 * s, sealH, 0.34 * s), skinMat);
    bulk.position.set(0, sealY, z);
    g.add(bulk);
  }
  // the sole extends under the walls too — no gap at the garboard
  const bilge = new THREE.Mesh(
    new THREE.BoxGeometry(w + 1.0 * s, 0.12 * s, l + 0.8 * s), skinMat);
  bilge.position.set(0, H.y - 0.2 * s, midZ);
  g.add(bilge);

  // ribs down both sides and beams overhead — the skeleton that makes a
  // hold read as the inside of a SHIP and not a corridor
  const boneMat = mat(0x4a3421);
  const nRibs = Math.max(4, Math.round(l / (1.3 * s)));
  for (let i = 0; i <= nRibs; i++) {
    const z = H.minZ + (l * i) / nRibs;
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.12 * s, wallH, 0.16 * s), boneMat);
      rib.position.set(side * (w / 2 - 0.08 * s), H.y + wallH / 2, z);
      g.add(rib);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14 * s, 0.16 * s), boneMat);
    beam.position.set(0, D.y - 0.19 * s, z);
    g.add(beam);
  }

  // the cargo: barrels and crates lashed along the walls, more of it the
  // bigger the hull. Deterministic scatter off the rib count.
  const barrelMat = woodMat({ base: [104, 72, 40], nPlanks: 5, seed: 31, vary: 0.16 });
  const crateMat = woodMat({ base: [128, 98, 62], nPlanks: 4, seed: 37, vary: 0.1 });
  const nCargo = Math.round(4 + s * 2.5);
  for (let i = 0; i < nCargo; i++) {
    const u = (Math.sin((i + 1) * 12.9898) * 43758.5453) % 1; // cheap unit hash
    const side = i % 2 ? 1 : -1;
    const z = H.minZ + 0.6 * s + (l - 1.2 * s) * ((i + 0.5) / nCargo);
    if (Math.abs(z - H.hatch.z) < 1.3 * s) continue; // the ladder landing stays clear
    // keep the waist clear: cargo hugs the walls, the captain walks the middle
    const x = side * (w / 2 - 0.55 * s);
    if (Math.abs(u) > 0.45) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28 * s, 0.32 * s, 0.62 * s, 8), barrelMat);
      barrel.position.set(x, H.y + 0.31 * s, z);
      g.add(barrel);
    } else {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.55 * s, 0.5 * s, 0.55 * s), crateMat);
      crate.position.set(x, H.y + 0.25 * s, z);
      crate.rotation.y = u * 2;
      g.add(crate);
    }
  }

  // the fighting classes house their spare broadside below: cannon bowsed
  // down at the gun posts, muzzles to the wall
  if (def.guns >= 3) {
    const gunMat = mat(0x23232a);
    for (const side of [-1, 1]) {
      for (const z of gunPosts(D, s, def.guns)) {
        if (z < H.minZ + 0.8 * s || z > H.maxZ - 0.8 * s) continue;
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07 * s, 0.09 * s, 1.0 * s, 6), gunMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(side * (w / 2 - 0.6 * s), H.y + 0.34 * s, z + 0.55 * s);
        const carriage = new THREE.Mesh(
          new THREE.BoxGeometry(0.46 * s, 0.3 * s, 0.42 * s), railMat);
        carriage.position.set(side * (w / 2 - 0.6 * s), H.y + 0.15 * s, z + 0.55 * s);
        g.add(barrel, carriage);
      }
    }
  }

  // the galleon's great-cabin corner: a chart table and the strongboxes
  // that explain the whole voyage
  if (def.castle) {
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.1 * s, 0.08 * s, 0.7 * s), crateMat);
    table.position.set(0, H.y + 0.62 * s, H.minZ + 0.9 * s);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.6 * s, 0.6 * s), boneMat);
    legL.position.set(-0.45 * s, H.y + 0.3 * s, H.minZ + 0.9 * s);
    const legR = legL.clone(); legR.position.x = 0.45 * s;
    g.add(table, legL, legR);
    for (const side of [-1, 1]) {
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.34 * s, 0.34 * s), barrelMat);
      chest.position.set(side * 0.75 * s, H.y + 0.17 * s, H.minZ + 0.45 * s);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.52 * s, 0.06 * s, 0.36 * s), mat(0xc9a24a));
      band.position.set(side * 0.75 * s, H.y + 0.2 * s, H.minZ + 0.45 * s);
      g.add(chest, band);
    }
  }

  // the companionway: a ladder from the sole to the hatch, and the hatch
  // itself — coaming and grating — piercing the weather deck overhead
  const hz = H.hatch.z;
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, wallH, 0.06 * s), boneMat);
    rail.position.set(H.hatch.x + side * 0.35 * s, H.y + wallH / 2, hz + 0.45 * s);
    rail.rotation.x = -0.18; // she leans like a proper ship's ladder
    g.add(rail);
  }
  const nRungs = Math.max(4, Math.round(wallH / (0.32 * s)));
  for (let i = 1; i < nRungs; i++) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.7 * s, 5), sparMat);
    rung.rotation.z = Math.PI / 2;
    const t = i / nRungs;
    rung.position.set(H.hatch.x, H.y + wallH * t, hz + 0.45 * s - 0.18 * wallH * t);
    g.add(rung);
  }
  // a lantern by the ladder — the warm point main.js hangs its real light on
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * s, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc978 }));
  lamp.position.set(H.hatch.x + 0.5 * s, D.y - 0.45 * s, hz);
  g.add(lamp);

  // topside: the hatch reads from above — coaming rim + dark grating
  const rimMat = mat(0x4a3421);
  for (const [dx, dz, ww, dd] of [
    [0, 0.65 * s, 1.3 * s, 0.12 * s], [0, -0.65 * s, 1.3 * s, 0.12 * s],
    [0.65 * s, 0, 0.12 * s, 1.3 * s], [-0.65 * s, 0, 0.12 * s, 1.3 * s],
  ]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.22 * s, dd), rimMat);
    rim.position.set(H.hatch.x + dx, D.y + 0.11 * s, hz + dz);
    g.add(rim);
  }
  const grate = new THREE.Mesh(
    new THREE.BoxGeometry(1.15 * s, 0.05 * s, 1.15 * s), mat(0x241a10));
  grate.position.set(H.hatch.x, D.y + 0.03 * s, hz);
  g.add(grate);

  return g;
}

// the ship's wheel — brig and up (shipyard def.wheel): a pedestal, a
// spoked rim, and it SPINS with the live rudder (setHelm). The small hulls
// keep their honest tiller.
function buildWheel(D, s, sparMat, hubMat) {
  const g = new THREE.Group();
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.62 * s, 0.12 * s), sparMat);
  pedestal.position.y = 0.31 * s;
  g.add(pedestal);
  const wheel = new THREE.Group();
  wheel.position.y = 0.74 * s;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34 * s, 0.035 * s, 5, 10), sparMat);
  wheel.add(rim);
  // four spokes through the hub = eight handles proud of the rim
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024 * s, 0.024 * s, 0.94 * s, 4), sparMat);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.07 * s, 6, 4), hubMat);
  wheel.add(hub);
  g.add(wheel);
  return { group: g, wheel };
}

// one SQUARE rig: mast + braced yards + rectangular courses, planted at
// deck-local z — the big-ship silhouette. The rig group braces (rotates)
// toward the wind in setSail; kind: 'square'.
function buildSquareRig(D, s, sparMat, z, mastH, yardW, sailC = SAILC) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.15 * s, mastH, 6), sparMat);
  mast.position.set(0, D.y + mastH / 2, z);

  const rig = new THREE.Group();
  rig.position.set(0, 0, z);

  const sails = [];
  const sailMat = new THREE.MeshPhongMaterial({ color: sailC, flatShading: true, side: THREE.DoubleSide });
  // course low and broad, topsail high and narrow
  for (const [hFrac, wFrac, drop] of [[0.62, 1, 0.34], [0.9, 0.7, 0.2]]) {
    const yH = D.y + mastH * hFrac;
    const w = yardW * wFrac;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.05 * s, w, 5), sparMat);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, yH, 0);
    rig.add(yard);
    // the sail hangs from the yard, foot drawn a touch aft — enough belly
    // to read as a drawing sail without cloth simulation
    const dropH = mastH * drop;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -w / 2, yH - 0.06 * s, 0,
      w / 2, yH - 0.06 * s, 0,
      w * 0.42, yH - dropH, -0.5 * s,
      -w / 2, yH - 0.06 * s, 0,
      w * 0.42, yH - dropH, -0.5 * s,
      -w * 0.42, yH - dropH, -0.5 * s,
    ], 3));
    geo.computeVertexNormals();
    const sail = new THREE.Mesh(geo, sailMat);
    rig.add(sail);
    sails.push(sail);
  }
  return { mast, rig, sails, kind: 'square', baseY: 0 };
}

// one fore-and-aft rig: mast + swinging boom + triangular sail, planted at
// deck-local z. Returns { mast, rig, sail } — the rig group swings in setSail.
function buildRig(D, s, sparMat, z, mastH, boomL, sailC = SAILC) {
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, mastH, 6), sparMat);
  mast.position.set(0, D.y + mastH / 2, z);

  const rig = new THREE.Group();
  rig.position.set(0, 0, z);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055 * s, 0.055 * s, boomL, 5), sparMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, D.y + 1.55 * s, -boomL / 2);
  rig.add(boom);

  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, D.y + 1.6 * s, -0.05 * s,
    0, D.y + 1.6 * s, -(boomL - 0.1 * s),
    0, D.y + mastH * 0.93, -0.05 * s,
  ], 3));
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo,
    new THREE.MeshPhongMaterial({ color: sailC, flatShading: true, side: THREE.DoubleSide }));
  rig.add(sail);

  // the mainsheet: boom end down to the deck, riding IN the rig group so it
  // swings with the boom it controls
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, D.y + 1.52 * s, -(boomL - 0.15 * s),
    0, D.y + 0.08 * s, -(boomL * 0.8),
  ], 3));
  rig.add(new THREE.Line(sheetGeo, new THREE.LineBasicMaterial({ color: 0x241b10 })));

  return { mast, rig, sails: [sail], kind: 'foreaft' };
}

// def: a shipyard.js HULLS row, or any { spec, masts, guns, square, castle,
// livery }. livery (livery.js LIVERIES row) paints her side's colours and
// flies her flag — absent, she wears honest trade wood. The legacy call
// buildShip(spec, masts) still works — old savours of the sloop years call
// it that way.
export function buildShip(def = SLOOP, legacyMasts) {
  if (def && def.maxSpeed !== undefined) def = { spec: def, masts: legacyMasts || 1, guns: 1 };
  const spec = def.spec || SLOOP;
  const masts = def.masts || 1;
  const liv = def.livery || null;
  const sailC = liv ? liv.sails : SAILC;
  const F = frameFor(spec), D = F.deck, s = F.scale;
  const group = new THREE.Group();

  const hull = buildHull(D, s, liv ? liv.hullBase : undefined);
  hull.position.y = D.y - 0.95 * s;
  group.add(hull);

  const deck = new THREE.Group();
  deck.position.y = 0;
  group.add(deck);

  // deck planks laid fore-and-aft (rotate turns the bands 90°)
  const deckPlank = new THREE.Mesh(
    new THREE.BoxGeometry((D.maxX + 0.15 * s) * 2, 0.12 * s, D.maxZ - D.minZ),
    woodMat({ base: [154, 122, 82], nPlanks: 10, seed: 11, vary: 0.10 }, { rotate: true }));
  deckPlank.position.set(0, D.y - 0.06 * s, (D.maxZ + D.minZ) / 2);
  group.add(deckPlank);

  // gunwale rails
  const railMat = woodMat({ base: liv ? liv.trimBase : [83, 54, 31], nPlanks: 2, seed: 3, vary: 0.12 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14 * s, 0.5 * s, D.maxZ - D.minZ), railMat);
    rail.position.set(side * (D.maxX + 0.08 * s), D.y + 0.2 * s, (D.maxZ + D.minZ) / 2);
    group.add(rail);
  }

  // spars: staved grain running up the stick, not hooped around it
  const sparMat = woodMat({ base: [83, 54, 31], nPlanks: 3, seed: 5, vary: 0.10 }, { rotate: true });

  // THE SAIL PLAN — the silhouette that tells the classes apart at a mile:
  //   1 mast            sloop / cutter — one fore-and-aft main
  //   2 masts, fore-aft schooner — two raked triangles
  //   2 masts, square   brig / corvette — braced yards and courses
  //   3 masts, square   frigate / galleon — square fore + main, spanker aft
  const rigs = [];
  const sticks = []; // { z, h } per mast — the standing rigging reads this
  let mainZ = 1.2 * s, mainH = 7.4 * s;
  if (masts >= 3) {
    mainZ = 0.9 * s; mainH = 8.0 * s;
    rigs.push(buildSquareRig(D, s, sparMat, mainZ, mainH, 3.8 * s, sailC));
    rigs.push(buildSquareRig(D, s, sparMat, D.maxZ * 0.6, 7.0 * s, 3.4 * s, sailC));
    rigs.push(buildRig(D, s, sparMat, D.minZ * 0.55, 5.8 * s, 3.0 * s, sailC)); // the spanker
    sticks.push({ z: mainZ, h: mainH }, { z: D.maxZ * 0.6, h: 7.0 * s }, { z: D.minZ * 0.55, h: 5.8 * s });
  } else if (masts === 2 && def.square) {
    rigs.push(buildSquareRig(D, s, sparMat, mainZ, mainH, 3.5 * s, sailC));
    rigs.push(buildSquareRig(D, s, sparMat, D.maxZ * 0.55, 6.6 * s, 3.1 * s, sailC));
    sticks.push({ z: mainZ, h: mainH }, { z: D.maxZ * 0.55, h: 6.6 * s });
  } else if (masts === 2) {
    rigs.push(buildRig(D, s, sparMat, mainZ, mainH, 4.6 * s, sailC));
    rigs.push(buildRig(D, s, sparMat, D.maxZ * 0.55, 6.5 * s, 3.6 * s, sailC));
    sticks.push({ z: mainZ, h: mainH }, { z: D.maxZ * 0.55, h: 6.5 * s });
  } else {
    rigs.push(buildRig(D, s, sparMat, mainZ, mainH, 4.6 * s, sailC));
    sticks.push({ z: mainZ, h: mainH });
  }
  for (const r of rigs) { group.add(r.mast); group.add(r.rig); }

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 2.6 * s, 5), sparMat);
  bowsprit.rotation.x = -Math.PI / 2 + 0.25;
  bowsprit.position.set(0, D.y + 0.45 * s, D.maxZ + 1.0 * s);
  group.add(bowsprit);

  // the STEM — a raked cutwater riding the leading edge of the new fine
  // entry, carrying the sheer up to the bowsprit root. The piece that makes
  // a bow read as a BOW and not the end of a box.
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 1.9 * s, 0.3 * s), railMat);
  stem.rotation.x = 0.32; // raked forward
  stem.position.set(0, D.y - 0.35 * s, D.maxZ + 0.78 * s);
  group.add(stem);

  // jib off the bowsprit, tacked to the FOREMOST mast
  const jibMastZ = masts >= 3 ? D.maxZ * 0.6 : masts === 2 ? D.maxZ * 0.55 : 1.2 * s;
  const jibGeo = new THREE.BufferGeometry();
  jibGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, D.y + 0.7 * s, D.maxZ + 2.2 * s,
    0, D.y + 1.4 * s, jibMastZ - 0.05 * s,
    0, D.y + 6.6 * s, jibMastZ - 0.05 * s,
  ], 3));
  jibGeo.computeVertexNormals();
  const jib = new THREE.Mesh(jibGeo,
    new THREE.MeshPhongMaterial({ color: sailC, flatShading: true, side: THREE.DoubleSide }));
  group.add(jib);

  // THE SIDE'S COLOURS — a sheer band down both topsides (blood red for the
  // black flag, the navy's buff chequer) and her flag at the main truck.
  // This is what tells the two services apart hull-down on the horizon.
  if (liv) {
    const bandMat = mat(liv.stripe);
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.07 * s, 0.24 * s, (D.maxZ - D.minZ) * 0.94), bandMat);
      band.position.set(side * (D.maxX + 0.3 * s), D.y - 0.32 * s, (D.maxZ + D.minZ) / 2 + 0.2 * s);
      group.add(band);
    }
  }

  // the helm: a tiller on the small hulls, a proper WHEEL from the brig up
  // (def.wheel) — both answer the live rudder through setHelm
  let wheelHandle = null, tillerGroup = null;
  if (def.wheel) {
    const w = buildWheel(D, s, sparMat, mat(0x2a2a31));
    w.group.position.set(F.helm.x, D.y, F.helm.z + 0.35 * s);
    group.add(w.group);
    wheelHandle = w.wheel;
  } else {
    tillerGroup = new THREE.Group();
    tillerGroup.position.set(F.helm.x, D.y, F.helm.z - 0.3 * s);
    const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 1.1 * s, 5), mat(ROPE));
    tiller.rotation.x = 0.9;
    tiller.position.y = 0.45 * s;
    tillerGroup.add(tiller);
    group.add(tillerGroup);
  }
  // rudder [-1..1] -> the wheel spins, the tiller sweeps (opposite the turn,
  // the way a real tiller is pushed)
  function setHelm(rudder) {
    if (wheelHandle) wheelHandle.rotation.z = -rudder * 2.4;
    else if (tillerGroup) tillerGroup.rotation.y = -rudder * 0.55;
  }

  // THE STANDING RIGGING — shrouds to every masthead, forestay to the
  // bowsprit, backstays to the quarters. One LineSegments per hull: a whole
  // lane of rigged ships costs one draw call each, and lines fade honestly
  // with distance at this art scale.
  {
    const pts = [];
    const rope = (x1, y1, z1, x2, y2, z2) => pts.push(x1, y1, z1, x2, y2, z2);
    for (const st of sticks) {
      const n = st.h > 7 * s ? 3 : 2; // tall sticks carry a third shroud
      for (const side of [-1, 1]) {
        for (let k = 0; k < n; k++) {
          const footZ = st.z - 0.7 * s + k * (1.4 * s / Math.max(1, n - 1));
          rope(side * (D.maxX + 0.06 * s), D.y + 0.45 * s, footZ,
            side * 0.04 * s, D.y + st.h * 0.8, st.z);
        }
      }
    }
    const fore = sticks.reduce((a, b) => (b.z > a.z ? b : a));
    const aft = sticks.reduce((a, b) => (b.z < a.z ? b : a));
    // forestay down to the bowsprit tip (the jib's luff made visible)
    rope(0, D.y + fore.h * 0.94, fore.z, 0, D.y + 0.77 * s, D.maxZ + 2.2 * s);
    // backstays to both quarters
    for (const side of [-1, 1]) {
      rope(0, D.y + aft.h * 0.9, aft.z,
        side * (D.maxX * 0.8), D.y + 0.45 * s, D.minZ + 0.2 * s);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.LineSegments(rg,
      new THREE.LineBasicMaterial({ color: 0x241b10 })));
  }

  // the sterncastle — the galleon's crown: a raised aftercastle with a poop
  // above it and an ochre band along the topsides, treasure-fleet style
  if (def.castle) {
    const castleMat = woodMat({ base: [96, 62, 38], nPlanks: 5, seed: 17, vary: 0.12 });
    const cw = (D.maxX + 0.1 * s) * 2;
    const z0 = D.minZ * 0.97, z1 = D.minZ * 0.42;
    const castle = new THREE.Mesh(new THREE.BoxGeometry(cw, 1.35 * s, z1 - z0), castleMat);
    castle.position.set(0, D.y + 0.6 * s, (z0 + z1) / 2);
    group.add(castle);
    const poop = new THREE.Mesh(new THREE.BoxGeometry(cw * 0.82, 0.7 * s, (z1 - z0) * 0.55), castleMat);
    poop.position.set(0, D.y + 1.6 * s, z0 + (z1 - z0) * 0.3);
    group.add(poop);
    const bandMat = mat(0xc9a24a);
    for (const side of [-1, 1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 * s, 0.2 * s, (D.maxZ - D.minZ) * 0.62), bandMat);
      band.position.set(side * (D.maxX + 0.28 * s), D.y - 0.45 * s, (D.maxZ + D.minZ) / 2 - 0.6 * s);
      group.add(band);
    }
  }

  // THE GUNS — a visible row of cannon at the exact posts main.js fires
  // from (shipframe.js gunPosts): black barrels run out over the rail on
  // oak carriages. The broadside you see is the broadside you throw.
  if (def.guns) {
    const gunMat = mat(0x23232a);
    for (const side of [-1, 1]) {
      for (const z of gunPosts(D, s, def.guns)) {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.075 * s, 0.095 * s, 1.15 * s, 6), gunMat);
        barrel.rotation.z = Math.PI / 2;
        barrel.position.set(side * (D.maxX + 0.35 * s), D.y + 0.36 * s, z);
        const carriage = new THREE.Mesh(
          new THREE.BoxGeometry(0.5 * s, 0.32 * s, 0.46 * s), railMat);
        carriage.position.set(side * (D.maxX - 0.32 * s), D.y + 0.16 * s, z);
        group.add(barrel, carriage);
      }
    }
  }

  // the hold: a real room below the weather deck (walked by main.js in
  // 'below' mode). Only hulls that declare one — NPC traffic never shows
  // its bilges to anybody, so it never pays for them.
  if (def.below) group.add(buildBelowDecks(D, s, def, spec, railMat, sparMat));

  // her flag flies from the main truck: a pixel-cloth plane (livery.js
  // flagPixels), doubled so it reads from either beam. It streams AFT of
  // the masthead — a following flutter is faked with a slow scale-wobble
  // in setSail, which is all a 16x10 cloth deserves.
  let flag = null;
  if (liv && liv.flag) {
    const fp = flagPixels(liv.flag);
    const ftex = new THREE.DataTexture(fp.data, fp.w, fp.h, THREE.RGBAFormat);
    ftex.colorSpace = THREE.SRGBColorSpace;
    ftex.magFilter = THREE.NearestFilter;
    ftex.minFilter = THREE.NearestFilter;
    ftex.needsUpdate = true;
    const fgeo = new THREE.PlaneGeometry(1.5 * s, 0.95 * s);
    fgeo.translate(0, 0, 0); // hoist at the mast: shift so the left edge sits at the truck
    const fmesh = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({
      map: ftex, side: THREE.DoubleSide, fog: false,
    }));
    // plane faces +z by default; turn it fore-and-aft so it shows a-beam,
    // trailing aft from the truck
    fmesh.rotation.y = Math.PI / 2;
    fmesh.position.set(0, D.y + mainH + 0.55 * s, mainZ - 0.8 * s);
    group.add(fmesh);
    flag = fmesh;
  }

  // the masthead lantern: a warm point at the MAIN top (the tallest stick),
  // lit after dark by setLantern. fog:false — a ship's light carries beyond
  // the haze that swallows her hull: how you find a sail at night.
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.16 * s, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc978, fog: false }));
  lantern.position.set(0, D.y + mainH + 0.25 * s, mainZ);
  lantern.visible = false;
  group.add(lantern);
  const setLantern = (on) => { lantern.visible = !!on; };

  // the ground tackle: an anchor CATTED at the port bow — shank, stock and
  // flukes, black iron against the strakes. setAnchor(true) lets it go: the
  // stowed anchor vanishes and a taut cable runs from the hawse down into
  // the sea ahead, so a ship riding to her anchor READS as one from a
  // cable's length away.
  const ironMat = new THREE.MeshPhongMaterial({ color: 0x1c1c22, flatShading: true, shininess: 20 });
  const catted = new THREE.Group();
  {
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.85 * s, 6), ironMat);
    catted.add(shank);
    const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.5 * s, 6), ironMat);
    stock.rotation.x = Math.PI / 2;
    stock.position.y = 0.36 * s;
    catted.add(stock);
    for (const side of [-1, 1]) {
      const fluke = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.1 * s, 0.06 * s), ironMat);
      fluke.position.set(side * 0.16 * s, -0.38 * s, 0);
      fluke.rotation.z = side * 0.7;
      catted.add(fluke);
    }
  }
  catted.position.set(-(D.maxX * 0.9), D.y - 0.15 * s, D.maxZ - 0.3 * s);
  group.add(catted);
  const cable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 3.6 * s, 5),
    new THREE.MeshPhongMaterial({ color: 0x3a2c1c, flatShading: true }));
  // from the hawse at the bow, down and forward into the sea
  cable.position.set(-0.2 * s, D.y - 1.0 * s, D.maxZ + 1.3 * s);
  cable.rotation.x = 1.1;
  cable.visible = false;
  group.add(cable);
  const setAnchor = (down) => { catted.visible = !down; cable.visible = !!down; };

  // heading, trim [0..1], windFrom -> swing the rigs and belly the sails.
  // Fore-and-aft rigs SWING with the trim; square rigs BRACE — a shallower
  // sweep, yards never fore-and-aft — so the two families move differently.
  function setSail(heading, trim, windFrom, power) {
    const side = tackSign(heading, windFrom);
    const belly = 0.75 + 0.25 * power;
    for (const r of rigs) {
      r.rig.rotation.y = r.kind === 'square'
        ? side * (0.2 + trim * 0.5)
        : side * trim * 1.15;
      for (const sail of r.sails) sail.scale.set(1, belly * 0.25 + 0.75, 1);
    }
    jib.rotation.y = side * (0.15 + trim * 0.5);
    // the flag streams to leeward, and breathes a little with the wind
    if (flag) {
      flag.rotation.y = Math.PI / 2 + side * 0.35;
      flag.scale.x = 0.85 + 0.15 * power;
    }
  }

  return { group, deck, setSail, setLantern, setAnchor, setHelm };
}

// the unit hull, for every caller that just wants "a ship" (the title
// diorama, the fleet astern)
export function buildSloop() {
  return buildShip({ spec: SLOOP, masts: 1, guns: 1 });
}

// ---- deckhands: the little figures that make another ship ALIVE ----
// Cheaper than the captain (captain.js) — no hat brim, no walk cycle, one
// material per colour family shared across every hand built. seed picks the
// shirt so a crew isn't clones.
const HAND_SHIRTS = [0x6b4a2f, 0x4a5a6b, 0x5a6b4a, 0x6b2f2f, 0x3f3f47].map(mat);
const HAND_SLOPS = mat(0x2b2b33);
const HAND_SKIN = mat(0xd9a56f);
export function buildHand(seed = 0) {
  const g = new THREE.Group();
  const shirt = HAND_SHIRTS[Math.abs(Math.floor(seed)) % HAND_SHIRTS.length];
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.18), HAND_SLOPS);
  legs.position.y = 0.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.26), shirt);
  body.position.y = 0.62;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), HAND_SKIN);
  head.position.y = 0.98;
  g.add(legs, body, head);
  return g;
}
