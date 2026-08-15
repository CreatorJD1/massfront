# BALANCE REVIEW — 2026-08-14

Measured pass over units, structures, upgrades, rosters and both research trees.
Per `AGENTS.md`, every number here is evaluated from the real source, not
estimated. Nothing was nerfed on a hunch: the recommendations are separated into
what was applied (one text correction) and what is documented for a decision.

Source of truth: `node tools/extract-design-db.mjs` → `design/design.json`
(36 units, 29 structures, 17 upgrade paths, 25 account research nodes,
9 weapon classes), plus the combat tables that live in `src/game/sim.js` and the
roster tables in `src/factiondoctrine.js`.

`python3` is not on PATH on this machine, so `tools/build-design-db.py` was not
run. It only reformats the same JSON into SQLite/XLSX/HTML, so no measurement
depends on it.

---

## 1. Method

**Effective HP.** Armour is not a damage-reduction stat; it selects a column in
`WKM` (`sim.js:1004`). A unit's EHP is therefore its HP divided by the mean
incoming multiplier across the six weapon classes that actually appear on units
(p, b, m, e, g, f). LIGHT suffers 1.22× on average, MEDIUM 1.00×, HEAVY 0.96×.

**Area damage.** `projImpact` (`sim.js:4211`) has **no separate direct-hit
path**: when `aoe > 0` every victim including the aimed one goes through the
same falloff loop, `fall = 1 - 0.5·d/aoe`. The aimed target sits at d≈0 and takes
full damage; the extra bodies average `1 - 0.5·(2/3) = 0.667`. Crowd scaling is
`hm = 1 + min(1.6, hz·(crowd-2)·0.055)` with `hz` of 1.0 for explosive and 1.35
for incendiary. Bodies in the blast are estimated as `π·aoe²/spacing²` at a
formation spacing of 26. Both a tighter (22) and looser (34) spacing were
computed; they move the area units together and change no ranking below.

**Cost.** `ce/cm` sits between 3.85 and 5.00 for every buildable card, so mass
is the ranking currency. A blended `cost = cm + ce/4` is used throughout; using
mass alone reorders nothing.

**Combat power.** `sqrt(EHP × dps)`, the standard square-law proxy. Efficiency
is power ÷ cost.

**Limits worth stating.** This does not model pathing, target acquisition,
kiting, minimum ranges in a real fight, veterancy, or the Bulwark shield. It
also cannot see the player faction's economy multipliers through the design DB,
because `FACTIONS` in `ai.js` holds only the three AI factions — Nova's doctrine
lives in `factiondoctrine.js` and was read directly.

---

## 2. What measurement says is NOT broken

Recording the negatives matters as much as the outliers, because each was a
plausible suspicion the numbers cleared.

| Suspicion | Verdict |
|---|---|
| A Mk3 weaker than its Mk2 | **None.** All 17 upgrade paths are monotonic in damage, range and HP. |
| A Mk3 that is a bad marginal buy | **Consistent, not broken.** Damage-multiple ÷ cost-multiple across all 11 defences ranges only 0.518 (bunker) to 0.664 (bastion). Every Mk3 is ~3× the cost for ~1.75–2.4× damage and 1.725× HP. That is a deliberate, uniform "upgrades buy footprint, not efficiency" curve. |
| A unit strictly dominated by a cheaper one in its own role | **None.** No card is cheaper-and-better on HP, DPS, range and speed simultaneously. |
| Rail Battery is redundant next to Mining Laser | **No — it is the energy answer.** Mining Laser wins on cost (480 vs 520) and anti-heavy DPS (169.7 vs 130.8), but burns 37.6 energy/s against the Rail's 12.1. Per point of anti-heavy damage the Rail is **2.4× more energy-efficient** (10.84 vs 4.52). Two different bills, both payable. |
| Faction doctrine text overstates the bonuses | **All four are accurate.** Nova −6% cost / +12% build, Legion +18% after 12 s, Syndicate +18% node and salvage, Brood −14% cost / +18% build all match `factiondoctrine.js` exactly. |
| The three Brood research nodes grant nothing | **True but honest.** `mfFactionTechBroodGate()` returns false and the `devBuy` takeover refuses the purchase with a toast, so no player can spend materials on them. They are labelled AI DOSSIER. Not a defect. |
| `contain` (+50% Research Complex shield) is a dead node | **Narrow, but real.** It buys 450 shield on one building against `hardpoint`'s +600 HP on every building for the same price — but the techlab shield **regenerates at 45/s** after a 6 s no-damage window, so under repeated pressure it out-performs flat HP. Defensible sustain-vs-burst choice. |

---

## 3. Outlier table

Efficiency is `sqrt(EHP × dps) / cost`, area-credited at spacing 26. Rank is out
of the 22 buildable combat units.

| # | Thing | Measured | Severity | Owner file | Action |
|---|---|---|---|---|---|
| 1 | `ARM` table is 3 entries shorter than `TYPES` | 33 vs 36. Atlas Skycrane (1850 HP), Massflesh Carrier (2850 HP), Massflesh Ascendant (2850 HP) all fall to `ARM[i]\|\|0` = LIGHT | **High** | `sim.js:1126` | Document — contended |
| 2 | Basilisk is a T3 that loses to the T2 it replaces | eff 0.575, rank 19/22 — below the T1 Rhino (0.867) | **High** | `sim.js` TYPES | Document — contended |
| 3 | Legion cannot build the TITAN | Same 820-cost Titan Gate returns 27% of the EHP and 50% of the single-target DPS for other factions' | **High** | `factiondoctrine.js` | **Applied** — `tgate:[8,26]`. Doctrine flavor already named the TITAN; no written forbid. |
| 4 | Syndicate ground range ceiling is 210 | Nova/Legion 400, Brood 265. A Mk3 Sentinel (238) out-ranges every Syndicate ground unit | **High** | `factiondoctrine.js:55` | Document — design call |
| 5 | Bombard cannot siege the batteries it exists to siege | 400 range vs Missile Bastion 430, Bastion 520, Stormcaller 520. At Mk3 it out-ranges **nothing** | **High** | `sim.js:62` | Document; codex text **fixed** |
| 6 | Plasma Charger's `aoe` 72 is a defence outlier | ~24 bodies per blast vs Bastion's 11. 1.947 anti-heavy DPS per cost — 4.1× the Sentinel, 7.8× the Rail | **Medium** | `sim.js:1058` | Document |
| 7 | The Concussion Mortar fires free at 520 range | Every other defence past 215 range pays 12–38 energy/s; the joint-longest-ranged one pays 0 | **Medium** | `sim.js:1049` | Document |
| 8 | AI faction build `bias` table is never read | Defined for all three AI factions; zero consumers. Production identity is hardcoded at `ai.js:672-691` and disagrees with it | **Medium** | `ai.js:55,68,83` | Document — contended |
| 9 | Bombard is the least efficient buildable unit | eff 0.891 area-credited, 0.301 single-target — last of 22 on both | **Medium** | `sim.js:62` | Document |
| 10 | Nova has the widest roster *and* the cost discount | 26 cards at −6%/+12%; Legion 20 and Syndicate 19 at list price | **Low** | `factiondoctrine.js` | Document — likely deliberate |
| 11 | Basilisk is dead data in three `fac` arsenal sets | Index 26 is never in the factory base list (`hud.js:3063`, `ai.js:706`), so the entry filters nothing | **Low** | `factiondoctrine.js:47,51,55` | Document — no-op either way |
| 12 | `optics` is an id in two independent research trees | `RESEARCH` in `sim.js:1202` and `DEVTREE` in `develop.js:90` | **Low** | — | Note only; separate stores, no collision |

---

## 4. The findings in detail

### 4.1 The `ARM` table has drifted from `TYPES` (highest priority)

`sim.js:1126` carries the comment *"Must stay the same length as TYPES — the new
entries continue the list in order."* It has 33 entries; `TYPES` has 36.

`dmgMul` resolves armour as `ARM[tIdx] || 0`, so the three missing units silently
become **LIGHT**:

| # | Unit | HP | Treated as | Consequence |
|---|---|---|---|---|
| 33 | Atlas Skycrane | 1850 | LIGHT | kinetic ×1.55, claws ×1.60, incendiary ×1.75 |
| 34 | Massflesh Carrier | 2850 | LIGHT | as above |
| 35 | Massflesh Ascendant | 2850 | LIGHT | as above |

This inverts the counter triangle on the three heaviest non-hero bodies in the
game. The designated anti-heavy weapons are the *worst* choice against a 2850 HP
breakthrough carrier — gauss lands at ×0.45 and beam at ×0.60 — while a Striker's
rifle lands at ×1.55 and a Pyro's flame at ×1.75.

**Recommended fix** (one line, `sim.js`, contended so not applied):

```js
const ARM=[0,1,2,1,2, 0,1,1,2, 1,1,2, 0,2, 1,2, 1,0, 1, 0,
           1,1,1,1,0,0,2,2,
           2,1,2,0,0,
           1,2,2];   // Atlas Skycrane, Massflesh Carrier, Massflesh Ascendant
```

MEDIUM for the Skycrane (an air transport, in line with the Raptor's frame) and
HEAVY for both Massflesh states, which is what 2850 HP and the "breakthrough
carrier" role describe. A guard such as
`console.assert(ARM.length===TYPES.length)` would keep the stated invariant from
drifting again.

### 4.2 Basilisk is a Tier 3 experimental that loses to the Tier 2 tank it replaces

At equal spend (523 blended per Basilisk, 127 per Goliath, so 4.13 Goliaths):

| | 1 Basilisk | 4.13 Goliaths |
|---|---|---|
| HP | 1100 | 1859 |
| EHP | 1148 | 1940 |
| DPS, single target | 46.2 | 108.4 |
| DPS, crowd | 72.6 | 108.4 |
| Range | 190 | 104 |
| Speed | 18 | 22 |

The Basilisk delivers 59% of the HP, 43% of the single-target damage and 67% of
the crowd damage of the Tier 2 tanks it costs. It buys range (190 vs 104) and
one body instead of four. Its efficiency of 0.575 ranks 19th of 22 and sits
below the Tier 1 Rhino's 0.867. Area credit does not rescue it — at `aoe` 20 the
blast holds fewer than two bodies.

The contrast with the other Tier 3 experimental is stark. The TITAN scores 1.241,
the highest in the game, and at equal spend beats 3.44 Basilisks with 14609 EHP
against 3954 and 320 DPS against 159. **The two experimentals differ by 2.2× in
cost-efficiency.**

Recommended, not applied (TYPES lives in `sim.js`): the smallest change that
fixes the inversion is HP 1100 → 1650 and cooldown 2.6 → 2.1, which lifts the
Basilisk to roughly Goliath-parity per resource while keeping its range and
single-body identity. A cost cut to 200m/820e reaches the same place if the
stat line is meant to stay.

### 4.3 Legion's Titan Gate is worth a quarter of everyone else's

The Titan Gate costs 420m/1600e (820 blended) for every faction. What it unlocks
does not:

| Faction | `tgate` roster | Unit efficiency |
|---|---|---|
| Nova | TITAN + Basilisk | 1.241 / 0.575 |
| Syndicate | TITAN | 1.241 |
| Brood | TITAN | 1.241 |
| **Legion** | **Basilisk only** | **0.575** |

Per 1800 of blended spend through the gate, Legion fields 3.44 Basilisks — 3954
EHP and 159 single-target DPS — while every other faction fields one TITAN at
14609 EHP and 320 DPS. **Legion gets 27% of the EHP and 50% of the damage for
the same building and the same money.**

Legion's compensating doctrine is +18% damage after 12 s of continuous
engagement. On a Basilisk that is +8.3 DPS. It does not close a 3.7× EHP gap.

Product call 2026-08-14: doctrine does **not** forbid chassis 8. `factext.js`
already names the Legion TITAN (Ascendant) and says the Ascension Gate "Builds
TITANs". `FAC_ARSENAL.legion.tgate` is now `[8,26]`, matching Nova. Basilisk
`TYPES` numbers were left alone.

### 4.4 The Syndicate has no answer to a Tier 3 Sentinel

Syndicate's `fac` set excludes both artillery pieces (Thumper #3 and Bombard
#16); it has no `art` card at all. Its longest-ranged ground unit is the
Harbinger at 210.

| Faction | Ground range ceiling | Out-ranges a Mk3 Sentinel (238)? |
|---|---|---|
| Nova | 400 (Bombard) | Yes |
| Legion | 400 (Bombard) | Yes |
| Brood | 265 (Thumper) | Yes |
| **Syndicate** | **210 (Harbinger)** | **No** |

The Sentinel is the cheapest tower in the game (330m/1180e fully upgraded). Every
other faction can shoot one from outside its envelope; the Syndicate must walk
into it or answer from the air. The Longbow at 205 clears a Mk1 tower (170) and
loses to a Mk2 (204) by one point of range.

The doctrine comment explains why the *Brood* has no 400-range siege. It does not
mention the Syndicate, and no comment anywhere records this as intended — which
is what puts it in the "accidental rather than designed" column. Adding Thumper
(index `3`) to the Syndicate `fac` set restores a 265-range answer with one
token. Not applied: it changes a faction's declared identity, which is a call for
the designer, not for a measurement pass.

### 4.5 The siege unit cannot siege

The Bombard exists to out-range static defence. Measured against the eleven
defensive structures:

| Defence | Mk1 range | Mk3 range | Bombard (400) out-ranges? |
|---|---|---|---|
| Sentinel | 170 | 238 | Mk1 ✓ Mk3 ✓ |
| Bulwark | 168 | 227 | ✓ ✓ |
| Skyguard | 200 | 276 | ✓ ✓ |
| Hellfire Rotary | 215 | 269 | ✓ ✓ |
| Tesla Coil | 245 | 319 | ✓ ✓ |
| Plasma Charger | 300 | 375 | ✓ ✓ |
| Mining Laser | 315 | 403 | ✓ **✗** |
| Rail Battery | 360 | 475 | ✓ **✗** |
| Missile Bastion | 430 | 538 | **✗** **✗** |
| Concussion Mortar | 520 | 702 | **✗** **✗** |
| Stormcaller | 520 | 634 | **✗** **✗** |

Against a fully upgraded defensive line the Bombard out-ranges nothing at all.
It is also the least efficient buildable unit in the game (0.891 area-credited,
0.301 single-target). At equal spend, 2.47 Thumpers deliver 242 crowd DPS against
the Bombard's 144 and 333 HP against its 400 — so the Bombard pays 41% of its
damage for +135 range that stops mattering the moment the enemy upgrades.

Two coherent directions, neither applied:

1. Raise Bombard range to ~560 so it clears a Mk1 Concussion Mortar and
   Stormcaller, making it the genuine siege answer the codex advertises. Its
   speed of 14 (slowest in the game) and minimum range of 100 already price that.
2. Leave the Bombard and accept that the designed counter to a long-range battery
   is the minimum-range window — Concussion Mortar cannot fire inside 140, the
   Stormcaller inside 110. In that case the Bombard's 400 range is decoration and
   its cost should fall toward the Thumper's.

The codex claim that stated option 1 as fact **has been corrected** (see §5).

### 4.6 Plasma Charger and the free Concussion Mortar

Two defensive numbers stand out from an otherwise consistent set.

**Plasma Charger `aoe` 72** is half again the next largest blast (Bastion and
Stormcaller at 48, Missile Bastion at 46). Because bodies-in-blast scales with
the square of the radius, that is ~24 targets against the Bastion's ~11. Combined
with ION (×1.35 vs heavy, ×1.15 vs medium, no bad matchup) it produces the best
anti-heavy damage per cost of any defence at 1.947 — 4.1× the Sentinel and 7.8×
the Rail Battery — while its 17 energy/s is mid-table. If any defensive number is
retuned, this is the one; `aoe` 56 would bring it in line with the other heavy
batteries.

**The Concussion Mortar fires for free.** Every other defence beyond 215 range
pays for each shot — Tesla Coil 25.3 e/s, Mining Laser 37.6, Rail 12.1, Missile
Bastion 16.8, Stormcaller 20.0, Plasma 17.0 — while the joint-longest-ranged
structure in the game, at 520 range with a 48 blast, has no `e` field at all
(`sim.js:1049`). The Sentinel, Bulwark and Skyguard are also free, which reads as
a deliberate "cheap defences do not tax the grid" rule; the Bastion sitting in
that group looks like an omission rather than a decision.

### 4.7 The AI faction build bias table is dead data

Each AI faction carries a `bias` map of unit index to weight — Legion
`{3:1.9, 16:2.2, 27:1.8, 2:1.4}`, Syndicate `{25:2.4, 17:2.0, 5:1.8, 23:1.6}`,
Brood `{0:2.6, 9:2.0, 21:1.8}` — introduced by a comment describing it as *"a
theme that biases what it builds… what makes fighting the Legion feel different
from fighting the Syndicate"* (`ai.js:50-54`).

**Nothing reads `.bias`.** Faction production is instead hardcoded at
`ai.js:672-691`, and the two disagree: the Legion branch draws from
`[1,2,2,16,3]`, which never yields the Harbinger the bias table weights at 1.8.

The table is inert, so removing it changes no behaviour; the risk it carries is
that it reads as live tuning to the next person who opens the file. It is also
mirrored into `design/design.json`, so any balance work done off the design DB
will see weights the game does not use. Contended file — documented only.

### 4.8 Faction summary

| | Cards | Cost | Build | Other doctrine | Ground range | Missing weapon classes |
|---|---|---|---|---|---|---|
| Nova | 26 | −6% | +12% | — | 400 | none |
| Legion | 20 | — | — | +18% dmg after 12 s | 400 | beam, sonic |
| Syndicate | 19 | — | — | +18% node yield & salvage | **210** | claws, gauss, incendiary |
| Brood | 20 | −14% | +18% | — | 265 | sonic |

Nova holding both the widest roster and a permanent economic discount is the one
structural asymmetry that no comment justifies. It is plausibly deliberate — Nova
is the default and the onboarding faction — so it is recorded rather than
flagged. Legion and Syndicate pay list price for 23% and 27% fewer cards
respectively, and their compensations (a conditional combat ramp, an economic
multiplier) are not obviously equal to that.

---

## 5. Changes applied

Two. The first is a text field that measurement proved false. The second is the
Legion Titan Gate roster, after a product call that doctrine flavor already
answered.

**`src/factiondoctrine.js`** — `FAC_ARSENAL.legion.tgate` is `[8,26]`. The
Ascension Gate flavor already said it builds TITANs; no comment forbade chassis
8. Basilisk `TYPES` numbers were not touched.

**`src/factions.js`** — the Dominion codex card for the Siege Platform read:

> `400 range. Out-ranges every static defence in the game.`

Measured, the Bombard's 400 range is beaten by the Missile Bastion (430), the
Concussion Mortar (520) and the Stormcaller Battery (520) at Mk1, and by eight of
the eleven defences once they are upgraded. The card now reads:

> `400 range, 44 splash. The longest reach of any mobile chassis; the heavy batteries still out-range it.`

Both halves are verified: no mobile unit exceeds 400 (the next is the Dreadnought
at 290), and the three heavy batteries do out-range it. This is descriptive text
with no gameplay effect. `node tools/bundle.mjs` and `node tools/pack-www.mjs`
both pass.

## 6. Changes recommended and NOT applied

Ordered by measured severity. Every one lands in a file the brief holds off
limits (`sim.js`, `ai.js`) or is a faction-identity decision rather than a data
defect.

| Priority | Change | File | Why not applied |
|---|---|---|---|
| 1 | Extend `ARM` to 36 entries: `1,2,2` for Skycrane and both Massflesh states | `sim.js:1126` | Contended file |
| 2 | Basilisk HP 1100 → 1650 and cool 2.6 → 2.1 (or cost → 200m/820e) | `sim.js` TYPES | Contended file |
| 3 | Decide the Bombard: range → ~560, or cost down toward the Thumper's | `sim.js:62` | Contended file |
| 4 | Give Legion `tgate:[8,26]` | `factiondoctrine.js` | **Applied.** Doctrine flavor already said the gate builds TITANs. |
| 5 | Add Thumper (`3`) to the Syndicate `fac` set for a 265-range answer | `factiondoctrine.js:55` | Faction-identity call |
| 6 | Plasma Charger `aoe` 72 → 56 | `sim.js:1058` | Contended file |
| 7 | Give the Concussion Mortar an energy cost in line with its peers | `sim.js:1049` | Contended file |
| 8 | Delete the unread `bias` maps, or wire them into the production roll | `ai.js:55,68,83` | Contended file |
| 9 | Add `console.assert(ARM.length===TYPES.length)` to hold the invariant | `sim.js` | Contended file |

`FACTION_POP_CAP` stays 1000 and standard theatres stay `*_medium`; nothing here
touches either. No commit was made.
