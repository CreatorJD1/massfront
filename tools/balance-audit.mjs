/* Measure, don't guess (AGENTS.md).

   Evaluates the real TYPES/ARM/WKM tables out of src/game/sim.js and prints
   mass efficiency per unit, plus the effective damage each unit deals into
   each armour class. Two things this is for:

     1. Tier payoff. A tier-3 body that is worse per mass than the tier-2 it
        is supposed to graduate from is a design bug, not a tradeoff — the
        player pays tech time AND mass to get less army.
     2. Role/stat mismatch. `cat` drives the intel panel copy and the class
        ability, so a unit labelled anti-tank whose weapon class is bad into
        heavy armour teaches the player something false.

   Run: node tools/balance-audit.mjs [--csv]
*/
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/game/sim.js'), 'utf8');

/* Pull the four literals out of the source and eval them in isolation. Reading
   them rather than duplicating them is the whole point: a copy here would
   silently stop matching the game the first time someone edits a stat. */
const grab = (name, open, close) => {
  const at = src.indexOf('const ' + name + '=');
  if (at < 0) throw new Error('cannot find ' + name);
  let i = src.indexOf(open, at), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) { end = j + 1; break; }
  }
  return src.slice(i, end);
};
/* Parenthesised: a bare `{...}` at the head of an eval is parsed as a block,
   not an object literal, and dies on the first `key:`. */
const TYPES = eval('(' + grab('TYPES', '[', ']') + ')');
const ARM = eval('(' + grab('ARM', '[', ']') + ')');
const WKM = eval('(' + grab('WKM', '{', '}') + ')');
const ARM_NM = ['LIGHT', 'MED', 'HEAVY'];

if (TYPES.length !== ARM.length)
  console.log('!! ARM has ' + ARM.length + ' entries for ' + TYPES.length + ' TYPES\n');

/* Raw dps/mass says artillery is worthless, which is wrong — it ignores the
   two things artillery is bought for. Fold them both in:

   SPLASH. A shell landing in a formation hits everything inside `aoe`, so the
   damage a unit actually applies scales with the area it covers. Units pack at
   roughly one body per 28px here (`size` 14-32, `r` 5-12), and sim.js applies
   a 1-0.5*(d/aoe) falloff, so the average target takes ~0.75 of nominal.
   Capped at 6 because a real formation is not infinitely deep.

   RANGE. Outranging the reply means firing for free. Weighted mildly (a 400px
   gun is not 4x a 100px gun) and only as a tiebreaker on the dominance check —
   it is a positioning advantage, not raw output. */
const splashTargets = aoe => aoe > 0 ? Math.min(6, 1 + 0.75 * (aoe / 28) ** 2) : 1;

const rows = TYPES.map((T, i) => {
  const dps = T.cool > 0 && T.dmg > 0 ? T.dmg / T.cool : 0;
  const mass = T.cm || 0;
  const wk = WKM[T.wk] || WKM.n;
  const tgts = splashTargets(T.aoe || 0);
  const eff = dps * tgts;
  return {
    i, name: T.name, tier: T.tier, cat: T.cat || '-', wk: T.wk, arm: ARM_NM[ARM[i]] || '?',
    mass, hp: T.hp, dps: +dps.toFixed(1), rng: T.rng, aoe: T.aoe || 0, spd: T.spd,
    tgts: +tgts.toFixed(2), effDps: +eff.toFixed(1),
    dpsPerMass: mass ? +(dps / mass).toFixed(3) : 0,
    effPerMass: mass ? +(eff / mass).toFixed(3) : 0,
    hpPerMass: mass ? +(T.hp / mass).toFixed(2) : 0,
    /* Effective DPS into each armour class — the number that actually decides
       a fight, and the one no stat card shows. */
    vsL: +(dps * wk[0]).toFixed(1), vsM: +(dps * wk[1]).toFixed(1), vsH: +(dps * wk[2]).toFixed(1)
  };
});

if (process.argv.includes('--csv')) {
  console.log(Object.keys(rows[0]).join(','));
  for (const r of rows) console.log(Object.values(r).join(','));
  process.exit(0);
}

const buildable = rows.filter(r => r.mass > 0);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const num = (s, n) => String(s).padStart(n);

console.log('BUILDABLE UNITS — sorted by tier then mass\n');
console.log(pad('unit', 15) + num('T', 2) + ' ' + pad('cat', 5) + pad('wk', 3) + pad('arm', 7) +
  num('mass', 5) + num('hp', 6) + num('rng', 5) + num('aoe', 4) + num('dps', 6) + num('eff', 6) +
  num('eff/m', 7) + num('hp/m', 7) + num('vsL', 6) + num('vsM', 6) + num('vsH', 6));
console.log('-'.repeat(102));
for (const r of buildable.slice().sort((a, b) => a.tier - b.tier || a.mass - b.mass))
  console.log(pad(r.name, 15) + num(r.tier, 2) + ' ' + pad(r.cat, 5) + pad(r.wk, 3) + pad(r.arm, 7) +
    num(r.mass, 5) + num(r.hp, 6) + num(r.rng, 5) + num(r.aoe, 4) + num(r.dps, 6) + num(r.effDps, 6) +
    num(r.effPerMass, 7) + num(r.hpPerMass, 7) + num(r.vsL, 6) + num(r.vsM, 6) + num(r.vsH, 6));

/* Tier payoff: the median per-mass rate at each tier. A higher tier that does
   not clear the tier below on at least one axis has no reason to exist. */
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(3) : 0; };
console.log('\nTIER MEDIANS (armed units only)');
for (const t of [1, 2, 3]) {
  const g = buildable.filter(r => r.tier === t && r.dps > 0);
  if (!g.length) continue;
  console.log('  tier ' + t + '  n=' + num(g.length, 2) +
    '   eff/mass ' + num(med(g.map(r => r.effPerMass)), 6) +
    '   hp/mass ' + num(med(g.map(r => r.hpPerMass)), 6) +
    '   median rng ' + num(med(g.map(r => r.rng)), 5));
}

/* Role honesty. `cat:'at'` promises the unit kills heavy armour; `cat:'aoe'`
   promises it clears crowds. Flag anything whose weapon class contradicts the
   label the intel panel prints. */
console.log('\nROLE / STAT MISMATCH');
let flagged = 0;
for (const r of buildable) {
  const w = WKM[r.wk] || WKM.n;
  if (r.cat === 'at' && w[2] < 1.25)
    console.log('  ' + pad(r.name, 15) + 'labelled ANTI-TANK but ' + r.wk + ' does x' + w[2] + ' into heavy'), flagged++;
  if (r.cat === 'aa' && r.dps === 0) console.log('  ' + pad(r.name, 15) + 'labelled AA with no weapon'), flagged++;
  if (r.cat === 'aoe' && r.aoe < 30)
    console.log('  ' + pad(r.name, 15) + 'labelled AOE with splash radius ' + r.aoe), flagged++;
}
if (!flagged) console.log('  none');

/* A dead-end upgrade: a higher tier beaten by a LOWER tier on splash-adjusted
   output, durability AND range at once. All three, because losing one of them
   is a tradeoff — losing all three means the higher tier is strictly a worse
   purchase and the tech that unlocked it was wasted. Restricted to same-role
   pairs so an artillery piece is never judged against a brawler. */
console.log('\nDEAD-END UPGRADES  (higher tier beaten on output AND durability AND range)');
let dom = 0;
for (const hi of buildable) {
  if (hi.tier < 2 || !hi.dps) continue;
  for (const lo of buildable) {
    if (lo.tier >= hi.tier || lo.cat !== hi.cat || !lo.dps) continue;
    if (lo.effPerMass > hi.effPerMass && lo.hpPerMass > hi.hpPerMass && lo.rng >= hi.rng) {
      console.log('  ' + pad(hi.name, 15) + 'T' + hi.tier + ' loses to ' + lo.name + ' T' + lo.tier +
        '  eff/m ' + hi.effPerMass + ' vs ' + lo.effPerMass +
        ', hp/m ' + hi.hpPerMass + ' vs ' + lo.hpPerMass +
        ', rng ' + hi.rng + ' vs ' + lo.rng);
      dom++;
    }
  }
}
if (!dom) console.log('  none');

/* An armour class nothing can efficiently hurt is a wall; one everything hurts
   is a trap. Count how many buildable weapons clear x1.0 into each class. */
console.log('\nCOUNTER COVERAGE  (weapons at >x1.0 into each armour class)');
for (let c = 0; c < 3; c++) {
  const good = buildable.filter(r => r.dps > 0 && (WKM[r.wk] || WKM.n)[c] > 1.0);
  console.log('  vs ' + pad(ARM_NM[c], 6) + num(good.length, 2) + ' / ' +
    buildable.filter(r => r.dps > 0).length + '   ' + good.map(r => r.name).join(', '));
}
