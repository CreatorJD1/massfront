# NEXUS-VII functional room materials

- Created: 2026-08-23
- Purpose: room- and section-specific interior surfaces for the NEXUS-VII management cutaway.
- Generation: nine original image-generation masters; no reference image or protected game asset was embedded, copied, or transformed.
- Production resolution: 1024 x 1024 per channel.
- Channels: lighting-neutral albedo, tangent-space normal, height, roughness, metallic, AO, and restrained emissive.
- Seam verification: every production channel has identical opposing border texels (`edge_max=0`, `edge_mean=0.0000`).
- Derivation: `tools/build_interior_pbr_maps.py` removes broad generated illumination, closes borders, and derives pixel-aligned PBR channels from each albedo master.
- Source masters are preserved under `assets/textures/uga/source/`.

## Assignment

| Material family | Districts | Visual language |
|---|---|---|
| `uga-command-navigation` | Command Core, Navigation Bridge | precision gunmetal, amber route inlays, restrained cyan instrumentation |
| `uga-science` | Survey Lab, Research Directorate | graphite and pale ceramic laboratory panels, teal/violet status detail |
| `uga-operations` | Mission Operations, Strike Bay, Logistics | dark anti-slip access plates, tie-down structure, amber readiness marks |
| `uga-industrial` | Fabrication, Engineering | heavy tool steel, heat-treated inserts, maintenance channels |
| `uga-civic-medical` | Habitat & Medical | warm composite, mineral ceramic, muted biophilic resin |
| `uga-diplomatic` | Coalition Embassy | midnight metal, graphite composite, restrained bronze framing |
| `uga-deck-floor` | All interior decks | broad anti-slip access plates, flush latches, human-scale maintenance rhythm |
| `uga-pressure-wall` | Pressure walls and bulkheads | vertical composite cladding, structural ribs, recessed service channels |
| `uga-interior-transit` | Room roads, ramps, concourses, and tunnel floors | human-scale graphite transit plates, anti-slip service lanes, restrained cyan route inlays |
| `uga-window-glazing` | Window ribbons and district facility panes | dark pressure-glass mullions with a dedicated cyan pane-only emissive mask |

Exterior hull, deck floors, pressure walls, district facilities, glass, and emissive system trim are separate material classes. Exterior hull material is never assigned to district floors or facility architecture.

`uga-window-glazing` is generated deterministically by
`tools/build_window_glazing_maps.py`. Its emissive texture contains no baked
halo: it is the precise input mask consumed by the runtime depth/fog-aware
window bloom pass. The runtime reuses the authored window surfaces and does not
add glow geometry.

## Source prompts

All prompts requested an orthographic, lighting-neutral, repeatable square material sheet with no perspective, text, logos, symbols, border, large landmark, baked directional light, watermark, or copied game art. Each family then specified only its functional material language and restrained accent palette.

The `uga-interior-transit` source prompt requested an original seamless,
orthographic, neutral-lit spacecraft transit-deck sheet with graphite access
plates, narrow anti-slip service channels, human-scale seams, and sparse muted
cyan inlays. It explicitly excluded text, logos, arrows, directional lighting,
baked glow, perspective, props, and reference-image reuse. The generated master
is preserved as `assets/textures/uga/source/uga-interior-transit-source.png`.
