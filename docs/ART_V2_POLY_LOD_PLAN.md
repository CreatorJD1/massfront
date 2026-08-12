# Art V2 — Poly reduction + normal-baked detail plan

**Status:** plan only (no code/asset changes). Baseline: git `v1.33.31` (`284d305`).
**Goal:** bring authored bespoke assets into the *live* path at mobile-safe triangle
counts by moving geometric detail into baked normal/AO maps, while keeping the
shared-atlas semantic route as the scalable mass-unit default.

## Why this works here (the constraints that shape every number below)

- **Instancing:** units render via `InstMesh` up to the 1000-unit faction cap. Tris
  and texture samples multiply by instance count, so the battle LOD — not the
  showcase LOD — is what matters.
- **Camera:** orthographic top-down. A battle unit is tens of px; fine geometry
  *and* normal detail mip to sub-pixel and flatten. So aggressive poly reduction +
  normal map is the *ideal* fit, not a compromise. Detail only pays off zoomed-in /
  in the Arsenal.
- **Engine already supports it:** `materials-world-v2.js` does tangent-space normal
  mapping (GGX, screen-space cotangent frame). `bake-material-v2-*.py` already bakes
  high-poly → NRE (Normal/Rough/Emissive). The gap is (a) LOD aggressiveness and
  (b) map-sharing strategy, **not** capability.
- **Runtime detail fade must keep a FLOOR.** The 1.33.31 flat-building regression was
  an un-floored screen-footprint normal fade (`mesh.js` FS3D `matStable`). Any detail
  LOD here must never fade the base normal to zero. See
  `docs/POSTMORTEM-1.33.31-REGRESSION.md`.

## Normal maps: yes. Height/parallax: bake-time only.

- **Normal maps** — one texture fetch, already sampled, keep at runtime.
- **Height maps** — use them **offline** to *generate* the normals/AO in the bake.
  Do **not** sample them live: runtime parallax/POM ray-marches per fragment
  (expensive on Adreno/Mali) and buys nothing at a top-down ortho camera.

## LOD triangle targets by class

Every authored asset gets: **Showcase LOD0** (Arsenal / `?materiallab`, on-demand
only) and a **Battle LOD** (live, instanced). Optional **Far LOD / imposter** for the
distant band. Budgets assume the shared 512/1024 authored map carries the detail.

| Class (examples) | Typical live instances | Showcase LOD0 | **Battle LOD (live)** | Far band |
|---|---|---|---|---|
| Commander / hero | 1 | ≤ 20–32K | **≤ 2.5–3K** | LOD1 |
| Landmark structure (HQ, factory, superweapon) | 1–6 | ≤ 12–20K | **≤ 2–4K** | LOD1 |
| Heavy / experimental (Rhino, Goliath, TITAN, Basilisk) | tens | ≤ 12–16K | **≤ 1–1.5K** | ≤ 400 |
| Standard vehicle / artillery (Striker, Thumper, Bombard) | 100s | ≤ 8K | **≤ 600–1,000** | sprite/imposter |
| Air (Wasp, Raptor, Kestrel) | 100s | ≤ 8K | **≤ 500–800** | sprite/imposter |
| Infantry (rifle, flame) | up to ~1000 | — | **≤ 200–400** (or keep procedural/sprite) | sprite |
| Neutral world props | many | (rebuild GLBs already 32–1,214) | keep as-is | sprite |

**Reference — current authored assets vs target:** Nova heavy tank is **32,018**
(LOD0) / **14,728** (LOD1) → LOD1 is ~10× over a heavy-class battle budget. Nova
factory **11,564 / 6,012** → LOD1 ~1.5–3× over a landmark budget. Both need a real
battle LOD added; the existing LOD1 is **not** it.

**Terrain (separate but the biggest single win):** `TGRID=320` submits ~200K tris
every frame, no chunking/cull, 32-bit indices. Chunk + frustum-cull + 16-bit indices
before any unit-LOD work moves the needle more than the whole roster.

## Shared vs bespoke map strategy (the memory-scaling decision)

A *unique* authored map set per unit does not scale to 1000 instances — that's why
the live game uses **one shared 2816² atlas + faction tile-remap** today (docs: "no
unique GPU texture per cosmetic variant"). So:

- **Bespoke authored BaseAO/NRE/Masks** (1024 showcase, **512 battle**) for
  **low-count hero/landmark** assets only: commander, HQ, factory, superweapon, key
  defense — ~5–8 per faction. These are the largest, most-inspected objects.
- **Mass units** (infantry, standard vehicles, air) → keep the **shared atlas +
  faction semantic tile-remap** (`tfcNovaSurfacePass` etc.). Do not give them unique
  maps.
- **Optional middle tier:** one **shared *bespoke* unit atlas per faction** covering
  the common families (better than the generic atlas, still one texture set / faction).
- Net: bespoke where instance-count is low; shared where it's high.

## Bake / verify pipeline (uses existing tools)

1. **Author** high-poly in Blender — pattern of `tools/build-material-v2-{tank,nova-factory}.py`.
2. **UV0** unwrap, no stretch; assign the V2 semantic material regions (BUILD/ARMOR/
   TEAM/GLASS/ENERGY/WEAPON/TRIM/BADGE…).
3. **Bake** BaseAO + NRE + Masks at 1024 (`tools/bake-material-v2-*.py`); this is the
   step that captures the high-poly detail as normals/AO.
4. **Decimate** to the class Battle-LOD budget (and a Far LOD) **reusing the same
   maps** — add the lower tier the current LOD1 lacks.
5. **Import** via `tools/glb-v2-import.mjs` → `assets/data/*-v2*.js`.
6. **Verify:** `tools/verify-bespoke-packs.mjs` (should flip from TEMPLATE→authored),
   `tools/verify-unit-v2.mjs` (routing), per-faction semantic-pack verifiers (guard
   raw `SERVO`/gait channels).
7. **Gate:** the 8-state `docs/ART_V2_ACCEPTANCE.md` visual+perf gate at 100/200 units,
   **on the real GPU** (headed Chrome, `--use-angle=d3d11`, not SwiftShader).
8. `node tools/bundle.mjs` + `pack-www`, real-GPU capture, **commit per asset**.

## Bounded engine changes required

- **Promote V2 from the `?materiallab` gate to live** for chosen assets, *behind each
  asset key* (docs: "integrate each pack behind its asset key, then move prototype →
  complete") — never a global flip.
- **Per-instance LOD bucketing** for authored units: reuse `renderBand()` to split an
  asset's instances into near(battle-LOD)/far(imposter) streams. Phase 1 can ship a
  single battle LOD and lean on the existing sprite path for the far band; add
  bucketing only if the near-LOD count alone blows the budget.
- **Floor the detail-normal fade** (post-mortem lesson) — never mix the base normal to
  flat.

## Proof-of-concept sequence (validate the loop before scaling)

1. **Nova heavy tank** (only fully-authored asset): bake a **~1–1.5K battle LOD** from
   the existing 32K high-poly, reuse its NRE normal map, wire into the live V2 path
   behind its key. Measure 100/200 units, day/night/damage, real GPU, vs the
   procedural tank. Pass = ACCEPTANCE gate + **no fps regression**.
2. **Nova HQ + factory** (landmarks — the project's own stated first target, and the
   user's building-texture focus). Factory already has an authored pack.
3. Roll out **one family per faction at a time** (Nova → Dominion → Syndicate →
   Brood), each its own commit + gate. Mass units stay on the shared route.

## Acceptance & guardrails

- Every asset passes `ART_V2_ACCEPTANCE.md` on the real GPU before it goes live.
- One git commit + tag-worthy checkpoint per asset; nothing global.
- Keep the shared-atlas semantic route as the permanent large-army fallback.
- Regression tests to add alongside (from the post-mortem): battle-LOD tri-count
  ceiling per class, and a "base normal never fully faded" shader assertion.
