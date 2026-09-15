// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { makeProfile } from "./profile.js";
import { traceFan, DEPTH_VIS } from "./rays.js";

const RAY_MAX = 720;
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
    opacity: 0.42,
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
  ping.frustumCulled = false;
  ping.renderOrder = 5;
  root.add(ping);

  const ping2 = ping.clone();
  ping2.material = volMat(0x7af0ff, 0.0);
  root.add(ping2);

  const sofar = new THREE.Mesh(new THREE.TorusGeometry(240, 2.4, 8, 64), volMat(0x2ab8c8, 0.38));
  sofar.geometry.rotateX(Math.PI / 2);
  sofar.frustumCulled = false;
  root.add(sofar);

  const thermo = new THREE.Mesh(new THREE.TorusGeometry(150, 1.6, 8, 48), volMat(0x4ec4d4, 0.28));
  thermo.geometry.rotateX(Math.PI / 2);
  thermo.frustumCulled = false;
  root.add(thermo);

  const mix = new THREE.Mesh(new THREE.TorusGeometry(90, 1.3, 8, 48), volMat(0x7ee0c8, 0.3));
  mix.geometry.rotateX(Math.PI / 2);
  mix.frustumCulled = false;
  root.add(mix);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.18, 1, 8, 1, true),
    volMat(0x5ad4e0, 0.35),
  );
  pole.frustumCulled = false;
  root.add(pole);

  const originMesh = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 10), volMat(0x9ef0e8, 0.7));
  originMesh.frustumCulled = false;
  originMesh.renderOrder = 6;
  root.add(originMesh);

  const blipGeo = new THREE.SphereGeometry(1.05, 10, 8);
  const blipMat0 = volMat(0x7af0ff, 0.85);
  const blipMat1 = volMat(0x8ef09a, 0.85);
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

  function rebuildFan(beaufort, hs, ox, oz, oy) {
    const p = makeProfile(beaufort, hs);
    const fan = traceFan(p, 18, RAY_MAX);
    const pos = rayGeo.attributes.position.array;
    const col = rayGeo.attributes.color.array;
    const nMax = Math.floor(pos.length / 18);
    let segs = 0;
    let w = 0;
    for (const ray of fan) {
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
        const y0 = oy - d0 / DEPTH_VIS;
        const y1 = oy - d1 / DEPTH_VIS;
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
    sofar.position.set(ox, oy - p.sofar / DEPTH_VIS, oz);
    thermo.position.set(ox, oy - p.thermo / DEPTH_VIS, oz);
    mix.position.set(ox, oy - p.mix / DEPTH_VIS, oz);
    const poleH = Math.max(8, p.sofar / DEPTH_VIS);
    pole.scale.set(1, poleH, 1);
    pole.position.set(ox, oy - poleH * 0.5, oz);
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
    const jumped = Math.hypot(originX - origin.x, originZ - origin.z) > 12;
    origin.x = originX;
    origin.z = originZ;
    origin.y = seaY;
    if (t - lastFanAt > 0.45 || lastFanAt < 0 || jumped) {
      rebuildFan(beaufort, hs, originX, originZ, seaY);
      lastFanAt = t;
    }
    const hydroY = seaY - d;
    originMesh.position.set(originX, hydroY, originZ);
    originMesh.scale.setScalar(1.0 + Math.sin(t * 4.2) * 0.12);
    const visSpeed = 220;
    if (pingActive && pingAge < 3.2) {
      const r = Math.max(2, visSpeed * pingAge);
      ping.visible = true;
      ping.position.set(originX, hydroY, originZ);
      ping.scale.setScalar(r);
      ping.material.opacity = Math.max(0, 0.55 * (1 - pingAge / 3.2));
      ping2.visible = true;
      ping2.position.set(originX, hydroY + 0.8, originZ);
      ping2.scale.setScalar(Math.max(1, r * 0.62));
      ping2.material.opacity = Math.max(0, 0.28 * (1 - pingAge / 2.4));
    } else {
      ping.visible = false;
      ping2.visible = false;
    }
    for (let i = 0; i < blips.length; i++) {
      const c = contacts && contacts[i];
      const m = blips[i];
      if (!c || !c.detected) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.material = c.team === 0 ? blipMat0 : blipMat1;
      const pulse = 1.05 + Math.sin(t * 6 + i) * 0.2;
      const s = (1.1 + Math.min(2.2, c.se * 0.1)) * pulse;
      m.position.set(c.x, hydroY, c.z);
      m.scale.setScalar(s);
    }
  }

  function dispose() {
    scene.remove(root);
    rayGeo.dispose();
    rayMat.dispose();
    pingGeo.dispose();
    ping.material.dispose();
    ping2.material.dispose();
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
