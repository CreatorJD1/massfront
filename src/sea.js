;
;
/* ============================================================================
   SEA STATE
   ----------------------------------------------------------------------------
   The water in this engine is a plane. WATER_H is the constant 0.335 and
   nothing has ever moved it: naval units slide across a sheet of glass, the
   SQUALL and TEMPEST hazards blind infantry on the shore without touching the
   water they are standing next to, and every ocean map plays identically to
   every other ocean map. Naval movement, naval pathing, domain masks, target
   masks and per-faction naval bonuses are all already built and working - the
   thing missing underneath them is a sea.

   This file is that sea, and nothing else. It owns one question: where is the
   surface, and how hard is it to work on. The renderer asks it for a height and
   a normal, the simulation asks it what a hull is fighting, the hazard system
   asks it what the weather did to it. One answer, one place.

   THREE RULES IT OBEYS
   ----------------------------------------------------------------------------
   1. DETERMINISTIC, AND PURE AT QUERY TIME. This runs inside a lockstep
      simulation. Every query is a pure function of (x, y, t) and the configured
      state - no RNG, no accumulated drift, no reading the clock. The only
      randomness is in mfSeaConfigure, which draws the wave set from an explicit
      seed exactly once. Two machines given the same seed compute the same
      surface forever, which is the only reason this can touch unit movement.

   2. REAL UNITS, NOT TASTE. MAP is 3200 m across and terrain.js scales height
      by HSCALE = 118, so one height unit here is 118 m and a two-metre sea is
      2/118 = 0.0169. Wave periods and lengths follow the deep-water relation
      L = 1.56 T^2, so an eight-second swell is about a hundred metres from
      crest to crest - roughly a thirtieth of the battlefield, which is the
      scale at which a wave is something a player can see a ship ride rather
      than a texture that shimmers. The sea-state ladder is the Douglas scale,
      because it already exists, players half-know it, and it gives the
      difficulty axis honest names instead of invented ones.

   3. A FLAT SEA COSTS NOTHING. waterMode 'none' configures a null sea: zero
      displacement, all multipliers exactly 1, and every query short-circuits on
      a single boolean. Land maps must not pay for a system they never use.

   WHAT IT DELIBERATELY DOES NOT DO
   ----------------------------------------------------------------------------
   No buoyancy solver, no wake, no shoreline refraction, no foam. Those are
   rendering and physics work that belongs on top of a surface that exists; this
   is the surface. Shallow water is also not modelled - real waves shorten and
   steepen as they feel the bottom, and faking that without the bathymetry to
   drive it would look worse than leaving it out.
   ============================================================================ */

/* Douglas sea scale. `h` is significant wave height in METRES - the mean of the
   highest third, which is the number mariners actually quote - and `t` the
   dominant period in seconds. Level 9 is not reachable from weather here; a
   phenomenal sea is not a battlefield, it is a cancelled operation. */
const MF_SEA_SCALE = [
  { level: 0, name: 'GLASSY',      h: 0.00, t: 0.0 },
  { level: 1, name: 'RIPPLED',     h: 0.08, t: 2.5 },
  { level: 2, name: 'SMOOTH',      h: 0.30, t: 3.5 },
  { level: 3, name: 'SLIGHT',      h: 0.90, t: 5.0 },
  { level: 4, name: 'MODERATE',    h: 1.80, t: 6.5 },
  { level: 5, name: 'ROUGH',       h: 3.20, t: 8.0 },
  { level: 6, name: 'VERY ROUGH',  h: 5.00, t: 9.5 },
  { level: 7, name: 'HIGH',        h: 7.50, t: 11.0 },
  { level: 8, name: 'VERY HIGH',   h: 11.0, t: 13.0 }
];

/* Height unit conversion. terrain.js owns HSCALE; this file must not silently
   disagree with it, so read it when it is loaded and fall back to the same
   literal when sea.js is used standalone (tests, tools). */
const MF_SEA_HSCALE = (typeof HSCALE === 'number' && HSCALE > 0) ? HSCALE : 118;

/* Four waves. One is a moving sine and reads as a bedsheet; eight costs four
   more sin/cos per vertex per frame on a phone for detail nobody can resolve at
   RTS camera distance. Four gives a dominant swell, a second crossing it, and
   two short chop components that break the repetition. */
const MF_SEA_COMPONENTS = 4;

/* Which sea a map gets before weather touches it. Rivers are moving water but
   they are not a sea - a river map should not roll a destroyer. */
const MF_SEA_BASE_LEVEL = { none: 0, river: 1, ocean: 3 };

/* What weather does to the water. These are increments on the base level, not
   absolute levels: a squall on a river is still a river. Only the modes that
   are actually weather appear - a magma eruption does not raise a swell. */
const MF_SEA_WEATHER_LIFT = {
  calm: 0, vanguard: 1, heat: 0, highland: 0, crater: 0, eruption: 0,
  meteor: 0, spores: 0, spore_bloom: 0, whiteout: 2, flood: 2, isles: 3
};

const MF_SEA = {
  active: false,
  level: 0,
  name: 'GLASSY',
  sigHeight: 0,      // metres
  amplitude: 0,      // height units, crest above mean
  period: 0,         // seconds
  dirX: 1, dirY: 0,  // unit vector the swell travels along
  waves: []
};

/* Same 32-bit LCG the rest of the project uses for seeded content. Kept local
   so configuring the sea cannot perturb any other seeded stream. */
function mfSeaRandom(seed) {
  let state = (seed | 0) || 1;
  return function next() {
    state = (state * 1664525 + 1013904223) | 0;
    return ((state >>> 8) & 0xffffff) / 0x1000000;
  };
}

function mfSeaClampLevel(level) {
  return Math.max(0, Math.min(MF_SEA_SCALE.length - 1, level | 0));
}

/* Configure once per battle. Returns the descriptor so a caller can log or
   display it without a second call. */
function mfSeaConfigure(options) {
  const config = options || {};
  const waterMode = String(config.waterMode || 'none');
  const base = MF_SEA_BASE_LEVEL[waterMode];
  if (!base) {
    MF_SEA.active = false;
    MF_SEA.level = 0;
    MF_SEA.name = 'GLASSY';
    MF_SEA.sigHeight = 0;
    MF_SEA.amplitude = 0;
    MF_SEA.period = 0;
    MF_SEA.dirX = 1; MF_SEA.dirY = 0;
    MF_SEA.waves = [];
    return mfSeaState();
  }

  const lift = MF_SEA_WEATHER_LIFT[String(config.weather || 'calm')] || 0;
  /* Difficulty raises the sea by at most one step. It is a real lever on a
     naval map - a rougher sea is slower and less accurate for BOTH sides - but
     a two-step jump between Easy and Hard would change which units are usable
     at all, and a difficulty setting should not redesign the battle. */
  const difficultyLift = Math.min(1, Math.max(0, Math.round(Number(config.difficulty) || 0)));
  const entry = MF_SEA_SCALE[mfSeaClampLevel(base + lift + difficultyLift)];

  const random = mfSeaRandom(Number(config.seed) || 1);
  const heading = random() * Math.PI * 2;

  MF_SEA.active = entry.level > 0;
  MF_SEA.level = entry.level;
  MF_SEA.name = entry.name;
  MF_SEA.sigHeight = entry.h;
  MF_SEA.period = entry.t;
  MF_SEA.dirX = Math.cos(heading);
  MF_SEA.dirY = Math.sin(heading);
  /* Significant height is crest-to-trough of the highest third of waves. The
     component amplitudes below sum to the MAXIMUM crest this surface can reach,
     not the average one, so the sum is half of Hs rather than a quarter: a five
     metre sea peaks about 2.5 m above still water and troughs the same below,
     which is the definition. Treating it as a quarter - the mean amplitude of a
     random sea - halves every wave and reads as a swell two grades calmer than
     the one the HUD is naming. */
  MF_SEA.amplitude = (entry.h * 0.5) / MF_SEA_HSCALE;
  MF_SEA.waves = [];
  if (!MF_SEA.active) return mfSeaState();

  /* Amplitude falls geometrically across components and wavelength with it, so
     the dominant swell carries the energy and the short components only break
     up its repetition. Spread is +-40 degrees: a real wind sea is directional,
     and waves arriving from every angle average out into noise. */
  let amplitudeShare = 0;
  for (let i = 0; i < MF_SEA_COMPONENTS; i += 1) amplitudeShare += Math.pow(0.55, i);

  for (let i = 0; i < MF_SEA_COMPONENTS; i += 1) {
    const falloff = Math.pow(0.55, i);
    const amplitude = MF_SEA.amplitude * (falloff / amplitudeShare);
    const spread = (random() - 0.5) * (Math.PI * 80 / 180);
    const angle = heading + spread;
    /* L = 1.56 T^2 in deep water. Shorter components carry shorter periods, so
       derive each component's period from the dominant and take its length from
       the same relation rather than inventing two numbers. */
    const period = Math.max(1.2, entry.t * Math.pow(0.62, i));
    const length = 1.56 * period * period;
    const k = (Math.PI * 2) / length;
    MF_SEA.waves.push({
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      amplitude,
      /* The same amplitude in metres. Vertical displacement is a height-unit
         field and horizontal displacement is a distance in the metre-space x/y
         the world is addressed in, so the Gerstner terms cannot share one
         number - multiplying a 0.0169 height by a metre-scale wavenumber would
         push crests sideways by roughly a centimetre and the surface would read
         as a plain sine. */
      amplitudeM: amplitude * MF_SEA_HSCALE,
      k,
      speed: (Math.PI * 2) / period,
      phase: random() * Math.PI * 2,
      /* Gerstner steepness. Q * k * A > 1 makes the surface self-intersect and
         turn inside out, so cap the sum below 1 and let rougher seas use more
         of the budget - that sharpening of crests IS what rough water looks
         like. */
      steep: Math.min(0.9, 0.18 + entry.level * 0.07) / (k * Math.max(amplitude * MF_SEA_HSCALE, 1e-6) * MF_SEA_COMPONENTS)
    });
  }
  return mfSeaState();
}

function mfSeaState() {
  return {
    active: MF_SEA.active,
    level: MF_SEA.level,
    name: MF_SEA.name,
    sigHeight: MF_SEA.sigHeight,
    period: MF_SEA.period,
    amplitude: MF_SEA.amplitude,
    dirX: MF_SEA.dirX,
    dirY: MF_SEA.dirY
  };
}

/* Vertical displacement above the still plane, in height units. This is the
   query the simulation makes, so it stays the cheap one: no horizontal term, no
   allocation, four sines. */
function mfSeaHeight(x, y, t) {
  if (!MF_SEA.active) return 0;
  let z = 0;
  for (let i = 0; i < MF_SEA.waves.length; i += 1) {
    const w = MF_SEA.waves[i];
    z += w.amplitude * Math.sin(w.k * (w.dx * x + w.dy * y) - w.speed * t + w.phase);
  }
  return z;
}

/* Full Gerstner displacement for rendering: crests move against the direction
   of travel, which is what makes them peak and the troughs broaden. Returns the
   offset from the sample point, not an absolute position. */
function mfSeaDisplace(x, y, t, out) {
  const result = out || { x: 0, y: 0, z: 0 };
  result.x = 0; result.y = 0; result.z = 0;
  if (!MF_SEA.active) return result;
  for (let i = 0; i < MF_SEA.waves.length; i += 1) {
    const w = MF_SEA.waves[i];
    const theta = w.k * (w.dx * x + w.dy * y) - w.speed * t + w.phase;
    const horizontal = w.steep * w.amplitudeM * Math.cos(theta);
    result.x += w.dx * horizontal;
    result.y += w.dy * horizontal;
    result.z += w.amplitude * Math.sin(theta);
  }
  return result;
}

/* Surface gradient, analytic rather than sampled: a finite difference would
   need three height queries and would alias badly against the short
   components. Used for shading and for how far a hull heels over. */
function mfSeaSlope(x, y, t, out) {
  const result = out || { gx: 0, gy: 0 };
  result.gx = 0; result.gy = 0;
  if (!MF_SEA.active) return result;
  for (let i = 0; i < MF_SEA.waves.length; i += 1) {
    const w = MF_SEA.waves[i];
    const d = w.amplitude * w.k * Math.cos(w.k * (w.dx * x + w.dy * y) - w.speed * t + w.phase);
    result.gx += w.dx * d;
    result.gy += w.dy * d;
  }
  return result;
}

/* Speed multiplier for a hull on a heading. Driving into the swell is slower
   than running with it - that is the whole reason a naval commander cares which
   way the sea is going - and the penalty scales with sea state so a slight sea
   is a detail and a very rough one is a decision.

   Never returns 0: a unit that cannot move at all reads as a bug, not as
   weather, and a stuck fleet has no counterplay. */
function mfSeaHeadingDrag(dirX, dirY) {
  if (!MF_SEA.active) return 1;
  const length = Math.hypot(dirX, dirY);
  if (!length) return 1;
  /* +1 running with the swell, -1 punching into it. */
  const alignment = ((dirX / length) * MF_SEA.dirX + (dirY / length) * MF_SEA.dirY);
  const severity = MF_SEA.level / 8;
  const base = 1 - severity * 0.28;
  return Math.max(0.45, Math.min(1.08, base + alignment * severity * 0.14));
}

/* A rolling deck is a bad gun platform. Applies to naval weapons only - the
   caller decides that, because this file does not know what a unit is. */
function mfSeaAccuracy() {
  if (!MF_SEA.active) return 1;
  return Math.max(0.55, 1 - (MF_SEA.level / 8) * 0.4);
}

/* Whether a sea this rough should keep small craft in harbour. The threshold is
   the point on the Douglas scale where a real small boat stops being a vessel
   and starts being cargo. */
function mfSeaSmallCraftWarning() {
  return MF_SEA.active && MF_SEA.level >= 5;
}

function mfSeaSummary() {
  if (!MF_SEA.active) return 'SEA GLASSY';
  return `SEA ${MF_SEA.name} · ${MF_SEA.sigHeight.toFixed(1)} M · ${MF_SEA.period.toFixed(0)} S`;
}
