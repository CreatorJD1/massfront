/* THE RANK THE PLAYER SEES MUST BE ONE RANK.
 *
 * src/game/meta.js owns RANKS as a classic script. The UGA module is its own
 * document and cannot import it, so modules/space_exploration/src/domain/
 * account_ledger.js mirrors the table in order to render the profile bar aboard
 * NEXUS-VII. A copied table is only safe while something compares it, because
 * the failure mode is silent and personal: the main menu calls you a Sergeant
 * and your own ship calls you a Corporal, and nothing errors.
 *
 * This reads RANKS out of meta.js as text - importing it would need the whole
 * classic global environment - and compares it element by element against the
 * module's ACCOUNT_RANKS. It also re-derives metaRankIdx() and metaRankProg()
 * semantics against accountRank() across the thresholds and their boundaries,
 * so a change to the *shape* of the progression is caught as well as a change
 * to its numbers.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACCOUNT_RANKS, accountRank } from '../modules/space_exploration/src/domain/account_ledger.js';

const metaSource = await readFile(new URL('../src/game/meta.js', import.meta.url), 'utf8');

const tableMatch = /const RANKS\s*=\s*\[([\s\S]*?)\];/.exec(metaSource);
assert.ok(tableMatch, 'src/game/meta.js must still declare a RANKS table');

const classicRanks = [...tableMatch[1].matchAll(/\{\s*nm:\s*'([^']+)'\s*,\s*em:\s*'([^']+)'\s*,\s*xp:\s*(\d+)\s*\}/g)]
  .map(([, nm, em, xp]) => ({ nm, em, xp: Number(xp) }));

assert.ok(classicRanks.length >= 2, 'RANKS parsed to fewer than two entries; the parser is wrong, not the table');
assert.equal(
  classicRanks.length,
  ACCOUNT_RANKS.length,
  `rank count drifted: meta.js has ${classicRanks.length}, the UGA mirror has ${ACCOUNT_RANKS.length}`
);

for (const [index, classic] of classicRanks.entries()) {
  const mirrored = ACCOUNT_RANKS[index];
  assert.equal(mirrored.nm, classic.nm, `rank ${index + 1} name drifted: ${mirrored.nm} vs ${classic.nm}`);
  assert.equal(mirrored.em, classic.em, `rank ${index + 1} (${classic.nm}) glyph drifted`);
  assert.equal(mirrored.xp, classic.xp, `rank ${index + 1} (${classic.nm}) threshold drifted: ${mirrored.xp} vs ${classic.xp}`);
}

/* metaRankIdx(): the highest rank whose threshold META.xp has met.
   metaRankProg(): position between that threshold and the next, 1 at the top. */
const classicIndex = xp => {
  let r = 0;
  for (let i = 0; i < classicRanks.length; i += 1) if (xp >= classicRanks[i].xp) r = i;
  return r;
};
const classicProgress = xp => {
  const r = classicIndex(xp);
  if (r >= classicRanks.length - 1) return 1;
  return (xp - classicRanks[r].xp) / (classicRanks[r + 1].xp - classicRanks[r].xp);
};

/* Every threshold, one either side of it, and past the top. Boundaries are
   where an off-by-one in either direction actually shows up. */
const probes = new Set([0, -50, 25_000]);
for (const rank of classicRanks) { probes.add(rank.xp - 1); probes.add(rank.xp); probes.add(rank.xp + 1); }

for (const xp of [...probes].sort((a, b) => a - b)) {
  const derived = accountRank(xp);
  const expectedIndex = classicIndex(Math.max(0, xp));
  assert.equal(derived.index, expectedIndex, `rank index disagrees at ${xp} XP`);
  assert.equal(derived.level, expectedIndex + 1, `displayed level must be the one-based rank at ${xp} XP`);
  assert.equal(derived.name, classicRanks[expectedIndex].nm, `rank name disagrees at ${xp} XP`);
  assert.equal(
    Number(derived.progress.toFixed(6)),
    Number(Math.max(0, Math.min(1, classicProgress(Math.max(0, xp)))).toFixed(6)),
    `rank progress disagrees at ${xp} XP`
  );
  const atTop = expectedIndex === classicRanks.length - 1;
  assert.equal(derived.max, atTop, `MAX RANK state disagrees at ${xp} XP`);
  assert.equal(derived.nextXp, atTop ? null : classicRanks[expectedIndex + 1].xp, `next threshold disagrees at ${xp} XP`);
}

/* Negative and non-numeric XP must not produce a rank below Recruit or NaN
   progress; a corrupt ledger record should read as a fresh commander. */
for (const bad of [undefined, null, NaN, '', 'seventeen', -1]) {
  const derived = accountRank(bad);
  assert.equal(derived.index, 0, `corrupt XP ${String(bad)} must read as the first rank`);
  assert.ok(Number.isFinite(derived.progress), `corrupt XP ${String(bad)} produced non-finite progress`);
}

console.log(`UGA rank mirror: PASS (${classicRanks.length} ranks, ${probes.size} XP probes)`);
