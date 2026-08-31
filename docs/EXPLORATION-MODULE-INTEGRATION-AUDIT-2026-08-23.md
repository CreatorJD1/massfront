# modules/space_exploration — integration audit and packaging decision

**Date:** 2026-08-23 · **Method:** read-only classification of all 277 untracked files.
Nothing in the module was modified, moved, or deleted.

## File classification (277 files, 262.7 MB)

| Category | Files | Size | Ship? |
|---|---:|---:|---|
| TEMP capture output (`tmp/`) | 86 | 61.5 MB | no |
| RUNTIME texture — planets (dynamic ref) | 60 | 43.7 MB | curated |
| RUNTIME model (referenced) | 3 | 42.3 MB | curated |
| RUNTIME texture — personnel | 15 | 37.9 MB | curated |
| BLENDER autosave (`.blend1`) | 4 | 24.1 MB | no |
| BLENDER source (`.blend`) | 4 | 23.8 MB | no |
| TEXTURE (unreferenced) | 17 | 14.1 MB | no |
| GENERATED model — **unreferenced** | 1 | 11.9 MB | no |
| OTHER (`.pyc`, logs, misc) | 13 | 1.7 MB | no |
| THIRD-PARTY runtime lib (three.js, GLTFLoader) | 2 | 0.7 MB | yes |
| AUTHORED runtime source (`src/`, `styles/`, `index.html`) | 45 | 0.6 MB | yes |
| AUTHORED tooling/tests | 14 | 0.2 MB | no |
| ARCHIVE (`_archive/`) | 8 | 0.1 MB | no |
| DOCS | 4 | 0.0 MB | no |
| GENERATED output (`dist/`) | 1 | 0.0 MB | no |
| **Minimum runtime subset** | | **125.2 MB** | |
| **Excluded** | | **137.5 MB** | |

`uga-civilization-ark.glb` (11.9 MB) is generated but **referenced by nothing** — it is the
clearest single candidate for deletion by whoever owns the module.

## The finding that governs everything

The runtime entry graph is tiny — `index.html` loads exactly four things:
`lib/three.min.js`, `lib/GLTFLoader.js`, `src/space_module.js`, `src/ui/space_module.css`.
The authored logic is **0.6 MB**.

But the assets it reaches for are not optimised. Fifteen personnel portraits total 37.9 MB
(~2.5 MB *each*, as PNG). Fifty-five planet textures total 43.7 MB. Three GLB models total
42.3 MB, undecimated and un-Draco'd. So the **minimum shippable subset is 125.2 MB against a
current `www/` of 108 MB** — integrating this module as-is would more than double the
installer for a mode that is off by default.

**Asset optimisation is therefore a prerequisite for integration, not a follow-up.** PNG →
WebP/AVIF for portraits and planets, and Draco/meshopt for the GLBs, should plausibly take
125 MB to 15–25 MB. Until that is done there is nothing worth wiring up.

## Packaging: already safe, now explicit

`tools/pack-www.mjs` copies an allowlist (`index.html`, `boot.js`, `src`, `assets`), so
`modules/` has never been packaged. That was safety by *omission*. This pass added a
defensive assertion mirroring the existing `experimental/` guard:

```js
if(existsSync(join(www,'modules')))
  missing.push('modules/   (must not ship — 264 MiB authoring module; …)');
```

Verified: `pack-www` still passes, and the guard fires when `www/modules` is injected.

## Integration design (specified, deliberately not implemented)

The module is **fully standalone** — `grep` finds no reference to `space_exploration` or
`modules/` anywhere in `src/`, `index.html`, or `boot.js`. There is also no existing
feature-flag registry to hang it on.

Implementing a flag-gated integration today would mean inventing both the flag mechanism and
the load path, in a shared dirty worktree, during a release freeze, for a mode whose assets
cannot ship. That is dead code that no test can exercise (flag off, assets absent), so I
stopped at the design rather than writing it:

1. **Flag.** `META.settings.experimentalExploration` (default `false`, never persisted true
   by any UI). Read once at boot into a module-scope constant so it cannot be toggled
   mid-session.
2. **Menu hook.** One entry in `#startScreen`, rendered only when the flag is on — absent
   from the DOM rather than hidden, so it cannot be reached by a mistap or a screen reader.
3. **Load path.** The module owns its own three.js and its own canvas. The smallest safe
   coupling is a **separate document** (`modules/space_exploration/index.html`) opened as a
   route, not an inline import: it keeps two WebGL contexts from fighting over the same
   canvas, keeps the module's three.js out of the main bundle, and means a crash there
   cannot take down the RTS.
4. **Saves.** The module must not read or write `saves`. If it later needs persistence it
   gets its own key with its own schema version.
5. **Packaging.** Stays excluded until the optimisation pass lands, then a *curated
   manifest* of the 78 runtime files ships — never the tree.

## Recommended next step

Asset optimisation, owned by whoever owns the module. Integration is a small task
afterwards; it is not a small task before.
