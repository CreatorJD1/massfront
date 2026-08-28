/* Exact replica of sim.js stampSite/plot/streetFrontage/roadClear geometry.
   The shared road-clearance rule stays in sim.js; this file must not invent a
   weaker test. Constants are asserted against src/game/sim.js by the probe so
   a planner edit cannot silently desync the replica. */

import vm from 'node:vm';

export const APRON = 0.59;          /* 1.18x footprint / 2 — sim.js plot/roadClear */
export const CURB_PAD = 3;          /* streetFrontage curbHalf = width/2 + 3 */
export const SETBACK = 14;
export const ROAD_EXCL = 2;         /* roadClear exclusion = width/2 + 2 */
export const FRONT_T_LO = 0.08;
export const FRONT_T_HI = 0.92;
export const OVERLAP_MARGIN = 12;
export const ROTATIONS = 16;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

export function loadSiteTemplates(src, extras = {}) {
  const ctx = { Math, console, ...extras };
  vm.createContext(ctx);
  vm.runInContext(
    src + '\nthis.SITE_TPL=SITE_TPL;this.siteTemplateFor=siteTemplateFor;' +
    'this.SITE_TPL_VER=SITE_TPL_VER;' +
    'this.SITE_TPL_FORCE=(typeof SITE_TPL_FORCE==="undefined")?null:SITE_TPL_FORCE;' +
    'this.SITE_TPL_RULES=(typeof SITE_TPL_RULES==="undefined")?null:SITE_TPL_RULES;' +
    'this.SITE_TPL_QUERY=(typeof SITE_TPL_QUERY==="undefined")?null:SITE_TPL_QUERY;' +
    'this.siteTemplatePool=(typeof siteTemplatePool==="function")?siteTemplatePool:null;' +
    'this.siteTemplateCompat=(typeof siteTemplateCompat==="function")?siteTemplateCompat:null;' +
    'this.siteTemplateContext=(typeof siteTemplateContext==="function")?siteTemplateContext:null;' +
    'this.siteTplTelemReset=(typeof siteTplTelemReset==="function")?siteTplTelemReset:null;' +
    'this.civicKitFill=(typeof civicKitFill==="function")?civicKitFill:null;',
    ctx
  );
  return ctx;
}

export function assertPlannerConstants(simSrc) {
  const need = [
    'apronHalf=h*.59',
    'P.w*.59*ix/3',
    'P.h*.59*iy/3',
    'S[4]*.5+2',
    'curbHalf=best.S[4]*.5+3',
    'setback=14',
    't=clamp(((x-S[0])*dx+(y-S[1])*dy)/L2,.08,.92)',
    'obbOverlap(candidate,cityPlan[i],12)',
    'if(!placed&&P.required){ ok=false; break; }'
  ];
  const missing = need.filter(s => !simSrc.includes(s));
  return { ok: missing.length === 0, missing };
}

export function streetFrontage(x, y, w, h, streets) {
  let best = null;
  for (let si = 0; si < streets.length; si++) {
    const S = streets[si];
    const dx = S[2] - S[0], dy = S[3] - S[1], L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - S[0]) * dx + (y - S[1]) * dy) / L2, FRONT_T_LO, FRONT_T_HI);
    const qx = S[0] + dx * t, qy = S[1] + dy * t, d2 = dist2(x, y, qx, qy);
    if (!best || d2 < best.d2) best = { S, si, qx, qy, dx, dy, d2 };
  }
  if (!best) return null;
  const L = Math.hypot(best.dx, best.dy) || 1, tx = best.dx / L, ty = best.dy / L, nx = -ty, ny = tx;
  const side = ((x - best.qx) * nx + (y - best.qy) * ny) < 0 ? -1 : 1;
  const apronHalf = h * APRON, curbHalf = best.S[4] * .5 + CURB_PAD, centre = curbHalf + SETBACK + apronHalf;
  const facing = s => ({
    x: best.qx + nx * s * centre, y: best.qy + ny * s * centre, a: Math.atan2(ty, tx),
    street: best.si, roadX: best.qx + nx * s * curbHalf, roadY: best.qy + ny * s * curbHalf,
    frontX: best.qx + nx * s * (curbHalf + SETBACK), frontY: best.qy + ny * s * (curbHalf + SETBACK)
  });
  const primary = facing(side); primary.alt = facing(-side); return primary;
}

export function roadClear(P, streets) {
  const ca = Math.cos(P.a), sa = Math.sin(P.a);
  for (let iy = -3; iy <= 3; iy++) for (let ix = -3; ix <= 3; ix++) {
    const lx = P.w * APRON * ix / 3, ly = P.h * APRON * iy / 3;
    const x = P.x + lx * ca - ly * sa, y = P.y + lx * sa + ly * ca;
    for (const S of streets) {
      const dx = S[2] - S[0], dy = S[3] - S[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - S[0]) * dx + (y - S[1]) * dy) / L2, 0, 1);
      if (dist2(x, y, S[0] + dx * t, S[1] + dy * t) < Math.pow(S[4] * .5 + ROAD_EXCL, 2)) return false;
    }
  }
  return true;
}

export function apronMinClearance(P, streets) {
  if (!streets.length) return Infinity;
  let min = Infinity;
  const ca = Math.cos(P.a), sa = Math.sin(P.a);
  for (let iy = -3; iy <= 3; iy++) for (let ix = -3; ix <= 3; ix++) {
    const lx = P.w * APRON * ix / 3, ly = P.h * APRON * iy / 3;
    const x = P.x + lx * ca - ly * sa, y = P.y + lx * sa + ly * ca;
    for (const S of streets) {
      const dx = S[2] - S[0], dy = S[3] - S[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - S[0]) * dx + (y - S[1]) * dy) / L2, 0, 1);
      const d = Math.hypot(x - (S[0] + dx * t), y - (S[1] + dy * t));
      min = Math.min(min, d - (S[4] * .5 + ROAD_EXCL));
    }
  }
  return min;
}

export function obbOverlap(b1, b2, margin) {
  margin = margin || 10;
  const dx = b1.x - b2.x, dy = b1.y - b2.y;
  const r1 = Math.hypot(b1.w, b1.h) * 0.5 + margin, r2 = Math.hypot(b2.w, b2.h) * 0.5;
  if (dx * dx + dy * dy > (r1 + r2) * (r1 + r2)) return false;
  const getCorners = (b) => {
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    const hw = b.w * 0.5 + margin * 0.5, hh = b.h * 0.5 + margin * 0.5;
    return [
      [b.x - hw * ca + hh * sa, b.y - hw * sa - hh * ca],
      [b.x + hw * ca + hh * sa, b.y + hw * sa - hh * ca],
      [b.x + hw * ca - hh * sa, b.y + hw * sa + hh * ca],
      [b.x - hw * ca - hh * sa, b.y - hw * sa + hh * ca]
    ];
  };
  const c1 = getCorners(b1), c2 = getCorners(b2);
  const axes = [[Math.cos(b1.a), Math.sin(b1.a)], [-Math.sin(b1.a), Math.cos(b1.a)],
    [Math.cos(b2.a), Math.sin(b2.a)], [-Math.sin(b2.a), Math.cos(b2.a)]];
  for (const axis of axes) {
    let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
    for (const p of c1) { const dot = p[0] * axis[0] + p[1] * axis[1]; if (dot < min1) min1 = dot; if (dot > max1) max1 = dot; }
    for (const p of c2) { const dot = p[0] * axis[0] + p[1] * axis[1]; if (dot < min2) min2 = dot; if (dot > max2) max2 = dot; }
    if (max1 < min2 || max2 < min1) return false;
  }
  return true;
}

export function worldStreets(T, ga) {
  const ca = Math.cos(ga), sa = Math.sin(ga);
  const L2W = (lx, ly) => [lx * ca - ly * sa, lx * sa + ly * ca];
  return (T.streets || []).map(S => {
    const a = L2W(S[0], S[1]), b = L2W(S[2], S[3]);
    return [a[0], a[1], b[0], b[1], S[4], 0];
  });
}

function tryPlot(x, y, w, h, a, kind, role, streets, placed) {
  const F = streetFrontage(x, y, w, h, streets);
  const fronts = F ? [F, F.alt] : [{ x, y, a }];
  let last = F ? 'plotRoad' : 'plotFrontage';
  for (const V of fronts) {
    const candidate = { x: V.x, y: V.y, w, h, a: V.a, kind, role: role || null, street: V.street };
    if (!roadClear(candidate, streets)) { last = 'plotRoad'; continue; }
    let blocked = false;
    for (let i = 0; i < placed.length; i++) if (obbOverlap(candidate, placed[i], OVERLAP_MARGIN)) { blocked = true; break; }
    if (blocked) { last = 'plotOverlap'; continue; }
    placed.push(candidate);
    return { ok: true, candidate, clearance: apronMinClearance(candidate, streets) };
  }
  return { ok: false, reason: last };
}

export function stampTemplate(T, ga, opts = {}) {
  const streets = worldStreets(T, ga);
  const ca = Math.cos(ga), sa = Math.sin(ga);
  const L2W = (lx, ly) => [lx * ca - ly * sa, lx * sa + ly * ca];
  const placed = [];
  const required = [];
  let firstRequired = null;
  for (const P of (T.plots || [])) {
    if (P.optional !== undefined && !opts.placeOptional) continue;
    const W = L2W(P.x, P.y);
    const hit = tryPlot(W[0], W[1], P.w, P.h, (P.a || 0) + ga, P.kind, P.role, streets, placed);
    if (P.required) {
      if (!firstRequired) {
        firstRequired = {
          role: P.role || null, kind: P.kind, ok: hit.ok,
          reason: hit.ok ? 'ok' : hit.reason,
          clearance: hit.ok ? hit.clearance : (hit.reason === 'plotRoad' ? firstFailedClearance(W, P, ga, streets) : null)
        };
      }
      if (!hit.ok) {
        return {
          ok: false, reason: hit.reason, requiredRole: P.role || null,
          placed: placed.slice(), firstRequired, streets, ga
        };
      }
      required.push(placed[placed.length - 1]);
    }
  }
  return { ok: true, reason: 'ok', placed, required, firstRequired, streets, ga };
}

function firstFailedClearance(W, P, ga, streets) {
  const F = streetFrontage(W[0], W[1], P.w, P.h, streets);
  const fronts = F ? [F, F.alt] : [{ x: W[0], y: W[1], a: (P.a || 0) + ga }];
  let min = Infinity;
  for (const V of fronts) min = Math.min(min, apronMinClearance({ x: V.x, y: V.y, w: P.w, h: P.h, a: V.a }, streets));
  return min;
}

export function rotationSet() {
  const out = [];
  for (let i = 0; i < ROTATIONS; i++) out.push(i * Math.PI * 2 / ROTATIONS);
  return out;
}

export function sweepTemplate(T) {
  const rows = [];
  let pass = 0;
  for (const ga of rotationSet()) {
    const r = stampTemplate(T, ga);
    if (r.ok) pass++;
    rows.push({
      ga, ok: r.ok, reason: r.reason, requiredRole: r.requiredRole || null,
      firstRequired: r.firstRequired, plotCount: r.placed.length
    });
  }
  return { id: T.id, name: T.name, class: T.class, pass, total: ROTATIONS, rows };
}

export function climateMatches(templateClimate, mapClimate) {
  /* Exact climate only. hive is not dusk and ice is not alpine — those
     aliases used to funnel incompatible locations into ordinary cities. */
  const c = templateClimate;
  if (!c || c === 'any') return true;
  return c === mapClimate;
}

export function mapTemplateContext(map) {
  return {
    map: map.id || map.map || '',
    planet: map.planet || null,
    climate: map.climate || null,
    biome: map.biome || map.climate || null,
    faction: map.faction || null,
    purpose: map.purpose || null,
    era: map.era || null,
    condition: map.condition || (map.infest ? 'infested' : null),
    water: map.waterMode || map.water || null,
    theme: map.theme || null
  };
}

export function semanticMatches(T, map) {
  const wild = v => !v || v === 'any';
  if (!wild(T.planet) && T.planet !== map.planet) return false;
  if (!wild(T.biome) && T.biome !== map.climate && T.biome !== map.biome) return false;
  if (!wild(T.faction) && T.faction !== map.faction) return false;
  if (!wild(T.purpose) && map.purpose && T.purpose !== map.purpose) return false;
  if (!wild(T.era) && map.era && T.era !== map.era) return false;
  if (!wild(T.condition) && map.condition && T.condition !== map.condition) return false;
  return true;
}

export function classRequestKey(cls) {
  if (cls === 'city') return 'towns';
  if (cls === 'dome') return 'domes';
  return cls;
}

export function templateAppliesToMap(T, map, { strictClimate = true, vm } = {}) {
  const key = classRequestKey(T.class);
  if (!(map[key] | 0)) return false;
  if (vm && typeof vm.siteTemplateCompat === 'function')
    return vm.siteTemplateCompat(T, mapTemplateContext(map)).ok;
  if (strictClimate && !climateMatches(T.climate, map.climate)) return false;
  if (!semanticMatches(T, map)) return false;
  return true;
}
