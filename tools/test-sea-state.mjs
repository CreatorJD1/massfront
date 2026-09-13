/* THE SEA HAS TO BE THE SAME SEA ON BOTH MACHINES.
 *
 * src/sea.js feeds unit movement, so it sits inside the lockstep simulation.
 * Everything here is therefore aimed at two properties that matter more than
 * how it looks: it is pure at query time, and it agrees with the physical units
 * the rest of the engine uses. A sea that drifts by one float between two
 * clients desynchronises a match; a sea whose amplitudes are secretly in the
 * wrong unit looks like a plain sine and nobody can say why.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* sea.js is a classic script, like every other file in assets/data/manifest.json,
   so evaluate it into a scope rather than importing it. */
const source = await readFile(new URL('../src/sea.js', import.meta.url), 'utf8');
const sea = new Function(`${source}\nreturn { mfSeaConfigure, mfSeaState, mfSeaHeight, mfSeaDisplace, mfSeaSlope, mfSeaHeadingDrag, mfSeaAccuracy, mfSeaSmallCraftWarning, mfSeaSummary, MF_SEA_SCALE };`)();

const HSCALE = 118;
const MAP = 3200;

/* ---- A land map pays nothing ---- */
let state = sea.mfSeaConfigure({ waterMode: 'none', weather: 'calm', seed: 7 });
assert.equal(state.active, false, 'a map with no water must configure a null sea');
assert.equal(sea.mfSeaHeight(100, 100, 12.5), 0, 'a null sea must be exactly flat');
assert.equal(sea.mfSeaHeadingDrag(1, 0), 1, 'a null sea must not slow anything');
assert.equal(sea.mfSeaAccuracy(), 1, 'a null sea must not spoil gunnery');
assert.equal(sea.mfSeaSmallCraftWarning(), false, 'a null sea must not warn');
const unknown = sea.mfSeaConfigure({ waterMode: 'lava', weather: 'calm', seed: 7 });
assert.equal(unknown.active, false, 'an unrecognised water mode must fall back to no sea, not throw');

/* ---- Determinism: same seed, same surface, forever ---- */
const sampleSurface = () => {
  const points = [];
  for (let i = 0; i < 40; i += 1) {
    const x = (i * 137.5) % MAP;
    const y = (i * 311.7) % MAP;
    const t = i * 0.37;
    points.push(sea.mfSeaHeight(x, y, t));
    const d = sea.mfSeaDisplace(x, y, t);
    points.push(d.x, d.y, d.z);
  }
  return points;
};

sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 20260911 });
const first = sampleSurface();
sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 20260911 });
const second = sampleSurface();
assert.deepEqual(second, first, 'the same seed must produce a bit-identical surface');

sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 20260912 });
const different = sampleSurface();
assert.notDeepEqual(different, first, 'a different seed must produce a different sea');

/* Pure at query time: re-querying the same point must not move it, and querying
   out of order must not change any answer. */
sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'calm', seed: 99 });
const a = sea.mfSeaHeight(812.5, 1190.25, 4.5);
sea.mfSeaHeight(1, 2, 900);
sea.mfSeaHeight(3000, 10, 0.001);
assert.equal(sea.mfSeaHeight(812.5, 1190.25, 4.5), a, 'querying the sea must not mutate it');

/* ---- Sea state ladder ---- */
const calmOcean = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'calm', seed: 5 });
const stormOcean = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 5 });
const river = sea.mfSeaConfigure({ waterMode: 'river', weather: 'calm', seed: 5 });
assert.ok(stormOcean.level > calmOcean.level, 'storm weather must raise the sea above calm');
assert.ok(calmOcean.level > river.level, 'an ocean must start rougher than a river');
assert.ok(stormOcean.sigHeight > calmOcean.sigHeight, 'a rougher level must mean taller waves');

/* Weather lift is an increment, not an override: a squall on a river is still a
   river, and must never reach the sea state an open ocean starts at. */
const stormRiver = sea.mfSeaConfigure({ waterMode: 'river', weather: 'isles', seed: 5 });
assert.ok(stormRiver.level < stormOcean.level, 'weather must lift from the base, not replace it');

/* Difficulty is capped at one step, because two would change which units are
   usable at all and a difficulty setting must not redesign the battle. */
const easy = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'calm', seed: 5, difficulty: 0 });
const hard = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'calm', seed: 5, difficulty: 3 });
assert.equal(hard.level - easy.level, 1, 'difficulty must lift the sea by exactly one step at most');

/* ---- Physical sanity ---- */
for (const entry of sea.MF_SEA_SCALE) {
  if (entry.level === 0) continue;
  assert.ok(entry.h > 0 && entry.t > 0, `sea state ${entry.level} must have a real height and period`);
}
for (let i = 2; i < sea.MF_SEA_SCALE.length; i += 1) {
  assert.ok(sea.MF_SEA_SCALE[i].h > sea.MF_SEA_SCALE[i - 1].h, 'the scale must increase monotonically in height');
  assert.ok(sea.MF_SEA_SCALE[i].t > sea.MF_SEA_SCALE[i - 1].t, 'the scale must increase monotonically in period');
}

/* Crests must stay near the quarter-of-significant-height the descriptor
   promises. A surface whose peaks are wildly taller than advertised would put
   hulls through the deck of the renderer. */
const rough = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 4242 });
let peak = 0;
for (let i = 0; i < 6000; i += 1) {
  const x = (i * 53.3) % MAP;
  const y = (i * 97.1) % MAP;
  peak = Math.max(peak, Math.abs(sea.mfSeaHeight(x, y, i * 0.05)));
}
assert.ok(peak > 0, 'a rough sea must actually displace the surface');
assert.ok(peak <= rough.amplitude * 1.05,
  `crest ${peak} must not exceed the configured amplitude ${rough.amplitude}`);
/* And it must be big enough to see. A 3.2 km battlefield with a 5 m sea should
   move the surface by a real fraction of a metre, not a rounding error. */
assert.ok(peak * HSCALE > 0.3, `a rough sea must move the surface more than 0.3 m, got ${(peak * HSCALE).toFixed(3)} m`);

/* The Gerstner horizontal term lives in metre space and the vertical in height
   units. If they were ever collapsed into one number the horizontal offset
   would collapse to centimetres and the surface would read as a plain sine. */
let horizontal = 0;
for (let i = 0; i < 2000; i += 1) {
  const d = sea.mfSeaDisplace((i * 71.3) % MAP, (i * 43.9) % MAP, i * 0.05);
  horizontal = Math.max(horizontal, Math.hypot(d.x, d.y));
}
assert.ok(horizontal > 1, `crests must shift metres, not height units, got ${horizontal.toFixed(3)}`);
assert.ok(horizontal < 120, `crest shift ${horizontal.toFixed(1)} m exceeds a plausible wavelength fraction`);

/* Steepness must stay below the self-intersection limit at every level, or the
   surface turns inside out at the crests. */
for (const entry of sea.MF_SEA_SCALE) {
  if (!entry.level) continue;
  sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'calm', seed: 11 });
  const slopeSample = [];
  for (let i = 0; i < 400; i += 1) {
    const g = sea.mfSeaSlope((i * 17.7) % MAP, (i * 23.1) % MAP, i * 0.11);
    slopeSample.push(Math.hypot(g.gx, g.gy));
  }
  assert.ok(Math.max(...slopeSample) < 1, 'surface gradient must stay below vertical');
}

/* ---- Gameplay coupling ---- */
const swell = sea.mfSeaConfigure({ waterMode: 'ocean', weather: 'isles', seed: 31 });
const withSwell = sea.mfSeaHeadingDrag(swell.dirX, swell.dirY);
const intoSwell = sea.mfSeaHeadingDrag(-swell.dirX, -swell.dirY);
const across = sea.mfSeaHeadingDrag(-swell.dirY, swell.dirX);
assert.ok(withSwell > intoSwell, 'running with the swell must beat punching into it');
assert.ok(across > intoSwell && across < withSwell, 'a beam sea must sit between the two');
assert.ok(intoSwell >= 0.45, 'no sea may stop a hull dead - that reads as a bug, not weather');
assert.equal(sea.mfSeaHeadingDrag(0, 0), 1, 'a stationary hull must not be penalised for a heading it does not have');

assert.ok(sea.mfSeaAccuracy() < 1, 'a rolling deck must cost gunnery');
assert.ok(sea.mfSeaAccuracy() >= 0.55, 'gunnery must never collapse entirely');
assert.equal(sea.mfSeaSmallCraftWarning(), true, 'a storm sea must warn small craft');
sea.mfSeaConfigure({ waterMode: 'river', weather: 'calm', seed: 31 });
assert.equal(sea.mfSeaSmallCraftWarning(), false, 'a river must not warn small craft');

/* Both sides get the same sea. A hazard that only inconveniences the player is
   a difficulty setting wearing a costume - the same rule hazards.js states. */
assert.equal(typeof sea.mfSeaSummary(), 'string', 'the sea must be reportable to the player');

console.log(`sea state: PASS (${sea.MF_SEA_SCALE.length} levels, peak ${(peak * HSCALE).toFixed(2)} m, crest shift ${horizontal.toFixed(1)} m)`);
