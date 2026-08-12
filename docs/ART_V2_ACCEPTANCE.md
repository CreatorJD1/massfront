# MASSFRONT Art V2 bespoke-pack acceptance

A unit or structure is **not** complete merely because it receives the shared
live Material V2 shader or faction surface pass. It becomes a completed bespoke
pack only after its authored source, texture triplet, renderer route and mobile
checks pass this gate.

## Asset declaration gate

Run from repository root:

```powershell
node tools/verify-bespoke-packs.mjs
```

Every entry declared in `MF2_BESPOKE_PACKS` must state:

- `faction`: the asset's actual faction provenance.
- `source`: `authored` or `semantic-bake`.
- `maps`: an authored map prefix, or explicit `null` only for a semantic-bake
  prototype.
- `uv`: `imported-uv0` for an authored bake or `generated-islands` for the
  temporary procedural prototype path.

An `authored` entry requires all three files under
`assets/textures/materials/`:

- `<prefix>-baseao.png` — RGB base color, alpha ambient occlusion.
- `<prefix>-nre.png` — normal XY, roughness and emissive packing used by the
  current V2 route.
- `<prefix>-masks.png` — structural, faction primary, faction secondary and
  wear/damage masks.

`semantic-bake` is a valid renderer prototype, but is reported as **PROTO** and
must not be presented as a finished authored pack.

## Visual gate at 412 x 915

Capture each completed asset in these eight states:

1. Arsenal close-up on the standard neutral lighting rig.
2. Typical battle camera on bright terrain.
3. Typical battle camera on dark terrain.
4. Strategic/far camera.
5. Selected state.
6. Unselected state.
7. Damaged/burning state, if the asset can be destroyed.
8. Beside two other faction assets of the same broad role.

Approve only when all are true:

- silhouette, faction, class/weapon role, and tier read in that order;
- armor, structural metal, machinery, weapon material and emissive areas do
  not collapse into one paint color;
- faction colors are mask landmarks, not an all-model tint;
- broad armor remains quiet at RTS distance; normal/detail maps do not shimmer;
- AO is present but cavities do not become black holes;
- emissive is restrained and remains legible without obscuring the silhouette;
- edge wear is localized to corners, seams, weapon interfaces and maintenance
  areas rather than covering the model in noise;
- no UV stretching, seams, floating modules, wrong faction geometry or missing
  normals is visible; and
- the burning version loses clean specular response and exposes scorched/damaged
  material rather than appearing as an undamaged model with a fire sprite.

## Performance gate

Each family must be tested in a representative active scene, not an empty
Arsenal only. Keep each test under approximately two minutes.

- Baseline the legacy/shared-material route, then test the V2 asset under the
  same camera and graphics quality.
- Test roughly 100 units plus a base, terrain, projectiles, effects, UI and
  selection highlights. Test about 200 where the selected class can plausibly
  occur at that count.
- Record device/browser, frame rate or frame time, draw calls/program switches
  when available, and whether GPU memory visibly rises while the camera moves.
- Verify far/strategic material LOD retains faction and role but removes
  sub-pixel detail costs.
- Reject a pack if it creates unique texture/mesh resources per cosmetic
  instance, causes a material-atlas/full-screen regression, or materially
  reduces large-army scale without a quality fallback.

## Completion record

For each pack, append to its faction queue:

`asset key | faction | authored source path | baseao/nre/masks prefix | visual
capture date | 100-unit result | 200-unit result or N/A | owner | status`

Status is one of `planned`, `prototype`, `review`, `complete`, or `blocked`.
