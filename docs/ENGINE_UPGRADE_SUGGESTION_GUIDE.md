# MASSFRONT RTS — Engine Upgrade & Map Implementation Guide for Claude

**Document Version:** 2.0 · **Target Engine:** WebGL2 Mobile RTS · **Max Active Capacity:** 4,000 Units (4-Player Battlefield) · **Basis:** Codebase Audit & Map Library Specifications

---

## Purpose & Operating Rules

This document provides a prioritized, actionable guide for Claude to upgrade the **MASSFRONT** engine across **Volumetrics, Physics/Kinematics, Destruction, Texture/Material Architecture, and the Planetary Map System**.

### Core Engine Invariants (Must Never Break)
1. **Single Global Scope:** All files are concatenated without modules or `import`/`export` (`AGENTS.md` Rule 1).
2. **Texture Unit Invariant:** Texture Units **4, 5, and 6** remain strictly reserved for CSM sun shadows, SSAO, and bloom post-processing (`AGENTS.md` Rule 4).
3. **Zero-GC Combat Loop:** No per-frame object allocations inside `simTick()` or `render3D()`; use flat typed arrays (`Float32Array`).
4. **4K Population Ceiling:** Performance budget assumes up to 4,000 active units (1,000 per player across 4 seats).

---

# PART 1: Top Volumetrics Upgrades

```
                       VOLUMETRIC SHADING PIPELINE
 ┌────────────────────────────────────────────────────────────────────────────┐
 │  [ CAMERA RAY ]                                                            │
 │         │                                                                  │
 │         ▼                                                                  │
 │  [ HEIGHT FOG ] ──► Analytical Vertical Density: ρ(y) = ρ₀ · e^(-βy)       │
 │         │                                                                  │
 │         ▼                                                                  │
 │  [ WATER DEPTH ] ──► Read uDepthTex: d = depth_terrain - depth_water       │
 │         │          Apply Beer-Lambert: Color · e^(-σd) + Surf Foam         │
 │         ▼                                                                  │
 │  [ CLOUD SHADOW ] ──► Scrolling 2D Dual-Worley UV Offset in Sun Pass       │
 └────────────────────────────────────────────────────────────────────────────┘
```

### 1. Analytical Height Fog (Atmospheric Valley Mist)
- **Visual Impact:** Deep river valleys, low swamps, and craters hold thick morning mist, while elevated mountain plateaus and high-rises break above the fog into crisp sunlight.
- **Why it's the best option:** Requires **zero extra render passes** and **zero texture lookups**. Evaluated in $O(1)$ arithmetic inside the existing terrain and mesh fragment shaders.
- **Implementation Path:**
  - **File:** `src/engine/mesh.js` (inside `FST` fragment shader and `FSM` model shader).
  - **Shader Code:**
    ```glsl
    // Uniforms: uFogDensity, uFogHeightFalloff (beta), uFogBaseHeight
    float hDelta = max(0.0, vWorldPos.y - uFogBaseHeight);
    float fogDensity = uFogDensity * exp(-uFogHeightFalloff * hDelta);
    float dist = length(vWorldPos - uCamPos);
    float fogFactor = clamp(1.0 - exp(-dist * fogDensity), 0.0, 1.0);
    finalColor = mix(finalColor, uFogColor, fogFactor);
    ```

---

### 2. Depth-Aware Volumetric Water & Coastal Surf
- **Visual Impact:** Completely eliminates hard polygon intersection lines along coastlines; renders deep ocean bathymetry, shallow turquoise lagoons, and dynamic white surf.
- **Implementation Path:**
  - **File:** `src/engine/gl.js` (`drawWaterPass` / `buildWater`) and `src/engine/mesh.js`.
  - **Implementation Steps:**
    1. Bind the scene depth buffer as `uDepthTex` to the water draw call on Texture Unit 3.
    2. In the water fragment shader, calculate linear water depth: `float depthDelta = linearizeDepth(texture(uDepthTex, screenUV).r) - linearizeDepth(gl_FragCoord.z);`.
    3. Apply Beer-Lambert absorption: `waterColor = mix(deepOceanCol, shallowCol, exp(-waterAbsorption * depthDelta));`.
    4. When `depthDelta < 1.2`, blend animated caustic foam: `waterColor += vec3(0.9, 0.95, 1.0) * smoothstep(1.2, 0.0, depthDelta) * foamNoise;`.

---

### 3. Procedural Scrolling Cloud Shadows
- **Visual Impact:** Realistic soft cloud shadows slowly drift across the 3.2 km terrain, adding dynamic lighting and scale.
- **Implementation Path:**
  - **File:** `src/engine/mesh.js` (inside `FST`).
  - **Implementation Steps:**
    1. Pass `uCloudTime` uniform to the terrain shader.
    2. Sample procedural Worley noise at `vec2 cloudUV = vWorldPos.xz * 0.00035 + vec2(uCloudTime * 0.015, uCloudTime * 0.008);`.
    3. Multiply directional sunlight intensity: `float cloudShadow = smoothstep(0.35, 0.75, noise(cloudUV)); float sunLight = mix(0.45, 1.0, cloudShadow);`.

---

# PART 2: Top Physics & Kinematics Upgrades (4K Cap)

### 1. Kinematic Walker Chassis & 4-Point Foot-Plant Snapping
- **Visual Impact:** Massive walker Titans (Goliath, Basilisk, Harbinger) pitch and roll realistically along mountain slopes rather than sliding horizontally with feet hovering in mid-air.
- **Implementation Path:**
  - **File:** `src/game/sim.js` (in `unitTick`) and `src/ui/render3d.js`.
  - **Implementation Steps:**
    1. For units with walker flags (`T.isWalker || utype === 4`), calculate the 4 world-space foot coordinates based on heading angle $\theta$ and chassis footprint $(L, W)$.
    2. Sample terrain height from `heightF`: $h_{FL}, h_{FR}, h_{BL}, h_{BR}$.
    3. Compute pitch angle $\alpha = \text{atan2}((h_{FL}+h_{FR}) - (h_{BL}+h_{BR}), 2L)$ and roll angle $\beta = \text{atan2}((h_{FL}+h_{BL}) - (h_{FR}+h_{BR}), 2W)$.
    4. Apply smooth rotational lerp ($0.15$ factor) to unit transform matrices in `render3d.js`.
    5. Trigger `rumbleHaptic()` and ground dust particle bursts when a foot height delta reaches minimum compression ($h \le \text{ground}$).

---

### 2. Multi-Piece Vehicle Fracturing & GPU Instanced Shrapnel
- **Visual Impact:** When tanks, mechs, or airships explode, they violently shatter into 3–5 tumbling debris pieces (turret, hull plating, tread assemblies) that arc and bounce along the terrain.
- **Implementation Path:**
  - **File:** `src/ui/render3d.js` and `src/game/sim.js`.
  - **Implementation Steps:**
    1. Maintain a pre-allocated flat debris array: `DEBRIS_MAX = 512`. Flat arrays: `debPosX`, `debPosY`, `debPosZ`, `debVelX`, `debVelY`, `debVelZ`, `debRotX`, `debRotY`, `debRotZ`, `debLife`, `debMeshId`.
    2. On `dealDamage` lethal blow: spawn 3–4 fragments with random radial impulse + vehicle inherited velocity ($\vec{v} = \vec{v}_{\text{unit}} + \vec{v}_{\text{blast}}$).
    3. In `render3d.js` tick: update $\vec{p}(t) += \vec{v}(t) \cdot \Delta t$, apply gravity ($g = -28.0$), and bounce if $z \le \text{heightAt}(x, y)$ ($v_z = -v_z \cdot 0.42$).
    4. Render all active debris in a single instanced draw call using `InstMesh`.

---

### 3. True 3D Parabolic Ballistics (Clearance over High Terrain)
- **Visual Impact:** Heavy howitzers and plasma artillery fire soaring ballistic shells that arc over mountain ranges and cliff walls to strike behind cover.
- **Implementation Path:**
  - **File:** `src/game/sim.js` (`spawnProjectile`, `projectileTick`).
  - **Implementation Steps:**
    1. For ballistic weapons (`W.ballistic === true`), solve trajectory launch velocity given gravity $g$ and flight time $T$:
       $$v_z = \frac{z_{\text{target}} - z_{\text{start}} + \frac{1}{2}g T^2}{T}, \quad \vec{v}_{xy} = \frac{\vec{p}_{\text{target}} - \vec{p}_{\text{start}}}{T}$$
    2. In `projectileTick`, update height $z(t)$ independently of ground elevation.
    3. Check obstacle ray intersection against `heightF`: if $z(t) < \text{heightAt}(x, y)$, trigger premature detonation against the mountain cliff.

---

# PART 3: Staged Structural Collapse & World Destruction

### 1. 3-Phase Structural Collapse
- **Visual Impact:** Structures visibly degrade during siege before collapsing into persistent tactical rubble.
- **Implementation Path:**
  - **File:** `src/engine/models.js` and `src/ui/render3d.js`.
  - **Implementation Steps:**
    - **Phase 1 (100%–40% HP):** Standard structure model with local spark/smoke particle emitters.
    - **Phase 2 (40%–0% HP):** Swap to damaged LOD sub-mesh with cracked concrete, exposed rebar, and burning flame emitters.
    - **Phase 3 (0% HP / Wreckage):** Trigger building explosion, spawn roof debris shrapnel, and stamp a permanent blackened foundation decal onto the terrain canvas with salvage mass ($25\%$ reclaimable).

---

### 2. Interactive Destructible Choke Points (`X1`, `X2` Obstacles)
- **Visual Impact:** Allows commanders to blow open canyon barricades, blast collapsed bridges, or breach security blast gates to open flanking routes.
- **Implementation Path:**
  - **File:** `src/game/sim.js` and `src/engine/mesh.js`.
  - **Implementation Steps:**
    1. Register destructible entities in `worldProps[]` with `isDestructible: true, hp: 1200, bzBlock: true`.
    2. When alive, `markBuildZone()` and flow-field cost grids treat the cells as impassable walls (`BZ_BAD`).
    3. On destruction ($0\text{ HP}$): play collapse animation, spawn rock/concrete rubble, and clear the passability bit in the flow-field grid so armies can instantly march through.

---

### 3. Dynamic Artillery Cratering & Biological Creep
- **Visual Impact:** Heavy artillery and orbital strikes leave real physical craters; destroyed Brood nests leave persistent biological decay pools.
- **Implementation Path:**
  - **File:** `src/engine/gl.js` (`stampTerrainCrater`, `stampBioDecal`).
  - **Implementation Steps:**
    1. When heavy damage lands ($D \ge 350$), call `stampTerrainCrater(wx, wy, radius, depth)`:
       - Depress `heightF` locally: $h(x,y) -= \text{depth} \cdot \exp(-d^2/r^2)$.
       - Raise outer lip ($d \approx r$): $h(x,y) += 0.35 \cdot \text{depth} \cdot \exp(-(d-r)^2/(0.25 r^2))$.
       - Stamp radial scorch mark into `SCORCH` texture canvas.
    2. Brood nests call `stampBioDecal(wx, wy)` stamping emerald/purple organic creep decals using the `paintResourceGroundNode` pipeline.

---

# PART 4: Texture & Material Architecture (WebGL2)

```
                     WEBGL2 TEXTURE BINDING ARCHITECTURE
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │  TEXTURE UNIT 0: Splat Map (RGBA8) ──► Channels = Material Weights          │
 │  TEXTURE UNIT 1: 2D Texture Array  ──► 4 Slices (Soil, Grass, Rock, Pave)   │
 │  TEXTURE UNIT 2: Normal / ORM Map  ──► R: Roughness, G: Metal, B: AO        │
 │  TEXTURE UNIT 3: Depth Buffer      ──► Soft Water / Volumetric Fog          │
 │  ─────────────────────────────────────────────────────────────────────────  │
 │  TEXTURE UNIT 4: Sun CSM Depth 1   ──► [RESERVED - NEVER REALLOCATE]        │
 │  TEXTURE UNIT 5: Sun CSM Depth 2   ──► [RESERVED - NEVER REALLOCATE]        │
 │  TEXTURE UNIT 6: Post-Proc / Bloom ──► [RESERVED - NEVER REALLOCATE]        │
 └─────────────────────────────────────────────────────────────────────────────┘
```

### 1. 4-Slice `TEXTURE_2D_ARRAY` Biome Ground Materials
- **Why it's the best option:** Completely replaces multiple individual texture binds with a single WebGL2 texture array.
- **Implementation Steps:**
  1. Allocate `gl.TEXTURE_2D_ARRAY` with dimensions $512 \times 512 \times 4$:
     - **Slice 0:** Base Soil / Bedrock
     - **Slice 1:** Lowland Organic Ground / Vegetation / Sand
     - **Slice 2:** Slope Cliff Stone / Rock Scree
     - **Slice 3:** Civic Hardscape Pavement / Concrete
  2. In `FST` terrain fragment shader:
     ```glsl
     uniform sampler2DArray uDetailArray;
     uniform sampler2D uSplatMap; // RGBA weights
     
     vec4 splat = texture(uSplatMap, vUV);
     vec3 c0 = texture(uDetailArray, vec3(vWorldUV, 0.0)).rgb * splat.r;
     vec3 c1 = texture(uDetailArray, vec3(vWorldUV, 1.0)).rgb * splat.g;
     vec3 c2 = texture(uDetailArray, vec3(vWorldUV, 2.0)).rgb * splat.b;
     vec3 c3 = texture(uDetailArray, vec3(vWorldUV, 3.0)).rgb * splat.a;
     vec3 finalGroundAlbedo = c0 + c1 + c2 + c3;
     ```

---

# PART 5: Planetary Map Library Implementation Pipeline

To translate the **14 Biome Worlds** (56 maps) from the concept dossiers into the live engine:

```
  DOSSIER CONCEPT (PNG)               ENGINE TRANSLATION TARGET
 ┌──────────────────────────┐        ┌────────────────────────────────────────┐
 │ Upper Concept Panel      │ ─────► │ Biome Ground Palette + Water Shader    │
 │ Lower Annotated Guide    │ ─────► │ Land Lanes, Chokes, Spawn HQs, Bridges │
 │ Legend Symbols (S, L, B) │ ─────► │ Flow-Field Costs & Obstacle Entities   │
 └──────────────────────────┘        └────────────────────────────────────────┘
```

### 1. Dossier-to-Engine Mapping Checklist per Planet

| Biome World | Theme Key | Lowland Material (Slice 1) | Cliff Material (Slice 2) | Distinct Flora / Billboards |
|---|---|---|---|---|
| **Aurora Prime** | `arctic` | Compacted Snowpack | Glacial Blue Ice | `treePine`, `rockIce` |
| **Vulkanis** | `lava` | Basalt Ash | Volcanic Slag / Magma | `treeDead`, `rockSlag` |
| **Veridian IX** | `swamp` | Mangrove Moss / Mud | Siltstone Cliff | `treePalm`, `bush` |
| **Nyx Crater** | `lunar` | Fine Regolith | Impact Breccia Glass | Crystalline Boulders |
| **Solara Drift** | `desert` | Golden Sand Dunes | Red Sandstone Canyon | Desert Palms, Sandstone Mesas |
| **Pelagos Reef** | `archipelago`| White Coral Sand | Limestone Sea Arches | Tropical Palms, Coral Spires |
| **Obsidian Reach**| `megacity` | Asphalt / Gravel | Concrete Rubble | Urban Lampposts, Ruined Slabs |
| **Mycelis Veil** | `infestation`| Bioluminescent Spore Turf| Chitinous Tendril Rock | `treeSpore`, Fungal Stalks |
| **Aetherion Shards**|`crystal` | Resonant Crystal Silt | Quartz Cliff | Resonant Crystals, Plasma Nodes |
| **Tempest Reach**| `stormcoast` | Wet Siltstone | Dark Granite Cliff | Coastal Scrub, Storm Basalt |
| **Thornmarsh** | `mangrove` | Peat Bog Turf | Bog Iron Outcrop | Mangrove Roots, Cypress |
| **Obsidian Caldera**|`caldera`| Sulfuric Ash Crust | Dark Obsidian Glass | Thermal Chimneys, Basalt |
| **Abyssal Shelf** | `abyss` | Abyssal Sediment | Trench Fault Wall | Hydrothermal Vents |
| **Karst Underworld**|`karst` | Limestone Gravel | Stalactite Colonnade | Karst Columns, Calcite Formations |

---

## Verification & Syntax Checklist for Claude
Before committing any changes:
1. Run `node tools/bundle.mjs` — ensure all 77+ sources concatenate cleanly without global scope collisions.
2. Run `node tools/pack-www.mjs` — verify all audio, textures, and manifests resolve cleanly.
3. Run `node tools/verify-overhaul.mjs` on hardware GPU — confirm 0 console errors, 0 WebGL shader link warnings, and smooth 60 FPS in-match rendering.
