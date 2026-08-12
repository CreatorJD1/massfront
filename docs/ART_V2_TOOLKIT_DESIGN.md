# MASSFRONT — In-house Bespoke/Material V2 Toolkit

**Status:** design (no code written yet). Companion to `docs/ART_V2_POLY_LOD_PLAN.md`.
**Goal:** turn per-asset one-off scripts into a repeatable, manifest-driven pipeline so
producing a verified bespoke pack is a config entry + one command, not a new 280-line
Python file.

## The problem, measured

| Evidence | Reading |
|---|---|
| `bake-material-v2-tank.py` 279 lines vs `bake-material-v2-nova-factory.py` 153 lines, **360 differing lines** | Two near-duplicate bakers; logic copied, not shared |
| Asset identity hardcoded at `OUT`/`SOURCE` (lines 13–14), names hardcoded at `save_packed('nova-heavy-tank-v2-…')` | A new asset = a new file |
| `verify-bespoke-packs.mjs`: **0 authored / 170 templates** | The one-off cost is exactly why only 2 real packs exist |
| `build-bespoke-v2-textures.py` (225 lines) generates 181 triplets with **no target mesh UV** | Mass generation exists but produces templates, not authored packs |
| `glb-v2-import.mjs` already takes `<in.glb> <out.js> [assetName]` | Import stage is already generic — the model to copy |

**Generic already (reusable as-is):** bake passes, BaseAO/NRE/Masks channel packing,
socket duplication, decimate→LOD, GLB/blend export, `MATERIAL_V2_BAKE_OK tris=…` report.
**Hardcoded (must become data):** asset key, paths, map size, decimate ratio, material
region names, LOD tiers.

## Primary design constraint: multiple AI agents drive this

The toolkit is used by **Claude, Codex, Antigravity, OpenCode** and humans —
often concurrently, each with a fresh context and no memory of the last session.
That makes *interface* design more important than the bake math. The failure mode
we already hit (per the tool audit: *"invocation knowledge lives in headers, not
npm scripts"* — an agent had to open a 280-line file to learn how to run it) is
the thing to design out.

**Rules every tool obeys** (encoded in `agentContract` in the manifest):

| Rule | Why it matters for an agent |
|---|---|
| **One entry point**: `node tools/artv2.mjs <cmd> [asset\|--all] [--json]` | Nothing to discover by reading source |
| **Self-describing**: `help`, `schema`, `status --json`, `next --json` | Agent can orient in one call, cold |
| **JSON envelope** on every command: `{ok,command,asset,data,errors,warnings,next}` | Parseable result, no prose scraping |
| **`next`** returns the next actionable stage per asset | Agent never infers pipeline order |
| **Deterministic exit codes** 0 ok / 1 gate fail / 2 usage / 3 env / 4 locked | Branch without parsing text |
| **Never interactive**, no TTY/prompt assumptions | Agents cannot answer prompts |
| **Idempotent**, re-run = no-op unless `--force` | Safe retries after a crash/timeout |
| **Per-asset lock** (`.artv2/locks/<asset>.lock`, stale-expiring) | Parallel agents work different assets safely |
| **Provenance sidecar** `.artv2.json` (source hashes, tool+Blender version, timestamp, `ARTV2_AGENT`) | An agent can tell what's stale and who did it |
| **`doctor`** reports exactly what's missing | No silent env drift between machines |
| **Write-scope fenced** to art dirs + manifest; never engine source | A confused agent can't break the game |

`status --json` is the keystone: one call returns every asset's stage, tri counts
vs budget, map hashes, live flag and what to do next — the entire pipeline state an
agent needs, without reading a single tool.

## Toolchain: Blender **5.2 only**

Pinned to **Blender 5.2.0 LTS** (numpy 2.3.4) at
`C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`, overridable via
`BLENDER_EXE`. `artv2 doctor` **hard-fails on any other major.minor** — 4.x/5.x
differ in `bpy` API and bake defaults, so a silent fallback would change output
between agents/machines. The existing one-off bakers were written against 4.2, so
porting them to 5.2 is part of step 1 (validated by reproducing the tank/factory
bake).

## Architecture

```
assets/data/art-v2-assets.json     ← THE MANIFEST (single source of truth)
tools/artv2/
  mf2_bake.py        Blender lib: bake passes, channel pack, save, sockets, LOD, report
  mf2_build.py       Blender lib: shared material/region setup + procedural greebles
  mf2_manifest.py    manifest load/validate (Python side)
  mf2_manifest.mjs   manifest load/validate + JSON envelope + locks (Node side)
tools/artv2-build.py    <asset|--all>  → high-poly .blend        (Blender 5.2)
tools/artv2-bake.py     <asset|--all>  → maps + baked/LOD GLBs   (Blender 5.2)
tools/artv2-import.mjs  <asset|--all>  → assets/data/*-v2*.js    (wraps glb-v2-import)
tools/artv2-verify.mjs  <asset|--all>  → budgets + pack + routing gates
tools/artv2-preview.mjs <asset|--all>  → real-GPU turntable/battle captures
tools/artv2.mjs         <cmd> ...      → single entry point + orchestrator
```

**Commands:** `help · schema · doctor · status · next · build · bake · import ·
verify · preview · promote · run` (`run` = build→bake→import→verify→preview).

Existing `bake-material-v2-*.py` / `build-material-v2-*.py` become thin shims calling the
lib with their manifest entry (keeps their proven behaviour, kills the duplication).

## The manifest (drives everything)

```jsonc
{
  "assets": {
    "novaHeavyTankV2": {
      "faction": "nova", "class": "heavy",           // class → LOD + map budgets
      "dir": "source-media/material-v2/nova-heavy-tank-v2",
      "slug": "nova-heavy-tank-v2",
      "build": "tools/artv2/recipes/nova_heavy_tank.py",  // authoring recipe (optional)
      "maps": { "showcase": 1024, "battle": 512 },
      "lods": [                                      // explicit, verified tiers
        { "name": "showcase", "target_tris": 32000 },
        { "name": "battle",   "target_tris": 1400 },  // ← the tier that was missing
        { "name": "far",      "target_tris": 400  }
      ],
      "regions": ["STRUCTURE","ARMOR","EDGE_STEEL","TEAM_PRIMARY","TEAM_SECONDARY",
                  "MACHINE","TRIM","WEAPON","GLASS","ENERGY","FACTION_BADGE"],
      "sockets": ["socket_weapon_primary","socket_sensor","socket_reactor"],
      "live": false,                                 // promotion flag (per asset key)
      "status": "authored"                           // template | authored | verified
    }
  },
  "classBudgets": {
    "hero":     { "battle_tris": 3000, "battle_map": 512 },
    "landmark": { "battle_tris": 4000, "battle_map": 512 },
    "heavy":    { "battle_tris": 1500, "battle_map": 512 },
    "vehicle":  { "battle_tris": 1000, "battle_map": 0   },  // 0 = shared atlas
    "air":      { "battle_tris":  800, "battle_map": 0   },
    "infantry": { "battle_tris":  400, "battle_map": 0   }
  }
}
```

Budgets live here, so `artv2-verify` can **fail a build that exceeds them** — the
guardrail that would have caught "LOD1 = 14,728 tris on a 1,500 budget."

## Tool responsibilities

**`mf2_bake.py` (the big win — extracted from the working tank baker)**
`bake_asset(entry)` → set up bake scene at `maps.showcase`; bake material/position/
curvature/AO/normal passes; compose **BaseAO** (albedo+AO), **NRE** (normalXY + rough +
emissive), **Masks** (metal + faction primary/secondary + wear); save all three; restore
authored materials; duplicate `socket_*` empties; export baked GLB + .blend; then **for
each LOD tier**: decimate to hit `target_tris` (iterate ratio rather than a fixed `.46`),
export GLB, and emit `MATERIAL_V2_BAKE_OK` per tier. Also downsample battle maps to
`maps.battle`.

**`artv2-verify.mjs`** — one gate, hard-fails on:
- tri count > class budget for any LOD tier (per-tier, not just LOD0)
- LOD tiers missing (esp. no `battle` tier)
- map triplet missing / wrong size / **duplicate-hash** (catches template-vs-authored:
  today nre has only 25 unique of 181, masks 19 of 181)
- UV0 missing / overlapping / stretched beyond threshold
- raw `SERVO` remapped, gait channels touched (wraps existing semantic verifiers)
- registry `status` claiming `authored` without a real source `.blend`+GLB
- then delegates to `verify-bespoke-packs.mjs` + `verify-unit-v2.mjs`

**`artv2-preview.mjs`** — real-GPU (headed Chrome, `--use-angle=d3d11`, **never
SwiftShader** — per the post-mortem) turntable + in-battle capture at 100/200 instances,
day/night/damaged, writing a before/after contact sheet per asset. This is the
`ART_V2_ACCEPTANCE.md` evidence, automated.

**`artv2.mjs`** — `node tools/artv2.mjs novaHeavyTankV2` runs the whole chain and prints a
one-screen report (tris per tier vs budget, map sizes/hashes, verify result, capture paths).
`--all` batches; `--promote` flips `live` after gates pass.

## What this changes in practice

| Task | Today | With the kit |
|---|---|---|
| New bespoke asset | write a ~280-line bake script + a build script | add a manifest entry (+ optional recipe) |
| Add a battle LOD | hand-edit decimate ratio, re-run, eyeball | declare `target_tris`; tool iterates to hit it |
| Know if a pack is real | read docs, trust `source:'authored'` | `artv2-verify` hashes maps + checks source; can't lie |
| Perf/visual evidence | manual capture, easy to use SwiftShader by mistake | `artv2-preview` real-GPU, standard sheet |
| Promote to live | edit code | `--promote` after gates, per asset key |

## Build order (each step independently useful)

1. **`mf2_bake.py` + manifest + `artv2-bake.py`**, with the tank/factory as the two
   entries. Success = reproduces today's outputs **and** adds the missing battle LOD.
2. **`artv2-verify.mjs`** with budget + duplicate-hash checks. Immediately tells the
   truth about all 181 packs.
3. **`artv2-import.mjs`** (thin wrapper) + **`artv2.mjs`** orchestrator.
4. **`artv2-preview.mjs`** real-GPU acceptance captures.
5. **`mf2_build.py`** shared authoring lib (extract from the 2 build scripts) — last,
   since hand-authoring recipes vary most.

Then the POC from the LOD plan (Nova tank battle LOD → HQ/factory) runs *through* the kit,
which is what proves it.

## Guardrails

- Kit **only writes** to `source-media/material-v2/**`, `assets/textures/materials/**`,
  `assets/data/*-v2*.js`, and the manifest. Never edits engine source.
- Promotion is **per asset key**, never a global flip (`materials-v2.js` stays opt-in until
  an asset passes).
- Every asset = one commit; budgets enforced in CI-style gate.
- Requires Blender on PATH (verify before step 1) + numpy in Blender's Python.
