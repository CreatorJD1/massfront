// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";

/**
 * Pooled spray + mist. Emits on hull slams, jacket waterline hits, and bow
 * spray. Particles die into the sea (CPU Gerstner). No allocations in the
 * emit path beyond the fixed pools.
 */
export function createSplashPool(scene) {
  const DROP_N = 720;
  const MIST_N = 220;
  const dummy = new THREE.Object3D();

  const dropGeo = new THREE.ConeGeometry(0.11, 0.48, 4);
  dropGeo.rotateX(Math.PI);
  const dropMat = new THREE.MeshBasicMaterial({
    color: 0xd4e0e6,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    fog: true,
  });
  const drops = new THREE.InstancedMesh(dropGeo, dropMat, DROP_N);
  drops.frustumCulled = false;
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(drops);

  const mistGeo = new THREE.PlaneGeometry(1.6, 1.6);
  const mistMat = new THREE.MeshBasicMaterial({
    color: 0xb7cfc8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mist = new THREE.InstancedMesh(mistGeo, mistMat, MIST_N);
  mist.frustumCulled = false;
  mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mist);

  const dropPool = new Array(DROP_N);
  const mistPool = new Array(MIST_N);
  for (let i = 0; i < DROP_N; i++) {
    dropPool[i] = { live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1 };
  }
  for (let i = 0; i < MIST_N; i++) {
    mistPool[i] = { live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1 };
  }
  let dropI = 0;
  let mistI = 0;
  let seed = 17;
  const wakePts = [];

  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  function nrand() {
    return rnd() * 2 - 1;
  }

  function grab(pool, cursorName) {
    const n = pool.length;
    for (let k = 0; k < n; k++) {
      const i = (cursorName === "d" ? dropI : mistI) % n;
      if (cursorName === "d") dropI++;
      else mistI++;
      if (!pool[i].live) return pool[i];
    }
    const i = (cursorName === "d" ? dropI : mistI) % n;
    return pool[i];
  }

  function emitBurst(imp) {
    const nDrop = Math.min(28, 6 + Math.floor(imp.strength * 18));
    const nMist = Math.min(8, 2 + Math.floor(imp.strength * 5));
    const nx = imp.nx || 0;
    const ny = imp.ny || 1;
    const nz = imp.nz || 0;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    const ux = nx / nlen;
    const uy = ny / nlen;
    const uz = nz / nlen;
    const speed = 4.5 + imp.strength * 9.5;
    for (let i = 0; i < nDrop; i++) {
      const p = grab(dropPool, "d");
      p.live = true;
      p.x = imp.x + nrand() * imp.radius * 0.35;
      p.y = imp.y + rnd() * 0.8;
      p.z = imp.z + nrand() * imp.radius * 0.35;
      p.vx = ux * speed * (0.45 + rnd()) + nrand() * 3.4;
      p.vy = uy * speed * (0.55 + rnd() * 0.8) + 2.2 + rnd() * 4.5;
      p.vz = uz * speed * (0.45 + rnd()) + nrand() * 3.4;
      p.max = 0.45 + rnd() * 0.55 + imp.strength * 0.25;
      p.life = p.max;
      p.size = 0.55 + rnd() * 1.1 + imp.strength * 0.6;
    }
    for (let i = 0; i < nMist; i++) {
      const p = grab(mistPool, "m");
      p.live = true;
      p.x = imp.x + nrand() * imp.radius * 0.5;
      p.y = imp.y + 0.4 + rnd();
      p.z = imp.z + nrand() * imp.radius * 0.5;
      p.vx = ux * 1.6 + nrand() * 1.8;
      p.vy = 1.1 + rnd() * 2.2;
      p.vz = uz * 1.6 + nrand() * 1.8;
      p.max = 0.55 + rnd() * 0.5;
      p.life = p.max;
      p.size = (2.4 + imp.strength * 3.8) * (0.7 + rnd() * 0.6);
    }
  }

  function emit(impacts) {
    const max = Math.min(impacts.length, 10);
    for (let i = 0; i < max; i++) emitBurst(impacts[i]);
  }

  function write(mesh, pool) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.live) {
        dummy.position.set(0, -400, 0);
        dummy.scale.set(0, 0, 0);
        dummy.rotation.set(0, 0, 0);
      } else {
        dummy.position.set(p.x, p.y, p.z);
        const s = p.size * (0.35 + 0.65 * (p.life / p.max));
        dummy.scale.set(s, s * 1.4, s);
        dummy.rotation.set(0, p.vx * 0.1, Math.atan2(p.vx, p.vy) * 0.4);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  function step(dt, sea) {
    const drag = Math.exp(-2.1 * dt);
    const g = 13.5;
    wakePts.length = 0;
    for (let i = 0; i < DROP_N; i++) {
      const p = dropPool[i];
      if (!p.live) continue;
      p.vy -= g * dt;
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      const h = sea.height(p.x, p.z);
      if (p.life <= 0 || p.y < h - 0.4) {
        if (p.y < h + 0.6 && p.vy < 0) {
          wakePts.push({ x: p.x, z: p.z, strength: 0.22, radius: 2.8 });
        }
        p.live = false;
      }
    }
    const mdrag = Math.exp(-1.2 * dt);
    for (let i = 0; i < MIST_N; i++) {
      const p = mistPool[i];
      if (!p.live) continue;
      p.vy -= 3.2 * dt;
      p.vx *= mdrag;
      p.vz *= mdrag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      p.size += dt * 2.4;
      if (p.life <= 0 || p.y < sea.height(p.x, p.z) - 0.2) p.live = false;
    }
    write(drops, dropPool);
    write(mist, mistPool);
    return wakePts;
  }

  function dispose() {
    scene.remove(drops);
    scene.remove(mist);
    dropGeo.dispose();
    mistGeo.dispose();
    dropMat.dispose();
    mistMat.dispose();
    drops.dispose();
    mist.dispose();
  }

  return { emit, step, dispose };
}
