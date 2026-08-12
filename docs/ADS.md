# In-world ad boards

Ads are **diegetic props**, not a UI overlay: a handful of billboards and
jumbotron screens stand in the battlefield itself — beside the highway, on the
rim of derelict city districts — playing looping video like anything else the
war left running. There is no ad network wired up yet. There does not need to
be one for this to be finished: every call a real network would need already
exists behind an adapter, and turning one on later is meant to be a one-line
config change, not a rewrite.

Everything lives in `src/adboards.js` (~700 lines, no build step, no
dependencies) plus placeholder creatives in `assets/ads/`. It attaches itself
to the running game by wrapping three existing functions — it does not, and
must not, require editing any other file.

| | |
|---|---|
| Renderer / placement / adapter | `src/adboards.js` |
| Settings-row styling | `src/styles/ads.css` |
| Placeholder creatives + manifest | `assets/ads/*.mp4`, `*.jpg`, `manifest.json` |
| Creative generator (re-runnable) | `tools/make-ad-art.py` |

---

## How it works

### The three hooks

`adboards.js` never edits engine code — it wraps three global functions that
already exist by the time it loads (it is `#20` of 30 in
`assets/data/manifest.json`'s load order, well after the engine and sim, well
before `main.js`):

| Hook | Why |
|---|---|
| `setupDoodads` | Called after `buildTerrain()` (which itself calls `buildRoads()` then `planDistricts()`), so the road grid and city districts already exist for whatever map just loaded. The wrapper recomputes board placement here — same moment every other doodad (rocks, trees, crystals) is placed. |
| `begin3D` | The per-frame "about to draw lit geometry" hook `render3d.js` calls three times a frame. Ad boards piggyback the first call each frame to flush their frame-prop geometry, throttle-check the video texture upload, and draw the screen quads — all without a second render pass. |
| `renderSettings` | Called after the real settings list is built; appends one more row to `#setList` for the on/off toggle. |

Every wrapper is the same shape:

```js
const orig = setupDoodads;
setupDoodads = function () {
  const r = orig.apply(this, arguments);   // ALWAYS run the original first
  try { adPlaceBoards(); adAssignCreatives(); }
  catch (e) { console.error('adboards: placement failed', e); }
  return r;
};
```

Original behaviour first, own logic in `try/catch`, own failure never
propagates. Four other systems share this global scope; a bug in an ad board
must never be able to take the render loop or the settings screen down with
it.

### The billboard prop

`mdlAdBoard()` builds one welded mesh — footings, posts, a maintenance
catwalk, hazard-stripe trim, a lighting boom with spotlights, an antenna, a
kit crate — from the same `MeshBuilder` primitives and palette constants
(`MET`, `CONC`, `DARKER`, `ENERGY`, …) every other structure in
`engine/models.js` is built from, so it sits in the world at the same
fidelity as everything around it. It draws through the normal instanced
model pipeline (`InstMesh`, `prog3D`) — lit, fogged, SSAO'd, shadowed, no
different from a turret or a building.

The **screen** is not part of that mesh, because its content changes every
frame. It is a separate, tiny unlit GLSL program (`adInitScreenProgram`)
drawing a handful of CPU-computed world-space quads — few enough per frame
(≤10) that a second instancing path would be more machinery than the job
needs. The quad corners are derived with the exact same
`world = R(yaw)·(local·scale) + (x, height, y)` transform the instanced model
shader applies, from the same `AD_HALFW/AD_SCR_H/AD_BOT_Y/AD_FACE_X` layout
constants the frame mesh uses — so the video image and its physical bezel
stay in registration at any position, scale or yaw a map's seed produces.

The screen program samples its texture unlit and multiplies by a
night-boosted `uBoost` factor (`nightAmt()` is the same day/night signal the
rest of the renderer uses), so boards read as a light source after dark, and
a soft additive halo is queued on the engine's existing billboard-sprite
batch for the same reason.

**Texture units / GL state** — the model and terrain shaders own units 0–3,
the AO/bloom/FXAA post-chain owns 4–6 (never move a sampler onto unit 0 by
default — an unbound sampler defaulting to unit 0 once made the material
atlas render across the whole screen). The screen quad's own sampler lives
on **unit 7**, chosen because nothing else in the engine touches it. Every
custom draw call in `adDrawScreens()` saves `BLEND` / `CULL_FACE` /
`DEPTH_TEST` / `DEPTH_WRITEMASK`, restores all four before returning, resets
the active texture unit back to 0, and — the one that matters most —
re-binds `prog3D` before returning, because `begin3D()`'s callers assume
that program is still current for every model drawn afterward this frame.

### Placement

Deterministic per map: `adPlaceBoards()` reseeds the shared `srand()`
generator itself (`(mapSeed ^ 0xAD8081) | 1`) rather than trusting whatever
state gl.js's own doodad placement left it in, so results never depend on
call order and never disturb it either.

Two scans, both capped by `AD_MAX = 10` boards total:

- **Roadside** (`adScanRoadSpots`) — walks the rasterised `ROADG` grid in
  strides of 5 cells, and for every occupied cell probes 10 random points
  74–130 units out looking for one that is walkable, not itself road, not
  water/cliff (`hAt` in `[0.40, 0.75]`), far from both spawns, far from
  resource deposits, and not already too close to another board. The board
  faces back toward the road.
- **City rim** (`adScanCitySpots`) — one candidate per `cityZones` entry,
  placed on the zone's rim (`0.80–1.15×` its radius) clear of every
  `cityPlan` block footprint belonging to that zone, facing inward.

Both scans reuse the same `validSpot`/`tooClose` predicates so a board can
never end up on top of a spawn's safety ring, a deposit, water, or another
board — no separate "don't collide" pass needed.

### Video texture management

One `HTMLVideoElement` **per creative**, not per board — several boards can
and do show the same clip — created lazily the first time a board showing it
is actually on screen. `assets/ads/manifest.json` maps creative ids to
`{poster, video}`, so a slot's assigned creative id doubles as the texture
cache key.

Every failure mode degrades to a plate colour or the poster image — **never
to a black rectangle**, which is what an unwritten `TEXTURE_2D` object (or
one whose `MIN_FILTER` still defaults to a mipmapped mode with no mips ever
generated) renders as:

| Condition | Handling |
|---|---|
| Texture never written | Every texture is seeded at creation with a real `texImage2D` call of a 1×1 solid colour (`adMakeTex`), and `TEXTURE_MIN_FILTER`/`MAG_FILTER` are explicitly set to `LINEAR` (no mipmaps are ever generated for a texture rewritten 15×/sec, so leaving the mipmapped default would sample solid black forever). |
| Video not ready | `readyState < HAVE_CURRENT_DATA` skips the upload that tick; the poster (or plate) keeps showing. |
| Video errored | The `error` event latches `videoState = 'error'` permanently for that creative; falls back to poster/plate and reports it via `AdProvider.reportError`. |
| Autoplay blocked | `<video>` is created `muted + playsInline` (both the modern property and the legacy `playsinline`/`webkit-playsinline` attributes) specifically so autoplay is allowed in the first place; if `play()` still rejects, `videoState` latches `'blocked'` and a listener on the next real `pointerdown`/`touchstart`/`keydown` anywhere on the page retries every blocked creative. |
| Tab hidden | `visibilitychange` calls `adPauseAll()`, which actually **pauses** every video element — not just skips its texture upload — so a backgrounded tab isn't still paying decode cost. |
| Low perf tier | See below — the whole system is gated off, not just throttled. |

### Performance

- **Upload throttle** — texture uploads are limited to `AD_UPLOAD_MS = 1000/15`
  (~15 fps), independent of the render loop's own frame rate, via a
  `now - lastUpload` check per creative.
- **On-screen only** — `adFrameHook()` computes each board's on-screen state
  against `camBounds()` every frame; only creatives with at least one
  on-screen board are in the `needed` set passed to `adUpdateCreatives()`.
  Anything not `needed` gets its `<video>` paused outright, not merely
  skipped.
- **Low-perf / battery-saver cutoff** — `adUpdateCreatives()` computes
  `perfOk = !(perfScale < 0.5) && META.settings.perf !== 'low'`, the same
  threshold `aoBeginScene()` in `engine/mesh.js` already uses to skip the
  AO/bloom pass entirely. When it's false every video is paused and only
  the (already-loaded, static) poster texture ever draws — no decode, no
  upload, at all.
- **User toggle** — `META.settings.ads === false` (see below) is checked in
  the same `canPlay` gate, independent of the perf tier.
- **Geometry cost** — the frame props are ≤10 instances through the existing
  instanced pipeline; the screen quads are ≤10 draw calls of 4 vertices each
  through a dedicated 2-triangle unlit program. Both are negligible next to
  a battlefield full of units; see the measurements in the accompanying test
  report for actual numbers.

### Impression counting

Dwell-based: a board counts as an impression once it has been continuously
on-screen **and** showing a resolved creative for `AD_DWELL_S = 1.5` seconds
(`adUpdateImpressions`, ticked from the same throttled per-frame hook). This
is the closest honest proxy for "impression" available without a server
round trip — a board that flickers past the edge of the camera for a frame
does not count, and dwell resets the instant it leaves screen or its
creative is unset.

Counts persist to their own `localStorage` key, `massfront_ads_stats_v1` —
deliberately **not** folded into `META`/`metaSave()`, so ad stats have their
own lifecycle independent of the player's save data (they are not something
a save-code export/import needs to carry, and clearing them independently is
someone's a valid thing to want without touching a career).

### The settings toggle

`adRenderSettingsRow()` appends one row to `#setList` after the real
`renderSettings()` has built the list, using the existing
`sItem setRow sTx sDs sBuy togB onT` classes from `ui.css` verbatim — no new
class was invented for the row itself, only a namespaced `.adsRow` modifier
in `ads.css` for a subtle accent (tinted border, a slow pulse on the emoji
glyph, disabled under `prefers-reduced-motion`). Clicking it flips
`META.settings.ads` (default: on, matching every other `DEF_SETTINGS` boolean
that's absent until toggled), calls the existing `metaSave()` so it persists
through the normal generic `JSON.stringify(META)` path with no changes to
`meta.js`, and re-invokes `renderSettings()` so the list — and this row — are
rebuilt cleanly.

---

## Adding a slot or a creative

**A new creative** (same providers, more variety): add an entry to
`assets/ads/manifest.json`'s `creatives` array —

```json
{
  "id": "your_id",
  "brand": "Display Name",
  "tagline": "optional, cosmetic only",
  "accent": [r, g, b],
  "bg": [r, g, b],
  "poster": "your_id_poster.jpg",
  "video": "your_id.mp4"
}
```

— and drop the referenced files in `assets/ads/`. `LocalAdProvider` picks
creatives by `adHash(slot.id) % list.length`, so a new entry is
automatically eligible for assignment to any slot next time `adAssignCreatives()`
runs (map load); nothing else needs to change. `video` is optional — a
creative with only a `poster` is a valid, if static, ad.

Re-generate every placeholder from scratch (or use it as a starting point
for hand-authored art) with:

```
python3 tools/make-ad-art.py
```

It writes 4-second, 12 fps, 480×270 seamless-loop H.264 baseline MP4s (via
`ffmpeg`, numpy+PIL for the frames) plus a poster JPG per creative, and
regenerates `manifest.json` to match. Runs in well under a minute; total
output is a few hundred KB, comfortably inside a "few MB" budget for
several times as many clips.

**A new slot** (more boards, or a fixed non-procedural placement): the
placement scans in `adPlaceBoards()` already produce `AdSlot` objects
(`{id, x, y, yaw, scale, placement, size, creative}`); to hand-place one
instead of procedurally scanning for it, push an `AdSlot(id, x, y, yaw, scale)`
onto `adBoards` after the two scans run, before the `AD_MAX` cap. Nothing
downstream — rendering, throttling, impressions, the adapter — cares how a
slot's coordinates were decided.

**A new placement category** (a third scan, e.g. "on a bridge"): add a
function shaped like `adScanRoadSpots`/`adScanCitySpots` (takes the shared
`validSpot`/`tooClose` predicates, returns `[{x,y,yaw}]`) and call it from
`adPlaceBoards()` the same way the existing two are called.

---

## Going live with a real ad network

`AD_CONFIG.provider` is the entire integration surface. Every board asks the
`AdProvider` interface for a creative and never touches a `<video>` element,
a manifest file, or a network SDK directly:

```js
class AdProvider {
  init();                                 // lazy, memoised, idempotent
  async _doInit();                        // provider-specific setup
  async loadCreative(slot);               // -> {id,brand,accent,bg,poster,video} | null
  reportImpression(slot, creative);       // dwell-based, see above
  reportError(slot, err);                 // playback/decode failures
}
```

`LocalAdProvider` (today's default) implements all four against the bundled
manifest. `NetworkAdProvider` is a **documented stub** in `src/adboards.js` —
constructed, wired into `AD_CONFIG`, but its `_doInit()`/`loadCreative()`
throw on purpose, because a real integration needs a signed agreement and
real IDs this codebase has no way to invent. To make it real:

1. **`AD_CONFIG.provider = 'network'`** — the entire call-site change; every
   board starts asking `NetworkAdProvider` for fill instead of
   `LocalAdProvider` with no other code touched.
2. **`_doInit()`** — load the network SDK (Google Mobile Ads / AdMob for
   native wrappers, or a raw VAST/IMA tag for a pure web build), initialise
   it with real app/ad-unit IDs, and gate the whole thing on the consent
   flow's result (see *Store policy*, below) — do not request a single ad
   before consent is resolved.
3. **`loadCreative(slot)`** — request a video creative sized to `slot.size`
   (an AdMob rewarded/interstitial unit, or a VAST `<MediaFile>` parsed out
   of the tag response) and resolve with the **same shape**
   `LocalAdProvider` resolves with: `{id, brand, accent, bg, poster, video}`.
   `video`/`poster` may be `blob:` or `https:` URLs — the renderer only ever
   uses them as `<video>`/`<img>` sources, so it does not care which.
4. **`reportImpression()` / `reportError()`** — forward to the network SDK's
   own tracking/viewability callbacks instead of `AD_STATS`. Networks
   generally define "impression" themselves (often stricter than this
   file's 1.5s dwell heuristic); prefer the network's own signal once one
   exists, and keep the local dwell counter only as a sanity check / offline
   fallback if useful.

Everything above that seam — geometry, placement, the throttled texture
upload, on-screen culling, the perf-tier cutoff, the settings toggle — is
provider-agnostic and needs **no changes** to go live.

### Store-policy items (do before enabling `NetworkAdProvider`)

None of these are implemented here — they are prerequisites a real ad
network integration cannot legally or technically skip, listed so they are
not discovered for the first time during store review:

- **Consent (GDPR/UK/CCPA and Google's own EU consent requirement)** — a
  real network must not request personalised (or in some jurisdictions, any)
  ads before the player has answered a consent prompt. If using AdMob, this
  is Google's [User Messaging Platform (UMP) SDK](https://developers.google.com/admob/ump/android/quick-start);
  a raw VAST integration needs the equivalent built by hand. `_doInit()`'s
  gate on "consent resolved" in step 2 above is where this plugs in.
- **Privacy policy** — both app stores require a published, linked privacy
  policy disclosing ad-network data collection the moment any ad SDK ships,
  even before it serves a single ad. Must be reachable from the app's store
  listing and, generally, from in-app settings.
- **Age rating / families policy** — AdMob (and most networks) restrict or
  forbid personalised ads, and sometimes ads entirely, on content rated for
  children (Google Play Families program, Apple's Kids Category, COPPA in
  the US). If this game's store listing ever targets a "made for kids"
  category, contextual-only ads and a network that supports a
  child-directed-treatment flag are required — check before picking a
  network, not after.
- **App Tracking Transparency (iOS)** — if the chosen network does any
  cross-app tracking/identifiers (IDFA), iOS requires the ATT prompt before
  that identifier is accessible, independent of the GDPR consent flow above.
- **Store ad-content policies** — both stores restrict ad content
  categories (no ads for real-money gambling to minors, no deceptive
  "system warning" style creatives, no auto-redirect/tap-jacking ads, video
  ads must be user-dismissable if they cover gameplay, etc.) — audit
  whatever creatives a network actually serves against current Play/App
  Store ad policy before shipping, since a network's fill is not fully
  choosable in advance.
- **Network SDK size / permissions** — most mobile ad SDKs add
  non-trivial binary size and request additional permissions (network
  state, sometimes location for geo-targeted fill); review both against
  this project's size and permission budget before committing to one.

None of the above blocks anything in this build — `LocalAdProvider` needs no
consent flow because it requests nothing from anyone and collects no data
that leaves the device — but all of it blocks flipping `AD_CONFIG.provider`
to `'network'` for a real store release.
