# Utility Production Review — 2026-09-04

## Scope and conclusion

This is a bounded source audit of the Constructor, Warden and Prospector reward loop. It does not claim that every utility unit, faction composition or price is balanced. The current mechanics provide meaningful value, but much of that value is not explained or counted for the player. Do not apply arbitrary stat buffs before usage and match telemetry show that the verified rewards are insufficient.

## What the units actually do

- **Constructor:** base cost 35 mass / 140 energy; authored `bt=4` now corresponds to a **16-second neutral production duration**, not four elapsed seconds. Its automatic structure repair applies 7 HP every 0.5 seconds, or a nominal 14 HP/s. A builder reclaims at twice the ordinary unit rate. It can also assist construction and production through the shared tractor contribution path.
- **Warden:** base cost 62 mass / 250 energy; authored `bt=5` corresponds to a **19-second neutral production duration**. Its repair branch applies 4 HP every 0.5 seconds, nominally 8 HP/s. Actual healing and visible feedback passed the bounded runtime checks below; a sustained-rate benchmark remains open, and a claimed job alone is not proof of healing.
- **Prospector:** base cost 52 mass / 210 energy; authored `bt=5` corresponds to a **19-second neutral production duration**. It drains 1.15 mass every 0.68 seconds, approximately 1.69 mass/s. Its nominal base-cost mass-only payback is therefore about 30.7 seconds. That figure excludes energy, travel, interruptions and depleted fields, so it is not a full economic break-even claim.
- **Prospector survey:** pays `35 + tier × 15` mass, or 50 / 65 / 80 mass for Tier I / II / III (`src/game/sim.js:8328-8343`). Tier II or III therefore repays the Prospector's 52-mass purchase in one successful survey; Tier I nearly does. A survey also prevents the same team from claiming that field repeatedly.
- **Assist:** active contributors use diminishing weights of 1.0, 0.667, 0.5 and so on, capped to a tractor contribution of 2 (`src/game/sim.js:8164-8169`). Production applies `1 + 0.22 × contribution`, so one contributor is +22% and two contributors are approximately +36.7%, before the total infrastructure cap (`src/game/sim.js:2430-2437`). Production assistance on an HQ also pays the preserved 0.42 mass/s and 1.8 energy/s labour dividend (`src/game/sim.js:8174-8178`).

## Payback caveats

Costs above are unmodified data-table costs, not universal player prices. Nova's 0.94 cost modifier gives 33/132, 59/235 and 49/198 respectively after rounding. A bare Nova facility's 1.12 production doctrine gives approximately 14.29 / 16.96 / 16.96 seconds before other infrastructure effects. The authoritative helper is `mfProductionDuration`; `bt` remains serialized work, not elapsed seconds. Earlier text quoting four/five-second builds was incorrect.

Prospector mining accelerates access to a finite deposit; it does not create extra lifetime ore. Mining calls the same deposit drain used by the economy (`src/game/sim.js:8367-8372`). Each Extractor also deploys one Prospector automatically (`src/game/sim.js:8298`), so buying another Prospector is primarily a tempo, pre-territory access, assist or survey decision. The production UI should explain those uses instead of presenting the unit as generic economy income.

Fast salvage likewise changes recovery time and the chance to secure a contested wreck, not the wreck's total payout. Repair value depends on damage actually sustained, while assist value depends on a queue or structure that remains active. These situational constraints are why the source evidence does not yet justify a broad cost or output buff.

## Confirmed feedback defect

The selected-unit HUD previously translated idle-looking simulation states into `READY`, even while an automatic utility lease was actively repairing, mining, surveying, salvaging or assisting. Those jobs are real simulation work at `src/game/sim.js:8181-8220`.

A GUI patch is now present to read the live utility lease and label it `HEAL`, `REPAIR`, `ASSIST`, `SALVAGE`, `MINE`, `SURVEY`, `ESCORT` or `RETURN`. Source-backed HUD tests pass. The combined browser fixture E observed HP 20→32 and the HEAL text, but its screenshot had unit intel open, so it was not accepted as visible selected-HUD evidence. Later fixture F, and independent clear-land fixture `utility-heal-clear-20260904`, observed a valid repair-unit job but no HP gain. The latter also exposed a numeric-versus-boolean walkability assertion defect. These failures are retained; neither an assigned job nor the earlier isolated success proves the runtime reward loop fully accepted. No release is claimed.

## Corrected runtime verification

The no-healing fixture diagnosis subsequently found a double clock increment: the verifier incremented `tick` and then called `unitTick`, which increments it internally. That could skip the same worker's LOD work phase indefinitely. The planner and HUD correctly showed a job, but the malformed test never executed the healing step. Both verifiers are corrected to the normal one-tick cadence and record phase opportunities. This was a verifier defect, not an established gameplay healing defect.

Final source-matched hardware-browser evidence at runtime `d31cb0bd901f`:

- `.tmp/utility-heal/utility-heal-cadence-20260904/evidence.json`: PASS, clear-land target 14→18 HP in four ticks; all four LOD phases visited. Native unit-info open/close retained visible HEAL status, and root inspected the actual screenshot.
- `.tmp/building-command/mobile-building-20260904-g/evidence.json`: PASS, target 20→32 HP in 45 ticks, visible HEAL. Both reports finalized offline isolation and capture-page closure, retained source stability and recorded zero runtime errors.

The fixture proves a real repair pulse and feedback, not a full sustained-rate, all-support-unit or physical-device acceptance matrix. Earlier failed reports remain intact.

Unit intel without a selected factory now uses `mfProductionDuration(T)` instead of raw work units, so the generic Warden duration is 19 seconds rather than five. Selected-factory cards still use actual live facility speed. The dedicated source-backed ETA contract passes; no-cost/production balance changes were introduced by this display correction.

## Recommended next slice

1. **Persistent survey intelligence.** Survey state is already serialized for mass deposits and energy geysers (`src/session.js:424-425`, `src/session.js:533-535`), but the current UI does not consume it. A surveyed field should permanently reveal exact remaining ore, tier/yield and a durable map marker to that team. Unsurveyed fields can retain approximate information. This gives SURVEY lasting recon and economic planning value without changing rewards.
2. **Utility Impact ledger.** Track and show HP repaired, mass mined, mass salvaged and production/construction time saved. Display the active rate on the selected-unit card and mission totals in debrief. The present account only records aggregate reclaimed mass (`src/main.js:640`, `src/main.js:1201`, `src/main.js:1243-1246`), so most utility value is invisible.
3. **Truthful production-card copy.** Surface the verified repair rates, mining rate, survey rewards, assist percentages and finite-deposit caveat before purchase. This should precede balance changes so playtests can distinguish an unrewarding unit from an unexplained one.

## Verification boundary

This document records source behavior and the bounded desktop hardware-browser repair/visible-HUD results above. Bundle, pack, focused tests and mobile-viewport visual inspection passed. It makes no deployment, release, physical-device performance, sustained-rate or full-roster balance claim. Persistent survey intelligence and the Utility Impact ledger remain proposed work, not implemented features.
