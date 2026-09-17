import {
  BROOD,
  DEFS,
  HQ,
  NODES,
  PLAYER,
  POP_CAP,
  TICK,
  type BuildingId,
  type Kind,
  type UnitId,
} from "./catalog";
import { accuracyMul, headingDrag, smallCraftWarn, swellDir } from "./sea";

export type Phase = "brief" | "live" | "paused" | "victory" | "defeat";

export type Order = {
  type: "idle" | "move" | "attack" | "assist";
  x: number;
  z: number;
  targetId: number;
};

export type Ent = {
  id: number;
  team: number;
  kind: Kind;
  x: number;
  z: number;
  yaw: number;
  hp: number;
  hpMax: number;
  radius: number;
  speed: number;
  dmg: number;
  range: number;
  reload: number;
  cool: number;
  hover: boolean;
  building: boolean;
  buildLeft: number;
  buildMax: number;
  queue: UnitId[];
  prodLeft: number;
  alive: boolean;
  order: Order;
};

export type Shot = {
  id: number;
  team: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  dmg: number;
  ttl: number;
  alive: boolean;
};

export type Node = { x: number; z: number; taken: number };

export type Bank = {
  mass: number;
  energy: number;
  mcap: number;
  ecap: number;
  mi: number;
  ei: number;
  wasted: number;
};

export type Notice = { id: number; text: string; age: number };

export type Snapshot = {
  phase: Phase;
  time: number;
  beaufort: number;
  banks: [Bank, Bank];
  selected: number[];
  buildKind: BuildingId | null;
  ghost: { x: number; z: number; valid: boolean } | null;
  pop: [number, number];
  notices: Notice[];
  objective: string;
  smallCraft: boolean;
  seaDrag: number;
  seaAcc: number;
  outcome: string | null;
  ents: Array<{
    id: number;
    team: number;
    kind: Kind;
    x: number;
    z: number;
    yaw: number;
    hp: number;
    hpMax: number;
    radius: number;
    building: boolean;
    buildLeft: number;
    buildMax: number;
    queue: UnitId[];
    selected: boolean;
    alive: boolean;
    hover: boolean;
  }>;
  shots: Array<{ id: number; team: number; x: number; z: number; alive: boolean }>;
  nodes: Node[];
};

const IDLE: Order = { type: "idle", x: 0, z: 0, targetId: -1 };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function createMatch(opts: { beaufort?: number; seed?: number; startLive?: boolean } = {}) {
  let nextId = 1;
  let shotId = 1;
  let noticeId = 1;
  let beaufort = opts.beaufort ?? 9.5;
  let phase: Phase = opts.startLive ? "live" : "brief";
  let time = 0;
  let acc = 0;
  let aiAcc = 0;
  let boxStart: { x: number; z: number } | null = null;
  const swell = swellDir(196);
  const ents: Ent[] = [];
  const shots: Shot[] = [];
  const notices: Notice[] = [];
  const selected: number[] = [];
  let buildKind: BuildingId | null = null;
  let ghost: Snapshot["ghost"] = null;
  const nodes: Node[] = NODES.map((n) => ({ x: n.x, z: n.z, taken: -1 }));
  const banks: [Bank, Bank] = [
    { mass: 220, energy: 900, mcap: 1200, ecap: 6000, mi: 0, ei: 0, wasted: 0 },
    { mass: 260, energy: 980, mcap: 1200, ecap: 6000, mi: 0, ei: 0, wasted: 0 },
  ];

  function notice(text: string) {
    if (notices[0] && notices[0].text === text && notices[0].age < 4) return;
    notices.unshift({ id: noticeId++, text, age: 0 });
    if (notices.length > 4) notices.pop();
  }

  function spawn(team: number, kind: Kind, x: number, z: number, built = true) {
    const d = DEFS[kind];
    const e: Ent = {
      id: nextId++,
      team,
      kind,
      x,
      z,
      yaw: team === PLAYER ? 0.4 : 3.5,
      hp: built ? d.hp : d.hp * 0.12,
      hpMax: d.hp,
      radius: d.radius,
      speed: d.speed,
      dmg: d.dmg,
      range: d.range,
      reload: d.reload,
      cool: 0,
      hover: d.hover,
      building: d.building,
      buildLeft: built ? 0 : d.time,
      buildMax: d.time,
      queue: [],
      prodLeft: 0,
      alive: true,
      order: { ...IDLE },
    };
    ents.push(e);
    if (kind === "extractor") {
      const node = nearestFreeNode(x, z, 22) || nearestNode(x, z);
      if (node) node.taken = e.id;
    }
    return e;
  }

  function nearestNode(x: number, z: number) {
    let best: Node | null = null;
    let bestD = Infinity;
    for (const n of nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function nearestFreeNode(x: number, z: number, maxR: number) {
    let best: Node | null = null;
    let bestD = maxR * maxR;
    for (const n of nodes) {
      if (n.taken >= 0 && ents.find((e) => e.id === n.taken && e.alive)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function popOf(team: number) {
    let n = 0;
    for (const e of ents) if (e.alive && e.team === team && !e.building) n++;
    return n;
  }

  function overlaps(x: number, z: number, r: number, ignore = -1) {
    for (const e of ents) {
      if (!e.alive || e.id === ignore) continue;
      const rr = e.radius + r + 4;
      if ((e.x - x) ** 2 + (e.z - z) ** 2 < rr * rr) return true;
    }
    return false;
  }

  function canPlace(kind: BuildingId, x: number, z: number) {
    const d = DEFS[kind];
    if (kind === "extractor") {
      const node = nearestFreeNode(x, z, 18);
      return !!node;
    }
    if (overlaps(x, z, d.radius)) return false;
    return true;
  }

  function placePoint(kind: BuildingId, x: number, z: number) {
    if (kind === "extractor") {
      const node = nearestFreeNode(x, z, 18);
      if (!node) return null;
      return { x: node.x, z: node.z };
    }
    return { x, z };
  }

  function tryPlace(team: number, kind: BuildingId, x: number, z: number) {
    const d = DEFS[kind];
    const bank = banks[team as 0 | 1];
    if (bank.mass < d.mass || bank.energy < d.energy) {
      if (team === PLAYER) notice("INSUFFICIENT MASS / ENERGY");
      return null;
    }
    const p = placePoint(kind, x, z);
    if (!p || !canPlace(kind, p.x, p.z)) {
      if (team === PLAYER) notice("INVALID SITE");
      return null;
    }
    bank.mass -= d.mass;
    bank.energy -= d.energy;
    const e = spawn(team, kind, p.x, p.z, false);
    if (team === PLAYER) notice(`DEPLOY ${d.name.toUpperCase()}`);
    return e;
  }

  function tryProduce(team: number, kind: UnitId, harborId?: number) {
    const d = DEFS[kind];
    const bank = banks[team as 0 | 1];
    if (popOf(team) >= POP_CAP) {
      if (team === PLAYER) notice("POPULATION CAP");
      return false;
    }
    if (bank.mass < d.mass || bank.energy < d.energy) {
      if (team === PLAYER) notice("INSUFFICIENT MASS / ENERGY");
      return false;
    }
    let harbor =
      (harborId != null && ents.find((e) => e.id === harborId && e.alive && e.kind === "harbor")) ||
      ents.find((e) => e.alive && e.team === team && e.kind === "harbor" && e.buildLeft <= 0);
    if (!harbor) {
      if (team === PLAYER) notice("NO NAVY YARD");
      return false;
    }
    if (harbor.queue.length >= 4) {
      if (team === PLAYER) notice("QUEUE FULL");
      return false;
    }
    bank.mass -= d.mass;
    bank.energy -= d.energy;
    harbor.queue.push(kind);
    if (harbor.queue.length === 1) harbor.prodLeft = d.time;
    return true;
  }

  function pickAt(x: number, z: number, team?: number) {
    let best: Ent | null = null;
    let bestD = 22 * 22;
    for (const e of ents) {
      if (!e.alive) continue;
      if (team != null && e.team !== team) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      const r = (e.radius + 8) ** 2;
      if (d < r && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function ownSelected() {
    return ents.filter((e) => e.alive && e.team === PLAYER && selected.includes(e.id));
  }

  function issueMove(x: number, z: number) {
    const list = ownSelected().filter((e) => !e.building);
    list.forEach((e, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      e.order = {
        type: "move",
        x: x + (col - 1.5) * 14,
        z: z + row * 16,
        targetId: -1,
      };
    });
  }

  function issueAttack(target: Ent) {
    for (const e of ownSelected()) {
      if (!e.dmg) continue;
      e.order = { type: "attack", x: target.x, z: target.z, targetId: target.id };
    }
  }

  function fire(e: Ent, tx: number, tz: number) {
    if (e.cool > 0 || e.dmg <= 0 || e.buildLeft > 0) return;
    const dx = tx - e.x;
    const dz = tz - e.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (dist > e.range) return;
    const acc = accuracyMul(beaufort);
    const spread = (1 - acc) * 0.18;
    const ang = Math.atan2(dx, dz) + (Math.random() - 0.5) * spread;
    const spd = e.building ? 90 : 70;
    shots.push({
      id: shotId++,
      team: e.team,
      x: e.x,
      z: e.z,
      vx: Math.sin(ang) * spd,
      vz: Math.cos(ang) * spd,
      dmg: e.dmg,
      ttl: 1.6,
      alive: true,
    });
    e.cool = e.reload;
    e.yaw = ang;
  }

  function retarget(e: Ent) {
    let best: Ent | null = null;
    let bestD = e.range * e.range;
    for (const o of ents) {
      if (!o.alive || o.team === e.team) continue;
      const d = (o.x - e.x) ** 2 + (o.z - e.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  function stepEconomy(dt: number) {
    for (const team of [PLAYER, BROOD] as const) {
      let mi = 0;
      let ei = 0;
      let mcap = 0;
      let ecap = 0;
      for (const e of ents) {
        if (!e.alive || e.team !== team || e.buildLeft > 0) continue;
        const d = DEFS[e.kind];
        mi += d.mi;
        ei += d.ei;
        mcap += d.mcap;
        ecap += d.ecap;
      }
      const b = banks[team];
      b.mi = mi;
      b.ei = ei;
      b.mcap = mcap;
      b.ecap = ecap;
      const dm = mi * dt;
      const de = ei * dt;
      if (b.mass + dm > mcap) {
        b.wasted += b.mass + dm - mcap;
        b.mass = mcap;
      } else b.mass += dm;
      if (b.energy + de > ecap) b.energy = ecap;
      else b.energy += de;
    }
    if (banks[PLAYER].mass >= banks[PLAYER].mcap - 1 && banks[PLAYER].mi > 0) {
      notice("STORAGE FULL — BUILD A SILO");
    }
  }

  function stepMove(e: Ent, dt: number) {
    if (e.building || e.speed <= 0 || e.buildLeft > 0) return;
    let tx = e.order.x;
    let tz = e.order.z;
    if (e.order.type === "attack" || e.order.type === "assist") {
      const t = ents.find((o) => o.id === e.order.targetId && o.alive);
      if (t) {
        tx = t.x;
        tz = t.z;
        e.order.x = tx;
        e.order.z = tz;
      } else {
        e.order.type = "idle";
        return;
      }
    }
    if (e.order.type === "idle") return;
    const dx = tx - e.x;
    const dz = tz - e.z;
    const dist = Math.hypot(dx, dz);
    const stop = e.order.type === "attack" ? Math.max(e.range * 0.72, e.radius + 10) : 4;
    if (dist <= stop) {
      if (e.order.type === "move") e.order.type = "idle";
      return;
    }
    const dirX = dx / dist;
    const dirZ = dz / dist;
    const drag = headingDrag(beaufort, dirX, dirZ, swell.x, swell.z);
    const warn = smallCraftWarn(beaufort) && (e.kind === "corvette" || e.kind === "constructor");
    const spd = e.speed * drag * (warn ? 0.72 : 1);
    const step = Math.min(dist - stop + 0.01, spd * dt);
    e.x += dirX * step;
    e.z += dirZ * step;
    e.yaw = Math.atan2(dirX, dirZ);
  }

  function stepCombat(e: Ent, dt: number) {
    if (e.dmg <= 0 || e.buildLeft > 0) return;
    e.cool = Math.max(0, e.cool - dt);
    let target: Ent | undefined;
    if (e.order.type === "attack") {
      target = ents.find((o) => o.id === e.order.targetId && o.alive);
    }
    if (!target) target = retarget(e) || undefined;
    if (!target) return;
    const dist = Math.hypot(target.x - e.x, target.z - e.z);
    if (dist <= e.range) fire(e, target.x, target.z);
    else if (!e.building && e.order.type !== "move") {
      e.order = { type: "attack", x: target.x, z: target.z, targetId: target.id };
    }
  }

  function stepShots(dt: number) {
    for (const s of shots) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      s.z += s.vz * dt;
      s.ttl -= dt;
      if (s.ttl <= 0) {
        s.alive = false;
        continue;
      }
      for (const e of ents) {
        if (!e.alive || e.team === s.team) continue;
        if ((e.x - s.x) ** 2 + (e.z - s.z) ** 2 <= (e.radius + 2.2) ** 2) {
          e.hp -= s.dmg;
          s.alive = false;
          if (e.kind === "core" && e.team === PLAYER) notice("CORE UNDER FIRE");
          if (e.hp <= 0) {
            e.alive = false;
            e.hp = 0;
            if (e.kind === "extractor") {
              const n = nodes.find((nd) => nd.taken === e.id);
              if (n) n.taken = -1;
            }
            if (e.kind === "core") {
              phase = e.team === BROOD ? "victory" : "defeat";
              notice(e.team === BROOD ? "BROOD CORE DESTROYED" : "COMMAND CORE LOST");
            }
          }
          break;
        }
      }
    }
  }

  function stepProduction(e: Ent, dt: number) {
    if (!e.alive || e.kind !== "harbor" || e.buildLeft > 0) return;
    if (!e.queue.length) return;
    e.prodLeft -= dt;
    if (e.prodLeft > 0) return;
    const kind = e.queue.shift()!;
    const ang = e.yaw + Math.PI;
    const x = e.x + Math.sin(ang) * (e.radius + DEFS[kind].radius + 10);
    const z = e.z + Math.cos(ang) * (e.radius + DEFS[kind].radius + 10);
    const u = spawn(e.team, kind, x, z, true);
    u.order = {
      type: "move",
      x: x + Math.sin(ang) * 28,
      z: z + Math.cos(ang) * 28,
      targetId: -1,
    };
    if (e.queue.length) e.prodLeft = DEFS[e.queue[0]].time;
  }

  function stepBuild(e: Ent, dt: number) {
    if (!e.alive || e.buildLeft <= 0) return;
    e.buildLeft = Math.max(0, e.buildLeft - dt);
    e.hp = Math.min(e.hpMax, e.hp + (e.hpMax / Math.max(0.1, e.buildMax)) * dt);
  }

  function ai(dt: number) {
    aiAcc += dt;
    if (aiAcc < 1.35) return;
    aiAcc = 0;
    if (phase !== "live" || time < 6) return;
    const team = BROOD;
    const bank = banks[team];
    const extractors = ents.filter((e) => e.alive && e.team === team && e.kind === "extractor");
    const reactors = ents.filter((e) => e.alive && e.team === team && e.kind === "reactor");
    const harbors = ents.filter((e) => e.alive && e.team === team && e.kind === "harbor" && e.buildLeft <= 0);
    const guns = ents.filter((e) => e.alive && e.team === team && e.kind === "gun");
    const hq = ents.find((e) => e.alive && e.team === team && e.kind === "core");
    if (!hq) return;

    if (extractors.length < 3) {
      const node = nodes.find(
        (n) => n.taken < 0 || !ents.find((e) => e.id === n.taken && e.alive),
      );
      if (node) tryPlace(team, "extractor", node.x, node.z);
    } else if (reactors.length < 2) {
      tryPlace(team, "reactor", hq.x - 28, hq.z + 24);
    } else if (!harbors.length) {
      tryPlace(team, "harbor", hq.x + 36, hq.z - 10);
    } else if (guns.length < 2) {
      tryPlace(team, "gun", hq.x - 10, hq.z - 32);
    } else if (bank.mass > 900 && bank.mcap - bank.mass < 80) {
      tryPlace(team, "silo", hq.x + 20, hq.z + 34);
    }

    const harbor = harbors[0];
    if (harbor && harbor.queue.length < 2) {
      const constructors = ents.filter((e) => e.alive && e.team === team && e.kind === "constructor");
      const destroyers = ents.filter((e) => e.alive && e.team === team && e.kind === "destroyer");
      if (constructors.length < 1) tryProduce(team, "constructor", harbor.id);
      else if (destroyers.length < 1 && bank.mass > 240) tryProduce(team, "destroyer", harbor.id);
      else tryProduce(team, "corvette", harbor.id);
    }

    if (time > 18) {
      const playerCore = ents.find((e) => e.alive && e.team === PLAYER && e.kind === "core");
      if (playerCore) {
        const combat = ents.filter(
          (e) =>
            e.alive &&
            e.team === team &&
            !e.building &&
            (e.kind === "corvette" || e.kind === "destroyer" || e.kind === "commander"),
        );
        if (combat.length >= 2) {
          for (const u of combat) {
            if (u.order.type === "idle" || u.order.type === "move") {
              u.order = { type: "attack", x: playerCore.x, z: playerCore.z, targetId: playerCore.id };
            }
          }
        }
      }
    }
  }

  function seed() {
    spawn(PLAYER, "core", HQ[PLAYER].x, HQ[PLAYER].z, true);
    spawn(PLAYER, "harbor", HQ[PLAYER].x + 44, HQ[PLAYER].z + 16, true);
    spawn(PLAYER, "commander", HQ[PLAYER].x + 22, HQ[PLAYER].z + 8, true);
    spawn(PLAYER, "constructor", HQ[PLAYER].x + 8, HQ[PLAYER].z - 22, true);
    spawn(PLAYER, "corvette", HQ[PLAYER].x + 36, HQ[PLAYER].z - 8, true);
    spawn(BROOD, "core", HQ[BROOD].x, HQ[BROOD].z, true);
    spawn(BROOD, "harbor", HQ[BROOD].x - 44, HQ[BROOD].z - 14, true);
    spawn(BROOD, "commander", HQ[BROOD].x - 20, HQ[BROOD].z - 6, true);
    spawn(BROOD, "constructor", HQ[BROOD].x - 10, HQ[BROOD].z + 24, true);
    spawn(BROOD, "corvette", HQ[BROOD].x - 34, HQ[BROOD].z + 4, true);
    const n0 = nearestFreeNode(HQ[PLAYER].x + 40, HQ[PLAYER].z - 20, 400);
    if (n0) spawn(PLAYER, "extractor", n0.x, n0.z, true);
    const n1 = nearestFreeNode(HQ[BROOD].x - 40, HQ[BROOD].z + 20, 400);
    if (n1) spawn(BROOD, "extractor", n1.x, n1.z, true);
  }

  seed();

  function step(dt: number) {
    if (phase !== "live") return;
    const cap = Math.min(0.1, dt);
    acc += cap;
    time += cap;
    while (acc >= TICK) {
      acc -= TICK;
      stepEconomy(TICK);
      for (const e of ents) {
        if (!e.alive) continue;
        stepBuild(e, TICK);
        stepMove(e, TICK);
        stepCombat(e, TICK);
        stepProduction(e, TICK);
      }
      stepShots(TICK);
      for (const n of notices) n.age += TICK;
    }
    ai(cap);
  }

  function pointerDown(x: number, z: number, button: number, shift: boolean) {
    if (phase === "brief") return;
    if (button === 2 || button === 1) {
      if (buildKind) {
        buildKind = null;
        ghost = null;
        return;
      }
      const foe = pickAt(x, z);
      if (foe && foe.team !== PLAYER) issueAttack(foe);
      else issueMove(x, z);
      return;
    }
    if (button === 0) {
      if (buildKind) {
        tryPlace(PLAYER, buildKind, x, z);
        return;
      }
      boxStart = { x, z };
      const hit = pickAt(x, z, PLAYER);
      if (hit) {
        if (!shift) selected.length = 0;
        if (!selected.includes(hit.id)) selected.push(hit.id);
      }
    }
  }

  function pointerMove(x: number, z: number) {
    if (buildKind) {
      const p = placePoint(buildKind, x, z);
      ghost = p ? { x: p.x, z: p.z, valid: canPlace(buildKind, p.x, p.z) } : { x, z, valid: false };
    } else ghost = null;
  }

  function pointerUp(x: number, z: number, button: number) {
    if (button !== 0 || !boxStart) {
      boxStart = null;
      return;
    }
    const dx = x - boxStart.x;
    const dz = z - boxStart.z;
    if (dx * dx + dz * dz > 18 * 18) {
      const minx = Math.min(boxStart.x, x);
      const maxx = Math.max(boxStart.x, x);
      const minz = Math.min(boxStart.z, z);
      const maxz = Math.max(boxStart.z, z);
      selected.length = 0;
      for (const e of ents) {
        if (!e.alive || e.team !== PLAYER) continue;
        if (e.x >= minx && e.x <= maxx && e.z >= minz && e.z <= maxz) selected.push(e.id);
      }
    } else {
      const hit = pickAt(x, z);
      const mobiles = ownSelected().filter((e) => !e.building);
      if (hit && hit.team !== PLAYER && mobiles.length) issueAttack(hit);
      else if (!hit && mobiles.length) issueMove(x, z);
      else if (!hit && !mobiles.length) selected.length = 0;
    }
    boxStart = null;
  }

  function snapshot(): Snapshot {
    const sel = new Set(selected);
    const sample = ents.find((e) => e.alive && e.team === PLAYER && !e.building);
    const drag = sample
      ? headingDrag(beaufort, Math.sin(sample.yaw), Math.cos(sample.yaw), swell.x, swell.z)
      : headingDrag(beaufort, 1, 0, swell.x, swell.z);
    return {
      phase,
      time,
      beaufort,
      banks: [
        { ...banks[0] },
        { ...banks[1] },
      ],
      selected: selected.slice(),
      buildKind,
      ghost: ghost ? { ...ghost } : null,
      pop: [popOf(PLAYER), popOf(BROOD)],
      notices: notices.filter((n) => n.age < 6).map((n) => ({ ...n })),
      objective:
        phase === "victory"
          ? "REGION HELD"
          : phase === "defeat"
            ? "CORE LOST"
            : "DESTROY THE BROOD CORE",
      smallCraft: smallCraftWarn(beaufort),
      seaDrag: drag,
      seaAcc: accuracyMul(beaufort),
      outcome: phase === "victory" || phase === "defeat" ? phase : null,
      ents: ents
        .filter((e) => e.alive)
        .map((e) => ({
          id: e.id,
          team: e.team,
          kind: e.kind,
          x: e.x,
          z: e.z,
          yaw: e.yaw,
          hp: e.hp,
          hpMax: e.hpMax,
          radius: e.radius,
          building: e.building,
          buildLeft: e.buildLeft,
          buildMax: e.buildMax,
          queue: e.queue.slice(),
          selected: sel.has(e.id),
          alive: e.alive,
          hover: e.hover,
        })),
      shots: shots.filter((s) => s.alive).map((s) => ({ id: s.id, team: s.team, x: s.x, z: s.z, alive: true })),
      nodes: nodes.map((n) => ({ ...n })),
    };
  }

  return {
    step,
    snapshot,
    pointerDown,
    pointerMove,
    pointerUp,
    setBeaufort(n: number) {
      beaufort = clamp(n, 0, 12);
    },
    setBuildKind(k: BuildingId | null) {
      buildKind = k;
      if (!k) ghost = null;
    },
    produce(kind: UnitId) {
      tryProduce(PLAYER, kind);
    },
    deploy() {
      if (phase === "brief") {
        phase = "live";
        notice("CARRIER DEPLOYED — STORMPEAK");
      }
    },
    pause() {
      if (phase === "live") phase = "paused";
    },
    resume() {
      if (phase === "paused" || phase === "brief") phase = "live";
    },
    get phase() {
      return phase;
    },
    hq: HQ,
  };
}

export type Match = ReturnType<typeof createMatch>;
