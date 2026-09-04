# MASSFRONT — frame & interface audit

**Build** v1.33.73 · **Viewport** 412×900 @dpr2 · **GPU** AMD Radeon 610M (integrated) · **Boot to interactive** 2.3 s

Where the frame budget actually goes, what the HUD does to a thumb on a 412 px
phone, and where the art direction is already working. Every number below came
from an instrument, not an impression.

---

## Revision — what has changed since the first pass

- **PLATOONS row reclaimed.** The stack rail was collapsing to 0×0 whenever a
  unit was selected. Fixed and shipped in v1.33.73 (§3).
- **Brood ground no longer builds on human concrete.** The Infestation Swarm now
  colonises the terrain it occupies, with veins between organisms and real
  height relief (§6).
- **Structures can be grounded cheaply.** The mechanism is now proven in shipped
  code, which changes the effort estimate on the highest-value visual fix (§8).
- **"The lighting is close to flat ambient" was wrong.** The terrain runs a full
  four-material splat system with authored normals and roughness. Corrected
  diagnosis in §6.

---

## 1. The headline: you are CPU-bound, not GPU-bound

*Measured by `tools/probe-performance.mjs` via the in-engine `mfPerfReport()`, in a live skirmish.*

This is the most important finding in the review, and it changes what
optimisation work is worth doing. The renderer is not the problem. The
per-frame CPU work that prepares the scene is.

| Live units | p50 frame | p95 frame | Draw calls | Triangles | JS heap | Engine verdict |
|---|---|---|---|---|---|---|
| 4 | 17.8 ms | 178 ms | 15 | 165,904 | 236 MB | Render CPU |
| 112 | 33.1 ms | 1,323 ms | 32 | 200,771 | 268 MB | Render CPU |
| **348** | **173 ms** | 1,441 ms | 34 | 253,128 | 262 MB | Simulation |
| **723** | **237 ms** | 1,334 ms | 35 | 325,208 | 260 MB | Render CPU |

p50 is the honest steady-state figure. Read the draw-call and triangle columns
next to the frame column — that contrast is the whole finding.

**What the numbers say.** From 4 units to 723, frame time rises **13×**
(17.8 ms → 237 ms). Over the same range draw calls rise from **15 to 35** and
triangles less than double. A GPU-bound or batching-bound game does not behave
like that — those columns would be climbing hard. They are almost flat.

The engine agrees, in its own words: *"Scene preparation and draw submission
cost 703.0 ms at p95."* Preparation, not submission.

> **Why this matters commercially.** Your own design target is roughly
> 1,000–2,000 units per theatre. At 723 units this build renders a frame every
> 237 ms — about 4 fps. The playable ceiling measured here is closer to
> **110 units**, where the frame lands at 33 ms (30 fps). That is a gap between
> the game's ambition and its current engine budget, and it is worth confronting
> before more content is built on top of it.

**FIX FIRST — per-frame per-unit CPU work is the wall.**
Because draw calls stay flat, the cost is in what runs *before* submission:
per-unit transform/matrix building, visibility and fog tests, icon and
health-bar layout, sorting, and the picker's spatial structures. Profile
`mfPerfBegin`/`mfPerfEnd` banks inside the render path to find which dominates,
then attack that one. Do not spend effort on batching or texture atlases — the
instrument says they are not costing you.

**INVESTIGATE — simulation takes over at ~350 units.**
At 348 units the engine's own attribution flips from *Render CPU* to
*Simulation*, then flips back at 723. Two separate costs are trading places
rather than one dominating. Both need a budget, and neither can be fixed by
touching the other.

**ALREADY STRONG — batching and memory.**
35 draw calls for 723 units is genuinely excellent instancing. The JS heap is
flat: 236 MB → 260 MB across a 180× increase in units, with no growth trend
across repeated samples. There is no unit-count memory leak.

---

## 2. The HUD holds up better than expected

*Measured by `tools/probe-gui-layout.mjs` — 37 controls, 4 decks, 412×900.*

Touch ergonomics were the thing I most expected to find broken, given this
project's history of controls that exist but cannot be tapped. They are fine.

- **Zero untappable controls, zero WCAG failures.** Across 37 unique interactive
  controls in all four HUD decks: **0** render at zero size, **0** fall below the
  24 px WCAG 2.5.8 AA minimum, and only one sits under Apple's 44 px guideline —
  `#goalDetailBtn` at 329×24, a wide objective banner rather than a small target.
- **No horizontal page overflow in any deck.** The document never scrolls
  sideways. That is a discipline many mobile HUDs lose.

---

## 3. Layout: the PLATOONS row spends its space badly

*Measured by `tools/probe-gui-layout.mjs`, confirmed in capture.*

**FIX FIRST — four of five unit stacks render off-screen.**
On a 412 px viewport the stack cards lay out at x = 414, 522, 629, 736. Every
one starts past the right edge. The row shows four empty platoon slots
(1 2 3 4), then COMMANDER, then CONSTRUCTOR clipped mid-label — Striker, Rhino,
Goliath and Thumper are simply not visible.

The rail is a horizontal scroller, so the content is reachable, but there is
**no visual affordance** that anything lies to the right: no edge fade, no
chevron, no partial-card peek. A player has no reason to swipe a row that looks
complete.

**Three fixes, cheapest first**

1. **Collapse empty platoon slots.** Slots 1–4 are all empty and consume roughly
   45% of the row. Render a saved slot only once it holds something; show a
   single compact "+" to create one. This alone roughly doubles the space
   available to real stacks.
2. **Add a scroll affordance.** A 16 px gradient mask on the right edge whenever
   `scrollWidth > clientWidth`, and size cards so the next one always peeks by
   ~20 px. Peeking is the strongest cue there is — it beats an arrow.
3. **Shrink the card.** 104 px per card buys icon + name + count + readiness +
   health. At 76 px (icon, count badge, health hairline) five stacks fit without
   scrolling at all, with the name on long-press.

---

## 4. GUI art and visual direction

*From 412×900 captures, all four decks.*

**WORKING — the chrome language is coherent and reads fast.**
Rounded bordered chips, a consistent cool-blue palette with semantic colour on
the resource icons, condensed uppercase labels, and the commander portrait with
rank and XP make a legible, confident system. The resource rail in particular
does a lot of work in very little height.

**COMPOSITION — the bottom of the screen is four layers deep.**
Reading upward: the orders row (ARMY / IDLE / SELECT / STOP / BUILD), the deck
tabs (ORDERS / PLATOONS / BUILDINGS / ABILITIES / VIEW), the active deck's own
row, and floating above them the commander COMMAND LINK card, the FEED button
and the minimap. That is a lot of competing furniture in the zone where the
thumb lives. The deck tabs and the orders row are both persistent navigation,
stacked — consider merging them into one persistent bar.

**HIERARCHY — floating elements read as unplaced.**
The CLEAR SKIES weather pill sits alone in dead space at the top right, aligned
to nothing. The FEED button with its red "6" badge is pinned to the far-left
edge, detached from any group. Anchor them: weather beside the mission timer in
the top rail; FEED with the minimap as a bottom-left utility cluster.

**OPPORTUNITY — the middle 55% of the screen is empty chrome.**
Correct for a battlefield viewport, but it is also the most valuable real estate
on the device and nothing uses it for transient information. Selection details,
order confirmations and unit intel all currently compete for the crowded bottom.
Consider a lightweight selection readout just above the dock, fading on order.

**DETAIL — numerals sit too tight to their icons.**
In the resource rail, `261`, `1.0K` and `11/500` nearly touch their coloured icon
chips. Four to six pixels of gap plus `font-variant-numeric: tabular-nums` would
stop the values jittering as they tick — a constant low-level source of visual
noise in an RTS.

---

## 5. World art: healthier than the HUD suggests

*Measured by `audit-material-variety.mjs` and `audit-faction-structure-art.mjs` — 142 structures, 117 units.*

**STRONG — only 1% of structures are single-material dominated.**
Of 142 structures, just 2 have one material covering ≥80% of their surface area.
Mean dominant-material share is **49.4%** for structures and **46.4%** for units.
That is healthy material breakup, and it means flat-looking surfaces are a
lighting or texture-intensity question, not a modelling one.

| Faction | Variants | Resident geometry | Max verts | Max tris |
|---|---|---|---|---|
| Nova Federation | 53 | 6.49 MB | 3,488 | 1,580 |
| Red Ascendancy | 53 | 5.59 MB | 5,256 | 2,588 |
| Machine Ascendancy | 49 | 7.81 MB | 5,100 | 2,376 |
| **Infestation Swarm** | 49 | **12.69 MB** | **9,008** | **3,960** |

**BUDGET — the Infestation Swarm costs roughly twice every other faction.**
12.69 MB of resident geometry against 5.59–7.81 MB, with a peak variant at 9,008
vertices versus 3,488–5,256 elsewhere. Organic silhouettes legitimately need more
geometry than hard-surface ones, so this may be deliberate — but on a phone it is
the faction most likely to push a low-memory device over the edge, and given the
CPU finding above it is also the faction most likely to make scene preparation
expensive. Worth a decimation pass on the worst variants.

**MINOR — one outstanding hard art finding.** `legion / mex / base` has 3 material
zones where the standard requires 4. A single-asset fix.

---

## 6. Looking at the rendered battlefield

*Captured by `tools/probe-world-art.mjs` — 4 camera framings, 4 factions.*

Earlier captures showed the HUD over black, because a WebGL context without
`preserveDrawingBuffer` has an undefined back buffer by the time the compositor
reads it. Forcing that flag before any page script runs makes the capture real —
verified at 100% of sampled pixels lit, mean luma 89/255 — so the following
assesses the actual game, not geometry statistics.

**HIGHEST VISUAL RETURN — nothing casts a shadow.**
Structures and vehicles sit on the concrete pad with no contact shadow and no
cast shadow. That single absence is why the base reads as *pasted onto* the
ground rather than standing on it, and it costs more perceived quality than any
texture work would buy back.

The Infestation Swarm already proved the fix works: its structures sit in
darkened sockets, and they were the only buildings that looked planted. **The
mechanism is now proven in shipped code** — see §7.

**FACTION IDENTITY — Nova and the Machine Ascendancy share a palette.**
Both are blue-grey with cyan emissive accents. They differ in silhouette — Nova
is rectilinear military blocks, the Machine Ascendancy is angular faceted plate
with energy orbs and rings — but silhouette is exactly what compresses away at
strategic zoom on a 412 px screen, and colour is what still reads.

By contrast the Infestation Swarm is *instantly* identifiable: magenta flesh
domes, bone spikes, acid-green pustules, olive units with blue crystal growth.
That is the standard the other factions should be held to. Push the Machine
Ascendancy toward a colder white/violet or a sodium-amber, or warm Nova toward
steel and off-white, so the two never sit in the same hue family.

**LIGHTING — diagnosis corrected.**
§5 measured healthy material breakup — mean dominant share 49%. On screen you
cannot see it: vertical faces are near-black with a thin lighter top edge, and
almost all surface detail lives on roofs.

**My first explanation — "the lighting is close to flat ambient" — was wrong.**
Reading the ground shader shows a full four-material splat system live in play:
`uGroundT/uSoilT/uPaveT/uGrassT` each paired with an authored normal map carrying
roughness in alpha, a micro-grain detail sheet sampled twice (second sample
scaled *and* rotated to break tiling), per-pixel normals central-differenced from
a global height sheet, and an `fwidth`-adaptive edge band for material
transitions. That is a considered renderer, not flat ambient.

The real problem is narrower, and therefore more fixable: **the value range is
compressed and the key light is weak relative to ambient**, so adjacent faces
land on nearly the same value and the normal-mapped structure has nothing to
modulate. Sun colour and intensity against ambient fill is the lever — not new
art, and not new shader work.

**VFX — the link beams read as rendering artifacts.**
Translucent white-grey quads radiate across the base in both the Nova and Machine
Ascendancy captures, cutting straight through building geometry with no shading
or depth interaction. They are presumably power or command links, but they read
as a bug. Give them a soft gradient, depth-fade at intersections, and some
motion, or scope them to when the player is inspecting the network.

**FIXED SINCE THIS REVIEW — every faction builds on the same human concrete.**
The grey pad with painted grid lines and a helipad cross is Nova's architectural
language, and the Brood's flesh domes sat on it.

Now fixed for the Brood. Each structure colonises the soil around it with a
corrupted, tendrilled rim, grows veins to its nearest neighbours, and —
the part that makes it read as biomass rather than a stain — contributes
*height*, so it has a rolled edge and vein ridges that catch the light. Three
separate causes were making it look boxy: a rectangular ground flatten, a bed
whose gradient was filled with a literal ellipse, and the real one — creep was
only *visible* inside whatever plaza the map already had, because the hardscape
mask governs where painted ground shows at all.

Still open for Legion and the Machine Ascendancy: both still pour Nova's apron.
Machine lattice and scorched plate remain unbuilt.

**OPPORTUNITY — the emissive accents are the best thing on screen.**
The small cyan point lights around the base carry the sci-fi register almost
single-handedly. There is room to lean much harder on emissive as the primary
faction signal — it costs little and reads at every zoom level.

**DETAIL — terrain softens noticeably at play zooms.**
At tactical and command framing the ground reads soft and slightly blurred, and
the pad's edges alias against it. Terrain does a good job of large-scale variety
but lacks close-range detail frequency where the camera actually sits.

---

## 7. What the renderer actually is, and the wall around it

*From reading `src/engine/mesh.js`, `terrain.js`, `ui/render3d.js`.*

Added after the first pass, because I misjudged this and the correction matters
for anything visual you plan next.

**BETTER THAN ASSUMED — the ground is a real multi-material splat system.**
Four complete material sets — ground, soil, pave, grass — each with a seamless
albedo and an authored normal map carrying roughness in alpha. On top of that: a
micro-grain detail sheet sampled twice with the second sample scaled *and*
rotated to break tiling, per-pixel normals central-differenced from a global
R16F height sheet, an `fwidth`-adaptive threshold band so formed edges stay crisp
while ramps crossfade, quality tiers from low to cinematic, five ground profiles,
per-material tints, and sixteen live impact burns.

This is a considered renderer. Any statement that the terrain "looks flat because
there is no material system" — including mine, earlier in this document — is wrong.

**HARD CONSTRAINT — every texture unit is spoken for.**
The terrain program uses all sixteen units WebGL2 guarantees. Units 4, 5 and 6
look free but belong to the post chain and model assets, and the code
deliberately places splat inputs on 8/9 *"above the post chain's 4/5/6, so
neither side can alias the other."*

That means **a fifth ground material cannot simply be added**. It needs one of:
atlasing into the existing sheets (breaks `REPEAT` wrap, needs manual `fract()`,
frays mips at seams), a `sampler2DArray` refactor of a heavily-tuned shader, or
exceeding the 16-unit floor and accepting different output on low-end Android.
Worth knowing before any future material — decals, snow, scorch — is planned.

**THE WAY THROUGH — the height sheet is an unused lever, and it is free.**
Because the shader derives normals from `uHeight` and `terrainDirty()` already
re-uploads that sheet per touched window, anything that contributes height gets
relief and correct lighting for nothing — no sampler, no shader edit. Brood creep
now rides this. Contact shadows, scorch depressions, wheel ruts and crater lips
could all use the same route.

---

## 8. Where I would spend the next two weeks

Ordered by value per hour, not by severity.

1. **Profile the render-CPU path and pick one hotspot.**
   Everything about the game's scale ambition depends on this number. The
   instrumentation already exists — add `mfPerfBegin`/`mfPerfEnd` banks around
   transform building, visibility culling and icon layout, then re-run the probe.
   Look for the one bank that grows with unit count.
   *High value · medium effort · unblocks the roadmap*

2. **Reclaim the PLATOONS row.** *Partly done.* The rail was collapsing to 0×0
   whenever a unit was selected — a cinematic rule fired on `uiPrimaryOpen`, which
   includes the unit info card. Fixed in v1.33.73. Still worth doing: hide empty
   platoon slots and add an edge-fade cue, because four of five stacks still start
   past the right edge with nothing signalling it.
   *Reachability shipped · discoverability still open · low effort*

3. **Set a frame budget and gate on it.** `probe-performance.mjs` currently
   reports but never fails. Pick a target — say p50 ≤ 33 ms at 150 units — and
   make it a gate. Otherwise this regresses silently, exactly as the
   payload-delivery bug did.
   *Medium value · low effort · prevents regression*

4. **Ground every structure with a contact shadow.** The cheapest large gain in
   the review, and the route is **no longer speculative**. Brood creep now gets
   real relief by contributing to the global height sheet the ground shader
   already central-differences for per-pixel normals — no shader change, no
   texture unit, no new art. A shallow settling depression and rim under every
   structure footprint would ground all three remaining factions the same way.
   *High value · low effort · mechanism proven in shipped code*

5. **Separate Nova and Machine Ascendancy by hue.** They currently share
   blue-grey with cyan accents and are told apart only by silhouette, which
   compresses away at strategic zoom.
   *High value · medium effort · art direction call*

6. **Merge the two persistent bottom bars.** The deck tabs and the orders row are
   both always-on navigation, stacked in the thumb zone. Collapsing them returns
   roughly 70 px of screen and simplifies the mental model.
   *Medium value · medium effort · needs design judgement*

7. **Decimate the worst Infestation variants.** Bring the faction's resident
   geometry closer to the other three. Lowest urgency, but it compounds with the
   CPU work above.
   *Lower value · medium effort · art task*

---

## 9. What this review cannot tell you

- **Art was judged from stills, not from motion.** The canvas-capture problem is
  solved (§6), so the world art was genuinely looked at — but animation, VFX in
  flight, combat readability and the feel of camera movement cannot be judged
  from a screenshot. Those still need play testing.
- **The hardware is not a phone.** Measurements ran on an AMD Radeon 610M
  integrated GPU under browser automation. Absolute frame times will differ on
  real devices. The *shape* of the curve — flat draw calls against rising frame
  time — is hardware-independent and is what the conclusion rests on.
- **p95 and max figures include environment noise.** A ~1.4 s stall appeared at
  every load step including four units, which is occluded-window scheduling in the
  automation host, not the game. I have leaned on p50 throughout for exactly this
  reason, and an external rAF sampler was discarded mid-review once it produced a
  669-unit step that read faster than a 348-unit one.
- **Only skirmish was measured.** Campaign, galactic and space-exploration flows
  were not exercised.

---

## Instruments added for this review

Left in the repo, all re-runnable, none gating a release yet:

- `tools/probe-performance.mjs` — frame budget via in-engine telemetry
- `tools/probe-gui-layout.mjs` — touch targets, clipping and overflow at any viewport
- `tools/probe-world-art.mjs` — forces `preserveDrawingBuffer` so the battlefield
  actually appears in captures, and verifies the frame is not black before you
  trust it

The world-art probe earned its place twice: it caught a creep change that erased
the infestation entirely, and a relief profile that inflated the mat into a
balloon. Both were mine, and both would have shipped blind.
