// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { DEPTH_VIS } from "../world/abyss.js";

/**
 * Presentation-only ocean juice: dive bubbles, propeller wash, storm rain,
 * lightning, hadal orbs, a distant shadow. Never writes sim state.
 */
export function createOceanLife(scene, camera) {
  const root = new THREE.Group();
  root.name = "OceanLife";
  scene.add(root);

  const dummy = new THREE.Object3D();
  let seed = 91;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function nrand() {
    return rnd() * 2 - 1;
  }

  const B = 160;
  const bGeo = new THREE.SphereGeometry(0.11, 6, 5);
  const bMat = new THREE.MeshBasicMaterial({
    color: 0xc4f0ea,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false,
  });
  const bubbles = new THREE.InstancedMesh(bGeo, bMat, B);
  bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 6;
  root.add(bubbles);
  const pool = new Array(B);
  for (let i = 0; i < B; i++) {
    pool[i] = { live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 1 };
  }
  let cursor = 0;

  function grab() {
    for (let k = 0; k < B; k++) {
      const i = cursor++ % B;
      if (!pool[i].live) return pool[i];
    }
    return pool[cursor % B];
  }

  function emitBubble(x, y, z, flooding) {
    const p = grab();
    p.live = true;
    p.x = x + nrand() * 0.7;
    p.y = y + nrand() * 0.4;
    p.z = z + nrand() * 0.7;
    p.vx = nrand() * 0.55;
    p.vy = flooding ? 0.55 + rnd() * 1.4 : 1.4 + rnd() * 2.4;
    p.vz = nrand() * 0.55;
    p.life = 0;
    p.max = 1.6 + rnd() * 2.8;
    p.s = 0.35 + rnd() * 1.4;
  }

  const R = 96;
  const rGeo = new THREE.CylinderGeometry(0.018, 0.012, 2.4, 3);
  const rMat = new THREE.MeshBasicMaterial({
    color: 0x9eb8c4,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const rain = new THREE.InstancedMesh(rGeo, rMat, R);
  rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rain.frustumCulled = false;
  rain.renderOrder = 7;
  root.add(rain);
  const drops = new Array(R);
  for (let i = 0; i < R; i++) {
    drops[i] = { x: 0, y: 40, z: 0, v: 18 + Math.random() * 22, s: 0.7 + Math.random() * 1.1 };
  }

  const flashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    uniforms: { uAmt: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAmt;
      varying vec3 vDir;
      void main() {
        float up = clamp(normalize(vDir).y, 0.0, 1.0);
        float a = uAmt * mix(0.55, 0.12, up);
        gl_FragColor = vec4(vec3(0.78, 0.86, 1.0) * a, a);
      }`,
  });
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 10), flashMat);
  flashMesh.frustumCulled = false;
  flashMesh.renderOrder = 20;
  flashMesh.visible = false;
  root.add(flashMesh);

  const O = 12;
  const oGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const oMat = new THREE.MeshBasicMaterial({
    color: 0x3cffc2,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const orbs = new THREE.InstancedMesh(oGeo, oMat, O);
  orbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  orbs.frustumCulled = false;
  orbs.renderOrder = 5;
  root.add(orbs);
  const orbState = [];
  for (let i = 0; i < O; i++) {
    orbState.push({
      a: Math.random() * 6.28,
      r: 10 + Math.random() * 22,
      y: (Math.random() - 0.5) * 10,
      s: 0.4 + Math.random() * 1.6,
      ph: Math.random() * 6.28,
      hue: Math.random(),
    });
  }

  const shadowGeo = new THREE.CylinderGeometry(1.2, 1.8, 1, 8);
  shadowGeo.rotateX(Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x02040a,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.scale.set(9, 7, 38);
  shadow.visible = false;
  shadow.renderOrder = 2;
  root.add(shadow);

  const TEND = 28;
  const tendGeo = new THREE.CylinderGeometry(0.035, 0.16, 7.5, 5, 5);
  tendGeo.translate(0, 3.75, 0);
  const tendMat = new THREE.MeshBasicMaterial({
    color: 0x1a4a42,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    fog: true,
  });
  const tendrils = new THREE.InstancedMesh(tendGeo, tendMat, TEND);
  tendrils.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tendrils.frustumCulled = false;
  tendrils.renderOrder = 2;
  tendrils.visible = false;
  root.add(tendrils);
  const tendState = [];
  for (let i = 0; i < TEND; i++) {
    tendState.push({
      x: nrand() * 40,
      z: nrand() * 40,
      s: 0.7 + rnd() * 1.4,
      ph: rnd() * 6.28,
      h: 0.65 + rnd() * 0.8,
    });
  }

  const PL = 110;
  const plGeo = new THREE.SphereGeometry(0.09, 5, 4);
  const plMat = new THREE.MeshBasicMaterial({
    color: 0x3dffc4,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
    toneMapped: false,
  });
  const plankton = new THREE.InstancedMesh(plGeo, plMat, PL);
  plankton.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  plankton.frustumCulled = false;
  plankton.renderOrder = 6;
  root.add(plankton);
  const plState = [];
  for (let i = 0; i < PL; i++) {
    plState.push({
      x: nrand() * 36,
      y: nrand() * 10,
      z: nrand() * 36,
      s: 0.35 + rnd() * 1.2,
      ph: rnd() * 6.28,
      v: 0.15 + rnd() * 0.4,
    });
  }

  const FP = 22;
  const foamGeo = new THREE.CircleGeometry(1.6, 10);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xd4e0da,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, FP);
  foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  foam.frustumCulled = false;
  foam.renderOrder = 5;
  root.add(foam);
  const foamState = [];
  for (let i = 0; i < FP; i++) {
    foamState.push({
      x: nrand() * 70,
      z: nrand() * 70,
      s: 1.2 + rnd() * 3.4,
      life: rnd() * 8,
      vx: nrand() * 0.6,
      vz: nrand() * 0.6,
    });
  }

  const PU = 48;
  const puffGeo = new THREE.CircleGeometry(0.55, 8);
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0xc8d6d0,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, PU);
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffs.frustumCulled = false;
  puffs.renderOrder = 7;
  root.add(puffs);
  const puffPool = new Array(PU);
  for (let i = 0; i < PU; i++) puffPool[i] = { live: false, x: 0, y: 0, z: 0, life: 0, max: 1, s: 1 };
  let puffI = 0;
  function emitPuff(x, y, z, s) {
    const p = puffPool[puffI++ % PU];
    p.live = true;
    p.x = x;
    p.y = y;
    p.z = z;
    p.s = s;
    p.max = 0.28 + rnd() * 0.22;
    p.life = p.max;
  }

  const boltMat = new THREE.MeshBasicMaterial({
    color: 0xe8f2ff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const boltGeo = new THREE.CylinderGeometry(0.12, 0.55, 1, 5);
  boltGeo.translate(0, -0.5, 0);
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.visible = false;
  bolt.frustumCulled = false;
  bolt.renderOrder = 18;
  root.add(bolt);
  let boltLife = 0;
  let boltX = 0;
  let boltZ = 0;

  let trauma = 0;
  let flash = 0;
  let nextStrike = 6 + Math.random() * 8;
  const shake = new THREE.Vector3();

  function addTrauma(n) {
    trauma = Math.min(1, trauma + n);
  }

  function emitFromSnap(snap, seaY) {
    if (!snap?.ents) return;
    for (let i = 0; i < snap.ents.length; i++) {
      const e = snap.ents[i];
      if (!e.alive) continue;
      if (e.sub) {
        const y = seaY - (e.keelM || 0) / DEPTH_VIS;
        const flooding = (e.targetKeelM || 0) > (e.keelM || 0) + 0.8;
        const blowing = (e.targetKeelM || 0) < (e.keelM || 0) - 0.8;
        const sx = Math.sin(e.yaw);
        const cz = Math.cos(e.yaw);
        const sternX = e.x - sx * (e.radius * 1.2);
        const sternZ = e.z - cz * (e.radius * 1.2);
        if (flooding) {
          emitBubble(e.x, y - 0.4, e.z, true);
          emitBubble(sternX, y - 0.2, sternZ, true);
        } else if (blowing) {
          emitBubble(e.x + nrand() * 1.2, y, e.z + nrand() * 1.2, false);
          emitBubble(e.x, y + 0.4, e.z, false);
        } else if (e.dived && e.keelM > 5) {
          if (rnd() < 0.45) emitBubble(sternX, y - 0.15, sternZ, true);
        }
      } else if (!e.building && !e.hover) {
        if (rnd() < 0.55) {
          const sx = Math.sin(e.yaw);
          const cz = Math.cos(e.yaw);
          const bowX = e.x + sx * e.radius * 1.1;
          const bowZ = e.z + cz * e.radius * 1.1;
          emitPuff(bowX + nrand() * 0.8, seaY + 0.15, bowZ + nrand() * 0.8, 0.8 + rnd() * 1.4);
          if (rnd() < 0.5) emitBubble(e.x - sx * e.radius, seaY - 0.4, e.z - cz * e.radius, true);
        }
      }
    }
  }

  function update({ t, dt, seaY, under, metres, beaufort, cam }) {
    const cx = cam.x;
    const cy = cam.y;
    const cz = cam.z;

    let liveN = 0;
    for (let i = 0; i < B; i++) {
      const p = pool[i];
      if (!p.live) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -999, 0);
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx += Math.sin(t * 2.1 + p.x) * dt * 0.4;
      p.vy += dt * 0.55;
      if (p.y > seaY - 0.15 || p.life > p.max) {
        p.live = false;
        dummy.scale.setScalar(0);
        dummy.position.set(0, -999, 0);
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const fade = 1 - p.life / p.max;
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.s * (0.55 + fade * 0.7));
      dummy.updateMatrix();
      bubbles.setMatrixAt(i, dummy.matrix);
      liveN++;
    }
    bubbles.instanceMatrix.needsUpdate = true;
    bubbles.visible = liveN > 0;

    const raining = !under && beaufort >= 7;
    rain.visible = raining;
    if (raining) {
      const spread = 46;
      for (let i = 0; i < R; i++) {
        const d = drops[i];
        d.y -= d.v * dt * (0.85 + beaufort * 0.04);
        if (d.y < seaY + 0.2) {
          emitPuff(d.x, seaY + 0.05, d.z, 0.45 + rnd() * 0.55);
          d.x = cx + nrand() * spread;
          d.y = cy + 14 + rnd() * 22;
          d.z = cz + nrand() * spread;
        }
        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.set(1, d.s * (0.8 + beaufort * 0.05), 1);
        dummy.rotation.set(0, 0, 0.08);
        dummy.updateMatrix();
        rain.setMatrixAt(i, dummy.matrix);
      }
      rain.instanceMatrix.needsUpdate = true;
      rMat.opacity = 0.16 + Math.min(0.22, (beaufort - 7) * 0.05);
    }

    nextStrike -= dt;
    if (!under && beaufort >= 7.4 && nextStrike <= 0) {
      flash = 0.85 + rnd() * 0.4;
      addTrauma(0.22 + rnd() * 0.18);
      nextStrike = 5 + rnd() * 14;
      boltLife = 0.18 + rnd() * 0.12;
      boltX = cx + nrand() * 28;
      boltZ = cz + nrand() * 28;
    }
    if (flash > 0.002) flash *= Math.exp(-dt * 5.4);
    else flash = 0;
    flashMesh.visible = flash > 0.02;
    flashMesh.position.copy(camera.position);
    flashMat.uniforms.uAmt.value = flash;

    if (boltLife > 0) {
      boltLife -= dt;
      bolt.visible = !under && boltLife > 0;
      const len = 70 + Math.sin(t * 40) * 4;
      bolt.position.set(boltX, seaY + 0.2, boltZ);
      bolt.scale.set(0.7 + rnd() * 0.8, len, 0.7 + rnd() * 0.8);
      boltMat.opacity = Math.min(1, boltLife * 6);
    } else {
      bolt.visible = false;
    }

    const showTend = under && metres > 8 && metres < 120;
    tendrils.visible = showTend;
    if (showTend) {
      const spreadT = 22 + metres * 0.08;
      for (let i = 0; i < TEND; i++) {
        const s = tendState[i];
        const px = cx + s.x;
        const pz = cz + s.z;
        if (Math.hypot(s.x, s.z) > spreadT) {
          s.x = nrand() * spreadT;
          s.z = nrand() * spreadT;
        }
        dummy.position.set(px, cy - 6 - (i % 5) * 1.2, pz);
        dummy.rotation.set(
          Math.sin(t * 0.7 + s.ph) * 0.22,
          s.ph,
          Math.cos(t * 0.55 + s.ph * 1.3) * 0.18,
        );
        dummy.scale.set(s.s, s.h, s.s);
        dummy.updateMatrix();
        tendrils.setMatrixAt(i, dummy.matrix);
      }
      tendrils.instanceMatrix.needsUpdate = true;
      tendMat.opacity = 0.35 + Math.min(0.3, metres / 200);
    }

    for (let i = 0; i < PL; i++) {
      const p = plState[i];
      p.y += Math.sin(t * 0.8 + p.ph) * dt * p.v;
      const px = cx + p.x;
      const py = under ? cy + p.y : seaY - 0.4 - (i % 7) * 0.35;
      const pz = cz + p.z;
      if (Math.hypot(p.x, p.z) > 38) {
        p.x = nrand() * 36;
        p.z = nrand() * 36;
      }
      const pulse = 0.45 + 0.7 * Math.abs(Math.sin(t * 1.8 + p.ph));
      dummy.position.set(px, py, pz);
      dummy.scale.setScalar(p.s * pulse);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      plankton.setMatrixAt(i, dummy.matrix);
    }
    plankton.instanceMatrix.needsUpdate = true;
    plankton.visible = true;
    plMat.color.setHex(under && metres > 140 ? 0x8a5cff : 0x3dffc4);
    plMat.opacity = under ? 0.22 + Math.min(0.3, metres / 400) : 0.14;

    const showFoam = !under && beaufort >= 5;
    foam.visible = showFoam;
    if (showFoam) {
      for (let i = 0; i < FP; i++) {
        const f = foamState[i];
        f.x += f.vx * dt;
        f.z += f.vz * dt;
        f.life += dt;
        if (f.life > 9 || Math.hypot(f.x, f.z) > 90) {
          f.x = nrand() * 70;
          f.z = nrand() * 70;
          f.life = 0;
        }
        dummy.position.set(cx + f.x, seaY + 0.12, cz + f.z);
        dummy.scale.setScalar(f.s * (0.8 + 0.2 * Math.sin(t + f.life)));
        dummy.rotation.set(0, f.life * 0.05, 0);
        dummy.updateMatrix();
        foam.setMatrixAt(i, dummy.matrix);
      }
      foam.instanceMatrix.needsUpdate = true;
      foamMat.opacity = 0.12 + Math.min(0.18, (beaufort - 5) * 0.03);
    }

    let puffN = 0;
    for (let i = 0; i < PU; i++) {
      const p = puffPool[i];
      if (!p.live) {
        dummy.scale.setScalar(0);
        dummy.position.set(0, -400, 0);
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.live = false;
        dummy.scale.setScalar(0);
        dummy.position.set(0, -400, 0);
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
        continue;
      }
      const k = 1 - p.life / p.max;
      dummy.position.set(p.x, p.y + k * 0.35, p.z);
      dummy.scale.setScalar(p.s * (0.6 + k * 1.4));
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      puffs.setMatrixAt(i, dummy.matrix);
      puffN++;
    }
    puffs.instanceMatrix.needsUpdate = true;
    puffs.visible = puffN > 0;
    puffMat.opacity = 0.2;

    const showOrbs = under && metres > 36;
    orbs.visible = showOrbs;
    if (showOrbs) {
      for (let i = 0; i < O; i++) {
        const o = orbState[i];
        o.a += dt * (0.12 + (i % 3) * 0.05);
        const px = cx + Math.cos(o.a + o.ph) * o.r;
        const pz = cz + Math.sin(o.a * 0.85) * o.r;
        const py = cy + o.y + Math.sin(t * 0.7 + o.ph) * 2.4;
        const pulse = 0.65 + 0.45 * Math.sin(t * 1.6 + o.ph);
        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(o.s * pulse);
        dummy.updateMatrix();
        orbs.setMatrixAt(i, dummy.matrix);
      }
      orbs.instanceMatrix.needsUpdate = true;
      const hadal = metres > 160;
      oMat.color.setHex(hadal ? 0x7a4cff : 0x3cffc2);
      oMat.opacity = 0.16 + Math.min(0.28, metres / 500);
    }

    const showShadow = under && metres > 55;
    shadow.visible = showShadow;
    if (showShadow) {
      const ang = t * 0.07;
      const dist = 48 + Math.sin(t * 0.11) * 10;
      shadow.position.set(
        cx + Math.cos(ang) * dist,
        cy - 8 - Math.sin(t * 0.2) * 4,
        cz + Math.sin(ang * 0.8) * dist,
      );
      shadow.rotation.y = ang + 1.2;
      shadow.rotation.x = Math.sin(t * 0.3) * 0.12;
      shadowMat.opacity = 0.22 + Math.min(0.28, (metres - 55) / 280);
    }

    trauma = Math.max(0, trauma - dt * 1.35);
    const mag = trauma * trauma * 0.55;
    shake.set((rnd() - 0.5) * mag, (rnd() - 0.5) * mag * 0.6, (rnd() - 0.5) * mag);

    return { flash, trauma };
  }

  function applyShake() {
    if (trauma <= 0.01) return;
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    camera.position.z += shake.z;
  }

  function dispose() {
    scene.remove(root);
    bGeo.dispose();
    bMat.dispose();
    bubbles.dispose();
    rGeo.dispose();
    rMat.dispose();
    rain.dispose();
    flashMesh.geometry.dispose();
    flashMat.dispose();
    oGeo.dispose();
    oMat.dispose();
    orbs.dispose();
    shadowGeo.dispose();
    shadowMat.dispose();
    tendGeo.dispose();
    tendMat.dispose();
    tendrils.dispose();
    plGeo.dispose();
    plMat.dispose();
    plankton.dispose();
    foamGeo.dispose();
    foamMat.dispose();
    foam.dispose();
    puffGeo.dispose();
    puffMat.dispose();
    puffs.dispose();
    boltGeo.dispose();
    boltMat.dispose();
  }

  return { emitFromSnap, emitBubble, update, applyShake, addTrauma, getFlash: () => flash, dispose };
}
