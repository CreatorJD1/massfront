# Stages 06–09 repair handoff — 2026-08-30

The concrete red gates from the current verification pass are repaired. This
handoff does not claim the remaining human, recording, physical-device or broad
visual-matrix acceptance items.

## Repaired and verified

- The Stage 7 loadout probe now clears the new onboarding choice through its
  real **Skip tutorial** UI before tapping Start MASSFRONT. Both 412×900 and
  344×760 hardware-GPU profiles passed with a stable whole-worktree fingerprint;
  the 412×900 profile also completed the real battle launch.
- The mobility gate now checks the current 21/18/13/10 unit balance instead of
  the obsolete 38/36/27/22 values. It also follows the current unit-owned
  faction-kit path. Road assault movement is 27.8 units/s for Striker and 17.2
  for Rhino.
- Dark-faction readability now checks the PBR material IDs after the Legion and
  Machine semantic surface passes. All 27 structures in each faction retain
  distinct coated-core and armor zones.
- The Stage 9 chain gate recognizes the intentional Stage 10 battlefield
  topology takeover between `locationplans.js` and `worldsites.js`; all 60 plan
  checks pass and boot/manifest order remains exact.
- Sibling-biome map themes are explicit region metadata. The four-planet,
  16-region, 48-map catalog passes without forcing Aelos High Shelf back to the
  wrong verdant biome.
- The packaged boundary test now uses the planet-aware
  `aelos_north_small` Compact theatre. It exercised 14 live city relics and all
  Compact/Standard/Large content classes with zero escaped footprints on AMD
  Radeon 610M / ANGLE D3D11.
- `mdlGatehouse` was not blindly added to the installer. That ignored candidate
  is 3,700 triangles and has no authored LOD. The shipped semantic gatehouse
  role is already a 1,185-triangle quantized payload. The quality gate records
  this as `NOT_SELECTED`, along with four similar compact-role replacements,
  and verifies that each real payload exists.

The durable machine summary is
[`../audit/stages06-09-repair/summary.json`](../audit/stages06-09-repair/summary.json).
The strict Stage 7 report and four visually reviewed captures are under
[`../audit/stages06-09-repair/stage7-loadout-summary/`](../audit/stages06-09-repair/stage7-loadout-summary/).
Stage 9 source-bound reports are under
[`../audit/stages06-09-repair/stage9/`](../audit/stages06-09-repair/stage9/).

## Final verification

```text
probe-stage7-loadout-summary: PASS, 2/2 accepted, source identity stable
hardware renderer: AMD Radeon 610M / ANGLE Direct3D 11
verify-stage9-location-plans: PASS, 60/60
verify-stage9-location-grammar: PASS, 5/5 contracts, 16 regions, 48 maps
world boundary: PASS, three scales, zero escaped content
global scope: PASS, 106 scripts / 3131 names
bundle: PASS, 26.57 MB
bundle SHA-256: 0b394a823d598497310883e60ca92ef734ecac7ba83b32be206e1a0aed074870
```

## Still open — not fabricated

- Nine commander subtitle fallbacks still have no approved voice performances.
- The 3D Deployment Arena and its 45% phone-height requirement still need
  source-matched acceptance.
- Stage 8 still needs the complete weapon/faction/gore/aftermath, force-field,
  fog, GL-state and context-recovery visual matrix.
- Stage 9 planner execution/runtime topology and the full phone tactical visual
  matrix remain pending even though the catalogs and dependency chain are green.
- The actual S25 Ultra and owner presentation approval remain external gates.

No Cursor-owned Stage 10 asset/module files, social/state-hash files,
boot/manifest files, release-retention files or staged documentation were
changed by this repair lane.
