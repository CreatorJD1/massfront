## What changed

**The white bloom disc on resource nodes is fixed.** It was not deposit decoration — 1.33.42 and 1.33.43 both stripped halos, rings, crystal pools and vein ribbons with no effect, because the emitter was the **weapon impact burst on a beam that never stops firing**.

A Prospector clamps the extraction laser (TITHE) on the deposit. The weapon VFX path assumes a transient, moving terminus, so on the same texels every frame it laid `addBeamBurst`'s 8 additive sprites (including a white `255,253,244` core at full alpha) while `addBeam3D` rescaled `rad` to `max(4.80, rad*5.85)` and drew ribbons ~116 world units across with a white inner ribbon at `a*1.40`, plus `addBeamPathFx` knots and a muzzle burst. Several times over the 0.936 bright-pass; bloom did the rest.

Clamped beams now use a dedicated `'mining'` style: two thin ribbons in the tier colour plus a soft terminus — no white core, no knots, no burst. Applied to **both** the TITHE extraction beam and the LABOUR build-assist beam, which had the identical defect.

**Two correctness fixes** found in a source review:
- Node reservation leaked permanently on a failed build start. The rollback called `depositAt()` to find the deposit it had just claimed, but `depositAt` filters `!D.taken` — so it could never find it, and could clear a *different* nearby node instead.
- `restampResourceNodesInTex` painted outside the rect it uploads, leaving terrain pixels that never reached the GPU and compounding stroke alpha on repeated stamps. Now clipped.

**Mega / SANDBOX demo removed** — a 10,000-unit bench that no longer represented the game and sat on the front strip as if it were a mode. `newDemo()` now serves only the three hidden QA capture labs and returns before touching world or HUD state when no lab token is present.

**Release pipeline unblocked** — `hf` defaults to the Xet transfer path when `hf-xet` is installed, and that handshake hangs on the ~960 MB source archive. The publisher now forces the classic path.

**Adds `docs/GAME_REVIEW_2026-08-17.md`**, a full-system review across 35 areas.

## How the bloom fix was verified

Suppression in a live match, not reasoning: gagging `addBeam` at the node removed the disc entirely and revealed the extractor on its pad; gagging the particles changed nothing. Before/after screenshots confirmed.

Two measurement traps worth knowing, both of which produced false results first: a blown-pixel metric via `readPixels` reads 0% after compositing without `preserveDrawingBuffer`, and page probes referencing `window.bbAdd` silently no-op because top-level `const` is not a window property in this codebase's single global scope.

## Reviewer notes

- **1.33.44 is already live and verified** against the dataset (`size 57272352`, `sha256 d8b64cc9…abb013` matching local). The demo removal in this PR is **staged, not published**.
- **`v1.33.41` shipped with no source archive at all** — it is absent from the dataset. That is the data loss the Xet fix prevents recurring.
- **Three absence claims in the review doc's first draft were false** and are corrected in place: box select, queue stacking and locked-entry display all exist in some form.
- **`renderLegacySprites` (~900 lines, `hud.js:252`) is dead code** — referenced only by a test via `.toString()`. This means 1.33.42's edits to it can never run, and the `!placing` guard on the build-zone overlay cites it as justification.
- Build artifacts (`compile-file-map.properties`, `MASSFRONT.apk.idsig`, `.cursor/`) and four earlier-session docs were deliberately left out of this commit.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
