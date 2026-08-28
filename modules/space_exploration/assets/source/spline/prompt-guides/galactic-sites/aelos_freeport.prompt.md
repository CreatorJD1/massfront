# Spline 3D production prompt — Morrow Freeport

**Status:** `source_prompt_only`  
**Site ID:** `aelos_freeport`  
**Map asset ID:** `gsite_aelos_freeport_morrow_01`  
**Mission / objective:** `syndicate_black_manifest` / `morrow_archive_stack`  
**Spline root:** `GSITE_AELOS_FREEPORT`

## Paste-ready art-direction prompt

> Build an original, game-ready modular environment for Morrow Freeport, Aelos's crowded trade station. Make a coherent working cargo district: a broad freight loop, market hall, cargo carousel and docking clamp above covert service corridors and a hidden archive route. The skyline must layer cranes, lifts, signs, pressure pipes and stacked freight while keeping combined-arms movement obvious from an RTS camera. Legitimate commerce and Syndicate concealment share one structure but use different spatial layers. Do not create a generic warehouse yard, random containers or copied science-fiction brands.

## Measured layout and gameplay envelope

- Site envelope **320 × 256 m**, **4 m grid**, **1 unit = 1 m**, **0.8 m nav cell**.
- `freight_vehicle_loop`: continuous P/L/V route at least **28 m two-way clear**.
- `market_service_flank`: P-only, at least **3 m**.
- `archive_breach_route`: deterministic P/L alternate, open before any permanent primary-route loss.
- `LZ_SERVICE_LOCK`: **40 × 32 m**, P/L. `LZ_FREIGHT_SHADOW`: **48 × 36 m**, P/L/V.
- Indexed cargo stacks create authored cover and LOS. Cranes, pipes, market props, spill barriers and damage meshes never enter certified envelopes.
- Exclude medium mechs and TITAN.

## Hero and modular model set

Create hero LOD families for `morrow_archive_stack`, `morrow_market_hall`, `morrow_cargo_carousel`, `morrow_docking_clamp`, `morrow_crane_gantry`, `morrow_freight_lift`, `morrow_smuggler_vault`, `morrow_customs_booth`, and `morrow_fuel_manifold`.

Build modular 4 m freight decks; 28–30 m straight/corner/T freight loops; stackable cargo frames; market/service partitions; docking bridges; crane rails; freight doors; pressure pipes/valves; spill curbs; archive breach panels; personnel ducts; forklift bays; and route-safe clutter sockets. Produce two genuinely different assemblies: `preset_aelos_morrow_trade_spaceport` and `preset_aelos_morrow_refinery_quay`. The refinery-quay needs a readable process train, pressure vessels, cryogenic transfer, containment and shutdown access—not a tank-farm recolor.

## 2K PBR material and decal set

Author four aligned seamless **2048²** families:

1. `morrow_greasy_cargo_steel` — industrial steel, edge wear and localized grease controlled by roughness.
2. `morrow_worn_market_composite` — replaceable wall/floor panels, foot traffic and repair patches without baked shadows.
3. `morrow_fuel_stained_deck_rubber` — anti-slip deck/rubber with contained spill and tire-contact variants.
4. `morrow_faded_commercial_panel_emissive` — painted shutters and selective low-area sign emission.

Deliver BaseColor, tangent Normal, ORM, optional Height/Emissive and seam/channel proofs. Create 16 original decals: cargo-company/stall identities, hazardous freight, fuel/no-spark, customs inspection, forklift lanes, evacuation, docking-clamp danger, Syndicate dead drops and manifest objective overlays. No real or reference-game branding.

## State set

- `operational_trade`: clean functional port with disciplined prop sockets and no Brood.
- `crane_fall_indexed`: dedicated fallen-crane state with declared cover/LOS and a surviving alternate.
- `archive_breach`: opened covert route with cut panels and objective wayfinding.
- `fuel_lock_burned`: charred containment, inactive flame aftermath and declared fuel hazard/blast state.

Route-affecting destruction is a named mesh swap, never a random physics pile.

## Technical construction contract

- Spline Y-up/-Z-forward; runtime candidate Z-up/+Y-forward. Origin at site floor datum.
- Apply transforms, triangulate, no negative scale, cameras/lights, hidden duplicate render meshes or embedded references.
- Every textured mesh has UV0+tangents. Maintain consistent texel scale; pad atlas islands; keep decals separate and declare alpha.
- Grid-ready pivots at floor contact; crane/lift/clamp pivots on actual rails/axes.
- Node contract: `GEO_`, `LOD0_`, `LOD1_`, `LOD2_`, `COLL_`, `NAV_`, `PORTAL_`, `COVER_`, `LOS_`, `SHOT_`, `OBJ_MORROW_ARCHIVE_STACK`, `LZ_SERVICE_LOCK`, `LZ_FREIGHT_SHADOW`, `EXTRACT_`, `HAZARD_FUEL_`, `DESTRUCT_`, `ROOF_`, `OCCLUDER_`.
- Build separate simple watertight collision, nav, cover, LOS and projectile proxies. Collision never uses high-detail freight meshes.
- LOD1 ≤ **40%**, LOD2 ≤ **12%** of LOD0 while preserving archive, carousel, crane and route apertures.
- Export editable source and standards-bound GLB candidate with stable material names, source URL, `intake.json` and provenance.

## Spline execution sequence

1. Under `GSITE_AELOS_FREEPORT`, establish route, portal, LZ, process and objective guides.
2. Greybox the freight loop, market flank and archive alternate; validate clear widths first.
3. Author archive, market, carousel, clamp and crane hero families.
4. Build and snap-test the freight/market kit; make the refinery-quay as a separate process assembly.
5. Add gameplay proxies and all four deterministic state collections.
6. Bind the four 2K families and place decal groups by system ownership.
7. Author LODs and tactical roof/occluder groups; inspect phone-scale legibility.
8. Export source/candidate packages without promoting runtime status.

## Acceptance checks

- Freight loop, market layer and hidden archive route read separately but form one believable port.
- Exact LZs and all three routes remain clear in every state.
- Trade port and refinery quay are not palette variants.
- Nine hero families, modular intersections, four PBR sets and 16 decals are complete and uniquely named.
- Crane/fuel destruction cannot erase the last legal route.
- Phone portrait captures retain objective, vehicle loop and extraction readability.

## Original-work boundary

Use Command & Conquer 3, Supreme Commander 2, XCOM 2 and StarCraft II only to study hierarchy, combined-arms spacing and environmental storytelling. Do not copy or trace their buildings, industrial kits, containers, logos, layouts, surfaces, decals or factions.
