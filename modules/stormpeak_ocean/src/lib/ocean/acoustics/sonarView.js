// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { makeProfile } from "./profile.js";
import { traceFan, DEPTH_VIS } from "./rays.js";

const RAY_MAX = 420;
const DEPTH_CAP = 1180;
const RIBBON_FLOATS = 90000;

function volMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createSonarView(scene) {
  const root = new THREE.Group();
  root.name = "Acoustics";
  root.renderOrder = 4;
  scene.add(root);

  const rayPos = new Float32Array(RIBBON_FLOATS);
  const rayCol = new Float32Array(RIBBON_FLOATS);
  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute("position", new THREE.BufferAttribute(rayPos, 3));
  rayGeo.setAttribute("color", new THREE.BufferAttribute(rayCol, 3));
  const rayMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.075,
    depthWrite: false,
    depthTest: true,
    fog: true,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const ribbons = new THREE.Mesh(rayGeo, rayMat);
  ribbons.frustumCulled = false;
  ribbons.renderOrder = 4;
  root.add(ribbons);

  const pingGeo = new THREE.RingGeometry(0.92, 1.0, 96);
  pingGeo.rotateX(-Math.PI / 2);
  const ping = new THREE.Mesh(pingGeo, volMat(0x5ad4e0, 0.0));
  ping.visible = false;
  ping.frustumCulled = false;
  ping.renderOrder = 5;
  root.add(ping);

  const sofar = new THREE.Mesh(new THREE.TorusGeometry(240, 2.4, 8, 64), volMat(0x2ab8c8, 0.12));
  sofar.geometry.rotateX(Math.PI / 2);
  sofar.frustumCulled = false;
  root.add(sofar);
  sofar.visible = false;

  const thermo = new THREE.Mesh(new THREE.TorusGeometry(150, 1.6, 8, 48), volMat(0x4ec4d4, 0.085));
  thermo.geometry.rotateX(Math.PI / 2);
  thermo.frustumCulled = false;
  root.add(thermo);
  thermo.visible = false;

  const mix = new THREE.Mesh(new THREE.TorusGeometry(90, 1.3, 8, 48), volMat(0x7ee0c8, 0.085));
  mix.geometry.rotateX(Math.PI / 2);
  mix.frustumCulled = false;
  root.add(mix);
  mix.visible = false;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.18, 1, 8, 1, true),
    volMat(0x5ad4e0, 0.08),
  );
  pole.frustumCulled = false;
  root.add(pole);
  pole.visible = false;

  const originMesh = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 8), volMat(0x9ef0e8, 0.24));
  originMesh.frustumCulled = false;
  originMesh.renderOrder = 6;
  root.add(originMesh);
  originMesh.visible = false;
  ribbons.visible = false;

  const blipGeo = new THREE.SphereGeometry(1.05, 10, 8);
  const blipMat0 = volMat(0x7af0ff, 0.46);
  const blipMat1 = volMat(0x8ef09a, 0.46);
  const blips = [];
  for (let i = 0; i < 24; i++) {
    const m = new THREE.Mesh(blipGeo, i % 2 ? blipMat1 : blipMat0);
    m.visible = false;
    m.frustumCulled = false;
    root.add(m);
    blips.push(m);
  }

  let enabled = true;
  let lastFanAt = -1;
  let origin = { x: 0, z: 0, y: 0 };

  function colorAt(depth, out, o) {
    const k = Math.min(1, depth / DEPTH_CAP);
    out[o] = 0.08 + 0.18 * (1 - k);
    out[o + 1] = 0.42 + 0.22 * (1 - k);
    out[o + 2] = 0.48 + 0.22 * k;
  }

  function rebuildFan(beaufort, hs, ox, oz, seaY, sourceDepthWorld) {
    const p = makeProfile(beaufort, hs);
    const fan = traceFan(p, 18, RAY_MAX);
    const pos = rayGeo.attributes.position.array;
    const col = rayGeo.attributes.color.array;
    const nMax = Math.floor(pos.length / 18);
    let segs = 0;
    let w = 0;
    for (const ray of fan) {
      /* Show one stable mid-angle ray per bearing. The complete 84-sheet fan
         filled the close camera with opaque-looking columns and hid the bed. */
      if (Math.abs(ray.theta - 0.12) > 1e-6) continue;
      const pts = ray.pts;
      const bx = Math.sin(ray.bearing);
      const bz = Math.cos(ray.bearing);
      const px = -bz;
      const pz = bx;
      for (let i = 0; i + 3 < pts.length; i += 4) {
        if (segs >= nMax) break;
        const r0 = pts[i];
        const d0 = pts[i + 1];
        const r1 = pts[i + 2];
        const d1 = pts[i + 3];
        const y0 = seaY - sourceDepthWorld - d0 / DEPTH_VIS;
        const y1 = seaY - sourceDepthWorld - d1 / DEPTH_VIS;
        const x0 = ox + bx * r0;
        const z0 = oz + bz * r0;
        const x1 = ox + bx * r1;
        const z1 = oz + bz * r1;
        const hw = 0.42;
        pos[w] = x0 - px * hw;
        pos[w + 1] = y0;
        pos[w + 2] = z0 - pz * hw;
        pos[w + 3] = x0 + px * hw;
        pos[w + 4] = y0;
        pos[w + 5] = z0 + pz * hw;
        pos[w + 6] = x1 + px * hw;
        pos[w + 7] = y1;
        pos[w + 8] = z1 + pz * hw;
        pos[w + 9] = x0 - px * hw;
        pos[w + 10] = y0;
        pos[w + 11] = z0 - pz * hw;
        pos[w + 12] = x1 + px * hw;
        pos[w + 13] = y1;
        pos[w + 14] = z1 + pz * hw;
        pos[w + 15] = x1 - px * hw;
        pos[w + 16] = y1;
        pos[w + 17] = z1 - pz * hw;
        colorAt(d0, col, w);
        colorAt(d0, col, w + 3);
        colorAt(d1, col, w + 6);
        colorAt(d0, col, w + 9);
        colorAt(d1, col, w + 12);
        colorAt(d1, col, w + 15);
        w += 18;
        segs++;
      }
    }
    rayGeo.setDrawRange(0, segs * 6);
    rayGeo.attributes.position.needsUpdate = true;
    rayGeo.attributes.color.needsUpdate = true;
    sofar.position.set(ox, seaY - p.sofar / DEPTH_VIS, oz);
    thermo.position.set(ox, seaY - p.thermo / DEPTH_VIS, oz);
    mix.position.set(ox, seaY - p.mix / DEPTH_VIS, oz);
    const poleH = Math.max(8, p.sofar / DEPTH_VIS);
    pole.scale.set(1, poleH, 1);
    pole.position.set(ox, seaY - poleH * 0.5, oz);
  }

  function setEnabled(v) {
    enabled = v;
    root.visible = v;
  }

  function update({ t, seaY, originX, originZ, beaufort, hs, pingAge, pingActive, contacts, dive }) {
    if (!enabled) {
      root.visible = false;
      return;
    }
    root.visible = true;
    const d = Math.max(0, dive || 0);
    origin.x = originX;
    origin.z = originZ;
    origin.y = seaY;
    /* Acoustic rays, layer torii and contact spheres belong on the PPI, not
       across the battlefield. Their giant world-space circles flashed over
       ships and terrain as the camera or contact detection changed. Keep only
       one short, local acknowledgement of an intentional active ping. */
    const pingVisible = !!pingActive && pingAge >= 0 && pingAge < 0.85;
    const hydroY = seaY - d;
    ribbons.visible = false;
    sofar.visible = false;
    thermo.visible = false;
    mix.visible = false;
    pole.visible = false;
    originMesh.visible = false;
    if (pingVisible) {
      const r = 2 + 24 * pingAge;
      ping.visible = true;
      ping.position.set(originX, hydroY, originZ);
      ping.scale.setScalar(r);
      ping.material.opacity = 0.16 * (1 - pingAge / 0.85);
    } else {
      ping.visible = false;
    }
    for (let i = 0; i < blips.length; i++) {
      blips[i].visible = false;
    }
  }

  function dispose() {
    scene.remove(root);
    rayGeo.dispose();
    rayMat.dispose();
    pingGeo.dispose();
    ping.material.dispose();
    sofar.geometry.dispose();
    sofar.material.dispose();
    thermo.geometry.dispose();
    thermo.material.dispose();
    mix.geometry.dispose();
    mix.material.dispose();
    pole.geometry.dispose();
    pole.material.dispose();
    originMesh.geometry.dispose();
    originMesh.material.dispose();
    blipGeo.dispose();
    blipMat0.dispose();
    blipMat1.dispose();
  }

  return { root, update, setEnabled, dispose };
}
