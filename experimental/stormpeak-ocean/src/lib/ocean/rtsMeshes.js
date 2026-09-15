// @ts-nocheck
/** @ts-nocheck */
import * as THREE from "three";
import { deckHeight } from "./physics/buoyancy.js";

const TFC = {
  hull: 0x2a3540,
  trim: 0x5a6570,
  glow: 0x33e8ff,
  pad: 0x3a4650,
};
const BROOD = {
  hull: 0x2a2218,
  trim: 0x4a3828,
  glow: 0x6ee07a,
  pad: 0x3a3024,
};

function makeMats(team, wrap) {
  const C = team === 0 ? TFC : BROOD;
  return {
    hull: wrap(new THREE.MeshStandardMaterial({
      color: C.hull, roughness: 0.5, metalness: 0.42,
    })),
    trim: wrap(new THREE.MeshStandardMaterial({
      color: C.trim, roughness: 0.55, metalness: 0.35,
    })),
    glow: wrap(new THREE.MeshStandardMaterial({
      color: team === 0 ? 0x0a2434 : 0x142418,
      emissive: C.glow,
      emissiveIntensity: 0.95,
      roughness: 0.3,
      metalness: 0.5,
    })),
    pad: wrap(new THREE.MeshStandardMaterial({
      color: C.pad, roughness: 0.7, metalness: 0.2,
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
  const hull = new THREE.Mesh(new THREE.BoxGeometry(beam, 2.6, length), m.hull);
  hull.castShadow = true;
  g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(beam * 0.55, length * 0.28, 4), m.hull);
  bow.rotation.x = Math.PI / 2;
  bow.position.set(0, 0, length * 0.52);
  g.add(bow);
  const superstruct = new THREE.Mesh(
    new THREE.BoxGeometry(beam * 0.7, 2.8, length * 0.34),
    m.trim,
  );
  superstruct.position.set(0, 2.4, -length * 0.04);
  g.add(superstruct);
  const light = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.9, 0.22, 0.35), m.glow);
  light.position.set(0, 1.4, length * 0.1);
  g.add(light);
  return g;
}

function commander(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, 5.4, 8), m.hull);
  body.castShadow = true;
  g.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), m.glow);
  canopy.position.y = 3.2;
  g.add(canopy);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.35, 2.4), m.trim);
  wing.position.y = 0.6;
  g.add(wing);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, 1.6, 8), m.glow);
  jet.position.set(0, -2.6, 0);
  g.add(jet);
  return g;
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
    const deck = new THREE.Mesh(new THREE.BoxGeometry(28, 2.4, 22), m.pad);
    deck.castShadow = true;
    inner.add(deck);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 16, 8), m.hull);
    tower.position.y = 9;
    inner.add(tower);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), m.trim);
    cap.position.y = 18;
    inner.add(cap);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 0.4), m.glow);
    glow.position.set(0, 1.5, 10.6);
    inner.add(glow);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 10, 8), m.trim);
    antenna.position.set(-2, 24, 0);
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
    const deck = new THREE.Mesh(new THREE.BoxGeometry(24, 2, 18), m.pad);
    inner.add(deck);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 10), m.hull);
    hall.position.y = 4.4;
    inner.add(hall);
    const crane = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 1.2), m.trim);
    crane.position.set(8, 8, 4);
    inner.add(crane);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 14), m.trim);
    boom.position.set(8, 14, -2);
    inner.add(boom);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(22, 0.25, 0.35), m.glow);
    glow.position.set(0, 1.2, 8.6);
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

function nodeMarker(wrap) {
  const g = new THREE.Group();
  const ringM = new THREE.Mesh(
    new THREE.RingGeometry(6.2, 7.1, 32),
    new THREE.MeshBasicMaterial({
      color: 0x3ad6e8, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }),
  );
  ringM.rotation.x = -Math.PI / 2;
  ringM.position.y = 0.3;
  g.add(ringM);
  const buoy = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.8, 4.5, 8),
    wrap(new THREE.MeshStandardMaterial({
      color: 0x1a4858, emissive: 0x2ab8c8, emissiveIntensity: 0.72, roughness: 0.42,
    })),
  );
  buoy.position.y = 2.2;
  g.add(buoy);
  g.userData.buoy = buoy;
  g.userData.ring = ringM;
  return g;
}

function makeEntity(ent, mats) {
  const m = mats[ent.team];
  const root = new THREE.Group();
  root.userData.id = ent.id;
  root.userData.kind = ent.kind;
  root.rotation.order = "YXZ";
  let body;
  if (ent.kind === "commander") body = commander(m);
  else if (ent.kind === "constructor") body = ship(m, 10, 4.2);
  else if (ent.kind === "corvette") body = ship(m, 16, 5);
  else if (ent.kind === "destroyer") body = ship(m, 24, 7.2);
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
  const teamMats = [makeMats(0, wrap), makeMats(1, wrap)];
  const shotGeo = new THREE.SphereGeometry(0.7, 6, 6);
  const shotMat0 = new THREE.MeshBasicMaterial({ color: 0x7af0ff });
  const shotMat1 = new THREE.MeshBasicMaterial({ color: 0x8ef09a });
  const shotPool = [];
  const ghost = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 0.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x3ad6e8, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  ghost.visible = false;
  root.add(ghost);

  function ensureNodes(nodes, sea) {
    while (nodeGroups.length < nodes.length) {
      const n = nodeMarker(wrap);
      root.add(n);
      nodeGroups.push(n);
    }
    nodes.forEach((n, i) => {
      const g = nodeGroups[i];
      const h = sea ? sea.height(n.x, n.z) : 0;
      g.position.set(n.x, h, n.z);
      g.visible = n.taken < 0;
    });
  }

  function getShot(team) {
    let m = shotPool.find((s) => !s.userData.live);
    if (!m) {
      m = new THREE.Mesh(shotGeo, team === 0 ? shotMat0 : shotMat1);
      root.add(m);
      shotPool.push(m);
    }
    m.material = team === 0 ? shotMat0 : shotMat1;
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
      if (!g) {
        g = makeEntity(e, teamMats);
        root.add(g);
        byId.set(e.id, g);
      }
      g.position.x = e.x;
      g.position.z = e.z;
      if (e.building) {
        g.position.y = 0;
        g.rotation.x = 0;
        g.rotation.z = 0;
        g.rotation.y = 0;
      } else if (!g.userData.ridden) {
        const h = sea ? sea.height(e.x, e.z) : 0;
        g.position.y = h + (e.hover ? 5.2 : 0.4);
        g.rotation.y = e.yaw;
      }
      const frac = Math.max(0.02, e.hp / e.hpMax);
      const hp = g.userData.hp;
      hp.scale.x = e.radius * 1.6;
      const dy = e.building ? (g.userData.deckY || 14) : 9;
      hp.position.y = e.building ? dy + 16 : 9;
      hp.userData.fg.scale.x = frac;
      hp.userData.fg.position.x = (frac - 1) * 0.5;
      hp.userData.fg.material.color.setHex(
        frac < 0.35 ? 0xd9776b : e.team === 0 ? 0x3ad6e8 : 0x6ee07a,
      );
      hp.quaternion.copy(camera.quaternion);
      g.userData.sel.visible = e.selected;
      g.userData.sel.scale.setScalar(e.radius);
      g.userData.sel.position.y = e.building ? dy + 0.4 : 0.45;
      if (e.buildLeft > 0) g.scale.setScalar(0.55 + 0.45 * (1 - e.buildLeft / Math.max(0.1, e.buildMax)));
      else g.scale.setScalar(1);
    }
    for (const [id, g] of byId) {
      if (!live.has(id)) {
        root.remove(g);
        byId.delete(id);
      }
    }
    for (const s of shotPool) s.userData.live = false;
    for (const s of snap.shots) {
      const m = getShot(s.team);
      const h = sea ? sea.height(s.x, s.z) : 0;
      m.position.set(s.x, h + 6.2, s.z);
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

  function wakePoints(snap) {
    const pts = [];
    for (const e of snap.ents) {
      if (e.building || e.hover) continue;
      const sternX = e.x - Math.sin(e.yaw) * (e.radius * 1.4);
      const sternZ = e.z - Math.cos(e.yaw) * (e.radius * 1.4);
      pts.push({
        x: sternX,
        z: sternZ,
        strength: e.kind === "destroyer" ? 0.38 : 0.24,
        radius: e.kind === "destroyer" ? 10 : 6,
      });
    }
    return pts;
  }

  return { root, sync, wakePoints, get, markRidden };
}
