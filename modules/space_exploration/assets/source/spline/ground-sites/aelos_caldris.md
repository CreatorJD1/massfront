# Caldris Orbital Ring — Spline source brief

**Status:** authoring brief only. `aelos_caldris` is a catalog/mission seed with no tactical geometry, navmesh, collision, dedicated texture pack, or runtime capture. Target asset ID: `gsite_aelos_caldris_customs_01`; Spline root: `GSITE_AELOS_CALDRIS`.

## Lore and presets

Caldris belongs to populated Aelos: a blue-white UGA core anchorage above an oceanic biosphere preserve, threaded by regulated civilian traffic. “Caldris Claim” holds `caldris_customs_core` amid competing resident-faction claims. Build two related but geometrically distinct presets: `preset_aelos_caldris_arcology_city` and `preset_aelos_caldris_customs_spaceport`. The silhouette must be a curved, inhabited ring ward—not a square ship room or a recolored NEXUS-VII interior.

## Dedicated modular kit

- Heroes: customs core, curved habitat viewport, mag-tram station, civic concourse tower, cargo lock, inspection gantry, ring service elevator.
- Modules: curved 4 m floor/wall arcs, pressure corridors, tram rails, inspection booths, civic partitions, cargo high-bay portals, service ducts, shutters, floor-contact end caps, and intact/breached glazing.
- Keep the customs core, curved skyline, landing-zone geometry, and tram/cargo relationship unique to Caldris. Shared Aelos bolts, utility props, and hidden gameplay proxies are support only.

## Materials, textures, and decals

Author three original 2K aligned PBR families: pearl arcology ceramic; teal civic glazing/transit inlay; customs scanner alloy. Supply basecolor, tangent normal, ORM, optional height, and restrained emissive. The 12-entry decal program covers original UGA customs/ring-sector identity, resident claim overlays, tram and cargo-weight grids, evacuation/shelter routes, restricted-fire zones, and decompression warnings. Generic recolors and palette-only faction variants are forbidden.

## Scale, routes, and landing zones

- Envelope: 320 × 256 m; 4 m structural grid; 0.8 m nav cell.
- `customs_loop`: P/L/V, at least 18 m clear. `cargo_high_bay`: P/L/V plus one conditional M route through a 24 × 12 m portal and a 42–48 m turn court. `customs_office_flank`: P only, at least 3 m.
- `customs_ring`: 40 × 36 m, P/L/V. `cargo_lock`: 48 × 40 m, P/L/V/M.
- Preserve two complete mixed-unit routes. Civilian cover, signage, props, shutters, and debris may not enter validated envelopes. TITAN is explicitly excluded; the compact site does not claim strategic-unit clearance.

## Destruction and gameplay proxies

Author named `intact_civic`, `customs_lockdown`, `pressure_breach`, and `post_breach_sealed` states. A decompression state may close one route only after an alternate seals. Every state needs explicit collision, nav, cover, LOS, shot, blast, and hazard behavior. Use `COLL_`, `NAV_`, `PORTAL_`, `LOS_`, `SHOT_`, `OBJ_CALDRIS_CUSTOMS_CORE`, `LZ_CUSTOMS_RING`, `LZ_CARGO_LOCK`, and `DESTRUCT_` nodes; never use render meshes as collision.

## LOD, collision, export, and concept gate

Follow `mf_ground_site_lod_v1`, `mf_ground_site_collision_v1`, and `mf_ground_site_export_v1` in `ground-site-authoring-manifest.json`: deliberately authored LOD0/1/2, LOD1 ≤ 40% and LOD2 ≤ 12% of each family’s LOD0, stable openings at every LOD, simple watertight collision proxies, applied transforms, UV0/tangents, and standards-bound GLB 2.0 PBR. Author in Spline at 1 unit = 1 m, Y-up/-Z-forward; normalize the candidate to Z-up/+Y-forward.

Final geometry is blocked on an original measured four-panel Caldris board showing the curved plan, cargo high bay, civilian-safe fire lanes, clearance sections, and phone crop. No Spline scene or model/texture source currently exists, so provenance fields remain null and runtime status remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are visual-language references only—for hierarchy, combined-arms readability, cover, and environmental storytelling. No mesh, texture, decal, layout, icon, logo, or faction design from those games may be copied, traced, extracted, or presented as source provenance.
