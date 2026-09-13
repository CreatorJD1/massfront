# MASSFRONT Modular Building Kit v1

Authoring/output target for MASSFRONT's whole-building city kit. Twelve
archetypes are authored three times over — **colonial**, **Nova brutalist** and
**ruined** — for **36 modules** that snap to the same **32 m placement grid** as
`mf-modular-road-v1`, so buildings and the roads that serve them land on one
lattice.

These are *whole buildings*, not a kit of parts. Each module is one complete
structure occupying 1×1, 2×1 or 2×2 grid cells, which is what lets it drop onto
the existing `WORLD_KIT` kind 6/7 render path without an engine change.

## The tiling contract

Three rules, held by all 36 modules. They are what make the pack a kit rather
than a folder of models:

| Rule | Value | Why |
| --- | --- | --- |
| Party-wall plane | facade stops at cell boundary − `0.06 m` | Two neighbours meet in a `0.12 m` recessed joint instead of two coplanar walls. Reads as an expansion gap; never z-fights. |
| Shared floor datum | plinth `0.6 m`, sill `1.2 m`, floor pitch `4 m` | Window bands line up across adjacent buildings of *different* archetypes, so a mixed row reads as one continuous street wall. |
| Typed edge sockets | `street` / `party_wall` / `service` / `open` | A placer reads these to decide what may butt against what. Party walls are authored **blind** — no glazing, no clutter — so tiled neighbours never stare into each other. |

Facade bay module is `8 m`, so mullions, piers and vents share one rhythm across
archetypes.

**Nothing may cross the party plane.** Each mass is composed *inside* its
envelope: a full-width base block and a full-width cornice that both return to
the plane, with a recessed, gently battered shaft between them. Neighbours meet
flush at base and cornice; the recessed shafts read as a deliberate vertical
joint between blocks. The first cut of the sci-fi vocabulary battered every wall
inward and flared base and cornice outward — it looked right on a lone module
and wrecked the kit, because neighbours then touched only at the ground and
opened into a wedge of daylight as they rose. `verify_tiling` checks both
failure modes (CROSS and GAP) on every module, every style, every LOD.

## Roofs: the wall continues, it is not capped

Worth stating explicitly because the first two attempts got it wrong by
retuning dimensions instead of fixing topology.

A roof must **not** be a separate solid parked on the shaft. The original build
stacked three of them — a cornice ring flaring wider than everything below it, a
floating deck box, and a parapet ring above that. Three disconnected parts read
as a hat sitting on a building at any size, so thinning the cornice and
darkening the trim helped a little and still looked wrong.

The correct construction, and what the generator does now:

1. Above the last window course the wall **returns** from the recessed shaft out
   to the party plane over a short transition.
2. It then runs **vertical as the parapet** — the parapet *is* the wall.
3. It finishes in a thin **coping**, flush with the plane, never proud of it.
4. The **roof slab is dropped `ROOF_PARAPET` (2.6 m) inside** that wall and stops
   short of its face, so you look down into a tray.

`add_parapet` no longer emits a ring at all; it exists only to knock chunks off
a derelict's coping. A side benefit: neighbouring copings meet across the joint
and draw one continuous line along a street, instead of every building wearing
its own lid.

Roof clutter density scales with **roof area** (`3 + area/190`), because a fixed
count gave a 64 m civic hall the same four boxes as a 32 m hab and every large
roof read as an empty tray. Every third unit is a finned louvre bank rather than
a coin flip — leaving them to chance meant half the modules shipped without any.

## Why it reads as sci-fi

The shell is not a box with a decal on it. It is an alternating stack of
spandrel slabs and window drums recessed by `slot`, so the shadow line is real
geometry. On top of that: metre-scale corner chamfers (every mass is an
octagonal prism), a heavy capping cornice, vertical mullion fins on the bay
pitch, pale applied armour plate against a darker wall, and bolted-on greebles —
riser stacks, vent banks, hab pods, dish arrays. Recesses are near-black; the
first version painted the whole kit one mid-grey and every form dissolved into
every other.

## Modules

Style sets differ only in surface language, detail density and state of repair —
never in footprint, floor datum or socket types. A colonial hab and a brutalist
hab are interchangeable on the same plot.

**Outpost scale** — `hab_block` (1×1), `gatehouse` (1×1), `watchtower` (1×1),
`depot_shed` (2×1)

**City scale** — `tower_slab` (1×1), `tower_spire` (1×1), `civic_hall` (2×2),
`arcology_stack` (2×2), `corner_infill` (1×1)

**Colony infrastructure** — `industrial_hall` (2×1), `tank_farm` (1×1),
`power_relay` (1×1)

Notable module behaviours:

- `gatehouse` clears **20 m × 10 m**, matching the road kit's own gate
  clearance, so a primary road runs straight through with no adapter piece.
- `corner_infill` is the piece that closes a block — two wings and a chamfered
  street corner, so a city reads as continuous frontage rather than detached
  objects.
- `tank_farm` and `depot_shed` carry `open` edges and chain end-to-end.
- `power_relay` keeps its pylons all the way to LOD2; they are its silhouette.
- The ruined set **shears** each form rather than authoring a separate short
  one, which is what keeps it footprint-compatible with the other two sets.
  Rubble is clamped inside the grid cell — a collapse that spills past the cell
  plane looks right alone and intersects the neighbour once tiled.

## Contents of each GLB

`LOD0`, `LOD1`, `LOD2`, a simplified collision proxy, cardinal `SOCKET_*`
empties (one **per cell edge**, so a 2×1 exposes two sockets north and two
south), a `SOCKET_ROOF` prop attach point, and a `NAV_*` metadata empty.

Chamfers are an LOD0-only cost: giving LOD1 even one bevel segment left the
brutalist and ruined sets at ~85% of their LOD0 count, and an LOD ladder that
saves nothing is just three copies of the same mesh.

## Blender command line

```bash
blender --background --python tools/blender/build-mf-modular-building-kit.py
```

With a JSON override file:

```bash
blender --background --python tools/blender/build-mf-modular-building-kit.py -- C:\path\building-kit-config.json
```

Supported override keys: `blend_path`, `export_dir`, `evidence_dir`,
`report_path`, `styles`, `save_blend`, `export_glb`, `render_evidence`,
`render_block_proof`, `render_resolution`, `evidence_views`.

To watch it build, drop `--background`.

## Blender MCP `execute_blender_code`

Runs the checked-in authoring script rather than duplicating generator code in
a chat prompt:

```python
import runpy

tool = runpy.run_path(
    r"C:\Users\Jason\Documents\Codex\MASSFRONT-main-source\tools\blender\build-mf-modular-building-kit.py",
    run_name="mf_modular_building_tool",
)
report = tool["build_building_kit"]({
    "render_evidence": True,
    "render_resolution": 768,
})
print(report["format"], report["moduleCount"])
```

The script replaces only the `MF_MODBLD_V1_SOURCE` collection and unused
generated materials, so it is idempotent and does not clear unrelated scene
content. Variation is **keyed value noise**, not a stream — every value is a
pure function of its own (call-site, index), so LOD1 cannot desync from LOD0 and
regenerating does not churn the exported GLBs.

## Evidence

`evidence/` holds four views per module (`iso_ne`, `iso_nw`, `top`, `entry`),
one overview per style set, and — the shot that actually answers the brief —
**tiling proofs**: four authored rows placed cell-exact on the grid,
photographed in iso and in street-level elevation. Any gap or overlap at a party
joint shows in the street elevation or nowhere.

Proof rows: `outpost_row` (colonial, 4 cells), `city_street` (brutalist,
6 cells), `colony_yard` (colonial, 6 cells), `dead_block` (ruined, 4 cells).

## Status

Exported GLBs are **source candidates**. This generator adds nothing to
`boot.js` or `assets/data/manifest.json`; runtime integration and phone-first
evidence remain a separate gate, same as the road kit.
