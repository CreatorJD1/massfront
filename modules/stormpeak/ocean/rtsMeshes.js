// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { deckHeight } from "./physics/buoyancy.js";

const FAC = {
  nova: { hull: 0x2a3540, trim: 0x5a6570, glow: 0x33e8ff, pad: 0x3a4650, stripe: 0x5db6ff },
  legion: { hull: 0x3a2420, trim: 0x6a4038, glow: 0xff6b58, pad: 0x4a3028, stripe: 0xc45a48 },
  syndicate: { hull: 0x243830, trim: 0x4a6a50, glow: 0x8ce85a, pad: 0x2a4034, stripe: 0x67efc9 },
  brood: { hull: 0x2a2218, trim: 0x4a3828, glow: 0xb978ff, pad: 0x3a3024, stripe: 0x6ee07a },
};

function makeMats(faction, wrap) {
  const C = FAC[faction] || FAC.nova;
  return {
    hull: wrap(new THREE.MeshStandardMaterial({
      color: C.hull, roughness: 0.38, metalness: 0.55,
    })),
    trim: wrap(new THREE.MeshStandardMaterial({
      color: C.trim, roughness: 0.42, metalness: 0.45,
    })),
    glow: wrap(new THREE.MeshStandardMaterial({
      color: 0x0a2434,
      emissive: C.glow,
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.5,
    })),
    pad: wrap(new THREE.MeshStandardMaterial({
      color: C.pad, roughness: 0.7, metalness: 0.2,
    })),
    stripe: wrap(new THREE.MeshStandardMaterial({
      color: C.stripe, roughness: 0.4, metalness: 0.55,
      emissive: C.stripe, emissiveIntensity: 0.22,
    })),
  };
}

function hpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x0a1014, depthTest: false }),
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x3ad6e8, depthTest: false }),
  );
  bg.position.z = -0.01;
  fg.position.z = 0;
  g.add(bg);
  g.add(fg);
  g.userData.fg = fg;
  g.renderOrder = 8;
  return g;
}

function ring() {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.22, 48),
    new THREE.MeshBasicMaterial({
      color: 0x3ad6e8, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthTest: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.4;
  m.renderOrder = 7;
  return m;
}

function ship(m, length, beam) {
  const g = new THREE.Group();
  const d = Math.max(1.8, beam * 0.42);

  const bodyGeo = new THREE.CylinderGeometry(beam * 0.36, beam * 0.4, length * 0.7, 16);
  bodyGeo.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeo, m.hull);
  body.scale.set(1.55, 0.62, 1);
  body.castShadow = true;
  g.add(body);

  const bow = new THREE.Mesh(new THREE.SphereGeometry(beam * 0.38, 14, 10), m.hull);
  bow.scale.set(1.45, 0.58, 1.85);
  bow.position.set(0, -0.05, length * 0.34);
  bow.castShadow = true;
  g.add(bow);

  const stern = new THREE.Mesh(new THREE.SphereGeometry(beam * 0.36, 12, 8), m.hull);
  stern.scale.set(1.5, 0.55, 1.15);
  stern.position.set(0, -0.08, -length * 0.32);
  g.add(stern);

  const keel = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.22, d * 0.45, length * 0.55), m.hull);
  keel.position.y = -d * 0.38;
  g.add(keel);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.88, 0.18, length * 0.72), m.trim);
  deck.position.y = d * 0.22;
  g.add(deck);

  const gunwaleL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, length * 0.68), m.trim);
  gunwaleL.position.set(-beam * 0.42, d * 0.32, 0);
  g.add(gunwaleL);
  const gunwaleR = gunwaleL.clone();
  gunwaleR.position.x *= -1;
  g.add(gunwaleR);

  const superW = beam * 0.52;
  const super1 = new THREE.Mesh(new THREE.BoxGeometry(superW, 1.35, length * 0.22), m.trim);
  super1.position.set(0, d * 0.22 + 0.85, -length * 0.04);
  g.add(super1);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(superW * 0.72, 1.15, length * 0.1), m.hull);
  bridge.position.set(0, d * 0.22 + 1.85, -length * 0.02);
  g.add(bridge);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(superW * 0.62, 0.38, 0.12), m.glow);
  glass.position.set(0, d * 0.22 + 1.95, length * 0.03);
  g.add(glass);

  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.08, beam * 0.11, 1.8, 10), m.trim);
  funnel.position.set(0, d * 0.22 + 2.4, -length * 0.12);
  g.add(funnel);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.05, beam * 0.07, 0.7, 8), m.glow);
  stack.position.set(0, d * 0.22 + 3.45, -length * 0.12);
  g.add(stack);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.4, 6), m.trim);
  mast.position.set(0, d * 0.22 + 3.3, -length * 0.02);
  g.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.28, 0.08, beam * 0.28), m.stripe);
  radar.position.set(0, d * 0.22 + 4.5, -length * 0.02);
  g.add(radar);

  if (length > 14) {
    const tur = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.14, beam * 0.16, 0.55, 10), m.trim);
    tur.position.set(0, d * 0.22 + 0.45, length * 0.22);
    g.add(tur);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, length * 0.16, 8), m.trim);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, d * 0.22 + 0.55, length * 0.3);
    g.add(barrel);
  }
  if (length > 20) {
    const tur2 = new THREE.Mesh(new THREE.CylinderGeometry(beam * 0.12, beam * 0.14, 0.5, 10), m.trim);
    tur2.position.set(0, d * 0.22 + 0.42, -length * 0.26);
    g.add(tur2);
    const rib = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.7, 0.1, 0.18), m.stripe);
    rib.position.set(0, d * 0.18, length * 0.08);
    g.add(rib);
  }

  const light = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.7, 0.1, 0.22), m.glow);
  light.position.set(0, d * 0.28, length * 0.18);
  g.add(light);

  addScrew(g, m, 0, -d * 0.22, -length * 0.42, beam * 0.12);
  return g;
}

function commander(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.6, 4.8, 12), m.hull);
  body.castShadow = true;
  g.add(body);
  const waist = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.18, 8, 20), m.stripe);
  waist.rotation.x = Math.PI / 2;
  waist.position.y = 0.4;
  g.add(waist);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.45, 14, 10), m.glow);
  canopy.scale.set(1, 0.72, 1.15);
  canopy.position.y = 2.85;
  g.add(canopy);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.08, 6, 18), m.trim);
  rim.position.y = 2.45;
  g.add(rim);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.22, 2.6), m.trim);
  wing.position.y = 0.35;
  g.add(wing);
  for (const sd of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 1.1), m.stripe);
    tip.position.set(sd * 4.4, 0.4, 0);
    g.add(tip);
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 2.2, 10), m.trim);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(sd * 2.6, -0.35, 0.2);
    g.add(nacelle);
  }
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.75, 1.5, 10), m.glow);
  jet.position.set(0, -2.5, 0);
  g.add(jet);
  return g;
}

function cigar(m, length, r0, r1, segs = 16) {
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, length, segs), m.hull);
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  return hull;
}

function addScrew(g, m, x, y, z, r = 0.78) {
  const screw = new THREE.Group();
  screw.position.set(x, y, z);
  screw.rotation.x = Math.PI / 2;
  const hub = new THREE.Mesh(new THREE.SphereGeometry(r * 0.22, 6, 6), m.trim);
  screw.add(hub);
  for (let i = 0; i < 3; i++) {
    const hold = new THREE.Group();
    hold.rotation.z = (i / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(r * 0.2, r * 1.55, 5), m.trim);
    blade.rotation.z = Math.PI / 2;
    blade.position.x = r * 0.48;
    blade.rotation.y = 0.32;
    hold.add(blade);
    screw.add(hold);
  }
  g.add(screw);
  if (!g.userData.screws) g.userData.screws = [];
  g.userData.screws.push(screw);
  return screw;
}

function addPlane(g, m, x, y, z, w, d) {
  const p = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), m.trim);
  p.position.set(x, y, z);
  g.add(p);
  if (!g.userData.planes) g.userData.planes = [];
  g.userData.planes.push(p);
  return p;
}

function nautilus(m) {
  const g = new THREE.Group();
  g.add(cigar(m, 18.4, 1.55, 1.85));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.55, 10, 8), m.hull);
  nose.scale.set(1, 1, 1.35);
  nose.position.z = 9.4;
  g.add(nose);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(1.85, 10, 8), m.hull);
  tail.scale.set(1, 1, 1.15);
  tail.position.z = -9.2;
  g.add(tail);
  const sail = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.9, 2.5), m.trim);
  sail.position.set(0, 2.6, -1.1);
  g.add(sail);
  const sailCap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 2.4, 10), m.trim);
  sailCap.rotation.x = Math.PI / 2;
  sailCap.position.set(0, 4.0, -1.1);
  g.add(sailCap);
  const peri = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 2.2, 8), m.trim);
  peri.position.set(0, 4.55, -0.7);
  g.add(peri);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 8.4), m.stripe);
  glow.position.set(0, 0.35, 0.4);
  g.add(glow);
  for (const sd of [-1, 1]) {
    const plane = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.16, 1.05), m.trim);
    plane.position.set(sd * 1.7, 0.15, 5.4);
    g.add(plane);
    if (!g.userData.planes) g.userData.planes = [];
    g.userData.planes.push(plane);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.4, 10), m.trim);
    jet.rotation.x = Math.PI / 2;
    jet.position.set(sd * 0.85, -0.15, -10.1);
    g.add(jet);
    addScrew(g, m, sd * 0.85, -0.15, -10.85, 0.72);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.08, 6, 14), m.glow);
    ringM.position.set(sd * 0.85, -0.15, -10.7);
    g.add(ringM);
  }
  for (let k = 0; k < 4; k++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.15, 8), m.trim);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(((k % 2) * 2 - 1) * (0.38 + 0.28 * (k >> 1)), -0.35, 8.6);
    g.add(tube);
  }
  return g;
}

function leviathan(m) {
  const g = new THREE.Group();
  g.add(cigar(m, 20.2, 1.85, 2.25, 10));
  const belt = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.55, 16.2), m.trim);
  belt.position.y = 0.15;
  g.add(belt);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.35, 2.8), m.trim);
  nose.position.set(0, 0.1, 10.4);
  g.add(nose);
  const sail = new THREE.Mesh(new THREE.BoxGeometry(1.55, 3.5, 2.85), m.trim);
  sail.position.set(0, 3.05, -1.0);
  g.add(sail);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 1.1), m.stripe);
  cap.position.set(0, 4.85, -1.0);
  g.add(cap);
  const peri = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.6, 8), m.trim);
  peri.position.set(0, 5.7, -0.7);
  g.add(peri);
  for (const sd of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.6, 10), m.glow);
    door.rotation.x = Math.PI / 2;
    door.position.set(sd * 0.85, -0.1, 11.2);
    g.add(door);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.15, 9.4), m.stripe);
    plate.position.set(sd * 2.15, 0.55, 0.4);
    g.add(plate);
    addPlane(g, m, sd * 2.1, 0.2, 6.2, 2.9, 1.2);
    addScrew(g, m, sd * 0.7, -0.35, -10.6, 0.82);
  }
  return g;
}

function blackwake(m) {
  const g = new THREE.Group();
  const drop = new THREE.Mesh(new THREE.SphereGeometry(2.05, 10, 8), m.hull);
  drop.scale.set(0.72, 0.72, 4.6);
  drop.castShadow = true;
  g.add(drop);
  for (const z of [-5.2, -0.2, 4.6]) {
    const hex = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.12, 6, 6), m.glow);
    hex.position.z = z;
    g.add(hex);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 2.4, 8), m.trim);
  mast.position.set(0, 2.15, -1.1);
  g.add(mast);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), m.glow);
  bead.position.set(0, 3.35, -1.1);
  g.add(bead);
  for (const sd of [-1, 1]) {
    for (const z of [-4.4, 0.2, 4.2]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.7, 8), m.trim);
      pod.position.set(sd * 1.45, -0.35, z);
      g.add(pod);
    }
  }
  for (let k = 0; k < 3; k++) {
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8), m.trim);
    tube.rotation.x = Math.PI / 2;
    tube.position.set((k - 1) * 0.38, -0.2, 8.4);
    g.add(tube);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 12.4), m.stripe);
  stripe.position.set(0, 0.85, 0);
  g.add(stripe);
  addScrew(g, m, 0, 0, -9.6, 0.7);
  return g;
}

function abyssal(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.85, 19.6, 8), m.hull);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8), m.trim);
  head.scale.set(1.05, 0.85, 1.45);
  head.position.z = 10.2;
  g.add(head);
  const maw = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 5), m.glow);
  maw.rotation.x = Math.PI / 2;
  maw.position.z = 12.2;
  g.add(maw);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), m.glow);
  eye.position.set(0, 0.55, 10.6);
  g.add(eye);
  for (const sd of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 5.4), m.stripe);
    fin.position.set(sd * 1.55, 0.1, -0.8);
    fin.rotation.z = sd * 0.18;
    g.add(fin);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 3.2, 6), m.trim);
    t.position.set(sd * 0.7, 0.85, 8.4);
    t.rotation.z = sd * 0.55;
    t.rotation.x = 0.4;
    g.add(t);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.55, 14.2), m.trim);
  ridge.position.set(0, 1.15, 0);
  g.add(ridge);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.65, 3.4, 6), m.trim);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -11.4;
  g.add(tail);
  g.userData.tail = tail;
  return g;
}

function submarine(m, faction) {
  if (faction === "legion") return leviathan(m);
  if (faction === "syndicate") return blackwake(m);
  if (faction === "brood") return abyssal(m);
  return nautilus(m);
}

function addJacket(g, m, w, d, deckY) {
  const offs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const hx = w * 0.38;
  const hz = d * 0.38;
  const legLen = deckY + 44;
  const legs = [];
  for (const [sx, sz] of offs) {
    const lx = sx * hx;
    const lz = sz * hz;
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.15, legLen, 8),
      m.trim,
    );
    leg.position.set(lx, deckY - legLen * 0.5 + 0.5, lz);
    leg.castShadow = true;
    g.add(leg);
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.28, 6, 18),
      m.glow,
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.set(lx, 0.2, lz);
    g.add(collar);
    legs.push({ lx, lz, mesh: collar, yScale: 1 });
  }
  const beamY = Math.max(2.2, deckY * 0.28);
  for (let i = 0; i < 4; i++) {
    const a = offs[i];
    const b = offs[(i + 1) % 4];
    const ax = a[0] * hx;
    const az = a[1] * hz;
    const bx = b[0] * hx;
    const bz = b[1] * hz;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, len), m.trim);
    bar.position.set((ax + bx) * 0.5, beamY, (az + bz) * 0.5);
    bar.rotation.y = Math.atan2(dx, dz);
    g.add(bar);
  }
  g.userData.legs = legs;
  g.userData.deckY = deckY;
}

function building(kind, m) {
  const g = new THREE.Group();
  const deckY = deckHeight(kind);
  const inner = new THREE.Group();
  inner.position.y = deckY;
  g.add(inner);
  let padW = 14;
  let padD = 12;
  if (kind === "core") {
    padW = 28;
    padD = 22;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 1.6, 22), m.pad);
    deck.castShadow = true;
    inner.add(deck);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 13.2, 2.2, 16), m.hull);
    skirt.position.y = 1.6;
    inner.add(skirt);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 14, 12), m.hull);
    tower.position.y = 9.4;
    inner.add(tower);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 4.4, 1.6, 12), m.trim);
    cap.position.y = 17.2;
    inner.add(cap);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8, 0, Math.PI * 2, 0, 1.4), m.trim);
    dish.position.y = 19.2;
    inner.add(dish);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.18, 6, 28), m.glow);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 1.5;
    inner.add(glow);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, 9, 8), m.trim);
    antenna.position.set(-2.2, 24, 0);
    inner.add(antenna);
  } else if (kind === "extractor") {
    padW = 16;
    padD = 16;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(7, 8.2, 1.8, 10), m.pad);
    inner.add(pad);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), m.hull);
    arm.position.y = 6;
    inner.add(arm);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.2, 10), m.glow);
    head.position.y = 11;
    inner.add(head);
  } else if (kind === "reactor") {
    padW = 14;
    padD = 14;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 7, 2, 12), m.pad);
    inner.add(base);
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 9, 12), m.hull);
    coil.position.y = 5.5;
    inner.add(coil);
    const core = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), m.glow);
    core.position.y = 6.2;
    inner.add(core);
  } else if (kind === "silo") {
    padW = 12;
    padD = 10;
    const a = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 8, 10), m.trim);
    a.position.set(-2.4, 4, 0);
    inner.add(a);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 8, 10), m.trim);
    b.position.set(2.4, 4, 0);
    inner.add(b);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 8), m.pad);
    inner.add(pad);
  } else if (kind === "harbor") {
    padW = 24;
    padD = 18;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 1.5, 18), m.pad);
    inner.add(deck);
    const hall = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.4, 6.5, 12), m.hull);
    hall.position.y = 4.1;
    inner.add(hall);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 5.4, 1.1, 12), m.trim);
    roof.position.y = 7.6;
    inner.add(roof);
    const crane = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 12, 8), m.trim);
    crane.position.set(8, 8, 4);
    inner.add(crane);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 14), m.trim);
    boom.position.set(8, 14, -2);
    inner.add(boom);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.16, 6, 24), m.glow);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = 1.1;
    inner.add(glow);
  } else if (kind === "gun") {
    padW = 12;
    padD = 12;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 5.2, 2.2, 10), m.pad);
    inner.add(base);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 2.4, 10), m.hull);
    turret.position.y = 2.2;
    inner.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 10, 8), m.trim);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 2.8, 5);
    inner.add(barrel);
  }
  addJacket(g, m, padW, padD, deckY);
  return g;
}

function nodeMarker(wrap, kind) {
  const g = new THREE.Group();
  const energy = kind === "energy";
  const col = energy ? 0xe8c45a : 0x3ad6e8;
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(energy ? 0.55 : 0.42, energy ? 0.7 : 0.55, energy ? 3.8 : 3.0, 6),
    wrap(new THREE.MeshStandardMaterial({
      color: energy ? 0x3a2c12 : 0x143038,
      emissive: col,
      emissiveIntensity: 0.55,
      roughness: 0.5,
    })),
  );
  buoy.position.y = energy ? 2.0 : 1.6;
  g.add(buoy);
  g.userData.kind = kind || "mass";
  return g;
}

function makeEntity(ent, wrap) {
  const m = makeMats(ent.faction || (ent.team === 0 ? "nova" : "brood"), wrap);
  const root = new THREE.Group();
  root.userData.id = ent.id;
  root.userData.kind = ent.kind;
  root.userData.faction = ent.faction;
  root.rotation.order = "YXZ";
  let body;
  if (ent.kind === "commander") body = commander(m);
  else if (ent.kind === "constructor") body = ship(m, 10, 4.2);
  else if (ent.kind === "corvette") body = ship(m, 16, 5);
  else if (ent.kind === "destroyer") body = ship(m, 24, 7.2);
  else if (ent.kind === "submarine") body = submarine(m, ent.faction);
  else body = building(ent.kind, m);
  body.name = "body";
  root.add(body);
  const hp = hpBar();
  const dy = ent.building ? deckHeight(ent.kind) : 0;
  hp.position.y = ent.building ? dy + 14 : 8;
  root.add(hp);
  const sel = ring();
  sel.scale.setScalar(ent.radius);
  sel.position.y = ent.building ? dy + 0.4 : 0.45;
  sel.visible = false;
  root.add(sel);
  root.userData.hp = hp;
  root.userData.sel = sel;
  root.userData.body = body;
  root.userData.deckY = dy;
  root.userData.legs = body.userData?.legs || null;
  return root;
}

export function createRtsView(scene, camera, { wetKit } = {}) {
  const wrap = wetKit ? (m) => wetKit.wrap(m) : (m) => m;
  const root = new THREE.Group();
  root.name = "MassfrontRts";
  scene.add(root);
  const byId = new Map();
  const nodeGroups = [];
  const shotGeo = new THREE.SphereGeometry(0.7, 6, 6);
  const torpGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.4, 8);
  torpGeo.rotateX(Math.PI / 2);
  const shotMat0 = new THREE.MeshBasicMaterial({ color: 0x7af0ff });
  const shotMat1 = new THREE.MeshBasicMaterial({ color: 0x8ef09a });
  const torpMat = new THREE.MeshBasicMaterial({ color: 0xd4b46a });
  const shotPool = [];
  const ghost = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x3ad6e8, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  ghost.visible = false;
  root.add(ghost);

  function ensureNodes(nodes, sea) {
    while (nodeGroups.length < nodes.length) {
      const n = nodeMarker(wrap, "mass");
      root.add(n);
      nodeGroups.push(n);
    }
    nodes.forEach((n, i) => {
      let g = nodeGroups[i];
      if (!g || g.userData.kind !== (n.kind || "mass")) {
        if (g) root.remove(g);
        g = nodeMarker(wrap, n.kind || "mass");
        root.add(g);
        nodeGroups[i] = g;
      }
      const h = sea ? sea.height(n.x, n.z) : 0;
      g.position.set(n.x, h, n.z);
      g.visible = n.taken < 0;
    });
  }

  function getShot(team, kind) {
    let m = shotPool.find((s) => !s.userData.live);
    if (!m) {
      m = new THREE.Mesh(kind === "torp" ? torpGeo : shotGeo, team === 0 ? shotMat0 : shotMat1);
      root.add(m);
      shotPool.push(m);
    }
    m.geometry = kind === "torp" ? torpGeo : shotGeo;
    m.material = kind === "torp" ? torpMat : team === 0 ? shotMat0 : shotMat1;
    m.userData.live = true;
    m.visible = true;
    return m;
  }

  function get(id) {
    return byId.get(id) || null;
  }

  function sync(snap, t, { sea } = {}) {
    ensureNodes(snap.nodes, sea);
    const live = new Set();
    for (const e of snap.ents) {
      live.add(e.id);
      let g = byId.get(e.id);
      if (g && (g.userData.kind !== e.kind || g.userData.faction !== e.faction)) {
        root.remove(g);
        byId.delete(e.id);
        g = null;
      }
      if (!g) {
        g = makeEntity(e, wrap);
        root.add(g);
        byId.set(e.id, g);
      }
      g.visible = !e.cloaked;
      g.position.x = e.x;
      g.position.z = e.z;
      if (e.building) {
        g.position.y = 0;
        g.rotation.x = 0;
        g.rotation.z = 0;
        g.rotation.y = 0;
      } else if (!g.userData.ridden) {
        const h = sea ? sea.height(e.x, e.z) : 0;
        const keel = e.sub ? Math.max(0, (e.keelM || (e.dived ? 16 : 0)) / 2.2) : 0;
        g.position.y = h + (e.hover ? 5.2 : 0.4) - keel;
        g.rotation.y = e.yaw;
      }
      const frac = Math.max(0.02, e.hp / e.hpMax);
      const hp = g.userData.hp;
      hp.visible = !e.cloaked;
      hp.scale.x = e.radius * 1.6;
      const dy = e.building ? (g.userData.deckY || 14) : 9;
      hp.position.y = e.building ? dy + 16 : 9 + Math.min(6, (e.keelM || 0) * 0.02);
      hp.userData.fg.scale.x = frac;
      hp.userData.fg.position.x = (frac - 1) * 0.5;
      hp.userData.fg.material.color.setHex(
        frac < 0.35 ? 0xd9776b : e.team === 0 ? 0x3ad6e8 : 0x6ee07a,
      );
      hp.quaternion.copy(camera.quaternion);
      g.userData.sel.visible = e.selected && !e.cloaked;
      g.userData.sel.scale.setScalar(e.radius);
      g.userData.sel.position.y = e.building ? dy + 0.4 : 0.45;
      if (e.buildLeft > 0) g.scale.setScalar(0.55 + 0.45 * (1 - e.buildLeft / Math.max(0.1, e.buildMax)));
      else g.scale.setScalar(1);
      const body = g.userData.body;
      if (e.sub && body) {
        const flooding = e.mode === "FLOODING";
        const blowing = e.mode === "BLOWING";
        const spin = t * (e.dived ? 18 : 8);
        const screws = body.userData.screws;
        if (screws) {
          for (let i = 0; i < screws.length; i++) screws[i].rotation.z = spin;
        }
        const planes = body.userData.planes;
        if (planes) {
          const tilt = flooding ? 0.34 : blowing ? -0.28 : 0;
          for (let i = 0; i < planes.length; i++) planes[i].rotation.x = tilt;
        }
        if (body.userData.tail) {
          body.userData.tail.rotation.y = Math.sin(t * 2.4) * 0.22;
        }
      }
    }
    for (const [id, g] of byId) {
      if (!live.has(id)) {
        root.remove(g);
        byId.delete(id);
      }
    }
    for (const s of shotPool) s.userData.live = false;
    for (const s of snap.shots) {
      const m = getShot(s.team, s.kind);
      const h = sea ? sea.height(s.x, s.z) : 0;
      const y = s.kind === "torp" ? h - (s.depth || 6) + 1.2 : h + 6.2;
      m.position.set(s.x, y, s.z);
    }
    for (const s of shotPool) if (!s.userData.live) s.visible = false;

    if (snap.ghost) {
      ghost.visible = true;
      const h = sea ? sea.height(snap.ghost.x, snap.ghost.z) : 0;
      ghost.position.set(snap.ghost.x, h + 0.5, snap.ghost.z);
      ghost.material.color.setHex(snap.ghost.valid ? 0x3ad6e8 : 0xd9776b);
    } else ghost.visible = false;
  }

  function markRidden(id) {
    const g = byId.get(id);
    if (g) g.userData.ridden = true;
  }

  function clear() {
    for (const [, g] of byId) root.remove(g);
    byId.clear();
    for (const s of shotPool) s.visible = false;
  }

  function wakePoints(snap) {
    const pts = [];
    for (const e of snap.ents) {
      if (e.building || e.hover || e.cloaked) continue;
      const sternX = e.x - Math.sin(e.yaw) * (e.radius * 1.4);
      const sternZ = e.z - Math.cos(e.yaw) * (e.radius * 1.4);
      const dived = e.dived && e.sub;
      pts.push({
        x: sternX,
        z: sternZ,
        strength: dived ? 0.08 : e.kind === "destroyer" ? 0.38 : 0.24,
        radius: e.kind === "destroyer" ? 10 : e.kind === "submarine" ? 5.5 : 6,
      });
    }
    return pts;
  }

  return { root, sync, wakePoints, get, markRidden, clear };
}
