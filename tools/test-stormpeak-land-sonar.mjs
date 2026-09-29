import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../modules/stormpeak_ocean/node_modules/three/build/three.module.js';
import { ISLANDS, probeSurface } from '../modules/stormpeak_ocean/src/lib/ocean/objects/islands.js';
import { DEPTH_VIS, LAND_CEILING_M, seabedHeightGLSL, seabedMetres } from '../modules/stormpeak_ocean/src/lib/ocean/world/abyss.js';
import { createSeabed } from '../modules/stormpeak_ocean/src/lib/ocean/objects/seabed.js';
import { createOceanMaterial } from '../modules/stormpeak_ocean/src/lib/ocean/ocean/oceanMaterial.js';
import { OrbitFollowControls } from '../modules/stormpeak_ocean/src/lib/ocean/camera/OrbitFollowControls.js';
import { createSonarView } from '../modules/stormpeak_ocean/src/lib/ocean/acoustics/sonarView.js';

assert.equal(ISLANDS.length, 2);
assert.equal(LAND_CEILING_M, -96, 'dry peaks must not clip into a flat mesa');
for (const island of ISLANDS) {
  const center = seabedMetres(island.x, island.z);
  const shoulder = seabedMetres(island.x + island.r * 0.25, island.z);
  const coast = seabedMetres(island.x + island.r * 0.75, island.z);
  assert.ok(center < -60, `island ${island.x},${island.z} needs distant-view relief`);
  assert.ok(shoulder - center > 25 && coast > 0,
    `island ${island.x},${island.z} must descend continuously into the sea`);
  assert.equal(probeSurface(island.x, island.z), 'land');
}
assert.equal(probeSurface(390, -220), 'water', 'old trench site cannot be called land');
assert.equal(probeSurface(0, 0), 'water');
assert.equal(probeSurface(0, 0, [{ alive: true, building: true, x: 0, z: 0, radius: 10 }]), 'land');

const scene = new THREE.Scene();
const seabed = createSeabed(scene);
const sky = { topColor: new THREE.Color(), bottomColor: new THREE.Color(),
  sunDirection: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color() };
const water = createOceanMaterial(sky, { lodMode: 1 });
assert.ok(seabed.root.children[0].material.vertexShader.includes(seabedHeightGLSL),
  'ground shader must use the shared seafloor');
assert.ok(water.vertexShader.includes(seabedHeightGLSL),
  'water cutout must use the identical seafloor instead of smooth ellipses');
assert.match(water.vertexShader, /return max\(0\.0, -seabedM\(xz\)\)/);
assert.doesNotMatch(water.vertexShader, /11\.0 \* pow\(max\(0\.0, 1\.0 - ra/);
water.dispose();
seabed.dispose();

// Shift-wheel is immediate, unlike the rate-limited ballast correction. A
// sudden +660 input must be bounded before the camera can enter the floor.
{
  const lab = readFileSync(new URL('../modules/stormpeak_ocean/src/lib/ocean/StormpeakLab.js', import.meta.url), 'utf8');
  assert.match(lab, /controls\.setMaxDive\(mudCap\)/);
  assert.match(lab, /controls\.keepAboveFloor\(cameraFloorY, 1\.5,/);
  const listeners = {};
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener: (type, fn) => { listeners[`window:${type}`] = fn; } };
  try {
    const camera = new THREE.PerspectiveCamera();
    const dom = { addEventListener: (type, fn) => { listeners[`dom:${type}`] = fn; } };
    const controls = new OrbitFollowControls(camera, dom);
    controls.dist = 22; controls.pitch = 0.72; controls.dive = 34;
    listeners['window:keydown']({ code: 'ShiftLeft' });
    listeners['dom:wheel']({ deltaY: 660, preventDefault() {} });
    const mudCap = seabedMetres(0, 0) / DEPTH_VIS - 0.4;
    assert.ok(controls.dive > mudCap, 'unbounded wheel reproduces the prior overshoot');
    controls.setMaxDive(mudCap);
    assert.equal(controls.dive, mudCap, 'live wheel depth must immediately respect mudCap');
    controls.pitch = -0.7; // upward orbit can lower the eye independently of focal depth
    controls.update(1 / 60, 2);
    const floorY = -seabedMetres(camera.position.x, camera.position.z) / DEPTH_VIS;
    assert.ok(camera.position.y < floorY + 1.5, 'fixture must enter the near-floor case');
    assert.equal(controls.keepAboveFloor(floorY, 1.5, 2), true);
    assert.ok(camera.position.y >= floorY + 1.5 - 1e-6, 'eye must stay above terrain');
    listeners['dom:wheel']({ deltaY: 660, preventDefault() {} });
    assert.ok(controls.dive <= controls.maxDive, 'another wheel step cannot re-enter terrain');
  } finally { globalThis.window = oldWindow; }
}

const sonar = createSonarView(scene);
const sample = { t: 1, seaY: 0, originX: 0, originZ: 0, beaufort: 9.5, hs: 3, pingAge: 0.3, pingActive: true, contacts: [{ detected: true, x: 4, z: 4, se: 6 }], dive: 0 };
sonar.update(sample);
assert.equal(sonar.root.children.filter(child => child.visible).length, 1, 'only deliberate local ping may cover the world view');
assert.ok(sonar.root.children.find(child => child.visible).scale.x < 24, 'ping radius stays local');
sonar.update({ ...sample, pingAge: 0.9 });
assert.equal(sonar.root.children.filter(child => child.visible).length, 0, 'world-space ping retires quickly');
sonar.setEnabled(false);
sonar.update(sample);
assert.equal(sonar.root.visible, false);
sonar.dispose();

console.log('Stormpeak land/sonar contracts: PASS');
