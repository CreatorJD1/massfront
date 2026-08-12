# Postmortem — the "flat buildings / empty battlefield" regression (2026-08-12)

## Summary

The local dev repo was stamped **v1.33.8** but had **diverged** from the deployed
line, whose good build was **v1.33.31**. The local build shipped two visual
regressions. We reconstructed the source to v1.33.31 (unpacked the OTA bundle
from HuggingFace, kept binary assets) and verified on a real GPU: clean build,
0 console errors, neutral city generates again (relics 0 → 22), buildings render
via the authored World V2 path.

## What actually broke

1. **Flat / dark buildings** — the model fragment shader (`src/engine/mesh.js`,
   FS3D) had a screen-footprint normal-map fade with **no floor**
   (`nT = mix(vec3(0,0,1), normalMap, matStable)`), so at normal zoom the normal
   map was removed entirely and large façades collapsed to flat ambient. Neutral
   city had the parallel fade in `materials-world-v2.js` (`normalGain … * mix(.48,1,…)`).
2. **Empty battlefield (no neutral city)** — `planDistricts()` in
   `src/game/sim.js` added `pickSeq()` for archetype selection that **consumed the
   seeded RNG stream immediately before the placement loop**, shifting the LCG
   phase so every district-placement dart missed its (already tiny, ~0.09%) valid
   area. Result: `cityZones/relics/cityStreets → 0`. Rocks/trees/deposits were
   never affected.

## Why it was hard to diagnose (the real root causes)

- **No version control history.** The whole tree was untracked (`git status` = all
  `??`, zero commits). With no history there was nothing to `diff`, `bisect`, or
  roll back to — the good baseline had to be reverse-engineered from a HuggingFace
  OTA bundle.
- **Version string drifted from reality.** `boot.js PACKAGED_REV`,
  `updater.js APP_VERSION`, `package.json`, `update.json` all said different/old
  values (1.33.8 / 1.33.7) on code that was really ~1.33.25 + local edits. The
  label lied, so "which version is this?" had no trustworthy answer.
- **Software-renderer previews misled.** Headless SwiftShader captures rendered
  terrain detail differently than the real GPU, sending the first diagnosis down a
  wrong path ("flat ground") that the NVIDIA path later disproved.
- **Concurrent writers.** More than one agent session was editing the same repo,
  risking clobbers.

## Prevention — do these to stop it recurring

### 1. Put the repo under real version control (highest priority)
`git init` exists but nothing is committed. Commit the tree, and **commit + tag
every release** (`git tag v1.33.31`). Then any future regression is one
`git bisect` away and there is always a clean local baseline to diff against — no
reverse-engineering OTA bundles.

### 2. One source of truth for the version + a bump guard
Derive `PACKAGED_REV` / `APP_VERSION` / `package.json` / `update.json` from a
single `version.json`. Add a check in `tools/bundle.mjs` that they all agree and
that the version was bumped since the last tag. **Never edit source without
bumping.** A build whose version doesn't match its content is the thing that
caused all of this.

### 3. Regression tests that assert the symptoms, and determinism
Extend `tools/test-city-terrain-integration.mjs`:
- Assert **every requested district actually lands** on all 56 maps (not a
  coin-flip). The underlying placement was fragile even pre-regression.
- **Determinism gate:** same seed → identical relic/city counts across runs, and
  **no sub-system may perturb the world PRNG** (snapshot/restore the LCG around
  `pickSeq`, or give it its own stream).
- **Shader sanity:** assert the building normal contribution is non-zero at
  gameplay zoom (would have caught the un-floored fade).

### 4. Verify renders on a real GPU / device — never software
Run the visual QA gate headed on the real GPU
(`--use-angle=d3d11`, no `swiftshader`) or on-device, and diff against a
committed reference screenshot per map. Treat SwiftShader output as
non-authoritative for anything about materials/detail/lighting.

### 5. Reversible cosmetic passes with a floor
Any "anti-flicker / detail-LOD" fade must keep a **floor** (never fade a normal
map or detail fully to zero) and keep the prior authored path as fallback — the
codebase already does this for World V2; make it a rule for every such pass, with
a before/after real-GPU screenshot attached to the change.

### 6. One writer at a time
Give each agent/session its own git worktree or branch, or serialize edits.
Concurrent writes to one tree with no VCS is how silent divergence happens.

## Fix applied this session
Reconstructed all 67 source files to v1.33.31, added the 6 missing
(`terragen.js`, `terralab.js`, `gpufx.js`, `worldsites.js`, `worldkit.js`,
`models-skyline.js`), registered them in `boot.js` + `assets/data/manifest.json`,
updated `index.html` body, bumped version to 1.33.31. `bundle.mjs` + `pack-www`
pass; real-GPU boot is clean. Binary assets untouched; pre-1331 source backed up.
**Outstanding:** the 1.33.31 CSS (`shell.styles` in the OTA bundle) was not
applied — `src/styles/*.css` is still 1.33.8.
