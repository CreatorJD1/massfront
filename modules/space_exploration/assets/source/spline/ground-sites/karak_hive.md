# Karak Primary Hive — Spline source brief

**Status:** authoring brief only. `karak_hive` is a data-only mission seed with no tactical map, class-aware navigation, collision, dedicated living-material pack, or runtime capture. Target asset ID: `gsite_karak_hive_heart_01`; Spline root: `GSITE_KARAK_HIVE`.

## Lore and preset

Karak’s final site is the system-scale infestation made local: a living, non-humanoid Brood megastructure under acidic atmosphere and neural spores. “Hive Heart” purges `karak_hive_heart` from `vascular_breach` or `thermal_vent`. `preset_karak_primary_hive_infestation` must feel grown around circulation, feeding, heat, and neural function. It is never a humanoid city, a resident-faction base, or metal buildings recolored organic.

## Dedicated modular kit

- Heroes: hive heart, vascular gate, thermal vent, brood chamber, egg-sac cathedral, acid-pool basin, neural node, root bridge, bone arch, feeding pit, spore chimney, membrane valve, fossilized colony remnant.
- Modules: 4 m organic contact pieces, two 24 × 12 m artery/gate families, 48 m chambers, 3 m crawl channels, tendon bridges, membrane portals, acid curbs, neural conduits, calcified supports, wound caps, and heart-state shells.
- Heart, chamber proportions, neural tissues, primary-hive silhouette, and boss-state surfaces remain unique; smaller Karak infestation blends may support Meridian/Spine only.

## Materials, textures, and decals

Author six original aligned 2K PBR families: living chitin; vascular tissue; acid wet film; calcified bone; spore crust; neural emissive tissue. The 20 decal/mask entries cover UGA containment/probe/breadcrumb/extraction overlays, organic wound states, acid residue, spore danger, neural pulses, and heart-objective masks. Biological variety must come from authored form, response, age, wetness, and damage—not hue shifts of one membrane.

## Scale, routes, and landing zones

- Envelope: 480 × 384 m; 4 m macro contact grid; 1.25 m nav cell; P/L/V/M.
- `organic_artery_a` and `organic_artery_b`: two complete P/L/V/M routes through 24 × 12 m membrane gates; at least one 48 m turning chamber. `crawl_observation_channels`: P only, 3 m minimum.
- `vascular_breach`: 44 × 36 m, P/L/V. `thermal_vent`: 56 × 48 m, P/L/V/M.
- Acid, roots, tendons, spores, corpses, and wound geometry may not intrude into legal envelopes. TITAN is excluded.

## Destruction and gameplay proxies

Author `dormant`, `alert`, `wounded`, and `heart_purged_safe_extraction`. Membranes and roots declare collision/nav/cover/LOS/shot/blast swaps; acid pools and spores are deterministic hazard volumes. The heart death sequence cannot collapse extraction before mission state advances. Use `COLL_`, `NAV_`, `PORTAL_`, `HAZARD_ACID_`, `HAZARD_SPORE_`, `OBJ_KARAK_HIVE_HEART`, `LZ_VASCULAR_BREACH`, `LZ_THERMAL_VENT`, and named `DESTRUCT_` nodes.

## LOD, collision, export, and concept gate

Use authored LOD0/1/2 with LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserving artery apertures, heart silhouette, neural emission, and hazard boundaries. Collision and nav use simple stable proxies, never the dense organic render surface. Export applied-transform, UV0/tangent, standards-bound GLB 2.0 PBR from 1 m Spline scale; author Y-up/-Z-forward and normalize to Z-up/+Y-forward.

Final geometry is blocked on an original measured board showing non-humanoid anatomy, dual arteries, heart-state sequence, acid/spore hazards, clearance sections, and phone crop. No Spline/model/texture source exists; provenance is unclaimed and runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II are visual-language references only—for macro readability, class scale, tactical paths, and infestation legibility. No creature, structure, mesh, surface, decal, animation, layout, logo, faction identity, or named prop may be copied, traced, extracted, or used as provenance.
