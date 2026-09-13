/* MAPGEN RULE BOOK — declarative, measured, banded.
   ===========================================================================
   The premise of the whole authoring system: "this map looks good" is not a
   judgement an agent gets to make. Every rule is a FUNCTION RETURNING A NUMBER
   and a BAND that number must fall inside. A map is accepted because its
   measurements landed in their bands, and the scorecard says which and by how
   much. That is the same discipline the rest of this repo already applies to
   perf evidence and interface captures.

   TWO TIERS, because they cost three orders of magnitude apart:

     T1  drawMapPreview() -> window.__mfPreviewField, a 256^2 heightfield from
         the REAL pipeline (same srand(def.seed), same five octaves, same
         mapMod, same terraShape at work=128) in ~25 ms. Terrain only: it is
         called with depPts=[] and never runs planDistricts/setupDeposits.
         Use it to screen thousands of seeds.

     T2  full buildTerrain() at TS=2048/work=512, ~944 ms, plus planDistricts,
         setupDeposits and the PASS/PSLOPE fields. Only the T1 survivors are
         worth this. Adds reachability, stranded deposits, site placement.

   T1 CANNOT see deposits, sites, spawns or passability. A T1 pass is a
   shortlist, never an acceptance — saying otherwise would be the same false
   green the perf-evidence ledger was written to stop.

   Bands are opening positions, not truth. Re-derive them from a measured
   population of the existing 48 sites before trusting them (see
   `screen-seeds.mjs --baseline`). */

/* Engine constants — must track the runtime.
     WATER_H  src/engine/gl.js:3638
     HSCALE   src/engine/terrain.js:32   (height units -> world units)
     MAP      src/engine/gl.js:31 */
export const ENGINE = { WATER_H: 0.335, BEACH_H: 0.375, HSCALE: 118, MAP: 3200 };

/* Every rule:
     id      stable key, used in scorecards
     tier    1 = preview field only, 2 = needs a full build
     unit    what the number means, for the report
     band    [lo, hi] inclusive; null on either side = unbounded
     hard    true  -> outside the band REJECTS the seed
             false -> outside the band only costs score
     why     the design reason. If a rule cannot state why, it should not exist. */
export const RULES = [
  {
    id: 'land-fraction', tier: 1, unit: '% of theatre above water', band: [0.55, 0.88], hard: true,
    why: 'Below ~55% the theatre stops being a battlefield and becomes an archipelago by accident. ' +
         'Above ~88% water has stopped contributing shape at all.'
  },
  {
    id: 'relief-spread', tier: 1, unit: 'fraction of land outside the two modal height bins', band: [0.45, null], hard: true,
    why: 'THE measured defect. The engine notes 65-70% of every map sits inside two adjacent 0.1 ' +
         'height bins — roughly a 24 world-unit band — which is why maps read flat despite having ' +
         'ridges. This makes that distribution a gate rather than a known complaint.'
  },
  {
    id: 'relief-range', tier: 1, unit: 'world units, dry max-min', band: [55, null], hard: false,
    why: 'Absolute vertical range. Weak on its own (one spike passes it), which is exactly why ' +
         'relief-spread is the hard rule and this one only scores.'
  },
  {
    id: 'coast-complexity', tier: 1, unit: 'shoreline cells / sqrt(land cells)', band: [1.6, 6.0], hard: false,
    why: 'Straight coasts read as a bathtub; fractal mush reads as noise. This is the band between.'
  },
  {
    id: 'highland-fraction', tier: 1, unit: '% of land in the upper relief third', band: [0.08, 0.42], hard: false,
    why: 'Too little and ridgelines never became terrain; too much and the playable floor vanishes.'
  },
  {
    id: 'centre-openness', tier: 1, unit: 'fraction of the central 40% that is dry', band: [0.60, null], hard: true,
    why: 'The centre is where lanes meet and where every archetype puts its contested ground. ' +
         'A drowned or walled centre silently removes the fight the map was designed around.'
  },
  {
    id: 'edge-dryness', tier: 1, unit: 'fraction of the outer ring that is dry', band: [null, 0.92], hard: false,
    why: 'Some water touching the boundary keeps the theatre from reading as a tabletop. ' +
         'Soft, because the superellipse already handles the silhouette.'
  }
];

export const T1_RULES = RULES.filter(r => r.tier === 1);

/* Scoring. A hard miss is fatal; a soft miss costs distance-outside-band,
   normalised by the band width so wide and narrow bands cost comparably. */
export function score(measurements) {
  const rows = [];
  let fatal = 0, penalty = 0;
  for (const rule of RULES) {
    const v = measurements[rule.id];
    if (v === undefined || v === null || !Number.isFinite(v)) continue;
    const [lo, hi] = rule.band;
    const under = lo !== null && v < lo;
    const over = hi !== null && v > hi;
    const ok = !under && !over;
    let miss = 0;
    if (!ok) {
      const width = (lo !== null && hi !== null) ? (hi - lo) : Math.max(Math.abs(lo ?? hi), 1e-6);
      miss = (under ? lo - v : v - hi) / width;
      if (rule.hard) fatal++; else penalty += miss;
    }
    rows.push({ id: rule.id, tier: rule.tier, value: v, band: rule.band, ok, hard: rule.hard, miss: +miss.toFixed(4) });
  }
  return { rows, fatal, penalty: +penalty.toFixed(4), accepted: fatal === 0 };
}

export function formatScorecard(seed, result) {
  const mark = r => (r.ok ? ' ok ' : r.hard ? 'FAIL' : 'warn');
  const lines = [`seed ${seed}  ${result.accepted ? 'ACCEPT' : 'REJECT'}  fatal=${result.fatal} penalty=${result.penalty}`];
  for (const r of result.rows) {
    const band = `[${r.band[0] ?? '-'}, ${r.band[1] ?? '-'}]`;
    lines.push(`  ${mark(r)}  ${r.id.padEnd(18)} ${String(r.value.toFixed(3)).padStart(8)}  ${band}`);
  }
  return lines.join('\n');
}
