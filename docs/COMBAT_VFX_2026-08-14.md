# Combat VFX — 2026-08-14

Visual-only sim hooks. Did **not** edit `gpufx.js`, `render3d.js`, `gl.js`,
or texture units 4/5/6/0.

## Landed in `src/game/sim.js`

- Hitscan beams terminate on hull radius (`beamHitXY`), not the navel.
- Building muzzles: AA from the gun, missile bastion / Stormcaller from the
  tube rack, Bulwark bore pulled in to match `BLD_TUR_S`.
- Brood Sentinel no longer fires a 0-damage bolt that arrives after the kill.
- Rail / mining laser dropped the extra white tracer (sheath+core already in
  the renderer).
- NOVA `orbital_up` originates on the silo, not 20 m south on the map plane.
- AA flak no longer offsets `uy-9` (that was fake height → burst south of the
  aircraft). Particles still have no Z; renderer owns lift.
- `addBeam(..., team)` so player lances stay readable at the fog edge.
- Small infantry / wildlife / Brood deaths: ichor flash, not a vehicle
  fireball. Shards stay on the corpse (were 60–110 speed + type-4 fire sprite).
- Explosion debris tinted dirt/metal instead of 255 white.

`node tools/bundle.mjs` parsed clean (73 sources). `pack-www.mjs` copied
`src/` (www sim.js hash matches) then its audio/manifest verify exited 1 —
a pre-existing gate, not this VFX diff. Did not re-wipe `www/` (8901 live).
Hard-refresh 8901 once when no match is in progress.

## Graphics-owned (leave for that agent)

| Symptom | Where |
|---|---|
| CPU particles have no height; muzzle/impact sit on `gh()` | `render3d.js` particle pass, `addParticle` SoA |
| Hitscan beam height is `gh()+13` vs turret `turH` 11–23 | `render3d.js` ~1919 |
| Young projectiles get sim type-0 **and** `addMuzzleFlash` | `render3d.js` ~1817 + `projectileFireFX` |
| GPU spark fountains / transform-feedback | `src/engine/gpufx.js` |
| Shared glow/ring vocabulary, LDR additive clip | MATERIAL-FX-AUDIT; post chain |

Repair / airlift / commander orbitals still spawn from hull centre. Plasma
Charger has no turret mesh, so it still emits from the pad.
