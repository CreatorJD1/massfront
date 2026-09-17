// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { config } from "../config.js";

/**
 * Stormpeak Anchorage — oil-rig deck on pilings, rocks, cyan-lit hull proxies.
 * Legs expose collars that ride the CPU sea; world-scale hulls sit near HQ so
 * the Close camera actually sees buoyancy.
 */
export function addStormpeakScene(scene, { wrapMat } = {}) {
  const wrap = wrapMat || ((m) => m);
  const S = config.propScale ?? 0.42;
  const root = new THREE.Group();
  root.name = "StormpeakAnchorage";
  root.scale.setScalar(S);
  scene.add(root);

  const contacts = [];
  function pushContact(localX, localZ, localR, strength = 1.0) {
    contacts.push({ x: localX * S, z: localZ * S, r: localR * S, strength });
  }

  const rockMat = wrap(new THREE.MeshStandardMaterial({
    color: 0x2a3238, roughness: 0.86, metalness: 0.1, flatShading: true,
  }));
  const rockMat2 = wrap(new THREE.MeshStandardMaterial({
    color: 0x222830, roughness: 0.88, metalness: 0.12, flatShading: true,
  }));

  const ROCK_SINK = 14.0;
  function rockPillar(x, z, h, r, mat = rockMat) {
    const sides = 5 + (Math.abs(Math.floor(x * 3 + z)) % 4);
    const geo = new THREE.ConeGeometry(r, h, sides);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, h * 0.22 - ROCK_SINK, z);
    m.rotation.y = (x * 0.37 + z * 0.19) % (Math.PI * 2);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.2, r * 1.55, h * 0.4, sides),
      mat,
    );
    base.position.set(x, -h * 0.08 - ROCK_SINK, z);
    base.castShadow = true;
    root.add(base);
    if (r > 8) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, h * 0.55, 5), mat);
      spike.position.set(x + r * 0.55, h * 0.05 - ROCK_SINK, z - r * 0.3);
      spike.castShadow = true;
      root.add(spike);
    }
    pushContact(x, z, r * 0.88, 0.35);
    return m;
  }

  const rocks = [
    [-58, -42, 42, 10], [-78, 14, 58, 13], [-52, 58, 38, 9],
    [62, -52, 48, 11], [82, 10, 62, 14], [48, 66, 40, 10],
    [-22, -74, 32, 8], [18, -82, 36, 9], [-90, -28, 46, 11],
    [96, -32, 34, 8], [-38, 86, 48, 12], [58, 90, 30, 7],
    [-102, 44, 52, 12], [108, 54, 38, 9], [-15, 95, 28, 7],
    [35, -95, 33, 8], [-70, -75, 36, 9], [75, 75, 29, 7],
  ];
  rocks.forEach(([x, z, h, r], i) => rockPillar(x, z, h, r, i % 2 ? rockMat2 : rockMat));

  const metal = wrap(new THREE.MeshStandardMaterial({ color: 0x6a7580, roughness: 0.36, metalness: 0.58 }));
  const metalDark = wrap(new THREE.MeshStandardMaterial({ color: 0x2a323c, roughness: 0.42, metalness: 0.5 }));
  const metalRust = wrap(new THREE.MeshStandardMaterial({ color: 0x6a5848, roughness: 0.62, metalness: 0.32 }));
  const cyanEdge = wrap(new THREE.MeshStandardMaterial({
    color: 0x1a4858, emissive: 0x2ab8c8, emissiveIntensity: 1.05, roughness: 0.35, metalness: 0.55,
  }));

  const pad = new THREE.Group();
  const DECK_Y = 34;
  pad.position.set(0, DECK_Y, 0);
  root.add(pad);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(56, 3.2, 42), metal);
  deck.castShadow = true;
  deck.receiveShadow = true;
  pad.add(deck);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(22, 2.4, 16), metalDark);
  wingL.position.set(-32, -0.2, 10);
  pad.add(wingL);
  const wingR = new THREE.Mesh(new THREE.BoxGeometry(20, 2.4, 14), metalDark);
  wingR.position.set(30, -0.2, -8);
  pad.add(wingR);
  const pier = new THREE.Mesh(new THREE.BoxGeometry(12, 2.0, 48), metalDark);
  pier.position.set(10, -0.3, 32);
  pad.add(pier);
  const pier2 = new THREE.Mesh(new THREE.BoxGeometry(36, 1.8, 10), metalDark);
  pier2.position.set(-8, -0.4, -28);
  pad.add(pier2);

  const soffit = new THREE.Mesh(new THREE.BoxGeometry(54, 1.2, 40), metalDark);
  soffit.position.set(0, -2.2, 0);
  pad.add(soffit);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 26, 9), metal);
  tower.position.set(-8, 14, -5);
  tower.castShadow = true;
  pad.add(tower);
  const towerTop = new THREE.Mesh(new THREE.BoxGeometry(12, 3.5, 12), metalDark);
  towerTop.position.set(-8, 28, -5);
  pad.add(towerTop);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 14, 8), metalDark);
  antenna.position.set(-8, 36, -5);
  pad.add(antenna);

  for (const z of [-20.5, 20.5]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(54, 0.4, 0.5), cyanEdge);
    rim.position.set(0, 1.9, z);
    pad.add(rim);
  }
  for (const x of [-27.5, 27.5]) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 40), cyanEdge);
    rim.position.set(x, 1.9, 0);
    pad.add(rim);
  }
  const padLight = new THREE.PointLight(0x6ec8d8, 0.85, 110, 1.7);
  padLight.position.set(0, 16, 0);
  pad.add(padLight);

  for (let i = 0; i < 7; i++) {
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(3.2 + (i % 2), 2.8, 3.2),
      i % 2 ? metalDark : metal,
    );
    c.position.set(-18 + i * 5.5, 3.2, 10 - (i % 3) * 5);
    pad.add(c);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 7, 14), metalDark);
  tank.position.set(16, 5.2, -10);
  pad.add(tank);
  const tank2 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5.5, 14), metalDark);
  tank2.position.set(22, 4.4, -6);
  pad.add(tank2);
  const crane = new THREE.Mesh(new THREE.BoxGeometry(1.5, 18, 1.5), metalDark);
  crane.position.set(20, 11, 12);
  pad.add(crane);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 22), metal);
  boom.position.set(20, 19, 2);
  pad.add(boom);

  const legPositions = [
    [-22, -16], [22, -16], [-22, 16], [22, 16],
  ];
  const LEG_R = 4.2;
  const LEG_LEN = DECK_Y + 28;
  const legs = [];
  legPositions.forEach(([lx, lz], i) => {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_R * 0.92, LEG_R * 1.15, LEG_LEN, 10),
      i % 3 === 0 ? metalRust : metalDark,
    );
    leg.position.set(lx, DECK_Y - LEG_LEN * 0.5 + 1.2, lz);
    leg.castShadow = true;
    leg.receiveShadow = true;
    root.add(leg);
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(LEG_R * 1.8, LEG_R * 2.2, 2.5, 8),
      metalRust,
    );
    foot.position.set(lx, -14, lz);
    root.add(foot);
    const isCorner = Math.abs(lx) > 15 && Math.abs(lz) > 10;
    pushContact(lx, lz, LEG_R * (isCorner ? 1.35 : 0.65), isCorner ? 0.32 : 0.12);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(LEG_R * 1.35, 0.55, 8, 24), cyanEdge);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(lx, 0.6, lz);
    root.add(collar);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.55, LEG_LEN * 0.7, 0.55), cyanEdge);
    stripe.position.set(lx + LEG_R * 0.95, DECK_Y * 0.35, lz);
    root.add(stripe);
    legs.push({
      lx: lx * S,
      lz: lz * S,
      mesh: collar,
      r: LEG_R * S,
      yScale: S,
    });
  });

  const pontoonY = 3.2;
  for (let i = 0; i < 4; i++) {
    const a = [[-22, -16], [22, -16], [22, 16], [-22, 16]][i];
    const b = [[-22, -16], [22, -16], [22, 16], [-22, 16]][(i + 1) % 4];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.0, len + 2), metalRust);
    beam.position.set((a[0] + b[0]) * 0.5, pontoonY, (a[1] + b[1]) * 0.5);
    beam.rotation.y = Math.atan2(dx, dz);
    beam.castShadow = true;
    root.add(beam);
  }

  function brace(ax, az, bx, bz, y) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, len), metalRust);
    bar.position.set((ax + bx) * 0.5, y, (az + bz) * 0.5);
    bar.rotation.y = Math.atan2(dx, dz);
    root.add(bar);
  }
  const corners = [[-22, -16], [22, -16], [22, 16], [-22, 16]];
  for (const y of [10]) {
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      brace(a[0], a[1], b[0], b[1], y);
    }
  }

  [[-26, -19], [26, -19], [-26, 19], [26, 19], [-40, 8], [38, -5], [10, 40], [-8, -32]]
    .forEach(([x, z]) => pushContact(x, z, 1.4, 0.08));

  const hullMat = wrap(new THREE.MeshStandardMaterial({ color: 0x1a1e22, roughness: 0.48, metalness: 0.5 }));
  const cyanMat = wrap(new THREE.MeshStandardMaterial({
    color: 0x0a2434, emissive: 0x2ab8c8, emissiveIntensity: 0.82, roughness: 0.34, metalness: 0.58,
  }));

  const ships = [];

  function fillHull(g, length, beam, hullM, superM, glowM) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(beam, 3.0, length), hullM);
    hull.castShadow = true;
    g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.58, 6, 4), hullM);
    bow.rotation.x = Math.PI / 2;
    bow.position.set(0, 0, length * 0.52);
    g.add(bow);
    const superstruct = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.72, 3.6, length * 0.38), superM);
    superstruct.position.set(0, 3.1, -length * 0.06);
    g.add(superstruct);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.5, 2.2, length * 0.14), metal);
    bridge.position.set(0, 5.8, -length * 0.02);
    g.add(bridge);
    const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.95, 0.28, 0.4), glowM);
    lightStrip.position.set(0, 1.7, length * 0.12);
    g.add(lightStrip);
    const bridgeLight = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.4), glowM);
    bridgeLight.position.set(0, 7.2, -length * 0.02);
    g.add(bridgeLight);
    const pl = new THREE.PointLight(0x4ec4d4, 0.7, 38, 2);
    pl.position.set(0, 6, 0);
    g.add(pl);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(length * 0.48, 0.35, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x2ab8c8, transparent: true, opacity: 0.28 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.15;
    g.add(ring);
  }

  function shipProxy(x, z, yaw, length = 24, beam = 6, wake = true) {
    const g = new THREE.Group();
    g.position.set(x, 0.35, z);
    g.rotation.order = "YXZ";
    g.rotation.y = yaw;
    fillHull(g, length, beam, hullMat, metalDark, cyanMat);
    root.add(g);
    pushContact(x, z, Math.max(beam * 0.4, length * 0.1), 0.18);
    ships.push({
      x: x * S, z: z * S, yaw,
      length: length * S, beam: beam * S,
      speed: 0,
      group: g,
      localX: x, localZ: z,
      world: false,
    });
    return g;
  }

  shipProxy(148, 62, -0.55, 28, 6.5);
  shipProxy(-128, 86, 1.15, 24, 5.5);
  shipProxy(96, -142, 2.35, 22, 5.2);
  shipProxy(-78, -110, -1.75, 20, 4.8);
  shipProxy(168, -48, 0.35, 18, 4.4);
  shipProxy(-155, -22, 2.9, 16, 4.0);

  const worldRoot = new THREE.Group();
  worldRoot.name = "TheatreHulls";
  scene.add(worldRoot);

  function worldShip(wx, wz, yaw, length, beam) {
    const g = new THREE.Group();
    g.position.set(wx, 0.4, wz);
    g.rotation.order = "YXZ";
    g.rotation.y = yaw;
    fillHull(g, length, beam, hullMat, metalDark, cyanMat);
    worldRoot.add(g);
    ships.push({
      x: wx, z: wz, yaw,
      length, beam,
      speed: 0,
      group: g,
      world: true,
    });
    return g;
  }

  // Close-camera hero hulls around TFC HQ (-220, 110)
  worldShip(-198, 96, 0.42, 22, 6.2);
  worldShip(-248, 88, -0.95, 28, 7.4);
  worldShip(-210, 148, 1.35, 16, 5.0);
  worldShip(232, -174, 2.5, 24, 6.8);

  root.add(new THREE.AmbientLight(0x7a90a8, 0.95));
  root.add(new THREE.HemisphereLight(0xa8c0d4, 0x0a1520, 1.05));
  const platKey = new THREE.DirectionalLight(0xd0dce8, 1.35);
  platKey.position.set(40, 90, 30);
  root.add(platKey);

  return { root, contacts: contacts.slice(0, 64), ships, legs, scale: S };
}
