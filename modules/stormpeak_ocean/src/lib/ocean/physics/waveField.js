// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * Surface-blast field. Crater + lip + Rayleigh jet + two gravity rings.
 * CPU sample matches the GPU vertex displacement so hulls ride the hole.
 */
const MAX = 8;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function gauss(x, w) {
  const t = x / Math.max(0.35, w);
  return Math.exp(-(t * t));
}

export function evalBlast(e, x, z, now) {
  const age = now - e.t0;
  if (age < 0 || age > (e.kind === "nuke" ? 28 : 11)) return null;
  const p = e.power;
  const tC = 0.55 + 0.5 * Math.min(1.4, p / 4);
  const c1 = e.kind === "nuke" ? 22 + p * 12 : e.kind === "torp" ? 8.5 + p * 10 : 11.5 + p * 16;
  const dx = x - e.x;
  const dz = z - e.z;
  const r = Math.hypot(dx, dz);
  const r0 = e.r0;
  const grow = 1 - Math.exp(-age / 0.15);
  const life = Math.exp(-age / (e.kind === "nuke" ? 7.5 + p * 2.2 : 3.4 + p * 1.4));

  let cavR;
  let cavD;
  let jetH;
  let lipH;
  if (age < tC) {
    cavR = r0 * (0.2 + 0.92 * (1 - Math.exp(-age / 0.2)));
    cavD = (e.kind === "nuke" ? 7 + p * 2.6 : 5 + p * (e.kind === "super" ? 24 : e.kind === "torp" ? 17 : 15)) * grow;
    jetH = 0;
    lipH = cavD * 0.32 * grow;
  } else {
    const jetAge = age - tC;
    const k = Math.exp(-jetAge / (e.kind === "nuke" ? 1.8 : 0.48));
    cavR = r0 * (1.02 + jetAge * (e.kind === "nuke" ? 0.85 : 1.55));
    cavD = (e.kind === "nuke" ? 6 + p * 2.4 : 5 + p * 15) * k * (e.kind === "nuke" ? 0.72 : 0.42);
    const jenv = Math.exp(-((jetAge - 0.12) / (e.kind === "nuke" ? 0.55 : 0.2)) * ((jetAge - 0.12) / (e.kind === "nuke" ? 0.55 : 0.2)));
    jetH = p * (e.kind === "nuke" ? 3.2 : e.kind === "shell" ? 6.5 : 14) * jenv;
    lipH = (e.kind === "nuke" ? 2.2 + p * 1.1 : 3.5 + p * 7) * k * 0.45;
  }

  const bowl = Math.pow(Math.max(0, 1 - r / Math.max(0.85, cavR)), 1.55);
  const lip = gauss(r - cavR, Math.max(1.4, cavR * 0.18));
  const jet = gauss(r, Math.max(0.5, r0 * 0.18));

  const width = 2.4 + p * 4.8 + age * 0.7;
  const crestR = r0 * 0.32 + c1 * age;
  let crestH = p * (e.kind === "nuke" ? 5.4 : e.kind === "torp" ? 3.4 : 7.2) * life * grow;
  if (e.kind === "rogue") crestH *= 1.22;
  const ring = gauss(r - crestR, width);

  let ring2 = 0;
  let crestH2 = 0;
  let crestR2 = 0;
  const age2 = age - 0.7;
  if (age2 > 0) {
    crestR2 = r0 * 0.45 + c1 * 0.58 * age2;
    crestH2 = crestH * 0.34 * Math.exp(-age2 / 3.2);
    ring2 = gauss(r - crestR2, width * 1.5);
  }
  let ring3 = 0;
  let crestH3 = 0;
  if (e.kind === "nuke" && age > 1.6) {
    const age3 = age - 1.6;
    const crestR3 = r0 * 0.7 + c1 * 0.42 * age3;
    crestH3 = crestH * 0.22 * Math.exp(-age3 / 5);
    ring3 = gauss(r - crestR3, width * 2.1);
  }

  if (e.kind === "nuke" && e.surface === "land") {
    cavD *= 0.12;
    jetH = 0;
    lipH *= 0.2;
    crestH *= 0.32;
    crestH2 *= 0.32;
    crestH3 *= 0.2;
  }

  let h = -bowl * cavD + lip * lipH + jet * jetH + ring * crestH + ring2 * crestH2 + ring3 * crestH3;
  if (r < crestR) {
    const trough = gauss(crestR - r, width * 1.35);
    h -= crestH * 0.34 * trough * (1 - bowl);
  }

  const dBowl = r < cavR ? (-1.55 * Math.pow(Math.max(1e-4, 1 - r / cavR), 0.55) * (-1 / cavR)) : 0;
  let dhdr = -dBowl * cavD;
  dhdr += lip * lipH * (-2 * (r - cavR) / (Math.max(1.4, cavR * 0.18) ** 2));
  dhdr += ring * crestH * (-2 * (r - crestR) / (width * width));
  const inv = r > 1e-4 ? 1 / r : 0;
  const collapsing = age >= tC && age < tC + 0.45;
  const onCrest = ring > 0.42 && crestH > 0.9;
  const opening = age < tC;
  let vy = 0;
  if (opening) vy = -cavD * 0.55 * bowl + lipH * 0.4 * lip;
  else vy = jetH * 1.15 * jet - cavD * 0.3 * bowl;
  if (onCrest) vy += crestH * 0.45;

  return {
    h,
    sx: dhdr * dx * inv,
    sz: dhdr * dz * inv,
    vy,
    foam: ring * Math.min(1, crestH * 0.22) + lip * Math.min(1, lipH * 0.18) + jet * Math.min(1, jetH * 0.08),
    crest: onCrest ? ring * p : 0,
    cavity: bowl * (cavD / 24),
    collapsing,
    opening,
    onCrest,
    power: p,
    crestH,
    cavD,
    crestR,
    cavR,
    jetH,
    lipH,
    width,
    jetR: Math.max(0.5, r0 * 0.18),
    tC,
    age,
  };
}

export function createWaveField(scene) {
  const events = [];
  let t = 0;
  const gpuPos = Array.from({ length: MAX }, () => new THREE.Vector2());
  const gpuData = Array.from({ length: MAX }, () => new THREE.Vector4());
  const gpuAux = Array.from({ length: MAX }, () => new THREE.Vector4());
  const jets = [];
  const wakePts = [];
  const dummy = new THREE.Object3D();

  const ringGeo = new THREE.RingGeometry(0.74, 1.0, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xd7e4de,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const rings = scene
    ? new THREE.InstancedMesh(ringGeo, ringMat, MAX)
    : null;
  if (rings) {
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rings.frustumCulled = false;
    rings.renderOrder = 5;
    scene.add(rings);
  }
  const scarGeo = new THREE.CircleGeometry(1, 24);
  scarGeo.rotateX(-Math.PI / 2);
  const scarMat = new THREE.MeshBasicMaterial({
    color: 0xcfdcd6,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const scars = scene ? new THREE.InstancedMesh(scarGeo, scarMat, MAX) : null;
  if (scars) {
    scars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scars.frustumCulled = false;
    scars.renderOrder = 4;
    scene.add(scars);
  }

  function detonate(x, z, power, kind = "shell", surface = "water") {
    const p = kind === "nuke" ? clamp(power, 2.6, 4.5) : clamp(power, 0.12, 1.45);
    const land = kind === "nuke" && surface === "land";
    const e = {
      x,
      z,
      t0: t,
      power: p,
      kind,
      surface: land ? "land" : "water",
      r0:
        kind === "nuke"
          ? land
            ? 38 + p * 14
            : 85 + p * 26
          : 4.2 + p * (kind === "super" ? 16 : kind === "rogue" ? 20 : kind === "torp" ? 8 : 10),
      hit: new Set(),
      opened: false,
      jetted: false,
    };
    if (events.length >= MAX) events.shift();
    events.push(e);
    return e;
  }

  function sample(x, z, out) {
    let h = 0;
    let sx = 0;
    let sz = 0;
    let vy = 0;
    let foam = 0;
    let crest = 0;
    let cavity = 0;
    for (let i = 0; i < events.length; i++) {
      const v = evalBlast(events[i], x, z, t);
      if (!v) continue;
      h += v.h;
      sx += v.sx;
      sz += v.sz;
      vy += v.vy;
      foam += v.foam;
      if (v.crest > crest) crest = v.crest;
      if (v.cavity > cavity) cavity = v.cavity;
    }
    if (out) {
      out.h = h;
      out.sx = sx;
      out.sz = sz;
      out.vy = vy;
      out.foam = foam;
      out.crest = crest;
      out.cavity = cavity;
      return out;
    }
    return { h, sx, sz, vy, foam, crest, cavity };
  }

  function impulseAt(x, z) {
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const v = evalBlast(e, x, z, t);
      if (!v) continue;
      const dx = x - e.x;
      const dz = z - e.z;
      const r = Math.hypot(dx, dz);
      const inv = r > 0.2 ? 1 / r : 0;
      let rad = 0;
      const age = t - e.t0;
      if (e.kind === "nuke" && age > 1.6 && age < 7.5) {
        const suction = Math.sin(((age - 1.6) / 5.9) * Math.PI);
        rad -= suction * (22 + e.power * 12);
      }
      if (v.onCrest) rad += v.crestH * (e.kind === "nuke" ? 8.5 : 2.4);
      if (v.opening) rad += v.lipH * (e.kind === "nuke" ? 1.6 : 0.8);
      if (v.collapsing) rad -= v.cavD * (e.kind === "nuke" ? 1.4 : 0.7) + v.power * (e.kind === "nuke" ? 14 : 6);
      fx += dx * inv * rad;
      fz += dz * inv * rad;
      fy += v.vy;
    }
    return { fx, fy, fz };
  }

  function sensorAt(id, x, z, keelM = 0) {
    let form = 0;
    let load = 0;
    let crest = 0;
    let cavity = 0;
    let tag = "";
    const push = impulseAt(x, z);
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const v = evalBlast(e, x, z, t);
      if (!v) continue;
      load += Math.abs(v.h) * 0.07 + v.crest * 0.75 + v.cavity * 0.5 + Math.abs(v.vy) * 0.04;
      if (v.crest > crest) crest = v.crest;
      if (v.cavity > cavity) cavity = v.cavity;
      const key = `${e.t0}|${id}`;
      const deep = keelM > 22;
      if (v.onCrest && !e.hit.has(key + "c")) {
        e.hit.add(key + "c");
        form += v.power * (12 + v.crestH) * (deep ? 0.32 : 1);
        tag = "CREST";
      }
      if (v.collapsing && v.cavity > 0.16 && !e.hit.has(key + "k")) {
        e.hit.add(key + "k");
        form += v.power * (20 + v.cavD) * (deep ? 1.4 : 0.75);
        tag = "COLLAPSE";
      }
      if (v.jetH > 4 && !e.hit.has(key + "j") && Math.hypot(x - e.x, z - e.z) < e.r0 * 0.6) {
        e.hit.add(key + "j");
        form += v.power * 16 * (deep ? 0.5 : 1.1);
        tag = "JET";
      }
    }
    const nuke = events.some((ev) => ev.kind === "nuke");
    const lim = nuke ? 110 : 28;
    return {
      id,
      load: clamp(load, 0, nuke ? 12 : 5),
      form,
      crest,
      cavity,
      tag,
      pushX: clamp(push.fx, -lim, lim),
      pushZ: clamp(push.fz, -lim, lim),
      pushY: clamp(push.fy, nuke ? -80 : -40, nuke ? 80 : 40),
    };
  }

  function packGpu() {
    let n = 0;
    for (let i = 0; i < events.length && n < MAX; i++) {
      const e = events[i];
      const v = evalBlast(e, e.x, e.z, t);
      if (!v) continue;
      gpuPos[n].set(e.x, e.z);
      gpuData[n].set(v.crestR, Math.max(0.8, v.cavR), Math.min(18, v.crestH), Math.min(18, v.cavD));
      gpuAux[n].set(Math.min(16, v.jetH), Math.min(12, v.lipH), v.width, v.jetR);
      n++;
    }
    return { count: n, pos: gpuPos, data: gpuData, aux: gpuAux };
  }

  function update(now, seaY = 0) {
    t = now;
    jets.length = 0;
    wakePts.length = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      const age = now - e.t0;
      if (age > (e.kind === "nuke" ? 28 : 11)) {
        events.splice(i, 1);
        continue;
      }
      if (!e.opened) {
        e.opened = true;
      }
      const v = evalBlast(e, e.x, e.z, t);
      if (v && v.age >= v.tC && !e.jetted) {
        e.jetted = true;
        jets.push({ x: e.x, z: e.z, power: e.power, kind: e.kind });
      }
      if (v && v.crestH > 0.5) {
        const n = e.kind === "nuke" ? 8 : 4;
        for (let k = 0; k < n && wakePts.length < 8; k++) {
          const a = (k / n) * Math.PI * 2 + age * 0.4;
          wakePts.push({
            x: e.x + Math.cos(a) * v.crestR,
            z: e.z + Math.sin(a) * v.crestR,
            strength: Math.min(1, e.kind === "nuke" ? 0.95 : 0.4 + v.crestH * 0.1),
            radius: Math.max(10, e.kind === "nuke" ? 28 + v.crestR * 0.18 : v.width * 2.4 + v.crestR * 0.12),
          });
        }
      }
    }
    if (rings) {
      for (let i = 0; i < MAX; i++) {
        if (i >= events.length) {
          dummy.scale.set(0, 0, 0);
          dummy.position.set(0, -400, 0);
          dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
          if (scars) scars.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const e = events[i];
        const v = evalBlast(e, e.x, e.z, t);
        if (!v || v.crestH < 0.25) {
          dummy.scale.set(0, 0, 0);
          dummy.position.set(0, -400, 0);
          dummy.updateMatrix();
          rings.setMatrixAt(i, dummy.matrix);
          if (scars) scars.setMatrixAt(i, dummy.matrix);
          continue;
        }
        dummy.position.set(e.x, seaY + 0.45, e.z);
        dummy.scale.set(Math.max(6, v.crestR), 1, Math.max(6, v.crestR));
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        rings.setMatrixAt(i, dummy.matrix);
        if (scars) {
          const scarR = Math.max(3, v.cavR * 0.85);
          dummy.scale.set(scarR, 1, scarR);
          dummy.position.set(e.x, seaY + 0.22, e.z);
          dummy.updateMatrix();
          scars.setMatrixAt(i, dummy.matrix);
        }
      }
      rings.instanceMatrix.needsUpdate = true;
      ringMat.opacity = 0.28 + Math.min(0.28, events.length * 0.05);
      if (scars) {
        scars.instanceMatrix.needsUpdate = true;
        scarMat.opacity = 0.16 + Math.min(0.18, events.length * 0.04);
      }
    }
    return { pack: packGpu(), jets, wakePts };
  }

  function live() {
    return events.length;
  }

  function dispose() {
    if (rings && scene) {
      scene.remove(rings);
      ringGeo.dispose();
      ringMat.dispose();
      rings.dispose();
    }
    if (scars && scene) {
      scene.remove(scars);
      scarGeo.dispose();
      scarMat.dispose();
      scars.dispose();
    }
  }

  return { detonate, sample, sensorAt, impulseAt, update, packGpu, live, events, get t() { return t; }, dispose };
}
