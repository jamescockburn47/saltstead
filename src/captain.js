// The captain — a readable low-poly figure you look DOWN on (third person),
// so silhouette beats detail: broad hat, coat, boots. All procedural.

import * as THREE from 'three';

function mat(color) { return new THREE.MeshPhongMaterial({ color, flatShading: true, shininess: 4 }); }

// warden: true dresses the harbourmaster's own figure — gold hatband, gold
// epaulettes, a sea-green coat. Same silhouette, unmistakable from above.
export function buildCaptain(warden = false) {
  const g = new THREE.Group();
  const coatColor = warden ? 0x1e4d40 : 0x5a1f24; // sea-green vs oxblood

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.18), mat(0x2b2b33));
  legL.position.set(-0.11, 0.21, 0);
  const legR = legL.clone(); legR.position.x = 0.11;
  g.add(legL, legR);

  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.28), mat(coatColor));
  coat.position.y = 0.68;
  g.add(coat);

  if (warden) {
    const epL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.2), mat(0xd8b95a));
    epL.position.set(-0.24, 0.92, 0);
    const epR = epL.clone(); epR.position.x = 0.24;
    g.add(epL, epR);
  }

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), mat(0xd9a56f));
  head.position.y = 1.08;
  g.add(head);

  // the tricorn: a squashed cone brim + crown — the silhouette that says pirate
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 3), mat(0x1d1d22));
  brim.position.y = 1.24; brim.rotation.y = Math.PI / 6;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 6), mat(0x1d1d22));
  crown.position.y = 1.3;
  g.add(brim, crown);

  if (warden) { // the gold hatband — the warden's mark, readable top-down
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.175, 0.045, 6), mat(0xd8b95a));
    band.position.y = 1.27;
    g.add(band);
  }

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.44, 0.14), mat(coatColor));
  armL.position.set(-0.3, 0.68, 0);
  const armR = armL.clone(); armR.position.x = 0.3;
  g.add(armL, armR);

  let phase = 0;
  // walking: leg/arm swing + a little bob; idle: settle back
  function animate(dt, moving) {
    phase = moving ? phase + dt * 7 : phase * (1 - Math.min(1, dt * 8));
    const s = Math.sin(phase) * (moving ? 0.5 : 0);
    legL.rotation.x = s; legR.rotation.x = -s;
    armL.rotation.x = -s * 0.7; armR.rotation.x = s * 0.7;
    g.position.y += 0; // deck-local y is owned by the caller
  }

  return { group: g, animate };
}
