# Stormbreak Ocean — system design

**Status:** designed 2026-09-14. The P1 look lab has been running since 2026-09-15 (§13); nothing is in the shipped engine yet.
**Brief:** the owner's three *XYLOS-7 · Stormbreak Anchorage* concepts (attached 2026-09-10) and the Grok Bot "Ocean Lab — Local Claude Handoff".
**Scope:** the battlefield ocean — waves, surface, foam, wakes, storm seas — and how waves and weather become gameplay. Platform art and the UGA space view are out of scope.

---

## 1. What done looks like

The concepts are the acceptance target. A metric never is.

| Concept | Camera | What it demands |
|---|---|---|
| Storm, near top-down | battle camera (about 65°, about 550 m span) | staggered breaking crests with teal glow beneath; lace foam in navy troughs; surf on rocks and platform legs; V-wakes |
| Calm, shallows | battle camera (about 60°) | turquoise shallows over a visible seabed; surf wrapping islands; deep navy open water |
| Storm, low angle | cinematic (about 30°, perspective, horizon) | towering glowing crests, spray, black sky — a mood target the battle camera cannot reach |

The concepts were attached in session `0b4f1943-5c66-40ea-a57b-2dcf2a485837` (2026-09-10 16:14 PDT). The Sea of Thieves references named in the handoff (`refs/sot/01–03`) are not on this PC.

Checklist, per shot: peaked staggered crests (not walls, not cells) · navy troughs to cyan crest glow · foam as tips, face streaks and lace (not paint sheets, not outlines) · wet specular with sparse glitter · judged at the battle camera · storms read as lethal.

## 2. Three findings that change the plan

### 2.1 The lab tunes a camera the battle never uses

The battle camera is orthographic, with elevation clamped to 60°–86° (`PITCH_MIN=1.05`, `PITCH_MAX=1.50`, `src/engine/mesh.js:4178`). It opens at 68° (`src/main.js:690`) and zooms across a 420–3400 m span (`mesh.js:4173`). The handoff's look-dev camera is about 45°, below the clamp.

At 60°–86° a crest is almost never seen in silhouette. Peaks read only through crest glow, specular breaks, foam tips and the parallax of horizontal displacement. A 45° shot rewards silhouette work the player cannot see, and it hides the shading and foam errors the player sees all the time.

**Change:** every acceptance shot uses the battle camera (§10). The low-angle concept is the target for menu and departure framing only.

### 2.2 The lab's shader ceilings come from SwiftShader, not from phones

"≤15 Gerstner samples", "no second lighting sample" and "SwiftShader screenshots hang on heavy shaders" are limits of a CPU software rasterizer. This repo already forbids SwiftShader for verification (AGENTS.md, Testing; `tools/pw-browser.mjs` with `assertHardwareGpu`).

A phone GPU runs a 128² FFT cascade as a few dozen tiny fragment passes. What limits a phone is draw calls and fill rate, and those have to be measured on the owner's devices (§9).

**Change:** replace the SwiftShader ceilings with a measured device budget. SwiftShader stays only as a "boots at LOW" smoke test.

### 2.3 The wave engine is not what failed

Upstream open-ocean (MIT; three.js, WebGL2, Vite) already computes Tessendorf FFT on the GPU by render-target ping-pong. It uses a JONSWAP spectrum over non-harmonic cascades and accumulates Jacobian whitecaps in a buffer that advects downwind and decays. Those are the systems the handoff asks for.

The rejected cycles failed around the wave field, not inside it. Each symptom has a usual cause. The table below is to be confirmed against the lab code, which is not on this PC.

| Rejected symptom | Usual cause | Answer in this design |
|---|---|---|
| Paint sheets; the white% chase | foam amount thresholded with no sub-texel structure | foam amount drives a lace threshold (§6); coverage is never a target |
| Parallel wall ridges | narrow directional spreading, one wind direction, aligned cascades | frequency-dependent spreading, a swell partition, rotated cascades (§4) |
| Black crest outlines | folded surface (J < 0) shaded with flipped normals; reflections sampling below the horizon | folds become foam; normals from slope maps; reflection clamped above the horizon (§5) |
| Cellular or knife ridges | displacement shape authored instead of spectral | spectral displacement only; cellular noise is allowed for foam lace, never for displacement |

White% is the wrong target. Active whitecap cover in the open ocean is about 3.84×10⁻⁶·U₁₀^3.41 (Monahan & O'Muircheartaigh, 1980), roughly 4% in a very rough sea (U₁₀ ≈ 15.5 m/s). The concepts show several times that, and nearly all of it is residual lace. Chasing coverage produces sheets, because what the eye reads is structure.

## 3. Architecture: one sea state, two authorities

- **Sea state: simulation authority, deterministic.** `src/sea.js` becomes the single owner of the sea's condition: Douglas level (as a continuous envelope), wind speed U₁₀, wind and swell heading, swell mix and ice cover.
  - It is seeded from the match seed (`mfDetSeed`, `src/game/determinism.js`).
  - It is included in `src/game/statehash.js`.
  - The simulation reads only phase-free values: level, heading and thresholds.
- **Wave field: presentation authority.** A GPU FFT driven by the sea state. Its phase, displacement and foam are presentation, and they never enter the simulation. `determinism.js` already states that contract for `performance.now` and `Math.random`.
- **Flows into gameplay:** hazards raise the sea state, and the sea state changes speed, gunnery, the HUD and AI.
- **Flows back from the wave field:** none. Hull motion reads the wave field but only moves meshes.

## 4. Wave field

### 4.1 Spectrum

- **JONSWAP**, γ = 3.3, with the peak set from U₁₀ and fetch.
- **Swell partition:** a second, narrow partition 30°–60° off the wind. It is weighted by `swellMix`, which rises from 0 to 0.35 with storm age, and gives staggered, multi-directional crests.
- **Directional spreading:** Mitsuyasu-type cos²ˢ. s peaks at the spectral peak (s_max ≈ 10 for wind sea, 25 for swell) and falls with frequency, so crests are long near the peak and short-crested chop above it. Narrow spreading everywhere is the parallel-wall look.

Wind by Douglas level. These are calibration starts: the Pierson–Moskowitz estimate Hs ≈ 0.21·U²/g lands inside each band.

| Level | Sea | Hs (sea.js) | U₁₀ start | Dominant crest spacing (sea.js period) | Real whitecap cover |
|---|---|---|---|---|---|
| 3 | SLIGHT | 0.9 m | 7 m/s | 39 m | 0.3% |
| 4 | MODERATE | 1.8 m | 9.5 m/s | 66 m | 0.8% |
| 5 | ROUGH | 3.2 m | 12.5 m/s | 100 m | 2.1% |
| 6 | VERY ROUGH | 5.0 m | 15.5 m/s | 141 m | 4.4% |
| 7 | HIGH | 7.5 m | 19 m/s | 189 m | 8.8% |
| 8 | VERY HIGH | 11 m | 24 m/s | 264 m | 19.6% |

At the storm concept's zoom (about 550 m span), a HIGH sea's 190 m crest spacing is about a third of the screen. Physically honest storm seas are already concept-scale.

The one allowed exaggeration is a single presentation gain, `seaDrama`, of 1.0–1.5 at level 6 and above. It never touches the simulation.

### 4.2 Cascades

- **Size:** three cascades, 128² on phones and 256² on desktop.
- **Patches:** non-harmonic sizes, starting at 1024 m, 211 m and 37 m. Each is band-limited to its own wavenumbers and rotated (0°, +23°, −41°) so tile edges never line up.
- **Repeats:** at a 3400 m span the largest patch repeats about three times, so a 2–4 km world-space variation field modulates choppiness and foam.
- **Rising storms:** the CPU re-weights amplitudes √S(k; U₁₀), about 49k values, and never re-rolls the random phases. Dispersion ω = √(gk) does not depend on wind, so a rising storm grows the waves already on screen instead of popping to new ones.
- **Choppiness** rises from 0.6 to 1.1 with level. Folds are handled (§5), not avoided.

### 4.3 Surface grid

Today the water is a static 10 m mesh over wet cells (`src/engine/terrain.js:1108`). It is displaced by three fixed sines with a 2.85 m ocean amplitude (`terrain.js:1232`), identical on every ocean map, and shaded by a different set of sines than the ones that displace it.

- **Grid:** the ocean moves to a camera-following grid of about 160² quads over the `camBounds` footprint, texel-snapped, with 2.5–20 m spacing by zoom span.
- **Land:** clipped by the existing R16F height texture.
- **Rivers and lakes** keep the current program. The ocean program discards non-ocean cells, and the current program stays as the fallback if the new one fails to link.
- **Must survive the port:**
  - crater flooding (`WATER_LIP` flood fronts)
  - fog-of-war darkening
  - the shoreline apron
  - the lava, ice and dusk water kinds
  - river flow
  - bloom extracted before water

## 5. Surface material

| Checklist item | Shader term |
|---|---|
| Peaked, staggered | choppy displacement; normals from the FFT slope maps, not mesh derivatives; crest sharpening from the Jacobian |
| Navy to cyan | body colour by height percentile, trough navy to crest teal; forward-scatter SSS through thin crests (height above mean × compression × view–sun term); sky-lit crest glow so overcast storms still glow |
| Foam | §6 |
| Wet specular | GGX; roughness = base (0.06 calm to 0.12 storm) plus the slope variance of cascades faded at the current span, so glitter survives as a path instead of aliasing into sparkle; reflection vector clamped above the horizon |
| Shallows | depth from the height texture; per-channel Beer–Lambert absorption; seabed visible only in the top ~12 m; surf band scaled by exposure to the wind |
| Alien storm | squall lightning from `src/hazards.js` flashes on the water; up to four violet crystal lights tint nearby crests |

Starting palette, read by eye from the concepts (pick properly in P1): trough `#071A28`, body `#0D3346`, crest scatter `#23BFB0`, shallows `#2BB3A3`, foam `#DDE9E7` at albedo ≤ 0.48.

## 6. Foam

Three layers, combined by max and rendered through one lace texture:

1. **Whitecaps (wave space).** Jacobian compression writes foam into a persistent buffer per cascade, which advects downwind and decays (τ from 2 s calm to 6 s in a storm). This is the open-ocean mechanism, kept.
2. **Event foam (world space).** One RGBA8 512² target follows the camera. It replaces today's eight wake, eight ripple and four crater uniform slots in the water shader with a field that remembers. It carries:
   - ship wakes: Kelvin arms at 19.47° plus a turbulent centreline
   - contact rings on platform legs and rocks
   - shore surf
   - projectile impacts
3. **Lace.** A tileable 512² texture with vein, bubble and streak channels, generated offline.
   - Foam amount sets the threshold: a little foam is thin veins, a lot is solid white.
   - Face streaks sample the streak channel stretched along the wind on steep faces.
   - Cellular noise is legitimate here as foam texture, never as displacement.

No foam edge comes from a hard Jacobian line. Edges come from the lace threshold.

## 7. Hulls, spray, storm grade

- **Hull motion.** Hulls only heave today (`src/ui/render3d.js:1101`).
  - Each frame, up to 64 probe points (bow, stern and beam of each visible hull) are rendered into a 64×1 float target that samples the cascades.
  - The target is read back asynchronously (`PIXEL_PACK_BUFFER` plus `fenceSync`), one or two frames late, and smoothed by a critically damped spring.
  - The instance layout already carries pitch and roll (`InstMesh.add(…, pitch, roll)`, `src/engine/mesh.js:970`).
  - Fallback: the analytic sea.js swell.
- **Structures** stay rigid and get contact foam and surge rings.
- **Spray** draws from the existing GPU particle pool (6,144 slots, `src/engine/gpufx.js:25`), capped at 600 on HIGH. It is emitted where compression and height peak together, at ROUGH and above.
- **Storm grade:** sky and sun darken with the level, rain streaks fall, and lightning reflects on the water.

## 8. Gameplay: waves and weather as conditions

`sea.js` already couples hull drag and gunnery to the sea. Seven changes make it a system. It is not wired in yet, so "as written" below means as the file would behave if it were.

1. **Weather drives the sea, telegraphed.**
   - The base level comes from the map and climate.
   - A hazard warning raises the level across its warning window, peaks at the strike or front passage, and decays over 45–60 s.
   - As written, `sea.js` configures once per battle while hazards are episodic, so a storm map would sit at its storm level for the whole match.
2. **Key the lift by hazard profile, not mode.** `storm` and `dust` share the mode `vanguard` (`src/hazards.js:40–41`). As written, the mode-keyed lift table (`src/sea.js:85`) would raise a swell under a dust front.
3. **Ice damps storms.** Every Nordhall ocean battlefield uses the arctic theme, where the renderer already cuts swell to 28%. The simulation should agree.
4. **Difficulty lifts the sea on Hard only.** `diffLvl()` returns 0–2 (`src/game/sim.js:3456`) and sea.js caps the lift at one step. As written, Normal and Hard would get the same sea.
5. **Effects start at SLIGHT (3).** Rivers stay visual. As written, a river would still cost 5–10% gunnery.
6. **Where it plugs in.**
   - **Speed:** take over `mfDomainSpeedMul` (`src/game/sim.js:179`), naval only.
   - **Gunnery:** scale the existing deterministic scatter by range × sea error: naval shooters at ±3 m (`sim.js:8871`) and the Sea Bastion at ±14 m (`sim.js:9734`). The number of random draws never changes.
   - **Small-craft warning (ROUGH and above):** a corvette-class penalty, not a production lock. Submit it at `MF_N_ORDER`, because INFO never reaches the battlefield (`src/ui/hudflow.js:364`).
   - **HUD:** the existing weather chip (`src/ui/hud.js:1170`) gains the sea level and a swell arrow. Site intel (`src/galaxyui.js:1120`) gains a sea forecast.
   - **Determinism:** sea state goes into the state hash, with multipliers quantized to 1/1024.
7. **The hard map.** The owner asked for at least one hard battlefield open only to air and naval units, with ground units greyed out. `mfDomainOfType` (`sim.js:144`) already separates the domains, and Stormbreak Anchorage is its natural home.

Effects by level, from `sea.js` as written:

| Level | Speed into / across / with the swell | Gunnery |
|---|---|---|
| 3 | 0.84 / 0.90 / 0.95 | 0.85 |
| 4 | 0.79 / 0.86 / 0.93 | 0.80 |
| 5 | 0.74 / 0.83 / 0.91 | 0.75 |
| 6 | 0.69 / 0.79 / 0.90 | 0.70 |
| 7 | 0.63 / 0.76 / 0.88 | 0.65 |
| 8 | 0.58 / 0.72 / 0.86 | 0.60 |

Water already exists on 8 ocean and 4 river battlefields (`src/engine/gl.js:1996`), plus the legacy Shattered Isles:
- **Ocean:** Aelos Coast ×3, Nordhall Isles ×3, Nordhall Cliff Medium, Nordhall Peaks Large.
- **River:** Aelos North Medium, Aelos Basin Medium, Aelos Ridge Large, Nordhall Frost Medium.

## 9. Phone budget

| Tier | Waves | Foam | Hulls | Spray |
|---|---|---|---|---|
| HIGH / CINEMATIC | FFT, 3 cascades (256² desktop, 128² phone), every frame | whitecap persistence, event foam 512² | probe readback | ≤ 600 |
| MEDIUM | FFT, 2 cascades at 128², updated alternately | persistence at half resolution, event foam 256² | probe readback | ≤ 200 |
| LOW, or no float render targets | analytic sea.js swell (4 components) | lace from analytic compression, no persistence | analytic | none |

- **Memory:** about 11 MB of ocean textures on phones (FFT ping-pong about 7 MB, foam targets about 2 MB, lace about 1.4 MB).
- **Texture units 16–20:** cascade displacement array, slope array, whitecap array, event foam, lace. Every existing owner sits at 0–15, and WebGL2 guarantees 32 combined units. Units 4/5/6 stay post (AGENTS.md, rule 4).
- **Float render targets** need `EXT_color_buffer_float`, which the engine already treats as optional (`src/engine/mesh.js:3069`).
  - P0 reads float targets, async readback and texture limits off the owner's phone before any tier is promised. The installed PWA gets a confirmation pass in P2.
  - Sampled outputs use RGBA16F, which is filterable in core WebGL2. RGBA32F stays inside the ping-pong.

## 10. Look-dev protocol

Every cycle renders the same shots on a hardware GPU and is published as a live page. The owner reads it on their phone beside the concept crops, at matched scale.

| Shot | Camera | Sea | Checks |
|---|---|---|---|
| S1 Storm close | ortho, pitch 1.19, span 550 m | HIGH (7) | crests, glow, lace, surf on rocks |
| S2 Storm command | ortho, pitch 1.19, span 1500 m | VERY ROUGH (6) | stagger, repeats, foam structure at distance |
| S3 Shallows | ortho, pitch 1.05, span 700 m | MODERATE (4), island | seabed, turquoise, shore surf |
| S4 Wakes | ortho, pitch 1.30, span 450 m | ROUGH (5), 3 hulls | Kelvin arms, hull pitch and roll |
| S5 Strategic | ortho, pitch 1.40, span 3000 m | ROUGH (5) | repeats, sparkle, banding |
| S6 Cinematic | perspective, about 30° (lab only) | HIGH (7) | mood against the low-angle concept; not a gate |

- **PASS** is the owner's cold read of S1–S4 against the concepts.
- **Numbers** (fps, draw calls, GPU MB, NaN count) are tripwires, never targets.
- **A failed cycle** is discarded, not tuned toward a number.

## 11. Plan

| Phase | Work | Gate |
|---|---|---|
| P0 Ground truth | a probe page, published live and opened on the owner's phone, reads float render targets, async readback and texture limits; shot rig S1–S6 | phone results recorded; S1–S5 render today's water |
| P1 Look | spectrum, spreading and cascades under the battle camera; material; lace foam and persistence; storm grade | owner PASS on S1–S4 |
| P2 Port | ocean program and camera grid in the engine; event foam; probes to hull pitch and roll; tiers | parity with P1 shots; MEDIUM water cost within budget on both devices |
| P3 Sea state | ship sea.js; weather envelope; ice; difficulty; HUD; speed and gunnery coupling; state hash; tests that fail when the coupling is deleted | identical deterministic replay |
| P4 Stormbreak map | air/naval-only hard battlefield; floating anchorage kit; crystal light tint | playable, ground units greyed out |

**Release:** the first update that carries a new source file cannot be a delta, because the publisher refuses `-PatchFrom` for a file absent from the base. The ocean ships as one full download (about 93 MB), so batch it.

## 12. Decisions for the owner

1. **Look-dev runs here and is judged on the owner's phone (owner, 2026-09-14).** The "Local Claude usage" section of the Grok Bot handoff is wrong: Grok Bot builds its own app on its own VM, and its lab is reference, not this workspace.
   - Each cycle is published as a live WebGL page that reproduces the engine's camera, lighting and tonemap, opened on the phone the game ships to.
   - Open choice: seed it from open-ocean's MIT FFT and spectrum code with attribution (recommended; needs a one-time GitHub download), or write it fresh.
2. **Acceptance camera:** battle shots at 60°–86°; the low-angle concept as cinematic mood only.
3. **One full download** when the ocean ships.
4. **Sea state follows the weather** (recommended), or one fixed sea per battle.
5. **Small-craft warning** as a penalty (recommended), or as a production lock.
6. **Sea lift on Hard only** (recommended), or on Normal and Hard as written.

## 13. What the lab has proven (2026-09-15)

**Where it is:**
- **Lab:** `tools/ocean-lab/`. Serve the repo root on port 8931 (`.claude/launch.json`, config `ocean-lab`) and open `/tools/ocean-lab/`.
- **Engine-ready modules:** `src/engine/ocean-spectrum.js`, `ocean-fft.js`, `ocean-cascades.js`, `ocean-foam-sim.js`, `ocean-surface.js` and `ocean-mirror.js`. All are classic scripts with `mfOcean*` globals and no collisions.
- **Tests:** `tools/test-ocean-spectrum.mjs` (the gather FFT equals the synthesis sum; energy equals m0) and `tools/test-ocean-mirror.mjs` (the CPU mirror equals the full field with every mode; slopes; hull pose).

**Loop:**
- **Capture:** `node tools/ocean-lab/shoot.mjs <cycle> S1,S3,S5 [debug views]` renders the §10 shots on the hardware GPU and prints hull poses.
- **Compare:** `compare.mjs` puts a shot beside a concept at the same framing.
- **Measure:** `measure.py` scores water tone and foam coverage against a concept.
- **Calibrate:** `sweep.mjs` renders style variants for measurement.

**Measured, 25 cycles, RTX 4060 laptop, 1600×900:**

| Check | Result |
|---|---|
| FFT cascades | 3 × 256², GPU ping-pong, ~52 fps with the lab scene |
| Wave height | Hs lands on the Douglas target within 0.3% |
| Storm tone vs concept | mean luminance-percentile error 8–9 (cycle 17 was 42) |
| Crest foam coverage | 2.8–3.2% bright pixels against the concept's 3.7% |
| CPU mirror | 128 modes keep 63% of the wave energy at N = 256; exact with every mode |

**Findings that change this design:**
1. **Whitecaps come from wind-projected compression, −(w·∇)(w·D), not the full Jacobian.** A short-crested sea compresses along a cellular network, and the full Jacobian draws that network (the fish-scale look).
2. **Lingering foam cannot be procedural.** Six textures all read as a pattern on the water rather than foam: Worley edges (cracks), fBm contours (lichen), reaction-diffusion (zebra), a veil over blurred veins (leopard spots), whole lace lines (crackle glaze), and wind streaks (barcode).
   - §6's lace layer becomes an **authored foam texture**, sampled in wind space and thresholded by foam amount.
   - The hook exists (`tools/ocean-lab/foam-art.png`); the source is an open owner decision.
   - **Foam coverage must be measured, never judged by eye.** The concept is only ~4% bright foam.
3. **Wake arms must not persist.** Foam stamped on a Kelvin arm lies inside the wedge once the ship moves on, and persisting it filled the wedge white.
   - Arms are stamped fresh every step into a channel that is never carried.
   - Only the stern wash and bow spray persist, and the sim spreads them into the trail.
4. **Hull pose comes from the CPU mirror, not §7's async probe readback.** The mirror sums the strongest modes of cascades 0–1, costs no GPU stall, and lives in `ocean-mirror.js`.
5. **Storm and calm need different palettes.** A storm's brightness is crest light; the storm body colour in calm sun reads as a pool. The lab blends the two by storm strength.
6. **Breaking clusters in wave groups.** A drifting group envelope (at group velocity) shifts the whitecap threshold, giving the concept's bands of heavy water between calmer gaps.

**Still open:**
- the authored foam texture
- P0's capability probe on the owner's phone
- storm grade and spray
- far-field whitecap anti-aliasing (Dupuy) for S2 and S5
- the calm shallows against their concept (S3)
- the engine port (P2)
