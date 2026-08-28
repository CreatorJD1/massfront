# Meridian Colony — Spline source brief

**Status:** authoring brief only. `karak_meridian` is still a catalog/mission seed with no tactical level, class-aware navigation, collision, dedicated site art, or runtime capture. Target asset ID: `gsite_karak_meridian_colony_01`; Spline root: `GSITE_KARAK_MERIDIAN`.

## Lore and presets

Meridian K-4 is Karak’s abruptly silent colony world. “Pale Bloom” purges `meridian_breeder_nest` amid spore fog and civilian remains. Build three genuinely distinct presets: `preset_karak_meridian_silent_colony`, `preset_karak_meridian_pressure_biodome`, and `preset_karak_meridian_containment_base`. The civilian clinic, school, habitat, greenhouse, roads, and evacuation evidence must remain readable beneath a graded Brood takeover. The biodome is not an Aelos dome recolor; the containment base is a later UGA layer, not the colony’s original identity.

## Dedicated modular kit

- Heroes: breeder nest, clinic, transit court, colony habitat, evacuation depot, water tower, comms mast, school/civic hall, greenhouse biodome, road bridge, quarantine gate.
- Modules: 4 m civic/hab pieces, 16–30 m roads, 24 × 12 m gates, 48 m courts, pressure tunnels, dome shell/rupture panels, utility alleys, decon/burn-lane hardware, rooftop insertion pieces, Brood contact blends, and personnel shortcuts.
- Clinic, breeder nest, civic landmarks, Meridian signage, biodome silhouette, and containment failure states remain unique.

## Materials, textures, and decals

Author five original aligned 2K PBR families: colony concrete/paving; hab composite; wet vegetation/spore residue; quarantine steel/plastic; Brood infestation blend. The 18 decals include colony districts, clinic/medical, utilities, evacuation, shelters, missing-person notices, quarantine, spore danger, UGA containment, breeder-nest objective, and purge states. The Brood layer requires new living maps and geometry—not hue-shifted colony materials.

## Scale, routes, and landing zones

- Envelope: 480 × 384 m; 4 m grid; 1.25 m nav cell; P/L/V/M.
- Two complete colony road loops admit P/L/V/M; one uses 24 × 12 m gates and a 48 m turn court, the other is at least 28 m two-way. Clinic/service flanks are P-only at 3 m minimum.
- `clinic_roof`: 32 × 28 m, P/L only; reject vehicles and medium mechs. `transit_court`: 56 × 48 m, P/L/V/M.
- Props, hedges, dome braces, bodies, spore masses, and rubble may not intrude into road/LZ envelopes. TITAN is excluded.

## Destruction and gameplay proxies

Author `silent_intact`, `brood_overgrown`, `nest_purged`, and `civic_collapse_safe_evacuation`. Nest destruction may open contamination hazards and static rubble but cannot sever evacuation. Dome rupture and containment failure each declare portals, collision, nav, cover, LOS, shot, blast, and spore volumes. Use separate `COLL_`, `NAV_`, `PORTAL_`, `HAZARD_SPORE_`, `OBJ_MERIDIAN_BREEDER_NEST`, `LZ_CLINIC_ROOF`, and `LZ_TRANSIT_COURT` nodes.

## LOD, collision, export, and concept gate

Use authored LOD0/1/2 with LOD1 ≤ 40% and LOD2 ≤ 12% of LOD0, preserving civic/biodome/nest silhouettes and all openings. Keep simple watertight collision and nav proxies invariant across LODs. Export applied-transform, UV0/tangent, standards-bound GLB 2.0 PBR at 1 m Spline scale; author Y-up/-Z-forward and normalize to Z-up/+Y-forward.

The original concept at `../../concepts/ground-sites/meridian-colony/meridian-colony-brood-infestation-concept-v1.png` is available as a source reference, with provenance in `../../concepts/ground-sites/meridian-colony/PROVENANCE.md` and SHA-256 `61d7d3b697c62b024b0db6e717c1fbb44a49327975ae5fb75afb892c6c018a87`. It is not runtime proof. Final geometry remains blocked until the board has an approved measured plan, rooftop-versus-court class restrictions, route sections, and phone crop. No Spline/model/texture source exists; runtime remains **DATA-ONLY**.

## Reference boundary

Command & Conquer 3: Tiberium Wars, Supreme Commander 2, XCOM 2, and StarCraft II may guide only macro hierarchy, combined-arms scale, tactical cover, and infestation storytelling. Do not copy, trace, extract, or closely reproduce their buildings, organisms, textures, decals, layouts, factions, logos, or named props.
