# MASSFRONT — Design & Engineering Review, and a Development Plan

*Reviewed against the current build. Covers the simulation, the renderer, the economy and the player-facing layers. Written to be actioned, not admired — every finding names a function and a fix.*

---

## 1. Where the game actually stands

MASSFRONT is a genuinely impressive piece of engineering wearing the clothes of a much smaller game. Ten thousand units at roughly five milliseconds a tick, deformable terrain that fills with water, a procedural material pipeline that generates its own normal and occlusion maps, flow-field pathfinding, three AI factions and a full meta layer — all of it running on a phone. Nothing on this list is easy and all of it works.

The problem is that almost none of it is *decidable*. The simulation is deep; the game on top of it is shallow. A player can spend fifteen minutes in a match and make perhaps three decisions that matter, and cannot tell afterwards which of them was wrong. That is the through-line of this review: the systems exist, they are simply not yet connected to the player.

The second theme is that the renderer's remaining quality gap is not detail. It is *colour management*. Every lighting multiply in the pipeline happens in display space, which is why terminators look soft and shadowed sides look washed no matter how much geometry gets added. That single fix is worth more than any amount of further modelling.

---

## 2. Simulation and combat design

### The counter system does not counter anything

`WKM` in `sim.js` gives three weapon classes a ±15–30% swing against three armour classes. Set that against the actual stat spread of the roster and it disappears into the noise. A Striker delivers 1.35 damage per second per unit of mass; a Goliath delivers 0.41. Apply the armour matrix entirely in the Goliath's favour and the Striker still wins by better than two to one. No armour multiplier in the table is strong enough to invert a three-fold efficiency gap, so the correct play at every stage of every match is to build the cheapest thing that shoots.

What actually counters massed cheap units is splash radius — and splash is not the system the game advertises, is not in the UI, and is not what the unit cards talk about. The game has two counter systems and only exposes the one that does not work.

Worse, area damage ignores armour entirely. In `dealDamage`'s blast loop the multiplier for the *originally targeted* unit is baked into the damage before it is applied to everyone in the radius, so a shell aimed at a light scout applies the anti-light bonus to the heavy tank standing beside it.

### Redundant and dead units

Pyro and Scorcher share a weapon, a mode set and a target class; Scorcher is simply Pyro with bigger numbers. Thumper and Bombard do the same job, except Thumper has no minimum range and is therefore a strictly better direct-fire tank at knife range — artillery with no downside. Vulture cannot shoot ground at all, yet the AI folds it into ground waves regardless of whether the player owns a single aircraft, which means those units walk into battles as free kills. Corvette and Dreadnought require water and a Harbor, and only one of the four maps is meaningfully drowned; on the other three they are dead content, and worse, the spawn fallback in `spawnUnit` can place a ship on land where the movement gate then freezes it permanently.

### The combat modes are free upgrades

The code comment promises "a deliberate trade, never a free upgrade." The multipliers do not deliver on it. Siege gives artillery +75% range and +45% damage in exchange for immobility, which artillery did not want anyway. Overdrive's health bleed takes forty-eight seconds to matter in engagements that last five to fifteen. Guard is a pure gift on a unit whose damage is already zero. Every mode is net positive, so the optimal play is to toggle once at spawn and never think about it again.

### Bulwark is unanswerable

It pulses a 28% damage reduction to every ally within its radius, permanently, for ninety mass, with no energy upkeep and no anti-shield weapon anywhere in the roster. Stacked with Guard it takes incoming damage down to under forty percent. Massed Bulwarks behind massed Strikers is almost certainly the dominant composition in the game, and nothing contests it.

### There is no move order

`orderMove` always sets the attack-move state. The state machine has a "reposition without acquiring" state; it is read in two places and written nowhere. Retreating, repositioning and walking past a fight are all impossible. This is the single highest-frequency tactical decision in the genre and it is missing.

### The AI cheats in proportion to how well you play

`aiThreat` is computed from the player's own unit count, structure count and commander level, and on Hard drives the AI's income multiplier as high as 9.6× with health and damage near double. The AI does not out-play the player; it out-resources them, and the resourcing scales with the player's success. That teaches nothing and feels like the game is cheating because it is.

It is also trivially exploitable. Wave targeting scores defended positions at nine hundred times the weight of distance, so an undefended forty-mass reactor built next to the enemy base becomes a permanent decoy that every wave for the rest of the match walks into. Waves retreat deterministically below 28% survivors and then park at home forever. The enemy commander is glued to its base twice a second and never pushes.

### The hive is a framerate event, not pressure

At full escalation THE TIDE queues on the order of twenty thousand units against a cap of twenty-eight thousand. The simulation step degrades, target reacquisition stretches to nearly three seconds, and the effect scaler drops far enough to switch off damage numbers. It stops being a threat and becomes something the player waits out. It also breaks the commander curve — a single tide is worth something like thirteen levels, each firing a modal that pauses the game.

### The correctness risks that will bite

The highest-severity issue in the simulation is **index reuse across recycled unit slots**. The free list recycles immediately, and every consumer validates that the slot is alive but not that it belongs to the enemy. A unit will keep firing at an index that has since been refilled by a friendly; an in-flight projectile homes on and damages whatever now occupies its target index with no team check at all; control groups silently absorb strangers. With tens of thousands of insects churning through the free list every second this is not theoretical. The fix is a generation counter — a `Uint16Array` bumped on spawn, with target handles storing index and generation together — and in the meantime a team check at each of the four validation sites.

Close behind: the reclaim tick is O(wrecks × buildings) every frame and the building array is never compacted, so dead structures are walked forever by the economy, fort recomputation, placement validation and reclaim. Structure death triggers a full 37,636-cell build-zone rasterisation inside the damage handler, which a swarm eating a wall run will do thirty times in a few frames. Acquisition radius is silently clamped below several units' actual range, so Bombard in siege mode and Thumper with full buffs are blind well inside the range their card advertises. Production charges the player for units the spawn cap then refuses to create, with no message.

---

## 3. Renderer and shading

### The one change worth more than all the others

Nothing in this pipeline is linear. The material atlas is uploaded as plain RGBA rather than sRGB, the canvas that painted it is sRGB, and the fragment shader writes to an 8-bit target with no encode step. Every multiply — albedo against N·L, ambient against occlusion — therefore happens in display space. The symptoms are exactly what the art has been fighting: soft terminators, shadowed sides that are too bright, and midtone contrast that will not appear no matter how much detail goes into the models.

Upload the atlas and terrain as `SRGB8_ALPHA8`, which the hardware decodes for free on filtering, and apply a gamma encode on output. Half a day of work; it changes every pixel in the game.

Alongside it, two smaller errors in the same shader. Albedo is remapped to a range peaking at 1.5, which combined with ambient and key pushes radiance to 2.4 and compresses everything above 1.6 into the top three percent of the output range — that is why light roofs blank out, and the exposure curve is compressing the problem rather than fixing it. And the specular half-vector bisects the sun and world-up rather than the sun and the eye, so highlights do not move when the camera orbits. Under an orthographic camera the view vector is constant for the whole frame, so this is a uniform computed once on the CPU and a five-line change.

The material atlas has a subtler bug: `fract()` is applied inside the coordinate handed to `texture()`, which makes the derivative explode across every tile wrap and forces the coarsest mip. Every unit and building has a blurry grey seam line where its texture repeats. `textureGrad` with manually computed derivatives fixes it.

### Ambient occlusion

The orthographic depth linearisation is correct and the approach is sound. Three things are wrong. There is no blur, and twelve samples with per-pixel random rotation and no resolve filter is salt-and-pepper by construction. The edge term has no sky rejection, so against the cleared background every silhouette receives the full darkening — a cartoon outline rather than contact shading. And it runs at full resolution: eighteen dependent depth fetches across roughly 1.3 megapixels is the single most expensive thing in the frame. Half resolution into an R8 target with a bilateral upsample, interleaved-gradient noise instead of a hash, and a four-by-four blur that averages exactly one rotation set — that recovers enough budget to pay for real shadows.

### Shadows

The projected decals were the right call to get contact into the frame quickly, and they are visibly not real. They are flat discs sampled at a single ground height, so on any slope half the decal buries and half floats and the depth test eats it. A tall tower gets a round smear rather than its own silhouette. Overlapping shadows multiply rather than merge, so two adjacent units double-darken. Nothing self-shadows. And they are not even cheap — five rings of twenty-six segments is 260 blended triangles per shadow, which at a few hundred visible shadows is comparable to the entire terrain.

A real shadow map is unusually cheap here because the camera is orthographic and `camBounds()` already gives the exact receiver extent, so no cascades are needed. One 1024² depth texture with hardware comparison filtering, a light matrix snapped to whole texels so it does not shimmer when panning, terrain excluded as a caster, and normal-offset bias. The only structural work is splitting `InstMesh.flush()` into upload and draw so the instance streams can be drawn twice — about twenty lines, reusing the existing vertex shader verbatim.

### Performance

The bottleneck is fill rate, not geometry. Full-resolution SSAO plus a full-screen copy that currently does nothing but move ten megabytes, plus additive glows that can cover a substantial fraction of the screen at close zoom. The copy pass should earn its bandwidth by carrying FXAA — the context is created without multisampling, so every silhouette is hard-aliased, and this is forty lines in a pass that already exists.

On the CPU side, the emissive uniform is global, which means every reactor, fab and damaged structure breaks its own batch and re-issues the full base mesh as its own draw call. Moving emissive into the instance stream would collapse a large fraction of the frame's draw calls. The terrain submits 73,728 triangles every frame with no chunking or culling while the camera often sees a seventeenth of the map, and its indices are 32-bit despite the vertex count fitting comfortably in 16.

### Two live bugs

`aoResolve()` is called from inside the translucent overlay pass and unconditionally resets blending, depth-write and culling on exit — the three states that pass had just configured. Selection rings and build-zone plates therefore draw opaque and depth-writing whenever AO is active. It also leaves the scene colour texture bound to unit zero, which the model program samples as its material atlas, so those overlays texture themselves with the previous frame's image.

Separately, `addBeam3D` indexes the instance buffer at a stride of nine floats where the actual stride is ten. Only the first segment of any beam lands correctly; every subsequent one writes its radius into the previous instance's Z coordinate.

---

## 4. Economy, onboarding and touch

### The economy is legible but the model is not

Structures do not stream. Placement charges a lump sum and construction then advances on a fixed timer with no ongoing drain and no possible stall, so the central streaming-economy decision — how much to commit to construction and how badly over-committing chokes you — does not exist. If you can afford the sticker price at the instant you confirm, you get the building at full speed regardless of everything else running.

The two currencies are also one currency drawn twice. Unit costs sit at a near-constant one-to-four mass-to-energy ratio and income is one-to-five, so the bars move in lockstep. Supreme Commander's tension came from mass being scarce while energy was abundant, with shields, radar and artillery as competing energy sinks. Here almost nothing bends the ratio.

The net-rate readout — the best idea in the HUD — is broken by the lump sum: placing a factory makes the mass rate read roughly minus two hundred and fifty per second for half a second. Every structure placement makes the economy display lie.

### Onboarding is a settings screen and two disappearing toasts

A first-time player's first thirty-five seconds are spent in front of eight rows and roughly twenty-eight buttons of match configuration. Wildcards default to *on*, so a brand-new player can have their first match rolled with early enemy titans or minus forty percent vision. The build-zone rule — the most important spatial mechanic in the game — is taught by a toast that erases itself after 2.6 seconds, once, forever. Their first view of the build menu is mostly padlocks, because gating is by commander level and commander level comes from combat.

Nothing anywhere explains what mass and energy are for, that extractors need a deposit, or that the armour triangle exists. The coach system is a failure-reaction mechanism: it fires after the player has already stalled.

### The touch layer has three sharp edges

There is no deselect. The terminal branch of the tap handler issues a move order whenever anything is selected, so with the whole army selected every stray tap on the map walks the entire force somewhere. Two-finger gestures run pinch, twist and pitch simultaneously with a yaw gate of under three degrees, so every zoom rotates the world — and the minimap draws its camera rectangle axis-aligned, so it starts lying the moment you have zoomed once. And there is a dead input window between four hundred and five hundred and twenty milliseconds where a press does nothing at all: too long to be a tap, too short to be a hold.

Pick radius scales with zoom in a way that makes single-unit selection about five screen pixels at the default zoom, which means targeted attack orders are effectively impossible until you pinch in.

### The information gap that matters most

There is no base-under-attack alert. No toast, no minimap ping, no sound. On a phone showing a fraction of the map, the player finds out they are being dismantled when the building is already gone.

### Meta is flat stat inflation

Ranks unlock nothing. Nine of eleven store entries are percentage multipliers, and fully maxed they grant something like a quarter more unit health, a fifth more damage and a third more energy income against an enemy whose scaling is set once by a three-button difficulty picker. The game gets monotonically easier and there is no ladder to absorb the growth. Only the orbital unlock changes how a match is played.

There is also a compounding bug: the crate rate multiplier is applied on top of itself every match and never reset, so ten matches in with the drop perk it has multiplied by roughly fifty-seven.

The strongest retention idea in the build — wildcards — is half implemented. The player chooses how many to draw, the game rolls them at random, and every one pays the same bonus regardless of whether it was cosmetic or crippling. Let the player choose the modifier and price each one on its own.

---

## 5. What changed in this pass

Three things were done during the review rather than filed:

The project is now a **normal application with folders and assets** rather than a single self-contained file. `index.html` loads ordered sources from `src/engine`, `src/game` and `src/ui`, styles live in `src/styles/ui.css`, the baked unit sheet and the load manifest live under `assets/`, and `tools/bundle.mjs` produces the single-file `dist/massfront.html` as a build *artifact* for hosts that still want one. `tools/pack-www.mjs` stages the web root and the Capacitor project builds the APK straight from the folder tree — it now ships as a real directory structure rather than one blob, and came out four megabytes smaller.

**Camera clamping at the map edge is fixed.** The old clamp held the view *hull* inside the battlefield, and the hull's shape changes as the camera turns — so every degree of rotation moved the legal region out from under the camera and shoved it, which is why a base near a corner could neither be rotated around nor panned from. The clamp now uses the hull's circumscribed radius, which rotation cannot change, so turning at the edge is free. Instead of a wall, the last four hundred units of ground fade into dense border haze that matches the clear colour exactly, so the map reads as continuing into weather rather than stopping.

**The dropship flies nose-first.** Its target heading carried a ninety-degree offset left over from the sprite era, so it crabbed sideways down its own flight path. Removed, turn rate raised, and a bank term added so it leans into turns.

---

## 6. Development plan

### Phase 1 — Correctness and contact (about a week)

These are the things that are actively wrong. Nothing else should start before them.

Add a generation counter to unit handles so recycled slots cannot be mistaken for their previous occupants, and add team checks to the four validation sites in the meantime. Fix the AO pass state leak and texture-unit leak, and the beam instance stride. Reset the crate rate on world reset. Move the build-zone rasterisation behind a dirty flag. Cap the tide against remaining headroom at queue time and stop creating wrecks for insect deaths. Give the reclaim tick the loop the other way round, and compact the building array.

### Phase 2 — Linear lighting and real shadows (about a week)

Upload textures as sRGB, encode gamma on output, clamp albedo and rebalance the key light, and compute the specular half-vector against the eye. Then the shadow map: split the instanced flush into upload and draw, one 1024² orthographic depth target snapped to texels, terrain as receiver only, normal-offset bias — and delete the decal shadows and their 260 triangles apiece. Fund it by halving the AO resolution and giving it the blur it needs. Put FXAA in the present pass, which is currently pure wasted bandwidth.

This phase is what closes the remaining distance to the reference art. Bloom on emissives and giving the terrain the material system the models already have are the natural follow-ups.

### Phase 3 — Make the game decidable (two to three weeks)

Add a real move order — the state already exists, only the wiring is missing. Widen the armour matrix until a wrong-weapon engagement is a visible loss, and apply the multiplier per victim inside the blast loop rather than baking the aimer's. Delete one of Pyro/Scorcher and one of Thumper/Bombard, give Thumper a minimum range, and stop the AI building anti-air into ground waves. Give Bulwark an energy upkeep and an answer.

Turn the combat modes into genuine trades rather than free upgrades. Make structures stream their cost so over-committing chokes. Break the mass-to-energy lockstep by giving turrets, radar and shields a standing energy draw.

Replace the AI's rubber-band cheat with behaviour: cap the income multiplier near 1.6× on Hard and buy the difficulty back with mode usage, artillery against defended positions, and target scoring that weighs value rather than only distance.

### Phase 4 — Teach the game (one to two weeks)

Hide match configuration behind an Advanced toggle for a first run, default wildcards off and the match clock to ten minutes. Replace the two vanishing toasts with a persistent four-step objective card. Add the base-under-attack alert — ping, sound, tap-to-jump. Add a deselect state and an explicit clear control. Decouple the two-finger gestures, add a reset-north compass, widen the pick radius to a screen-space value, and close the dead press window. Add haptics; there is currently not a single vibrate call in a mobile-first game.

### Phase 5 — Reasons to come back (ongoing)

Convert at least half the armory from percentages to unlocks that change how a match is played, and tie ranks to them so a rank means something. Let players choose their wildcards at individually priced multipliers. Add a daily first-win bonus. Give Mega Battle reduced but non-zero rewards — it is the most shareable thing in the build and it is currently progression-dead.

---

## 7. The short version

Fix the recycled-index bug before anything else; it is the only defect on this list that makes units shoot their own side. Then spend a week on colour management and a shadow map, because that is where the remaining visual gap actually lives and no further modelling will substitute for it. Then spend three weeks giving the player decisions: a move order, an armour matrix that decides fights, modes that cost something, an economy that can choke, and an AI that wins by playing rather than by being handed nine times the income.

The engine is not the constraint. It has been ready for a bigger game than the one currently sitting on top of it.
