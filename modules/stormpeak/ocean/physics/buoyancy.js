// @ts-nocheck
/** @ts-nocheck */
/**
 * Multi-point heave / pitch / roll. Ships are corks on long swell: tight heave
 * so they stay on the 100 ft faces, clamped pitch/roll so hulls don't flip.
 * Jackets stay put and report waterline slams. Hover chassis tracks the surface
 * with extra air gap. Fixed-step caller (see StormpeakLab).
 */

const DECK = {
  core: 16,
  harbor: 14,
  extractor: 11,
  reactor: 10,
  silo: 9,
  gun: 10,
};

const SHIP_DIM = {
  constructor: { length: 10, beam: 4.2, draft: 0.9, hover: 4.6 },
  corvette: { length: 16, beam: 5, draft: 1.45, hover: 0 },
  destroyer: { length: 24, beam: 7.2, draft: 1.9, hover: 0 },
  commander: { length: 8, beam: 8, draft: 0, hover: 5.4 },
};

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function spring(pos, vel, target, k, damp, dt) {
  const a = (target - pos) * k - vel * damp;
  vel += a * dt;
  pos += vel * dt;
  return [pos, vel];
}

export function deckHeight(kind) {
  return DECK[kind] ?? 10;
}

export function createBuoyancyWorld(sea) {
  const bodies = new Map();
  const impacts = [];
  const _a = { h: 0, vy: 0, steep: 0, sx: 0, sz: 0, vx: 0, vz: 0 };
  const _b = { h: 0, vy: 0, steep: 0, sx: 0, sz: 0, vx: 0, vz: 0 };
  const _c = { h: 0, vy: 0, steep: 0, sx: 0, sz: 0, vx: 0, vz: 0 };
  const _d = { h: 0, vy: 0, steep: 0, sx: 0, sz: 0, vx: 0, vz: 0 };
  const _m = { h: 0, vy: 0, steep: 0, sx: 0, sz: 0, vx: 0, vz: 0 };

  function makeShip(id, opts) {
    return {
      id,
      kind: opts.kind || "ship",
      x: opts.x || 0,
      z: opts.z || 0,
      yaw: opts.yaw || 0,
      length: opts.length || 16,
      beam: opts.beam || 5,
      draft: opts.draft ?? 1.2,
      hover: opts.hover || 0,
      yScale: opts.yScale || 1,
      group: opts.group || null,
      collars: opts.collars || null,
      deckY: opts.deckY || 0,
      jacket: !!opts.jacket,
      lockXZ: !!opts.lockXZ,
      y: 0,
      vy: 0,
      pitch: 0,
      vp: 0,
      roll: 0,
      vr: 0,
      prevH: 0,
      inited: false,
      slamCool: 0,
      sprayAcc: 0,
    };
  }

  function add(id, opts) {
    if (bodies.has(id)) {
      const b = bodies.get(id);
      Object.assign(b, {
        x: opts.x ?? b.x,
        z: opts.z ?? b.z,
        yaw: opts.yaw ?? b.yaw,
        group: opts.group ?? b.group,
        collars: opts.collars ?? b.collars,
      });
      return b;
    }
    const b = makeShip(id, opts);
    bodies.set(id, b);
    return b;
  }

  function removeMissing(live) {
    for (const id of bodies.keys()) {
      if (typeof id === "number" && !live.has(id)) bodies.delete(id);
    }
  }

  function pose(id) {
    return bodies.get(id) || null;
  }

  function emitImpact(list, x, y, z, nx, ny, nz, strength, radius, kind) {
    if (strength < 0.12) return;
    list.push({ x, y, z, nx, ny, nz, strength, radius, kind });
  }

  function stepBody(b, dt) {
    b.slamCool = Math.max(0, b.slamCool - dt);
    const fwdX = Math.sin(b.yaw);
    const fwdZ = Math.cos(b.yaw);
    const rgtX = Math.cos(b.yaw);
    const rgtZ = -Math.sin(b.yaw);
    const hl = b.length * 0.38;
    const hb = b.beam * 0.32;

    sea.sample(b.x + fwdX * hl, b.z + fwdZ * hl, _a);
    sea.sample(b.x - fwdX * hl, b.z - fwdZ * hl, _b);
    sea.sample(b.x + rgtX * hb, b.z + rgtZ * hb, _c);
    sea.sample(b.x - rgtX * hb, b.z - rgtZ * hb, _d);
    sea.sample(b.x, b.z, _m);

    const mean = (_a.h + _b.h + _c.h + _d.h + _m.h) * 0.2;
    const meanVy = (_a.vy + _b.vy + _c.vy + _d.vy + _m.vy) * 0.2;
    const steep = Math.max(_a.steep, _b.steep, _m.steep);
    const dh = mean - b.prevH;
    b.prevH = mean;

    if (b.jacket) {
      if (!b.inited) {
        b.inited = true;
        b.y = b.deckY;
      }
      if (b.collars) {
        for (const c of b.collars) {
          const s = sea.sample(b.x + c.lx, b.z + c.lz, _a);
          if (c.mesh) c.mesh.position.y = s.h / (c.yScale || 1);
        }
      }
      const overtop = mean - b.deckY;
      if (b.slamCool <= 0 && overtop > -1.2 && meanVy > 3.4) {
        b.slamCool = 0.55;
        const str = clamp((meanVy - 2.2) * 0.16 + Math.max(0, overtop) * 0.08, 0.2, 1.4);
        emitImpact(impacts, b.x, b.deckY + 0.4, b.z, 0, 1, 0, str, Math.max(6, b.length * 0.4), "deck");
        if (b.collars) {
          for (const c of b.collars) {
            emitImpact(
              impacts,
              b.x + c.lx,
              mean,
              b.z + c.lz,
              c.lx,
              0.5,
              c.lz,
              str * 0.7,
              3.5,
              "leg",
            );
          }
        }
      } else if (b.slamCool <= 0 && Math.abs(meanVy) > 4.2 && steep > 0.55) {
        b.slamCool = 0.28;
        emitImpact(impacts, b.x, mean, b.z, -_m.sx, 0.4, -_m.sz, clamp(meanVy * 0.08, 0.18, 0.7), 4.2, "leg");
      }
      return;
    }

    const targetY = mean - b.draft + b.hover;
    const targetPitch = clamp(Math.atan2(_a.h - _b.h, Math.max(4, b.length * 0.76)), -0.26, 0.26);
    const targetRoll = clamp(Math.atan2(_c.h - _d.h, Math.max(3, b.beam * 0.7)), -0.2, 0.2);

    const kY = b.hover ? 7.5 : 11.5;
    const dY = b.hover ? 5.2 : 5.5;
    const kA = b.hover ? 5.5 : 10.5;
    const dA = b.hover ? 4.4 : 6.2;

    if (!b.inited) {
      b.y = targetY;
      b.pitch = targetPitch;
      b.roll = targetRoll;
      b.vy = meanVy;
      b.inited = true;
    }

    [b.y, b.vy] = spring(b.y, b.vy, targetY, kY, dY, dt);
    [b.pitch, b.vp] = spring(b.pitch, b.vp, targetPitch, kA, dA, dt);
    [b.roll, b.vr] = spring(b.roll, b.vr, targetRoll, kA, dA, dt);
    b.pitch = clamp(b.pitch, -0.3, 0.3);
    b.roll = clamp(b.roll, -0.24, 0.24);

    const subBow = _a.h - (b.y + Math.sin(b.pitch) * hl);
    const relVy = meanVy - b.vy;
    if (b.slamCool <= 0 && subBow > 0.35 && relVy > 3.1) {
      b.slamCool = 0.4;
      const str = clamp((relVy - 2.4) * 0.18 + steep * 0.22, 0.22, 1.35);
      emitImpact(
        impacts,
        b.x + fwdX * hl,
        _a.h,
        b.z + fwdZ * hl,
        fwdX,
        0.55,
        fwdZ,
        str,
        Math.max(3.2, b.beam * 0.7),
        "slam",
      );
    }

    b.sprayAcc += dt * (0.35 + steep * 1.8 + Math.abs(relVy) * 0.12);
    const sprayNeed = b.hover ? 0.55 : 0.22;
    if (b.sprayAcc > sprayNeed && (steep > 0.32 || Math.abs(dh) > 0.35)) {
      b.sprayAcc = 0;
      const side = steep > 0.5 ? 1 : 0.55;
      emitImpact(
        impacts,
        b.x + fwdX * hl * 0.92,
        Math.max(b.y, _a.h) + 0.4,
        b.z + fwdZ * hl * 0.92,
        -_a.sx + fwdX * 0.3,
        0.7,
        -_a.sz + fwdZ * 0.3,
        clamp(0.16 + steep * 0.45 + Math.abs(relVy) * 0.05, 0.14, 0.85) * side,
        Math.max(2.4, b.beam * 0.45),
        "spray",
      );
    }

    if (b.group) {
      const g = b.group;
      if (!b.lockXZ) {
        g.position.x = b.x;
        g.position.z = b.z;
      }
      g.position.y = b.y / b.yScale;
      g.rotation.order = "YXZ";
      g.rotation.y = b.yaw;
      const body = g.userData && g.userData.body;
      if (body && body !== g) {
        g.rotation.x = 0;
        g.rotation.z = 0;
        body.rotation.order = "YXZ";
        body.rotation.x = b.pitch;
        body.rotation.z = b.roll;
        body.rotation.y = 0;
      } else {
        g.rotation.x = b.pitch;
        g.rotation.z = b.roll;
      }
    }
  }

  function step(dt) {
    impacts.length = 0;
    for (const b of bodies.values()) stepBody(b, dt);
    return impacts;
  }

  function syncTheatre(ships, yScale) {
    for (let i = 0; i < ships.length; i++) {
      const s = ships[i];
      const id = `th-${i}`;
      const ys = s.world ? 1 : yScale;
      const b = add(id, {
        kind: "ship",
        x: s.x,
        z: s.z,
        yaw: s.yaw,
        length: s.length,
        beam: s.beam,
        draft: Math.max(1.05, (s.beam || 5) * 0.28),
        yScale: ys,
        group: s.group,
        lockXZ: !s.world,
      });
      b.x = s.x;
      b.z = s.z;
      b.yaw = s.yaw;
      b.group = s.group;
      b.yScale = ys;
      b.lockXZ = !s.world;
    }
  }

  function syncEnts(ents, getGroup) {
    const live = new Set();
    for (const e of ents) {
      live.add(e.id);
      const dim = SHIP_DIM[e.kind] || { length: e.radius * 2.2, beam: e.radius * 1.2, draft: 1, hover: 0 };
      const jacket = !!e.building;
      const g = getGroup ? getGroup(e.id) : null;
      const b = add(e.id, {
        kind: e.kind,
        x: e.x,
        z: e.z,
        yaw: e.yaw,
        length: jacket ? e.radius * 2.2 : dim.length,
        beam: jacket ? e.radius * 1.8 : dim.beam,
        draft: jacket ? 0 : dim.draft,
        hover: e.hover ? dim.hover || 5 : 0,
        jacket,
        deckY: jacket ? deckHeight(e.kind) : 0,
        yScale: 1,
        group: jacket ? null : g,
        collars: g?.userData?.legs || null,
      });
      b.x = e.x;
      b.z = e.z;
      b.yaw = e.yaw;
      b.jacket = jacket;
      b.hover = e.hover ? dim.hover || 5 : 0;
      if (!jacket) b.group = g;
      else {
        b.group = null;
        b.collars = g?.userData?.legs || b.collars;
        b.deckY = deckHeight(e.kind);
      }
    }
    removeMissing(live);
  }

  function syncJackets(legs, yScale) {
    const id = "rig";
    const b = add(id, {
      kind: "jacket",
      x: 0,
      z: 0,
      yaw: 0,
      length: 28,
      beam: 22,
      jacket: true,
      deckY: 19.7,
      yScale,
      collars: legs,
    });
    b.collars = legs;
    b.jacket = true;
  }

  return {
    add,
    pose,
    step,
    syncTheatre,
    syncEnts,
    syncJackets,
    deckHeight,
    bodies,
  };
}
