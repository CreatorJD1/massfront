# UGA Material Asset Provenance

The runtime does not use the supplied game screenshots as textures, skyboxes,
ship art, portraits, or backgrounds. They were composition/quality references
only. The UGA hull and interior material sources below were generated for this
isolated MASSFRONT test room on 2026-08-20, then converted into aligned PBR map
sets locally.

## Hull material source

Output:

`assets/textures/uga/source/uga-hull-material-source.png`

Exact image-generation prompt:

```text
Use case: stylized-concept
Asset type: seamless tileable game texture source for a UV-mapped 3D civilization-ark hull
Primary request: orthographic seamless dark titanium and ceramic armor plating material with dense physically believable panel topology, recessed maintenance seams, micro-fasteners, layered access hatches, subtle thermal discoloration, edge wear, shallow engraved service channels, and small non-text emissive inlays
Scene/backdrop: flat material swatch only, no environment
Subject: one continuous hard-surface sci-fi hull material
Style/medium: photorealistic PBR material source, evenly lit, production texture scan appearance
Composition/framing: square top-down orthographic texture, seamless on all four edges, uniform texel density, no perspective
Lighting/mood: neutral diffuse material-capture lighting with minimal baked shadow
Color palette: graphite titanium, blue-black ceramic, restrained warm metal wear, tiny cyan and amber emissive accents
Materials/textures: crisp high-frequency normal-worthy detail plus medium panel forms; no large unique focal feature
Constraints: seamless/tileable; original design; no text; no numbers; no symbols; no logos; no watermark; no scene, ship, border, frame, or perspective
Avoid: generic hexagons, checker pattern, flat rectangles, obvious repeating motif, excessive neon, painted illustration, grunge-only noise
```

## Interior material source

Output:

`assets/textures/uga/source/uga-interior-material-source.png`

Exact image-generation prompt:

```text
Use case: stylized-concept
Asset type: seamless tileable PBR texture source for UV-mapped UGA civilization-ship interior architecture
Primary request: orthographic seamless lived-in megaship interior wall and deck material combining layered dark titanium panels, ceramic structural ribs, recessed service channels, narrow maintenance grilles, inset glass strips, subtle hazard-edge wear, micro-fasteners, and dense believable fabrication detail
Scene/backdrop: flat material swatch only, no room or environment
Subject: one continuous premium hard-surface interior material suitable for command decks, habitat infrastructure, laboratories, hangars, and industry
Style/medium: photorealistic AAA PBR material source, material-scan appearance, neutral capture
Composition/framing: square top-down orthographic texture, seamless on all edges, uniform texel density, no perspective
Lighting/mood: neutral diffuse illumination, minimal baked shadow
Color palette: charcoal titanium, cool gunmetal, pale ceramic inserts, restrained warm wear, narrow cyan and amber light channels
Materials/textures: strong height/normal detail at multiple scales, realistic roughness variation, clean emissive masks
Constraints: seamlessly tileable; original MASSFRONT design; no readable text, numbers, logos, symbols, watermark, border, frame, room perspective, props, people, or exterior scene
Avoid: basic repeating rectangles, generic hex pattern, excessive neon, flat illustration, random grunge, obvious AI seams
```

## Derived aligned maps

`tools/build_pbr_maps.py` produces these 1024 × 1024 maps for both
`uga-hull` and `uga-interior`:

- base color;
- tangent-space normal;
- roughness;
- metallic;
- ambient occlusion;
- emissive;
- height.

The script derives every channel from the same seamless source so a panel seam
cannot move between base color, normal, roughness, emissive, and height. It also
feathers opposing edges and uses wrap-aware Sobel derivatives for the normal
map. The outputs are authored source material for Blender, not generic runtime
background imagery.

Example rebuild:

```powershell
python tools/build_pbr_maps.py assets/textures/uga/source/uga-hull-material-source.png assets/textures/uga uga-hull --size 1024
python tools/build_pbr_maps.py assets/textures/uga/source/uga-interior-material-source.png assets/textures/uga uga-interior --size 1024
```

Blender embeds the production texture channels into the exported GLBs. AO is
bound to the standard glTF occlusion channel and also contributes 38% to the
Blender preview's base-color multiply. Height is packed losslessly into normal
alpha; normal RGB remains standards-compliant and feeds a Normal Map → subtle
Bump → Principled chain. Editable `.blend` sources and deterministic QA renders
are retained separately from the runtime packages.

## Hero planets

Six original 2:1 equirectangular material sources were generated specifically
for Caldris, Ithara, Orison, Nacre, Meridian K-4, and Tethys Foundry. The exact
prompts, exclusions, output paths, and intended geological identities are
recorded in `docs/PLANET_TEXTURE_PROMPTS.md`. No supplied game screenshot is
present in these sources or their runtime maps.

`tools/build_planet_pbr_maps.py` derives aligned 1024 × 512 base color, normal,
height, ambient-occlusion/roughness/metallic, emissive, and weather maps. It
uses wrap-aware longitude sampling, reflected pole sampling, continuous cloud
edges, and recessed volcanic fissures. Runtime planet groups remain hidden
until all six channels decode; a partial package is disposed rather than shown.

## Three-system contact pack

`tools/blender/build_showcase_contact_pack.py` builds the nine exact foreground
contacts from authored profiles, lofts, prisms, lathes, swept paths, and
`from_pydata` meshes. It does not invoke Blender mesh-primitive creation. The
runtime GLB embeds the UGA hull/interior PBR images above and contains genuine
LOD0/LOD1/LOD2 children for every contact. The editable source is
`assets/source/blender/massfront-showcase-contacts.blend`; the reproducible
runtime export is `assets/models/massfront-showcase-contacts.glb`.

The verified 2026-08-20 export is 16,551,044 bytes with SHA-256
`06B906F030025982834A89E75A9575DE02FDB3BC73833D81E1B4203111F7F5A2`.
LOD totals are 67,022 / 27,966 / 7,866 triangles. Blender's shared packed-map
sampler warning is nonfatal; parsed glTF bindings confirm that the embedded ORM
image is assigned to both occlusion and metallic-roughness inputs.

## Personnel portraits

The three resident commanders and twelve starting specialists use original
high-resolution illustrated portraits generated specifically for this test
room. Runtime copies are under `assets/textures/personnel/`; no portrait is
derived from a supplied screenshot, real person, existing game character, or
third-party artwork. The complete prompt set, roster-to-file mapping, and
fail-closed runtime acceptance contract are retained in
`docs/PERSONNEL_PORTRAIT_PROMPTS.md`.

The Factions and Deployment views never synthesize a portrait from a crest,
initials, CSS, or generic silhouette. An absent, undersized, or unapproved
image keeps that person unavailable and exposes the exact art lock instead.
