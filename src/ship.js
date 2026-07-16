// The sloop — procedural low-poly geometry, flat-shaded, zero assets.
// Returns { group, deck, setSail } — group carries position + attitude,
// the captain is parented to `deck` so the whole ship is one moving frame.

import * as THREE from 'three';
import { DECK, HELM } from './shipframe.js';
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
// of vertex pushing beats any asset file
function buildHull() {
  const L = DECK.maxZ - DECK.minZ + 1.6, W = (DECK.maxX + 0.35) * 2, H = 1.7;
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
    if (t > 0.55 && y > 0) pos.setY(i, y + 0.25 * (t - 0.55) / 0.45); // sheer line rises at the bow
  }
  geo.computeVertexNormals();
  // strakes: 8 plank courses up the topsides, grain running bow to stern
  return new THREE.Mesh(geo, woodMat({ base: [110, 74, 47], nPlanks: 8, seed: 7 }));
}

export function buildSloop() {
  const group = new THREE.Group();

  const hull = buildHull();
  hull.position.y = DECK.y - 0.95;
  group.add(hull);

  const deck = new THREE.Group();
  deck.position.y = 0;
  group.add(deck);

  // deck planks laid fore-and-aft (rotate turns the bands 90°)
  const deckPlank = new THREE.Mesh(
    new THREE.BoxGeometry((DECK.maxX + 0.15) * 2, 0.12, DECK.maxZ - DECK.minZ),
    woodMat({ base: [154, 122, 82], nPlanks: 10, seed: 11, vary: 0.10 }, { rotate: true }));
  deckPlank.position.set(0, DECK.y - 0.06, (DECK.maxZ + DECK.minZ) / 2);
  group.add(deckPlank);

  // gunwale rails
  const railMat = woodMat({ base: [83, 54, 31], nPlanks: 2, seed: 3, vary: 0.12 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.5, DECK.maxZ - DECK.minZ), railMat);
    rail.position.set(side * (DECK.maxX + 0.08), DECK.y + 0.2, (DECK.maxZ + DECK.minZ) / 2);
    group.add(rail);
  }

  // spars: staved grain running up the stick, not hooped around it
  const sparMat = woodMat({ base: [83, 54, 31], nPlanks: 3, seed: 5, vary: 0.10 }, { rotate: true });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.4, 6), sparMat);
  mast.position.set(0, DECK.y + 3.7, 1.2);
  group.add(mast);

  const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 2.6, 5), sparMat);
  bowsprit.rotation.x = -Math.PI / 2 + 0.25;
  bowsprit.position.set(0, DECK.y + 0.45, DECK.maxZ + 1.0);
  group.add(bowsprit);

  // boom + mainsail swing together around the mast
  const rig = new THREE.Group();
  rig.position.set(0, 0, 1.2); // at the mast
  group.add(rig);

  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 4.6, 5), sparMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.set(0, DECK.y + 1.55, -2.3);
  rig.add(boom);

  // mainsail: a single triangle, mast to boom-end to masthead
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, DECK.y + 1.6, -0.05,
    0, DECK.y + 1.6, -4.5,
    0, DECK.y + 6.9, -0.05,
  ], 3));
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo,
    new THREE.MeshPhongMaterial({ color: SAILC, flatShading: true, side: THREE.DoubleSide }));
  rig.add(sail);

  // jib off the bowsprit
  const jibGeo = new THREE.BufferGeometry();
  jibGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, DECK.y + 0.7, DECK.maxZ + 2.2,
    0, DECK.y + 1.4, 1.15,
    0, DECK.y + 6.6, 1.15,
  ], 3));
  jibGeo.computeVertexNormals();
  const jib = new THREE.Mesh(jibGeo,
    new THREE.MeshPhongMaterial({ color: SAILC, flatShading: true, side: THREE.DoubleSide }));
  group.add(jib);

  // the helm: a tiller post so the station reads at a glance
  const tiller = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5), mat(ROPE));
  tiller.rotation.x = 0.9;
  tiller.position.set(HELM.x, DECK.y + 0.45, HELM.z - 0.3);
  group.add(tiller);

  // heading, trim [0..1], windFrom -> swing the rig and belly the sails
  function setSail(heading, trim, windFrom, power) {
    const side = tackSign(heading, windFrom);
    rig.rotation.y = side * trim * 1.15;
    const belly = 0.75 + 0.25 * power;
    sail.scale.set(1, belly * 0.25 + 0.75, 1);
    jib.rotation.y = side * (0.15 + trim * 0.5);
  }

  return { group, deck, setSail };
}
