# Morrow Freeport — Spline source brief

**Status:** authoring brief only. `aelos_freeport` is a data-only mission seed with no tactical level, navigation, collision, dedicated art pack, or runtime evidence. Target asset ID: `gsite_aelos_freeport_morrow_01`; Spline root: `GSITE_AELOS_FREEPORT`.

## Lore and presets

Morrow is Aelos commerce at its busiest and least trustworthy: legitimate docks and crowded market galleries over covert archive/service routes. “Black Manifest” recovers `morrow_archive_stack` through `service_lock` or `freight_shadow`. Build two distinct presets: `preset_aelos_morrow_trade_spaceport` and `preset_aelos_morrow_refinery_quay`. The refinery is a dedicated fuel/cryogenic process site with pressure vessels and containment—not a tank-farm recolor of the market.

## Dedicated modular kit

- Heroes: archive stack, market hall, cargo carousel, docking clamp, crane gantry, freight lift, smuggler vault, customs booth, fuel manifold.
- Modules: 4 m freight decks, 28–30 m two-way loop pieces, stackable cargo frames, market/service partitions, docking bridges, crane rails, pressure pipes/valves, spill curbs, archive breach panels, and personnel duct flanks.
- Archive silhouette, Morrow brands, covert route, carousel, and refinery-quay process train remain unique.

## Materials, textures, and decals

Author four original aligned 2K PBR families: greasy cargo steel; worn market composite; fuel-stained deck/rubber; faded commercial panels and shutters. Provide basecolor, tangent normal, ORM, optional height/emissive, plus seam/channel proofs. The 16 decals include original cargo companies and stall IDs, hazardous freight, fuel/no-spark, customs inspection, forklift lanes, evacuation, clamp danger, Syndicate dead-drop language, and manifest-objective overlays. No brand, preset, or faction variant may be a palette swap.

## Scale, routes, and landing zones

- Envelope: 320 × 256 m; 4 m grid; 0.8 m nav cell; P/L/V only.
- `freight_vehicle_loop`: P/L/V, 28 m minimum two-way clear width. `market_service_flank`: P, 3 m minimum. `archive_breach_route`: deterministic P/L alternate.
- `service_lock`: 40 × 32 m, P/L. `freight_shadow`: 48 × 36 m, P/L/V.
- Indexed cargo stacks define cover/LOS. Cranes and fuel props may never intrude into the certified loop. Medium mechs and TITAN are excluded.

## Destruction and gameplay proxies

Author `operational_trade`, `crane_fall_indexed`, `archive_breach`, and `fuel_lock_burned`. A fallen crane or cargo pile may change cover only through a declared state and cannot close the last route. Fuel damage declares hazard and blast effects. Use separate `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `HAZARD_FUEL_`, `OBJ_MORROW_ARCHIVE_STACK`, `LZ_SERVICE_LOCK`, and `LZ_FREIGHT_SHADOW` nodes.

## LOD, collision, export, and concept gate

Apply the shared LOD/collision/export contracts: authored LOD0/1/2, LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserved crane/archive silhouettes and route apertures, simple watertight collision, applied transforms, UV0/tangents, and GLB 2.0 PBR. Spline authoring is 1 unit = 1 m, Y-up/-Z-forward; normalize candidates to Z-up/+Y-forward.

Final geometry is blocked on an original measured board covering the commercial loop, covert archive, refinery process route, class clearances, destruction states, and phone crop. No Spline scene or dedicated model/texture provenance exists; runtime status remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are references for visual hierarchy, combined-arms readability, cover, and environmental storytelling only. Do not copy, trace, extract, or imitate their specific assets, layouts, logos, decals, factions, or named props.
