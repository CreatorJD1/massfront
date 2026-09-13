# Orison Derelict — Spline source brief

**Status:** authoring brief only. `veyra_orison` has catalog and mission data but no tactical map, navmesh, collision, dedicated site GLB/PBR pack, or runtime capture. Target asset ID: `gsite_veyra_orison_archive_01`; Spline root: `GSITE_VEYRA_ORISON`.

## Lore and preset

Orison is a tidally locked relic world in Veyra’s black-hole frontier. “Orison Recovery” boards a broken pre-UGA archive/transit megaframe under vacuum breaches, moving debris, and gravitic shear to recover `orison_memory_vault`. `preset_veyra_orison_derelict_megastructure` must read as one coherent axial structure with cold cyan wayfinding and localized warm damage—not disconnected sci-fi rooms or a recolored UGA hull.

## Dedicated modular kit

- Heroes: memory vault, broken axial spine, aft lattice, archive chamber, collapsed docking jaw, shattered reactor ring, breach shutters, debris bridge, emergency lift, escape-pod cluster.
- Modules: 4 m megaframe floors/walls, pressure bulkheads, data-glass galleries, service trunks, 18 × 8 m vehicle portals, conditional 24 × 12 m high bay, pressure tunnels, debris bridges, breach caps, roof/occluder groups, and personnel data ducts.
- The vault, axial silhouette, pre-UGA script, exact damage states, and landing-zone geometry remain Orison-only.

## Materials, textures, and decals

Author four original aligned 2K PBR families: burnt megaframe alloy; fractured data glass; frost/vacuum residue; red/amber emergency emission. The 14 decals include original pre-UGA archive script, fracture numbering, vacuum hatches, shear vectors, rescue routes, deck coordinates, Nova recovery, Syndicate salvage, emergency power, and memory-vault objective marks. These are dedicated surfaces, not palette variants of NEXUS-VII.

## Scale, routes, and landing zones

- Envelope: 192 × 160 m; 4 m grid; 0.5 m nav cell.
- `archive_recovery_loop`: P/L/V through 18 × 8 m portals. `measured_high_bay`: conditional P/L/V/M through 24 × 12 m portals only after clearance approval. `data_duct_flank`: P, 3 m minimum.
- `broken_spine`: 44 × 36 m, P/L/V. `aft_lattice`: 48 × 40 m, P/L/V and conditional M.
- Preserve objective-to-extraction redundancy in every damage state. TITAN is excluded.

## Destruction and gameplay proxies

Author `sealed_archive`, `shear_damaged`, `breach_open`, and `lattice_collapse_safe_extraction`. Bulkheads block LOS, shots, and blast while sealed; a breach opens a declared alternate; falling debris cannot erase the final extraction path. Use separate `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `HAZARD_VACUUM_`, `OBJ_ORISON_MEMORY_VAULT`, `LZ_BROKEN_SPINE`, `LZ_AFT_LATTICE`, and `DESTRUCT_` nodes.

## LOD, collision, export, and concept gate

Use authored LOD0/1/2 with LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserving the spine/vault silhouette and every route opening. Collision is simple, watertight, separate, and invariant across visual LODs. Export applied-transform, UV0/tangent, standards-bound GLB 2.0 PBR from 1 m Spline scale; author Y-up/-Z-forward and normalize to Z-up/+Y-forward.

The existing original concept at `../../concepts/ground-sites/orison-derelict/orison-derelict-combined-arms-concept-v1.png` is a source reference, not runtime proof. Its SHA-256 is `be4f697930285ef0e2c2843d0be5beedb2f66bf9c9c56977d523b6409fea2da2`. Final geometry remains blocked until that board gains an approved measured plan and class-clearance section. No Spline/model/texture source exists yet; runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II may inform only silhouette hierarchy, combined-arms scale, tactical cover, and readable ruin storytelling. No mesh, material, decal, layout, logo, faction language, or prop from those games is an asset source.
