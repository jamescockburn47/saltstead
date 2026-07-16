// The hulls — procedural low-poly geometry, flat-shaded, zero assets.
// buildShip(spec, masts) raises any rung of the shipwright's ladder: the
// sloop's proportions scaled by the spec's frame (shipframe.js frameFor),
// with a second mast and course for the bigger hulls. Returns
// { group, deck, setSail, setLantern } — group carries position + attitude,
// the captain is parented to `deck` so the whole ship is one moving frame,
// setLantern lights the masthead after dark.

import * as THREE from 'three';
import { SLOOP } from './shipphysics.js';
import { frameFor } from './shipframe.js';
import { tackSign } from './sailing.js';
import { woodPixels } from './woodgrain.js';

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
// the hull's scale against the unit sloop.
function buildHull(D, s) {
  const L = D.maxZ - D.minZ + 1.6 * s, W = (D.maxX + 0.35 * s) * 2, H = 1.7 * s;
  const geo = new THREE.BoxGeometry(W, H, L, 1, 1, 6);
  const pos = geo.attributes.position;
  const zMax = L / 2;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    let sx = 1;
    const t = z / zMax;
    if (t > 0.35) sx *= 1 - 0.92 * ((t - 0.35) / 0.65) ** 1.6; // bow taper
    if (t < -0.7) sx *= 0.82;                                   // stern tuck
    if (y < 0) sx *= 0.55;                                      // keel pinch
    pos.setX(i, pos.getX(i) * sx);
    if (t > 0.55 && y > 0) pos.setY(i, y + 0.25 * s * (t - 0.55) / 0.45); // sheer line rises at the bow
  }
  geo.computeVertexNormals();
  // strakes: 8 plank courses up the topsides, grain running bow to stern
  return new THREE.Mesh(geo, woodMat({ base: [110, 74, 47], nPlanks: 8, seed: 7 }));
}

// one fore-and-aft rig: mast + swinging boom + triangular sail, planted at
// deck-local z. Returns { mast, rig, sail } — the rig group swings in setSail.
function buildRig(D, s, sparMat, z, mastH, boomL) {
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
    new THREE.MeshPhongMaterial({ color: SAILC, flatShading: true, side: THREE.DoubleSide }));
  rig.add(sail);

  return { mast, rig, sail };
}

export function buildShip(spec = SLOOP, masts = 1) {
  const F = frameFor(spec), D = F.deck, s = F.scale;
  const group = new THREE.Group();

  const hull = buildHull(D, s);
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
  const railMat = woodMat({ base: [83, 54, 31], nPlanks: 2, seed: 3, vary: 0.12 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14 * s, 0.5 * s, D.maxZ - D.minZ), railMat);
    rail.position.set(side * (D.maxX + 0.08 * s), D.y + 0.2 * s, (D.maxZ + D.minZ) / 2);
    group.add(rail);
  }

  // spars: staved grain running up the stick, not hooped around it
  const sparMat = woodMat({ base: [83, 54, 31], nPlanks: 3, seed: 5, vary: 0.10 }, { rotate: true });

  // the rigs: main aft, and on two-masted hulls a foremast forward
  const rigs = [buildRig(D, s, sparMat, 1.2 * s, 7.4 * s, 4.6 * s)];
  if (masts >= 2) rigs.push(buildRig(D, s, sparMat, D.maxZ * 0.55, 6.5 * s, 3.6 * s));
  for (const r of rigs) { group.add(r.mast); group.add(r.rig); }

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.08 * s, 2.6 * s, 5), sparMat);
  bowsprit.rotation.x = -Math.PI / 2 + 0.25;
  bowsprit.position.set(0, D.y + 0.45 * s, D.maxZ + 1.0 * s);
  group.add(bowsprit);

  // jib off the bowsprit, tacked to the FOREMOST mast
  const jibMastZ = masts >= 2 ? D.maxZ * 0.55 : 1.2 * s;
  const jibGeo = new THREE.BufferGeometry();
  jibGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, D.y + 0.7 * s, D.maxZ + 2.2 * s,
    0, D.y + 1.4 * s, jibMastZ - 0.05 * s,
    0, D.y + 6.6 * s, jibMastZ - 0.05 * s,
  ], 3));
  jibGeo.computeVertexNormals();
  const jib = new THREE.Mesh(jibGeo,
    new THREE.MeshPhongMaterial({ color: SAILC, flatShading: true, side: THREE.DoubleSide }));
  group.add(jib);

  // the helm: a tiller post so the station reads at a glance
  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 1.1 * s, 5), mat(ROPE));
  tiller.rotation.x = 0.9;
  tiller.position.set(F.helm.x, D.y + 0.45 * s, F.helm.z - 0.3 * s);
  group.add(tiller);

  // the masthead lantern: a warm point at the maintop, lit after dark by
  // setLantern. fog:false — a ship's light carries beyond the haze that
  // swallows her hull, which is exactly how you find a sail at night.
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.16 * s, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc978, fog: false }));
  lantern.position.set(0, D.y + 7.65 * s, 1.2 * s);
  lantern.visible = false;
  group.add(lantern);
  const setLantern = (on) => { lantern.visible = !!on; };

  // heading, trim [0..1], windFrom -> swing the rigs and belly the sails
  function setSail(heading, trim, windFrom, power) {
    const side = tackSign(heading, windFrom);
    const belly = 0.75 + 0.25 * power;
    for (const r of rigs) {
      r.rig.rotation.y = side * trim * 1.15;
      r.sail.scale.set(1, belly * 0.25 + 0.75, 1);
    }
    jib.rotation.y = side * (0.15 + trim * 0.5);
  }

  return { group, deck, setSail, setLantern };
}

// the unit hull, for every caller that just wants "a ship" (merchant lanes,
// the fleet astern)
export function buildSloop() {
  return buildShip(SLOOP, 1);
}
