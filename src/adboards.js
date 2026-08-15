;
;
/* ============================================================================
   AD BOARDS — in-world video-texture billboards
   ----------------------------------------------------------------------------
   Ads are DIEGETIC PROPS here, not a UI overlay: a small number of billboards
   and jumbotron screens stand in the battlefield itself, beside the highway
   and around the derelict city districts, playing looping video like anything
   else the war left running. There is no ad network wired up yet — only
   bundled placeholder clips — but every path a real network would need
   (request a creative for a slot, report an impression, report a failure)
   already exists behind the AdProvider interface below. Turning on AdMob or a
   VAST tag later is meant to be AD_CONFIG.provider flipping from 'local' to
   'network', not a rewrite of the renderer.

   This file plugs into an already-running engine without editing any of it.
   Three existing global FUNCTIONS are wrapped (not replaced) at load time:
     setupDoodads  — so board placement is (re)computed right after the
                     terrain, road grid and city districts exist for whatever
                     map is current, exactly like rocks/trees/crystals are.
     begin3D       — the model-shader "frame prologue" render.js calls before
                     drawing any lit geometry. Hooking it is what lets the
                     board frames draw through the SAME lit/fogged/SSAO'd
                     pipeline every other structure uses, and gives a once-
                     per-frame timing point for the throttled video-texture
                     upload, all without a second render pass.
     renderSettings — appends one more row to #setList after the real
                     function has built the list, so the toggle lives in the
                     normal settings screen without touching meta.js.
   Every wrapper calls the ORIGINAL function first, wraps its own work in
   try/catch, and never lets a failure in here reach the caller — four other
   systems are mid-development in this same global scope and a bug in an ad
   board must never be able to take the render loop or the settings screen
   down with it.

   CRITICAL GL HYGIENE: the post-processing chain (SSAO/bloom/FXAA, in
   engine/mesh.js) owns texture units 4/5/6 and the model/terrain shaders own
   0/1/2/3. Unit 7 is ALSO the model detail atlas and unit 8 the fog map —
   ads borrow them for the screen draw, then put detail/fog/matTex back.
   Never bindTexture(null) on the active unit (that was unit 0 / the atlas).
   Restore BLEND / CULL_FACE / DEPTH_TEST / DEPTH_WRITEMASK / prog3D.
   ============================================================================ */

/* ============================================================================
   BILLBOARD PROP — geometry
   ----------------------------------------------------------------------------
   Authored the same way every other structure in engine/models.js is: welded
   from MeshBuilder primitives, feet at y=0, facing local +X, real world-scale
   units (an instance scale of ~1 is a real billboard). The screen itself is
   NOT part of this mesh — it can't be, its content changes every frame — this
   only builds the frame it sits in: footings, posts, a catwalk, hazard trim,
   a lighting boom and a backing panel sized to exactly match the video quad
   adScreenVerts() computes below. The two are kept in registration by sharing
   the same AD_* layout constants.
   ============================================================================ */
const AD_HALFW  = 14.2;   // screen half-width, local Z
const AD_SCR_H  = 16.0;   // screen height
const AD_BOT_Y  = 13.0;   // screen bottom, world units above ground
const AD_FACE_X = 1.02;   // local X of the screen plane — just proud of the backing panel

function mdlAdBoard(){
  const m = MB();
  const hw = AD_HALFW, topY = AD_BOT_Y + AD_SCR_H;
  // footings + support posts, one each side of the screen
  for (const s of [-1, 1]) {
    const pz = s * hw * 0.70;
    m.cyl(0.0, 0.0, pz, 2.5, 2.4, 1.0, 10, CONC);              // concrete footing
    m.cyl(0.0, 1.0, pz, 1.05, 0.90, AD_BOT_Y - 1.0, 10, MET_D); // support post
    m.cyl(0.0, AD_BOT_Y - 1.0, pz, 0.90, 0.80, 1.3, 10, MET_L); // collar where the catwalk lands
  }
  // horizontal cross braces tying the posts together
  m.box(0.0, 4.5, 0, 1.0, 0.9, hw * 1.42, DARK);
  m.box(0.0, 8.5, 0, 1.0, 0.9, hw * 1.42, DARK);
  // maintenance catwalk + a glowing guard-rail along its front edge
  m.bevelBox(0.20, AD_BOT_Y - 1.40, 0, 2.0, 0.5, hw * 1.70, 0.2, MET);
  glowStrip(m, 1.15, AD_BOT_Y - 0.50, 0, hw * 1.65, MET_L, Math.PI / 2);
  // hazard stripe band along the base — no existing palette constant maps to
  // MAT.WARN, so the material is set explicitly for this one primitive; every
  // primitive after it uses a recognised palette colour again and resets it
  m.mat(MAT.WARN);
  m.box(0.05, AD_BOT_Y - 2.30, 0, 0.9, 0.75, hw * 1.60, C(255, 255, 255));
  // backing panel — the screen quad sits flush against its front face
  m.bevelBox(0.40, AD_BOT_Y - 1.50, 0, 1.2, AD_SCR_H + 4.0, hw * 2 + 3.0, 0.4, DARKER);
  // lighting boom + spotlights angled down at the screen
  m.box(0.60, topY + 0.60, 0, 2.6, 0.5, hw * 1.70, MET_D);
  for (const t of [-0.75, -0.25, 0.25, 0.75]) {
    const lz = t * hw * 1.55;
    m.box(1.60, topY + 0.20, lz, 1.6, 0.6, 0.6, DARK);
    m.box(2.30, topY + 0.10, lz, 0.6, 0.5, 0.9, LAMP, -0.35);
  }
  // emissive trim along the top and bottom edges — reads at night even before
  // the screen itself is considered "glowing"
  glowStrip(m, AD_FACE_X, topY + 0.35, 0, hw * 2 + 0.6, ENERGY, Math.PI / 2);
  glowStrip(m, AD_FACE_X, AD_BOT_Y - 0.35, 0, hw * 2 + 0.6, ENERGY, Math.PI / 2);
  // antenna + a crate of gear at the base for clutter, same vocabulary every
  // other structure in the game is built from
  sensorMast(m, 0.40, topY + 1.10, hw * 0.95, 3.4, MET_L);
  kitBox(m, 0.30, 0.10, hw * 0.70 + 1.6, 1.8, 1.3, 1.6, MET_D, 0.25);
  return m.build();
}

/* ============================================================================
   PLACEMENT — deterministic per map, seeded like every other doodad
   ----------------------------------------------------------------------------
   Runs from the setupDoodads() wrapper (see adInstallHooks), so ROADG,
   cityZones/cityPlan and the height field are already built for whatever map
   is current. Uses the SAME srand()/rnd()/rr() generator gl.js's own doodad
   placement uses, but reseeds it itself first — so this never depends on
   (or disturbs) whatever state that shared generator was left in — and never
   places on top of a spawn's safety ring, a resource deposit, water, or
   another board.
   ============================================================================ */
const AD_MAX = 10;
let adBoards = [];

function AdSlot(id, x, y, yaw, scale) {
  return {
    id, x, y, yaw, scale,
    placement: 'billboard',
    size: { w: AD_HALFW * 2 * scale, h: AD_SCR_H * scale },
    creative: null,           // filled in asynchronously by adAssignCreatives()
    _dwell: 0, _counted: false, _onscreen: false,
    // crossfade rotation state — second creative slot + blend progress
    creative2: null, _rotT: 0, _blend: 0,
  };
}

/* Beside the highway: walk the rasterised road grid looking for cells that
   are ON the road, then probe outward from each for the nearest clear
   shoulder — clear of the road itself, walkable, not water, not a cliff. */
function adScanRoadSpots(validSpot, tooClose) {
  const spots = [];
  if (typeof ROADG === 'undefined' || !ROADG) return spots;
  const cellW = MAP / PGS;
  const onRoad = (x, y) => !!ROADG[clamp(y / MAP * PGS | 0, 0, PGS - 1) * PGS + clamp(x / MAP * PGS | 0, 0, PGS - 1)];
  /* tooClose() alone only ever sees adBoards, and adBoards is still EMPTY for
     the whole duration of a scan — adPlaceBoards() doesn't push a scan's
     results into it until the scan has already returned in full. Two
     candidates accepted earlier in this SAME scan therefore never got
     checked against each other, so a run of unlucky road cells could place
     two boards on top of one another. tooCloseAny() closes that gap by also
     checking what this scan has already accepted. */
  const tooCloseAny = (x, y, d) => tooClose(x, y, d) || spots.some(s => dist2(x, y, s.x, s.y) < d * d);
  for (let gy = 3; gy < PGS - 3 && spots.length < 4; gy += 5) {
    for (let gx = 3; gx < PGS - 3 && spots.length < 4; gx += 5) {
      if (!ROADG[gy * PGS + gx]) continue;
      const rx = (gx + 0.5) * cellW, ry = (gy + 0.5) * cellW;
      if (tooCloseAny(rx, ry, 300)) continue;
      for (let t = 0; t < 10; t++) {
        const ang = rnd() * TAU, dist = 74 + rnd() * 56;
        const px = rx + Math.cos(ang) * dist, py = ry + Math.sin(ang) * dist;
        if (onRoad(px, py)) continue;
        if (!validSpot(px, py) || tooCloseAny(px, py, 300)) continue;
        spots.push({ x: px, y: py, yaw: ang + Math.PI });   // face back toward the highway
        break;
      }
    }
  }
  return spots;
}

/* In the city: one board per derelict/industrial district, planted just
   outside the block footprints on the district's rim, facing in. */
function adScanCitySpots(validSpot, tooClose) {
  const spots = [];
  if (typeof cityZones === 'undefined') return spots;
  const tooCloseAny = (x, y, d) => tooClose(x, y, d) || spots.some(s => dist2(x, y, s.x, s.y) < d * d);   // see adScanRoadSpots
  cityZones.forEach((Z, zi) => {
    for (let t = 0; t < 14; t++) {
      const ang = rnd() * TAU, rad = Z.r * (0.80 + rnd() * 0.35);
      const px = Z.x + Math.cos(ang) * rad, py = Z.y + Math.sin(ang) * rad;
      if (!validSpot(px, py) || tooCloseAny(px, py, 300)) continue;
      let blocked = false;
      if (typeof cityPlan !== 'undefined') {
        for (const P of cityPlan) {
          if (P.zone !== zi) continue;
          const r2 = Math.max(P.w, P.h) * 0.7 + 30;
          if (dist2(px, py, P.x, P.y) < r2 * r2) { blocked = true; break; }
        }
      }
      if (blocked) continue;
      spots.push({ x: px, y: py, yaw: ang + Math.PI });
      return;   // one per district — a skyline of billboards would defeat the point
    }
  });
  return spots;
}

function adPlaceBoards() {
  adBoards = [];
  if (typeof MAP === 'undefined' || typeof hAt !== 'function') return;   // engine not ready yet
  const MD = (typeof MAPDEFS !== 'undefined' && typeof curMap !== 'undefined' && MAPDEFS[curMap]) || null;
  srand(((MD && MD.seed || 1337) ^ 0xAD8081) | 1);
  const farFromSpawns = (x, y, d) => typeof farFromStartZones === 'function'
    ? farFromStartZones(x, y, d)
    : dist2(x, y, MAP * SP_LO, MAP * SP_HI) > d * d && dist2(x, y, MAP * SP_HI, MAP * SP_LO) > d * d;
  const validSpot = (x, y) => {
    if (x < 60 || y < 60 || x > MAP - 60 || y > MAP - 60) return false;
    if (!farFromSpawns(x, y, 340)) return false;
    if (typeof deposits !== 'undefined') for (const D of deposits) if (dist2(x, y, D.x, D.y) < 95 * 95) return false;
    if (typeof isWalkable === 'function' && !isWalkable(x, y)) return false;
    const h = hAt(x, y);
    return h >= 0.40 && h <= 0.75;
  };
  const tooClose = (x, y, d) => { for (const b of adBoards) if (dist2(x, y, b.x, b.y) < d * d) return true; return false; };

  let n = 0;
  for (const s of adScanRoadSpots(validSpot, tooClose)) {
    if (adBoards.length >= AD_MAX) break;
    adBoards.push(AdSlot('rd' + (n++), s.x, s.y, s.yaw, 0.88 + rnd() * 0.30));
  }
  n = 0;
  for (const s of adScanCitySpots(validSpot, tooClose)) {
    if (adBoards.length >= AD_MAX) break;
    adBoards.push(AdSlot('cz' + (n++), s.x, s.y, s.yaw, 1.00 + rnd() * 0.34));
  }
}

/* ============================================================================
   AD PROVIDER ADAPTER
   ----------------------------------------------------------------------------
   Every board asks THIS interface for what to play, and never touches a
   video element, a manifest file, or a network SDK directly. Today
   AD_CONFIG.provider is 'local' and LocalAdProvider serves the bundled clips
   in assets/ads/. The day a real network deal exists, AD_CONFIG.provider
   flips to 'network' and NetworkAdProvider — a documented stub below —
   starts answering the exact same three calls instead. Nothing in placement,
   rendering, throttling or the settings toggle has to change.
   ============================================================================ */
class AdProvider {
  /** Lazy, memoised, idempotent — call it as often as you like. */
  init() {
    if (!this._ready) this._ready = this._doInit().catch(e => { console.warn('adboards: provider init failed', e); });
    return this._ready;
  }
  async _doInit() {}
  /** slot: {id, size:{w,h}, placement:'billboard', x, y, yaw}.
   *  Resolves to {id, brand, accent, bg, poster, video} or null for "no
   *  fill" (the slot just keeps showing its neutral plate — exactly what an
   *  unfilled network request would look like too). Reject only for a real
   *  error; "nothing to show" is not one. */
  async loadCreative(slot) { return null; }
  /** Fired once per slot per viewing session (continuously on screen for at
   *  least AD_DWELL_S seconds) — the closest honest proxy for "impression"
   *  without a server round trip. */
  reportImpression(slot, creative) {}
  /** Playback/decoration failures the renderer couldn't route around. */
  reportError(slot, err) {}
}

class LocalAdProvider extends AdProvider {
  constructor() { super(); this.manifest = null; }
  async _doInit() {
    try {
      const res = await fetch('./assets/ads/manifest.json');
      if (!res.ok) throw new Error('http ' + res.status);
      this.manifest = await res.json();
    } catch (e) {
      console.warn('adboards: local ad manifest unavailable — boards will show a static plate only', e);
      this.manifest = null;
    }
  }
  async loadCreative(slot) {
    await this.init();
    const list = this.manifest && this.manifest.creatives;
    if (!list || !list.length) return null;
    const c = list[adHash(slot.id) % list.length];
    return {
      id: c.id, brand: c.brand, accent: c.accent, bg: c.bg,
      poster: './assets/ads/' + c.poster,
      video: c.video ? './assets/ads/' + c.video : null,
    };
  }
  reportImpression(slot, creative) {
    AD_STATS.total++;
    AD_STATS.impressions[creative.id] = (AD_STATS.impressions[creative.id] || 0) + 1;
    adStatsSave();
  }
  reportError(slot, err) { console.warn('adboards: slot error', slot && slot.id, err); }
}

/* ---- NetworkAdProvider — STUB ----------------------------------------------
   Not implemented on purpose: a live network integration needs a signed
   agreement, real IDs and — per store policy — a consent flow before it can
   request anything (see docs/ADS.md). This class exists so the SEAM is
   concrete rather than hypothetical. To go live:

     1. AD_CONFIG.provider = 'network' (below) — the entire call-site change.
     2. _doInit(): load the network SDK (e.g. Google Mobile Ads / AdMob, or a
        raw VAST/IMA tag), initialise it with real app/unit IDs, and gate the
        whole thing on the consent flow's result — do not request ads before
        consent is resolved.
     3. loadCreative(slot): request a video creative sized to slot.size (an
        AdMob rewarded/interstitial unit, or a VAST <MediaFile> parsed from
        the tag response) and resolve with the SAME shape LocalAdProvider
        resolves with: {id, brand, accent, bg, poster, video}. `video`/
        `poster` may be blob: or https: URLs — adDrawScreens() only ever
        consumes them as <video>/<img> sources, so it does not care.
     4. reportImpression()/reportError(): forward to the network SDK's own
        tracking callbacks instead of AD_STATS.
   Everything above this point — geometry, placement, the throttled texture
   upload, the settings toggle — is provider-agnostic and needs no changes. */
class NetworkAdProvider extends AdProvider {
  constructor(cfg) { super(); this.cfg = cfg || {}; }
  async _doInit() {
    throw new Error('NetworkAdProvider is a stub — see docs/ADS.md before setting AD_CONFIG.provider="network"');
  }
  async loadCreative(slot) { throw new Error('NetworkAdProvider.loadCreative is not implemented'); }
}

/* The entire integration surface for going live with a real network: swap
   this one field (plus the cfg block NetworkAdProvider would need) and every
   board in the game starts asking the network for fill instead. */
const AD_CONFIG = { provider: 'local' };
const AD_PROVIDER = AD_CONFIG.provider === 'network' ? new NetworkAdProvider({}) : new LocalAdProvider();

function adHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

async function adAssignCreatives() {
  for (const slot of adBoards) {
    try {
      const desc = await AD_PROVIDER.loadCreative(slot);
      if (desc) { adRegisterCreative(desc); slot.creative = desc.id; }
    } catch (e) { console.warn('adboards: loadCreative failed', slot.id, e); }
  }
  // contextual content is assigned after sponsor creatives so it can override
  try { adAssignContextualCreatives(); } catch (e) {}
}

/* ============================================================================
   IMPRESSION COUNTING
   ============================================================================ */
const AD_STATS_KEY = 'massfront_ads_stats_v1';
const AD_DWELL_S = 1.5;     // seconds continuously on screen before it counts
const AD_ROTATE_S = 12;     // seconds between ad rotations
const AD_FADE_S = 1;        // crossfade duration in seconds
const AD_TEX_UNIT2 = 8;     // second texture unit for crossfade — 0-3 model, 4-6 post, 7 primary, 8 secondary
let AD_STATS = { total: 0, impressions: {} };

function adStatsLoad() {
  try {
    const s = localStorage.getItem(AD_STATS_KEY);
    if (s) AD_STATS = Object.assign({ total: 0, impressions: {} }, JSON.parse(s));
  } catch (e) {}
}
function adStatsSave() { try { localStorage.setItem(AD_STATS_KEY, JSON.stringify(AD_STATS)); } catch (e) {} }

function adUpdateImpressions(dt) {
  for (const b of adBoards) {
    if (b._onscreen && b.creative) {
      b._dwell += dt;
      if (!b._counted && b._dwell >= AD_DWELL_S) {
        b._counted = true;
        const c = AD_CREATIVES[b.creative];
        try { AD_PROVIDER.reportImpression(b, c || { id: b.creative }); } catch (e) {}
      }
    } else { b._dwell = 0; b._counted = false; }
  }
}

/* ============================================================================
   VIDEO TEXTURE MANAGEMENT
   ----------------------------------------------------------------------------
   One HTMLVideoElement per CREATIVE (not per board — several boards can and
   do share a clip), created lazily the first time a slot showing it is
   actually on screen. Every failure mode the brief calls out degrades to the
   poster texture, never to an unwritten (black) one:
     - not ready yet        -> readyState check before ever sampling the video
     - errored               -> 'error' event latches videoState permanently
     - autoplay blocked      -> play() rejection latches 'blocked'; retried on
                                 the next real user gesture (mobile browsers
                                 refuse unmuted autoplay, and this game's own
                                 videos are muted+playsinline for exactly that
                                 reason — but a stricter WebView can still say
                                 no, so the retry path is not optional)
     - tab hidden             -> paused outright, not just un-uploaded, so a
                                 backgrounded tab is not still paying decode
                                 cost
   ============================================================================ */
const AD_CREATIVES = {};
const AD_UPLOAD_MS = 1000 / 15;     // throttle GPU uploads to ~15fps, not 60
let adFallbackTex = null;

function adMakeTex(seedRGBA) {
  const t = gl.createTexture();
  const was = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE7);
  const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D, t);
  // no mipmaps: the video texture is rewritten every throttle tick, and
  // regenerating mips on that cadence would be the "stalled GPU upload"
  // this whole system exists to avoid. LINEAR/LINEAR keeps it complete
  // without them — the default min filter needs mips and samples as solid
  // black on a texture that never gets any, which is precisely the bug this
  // file's brief called out by name.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // seeded immediately with a solid plate colour: a texture object that has
  // never been written samples as opaque black, i.e. exactly the "black
  // rectangle" failure mode this system must never show.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, seedRGBA || new Uint8Array([16, 20, 26, 255]));
  gl.bindTexture(gl.TEXTURE_2D, prev);
  gl.activeTexture(was);
  return t;
}

function adRegisterCreative(desc) {
  if (!desc || !desc.id) return null;
  let c = AD_CREATIVES[desc.id];
  if (c) return c;
  const bg = desc.bg || [16, 20, 26];
  c = AD_CREATIVES[desc.id] = {
    id: desc.id, brand: desc.brand || desc.id, accent: desc.accent || [190, 220, 255],
    poster: desc.poster || null, video: desc.video || null,
    posterTex: adMakeTex(new Uint8Array([bg[0], bg[1], bg[2], 255])),
    videoTex: adMakeTex(new Uint8Array([bg[0], bg[1], bg[2], 255])),
    posterLoaded: false, videoTexPrimed: false,
    videoEl: null, videoState: 'init', lastUpload: 0,
  };
  if (c.poster) adLoadPoster(c);
  return c;
}

function adLoadPoster(c) {
  const img = new Image();
  img.onload = () => {
    try {
      const was = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE7);
      const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
      gl.bindTexture(gl.TEXTURE_2D, c.posterTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.bindTexture(gl.TEXTURE_2D, prev);
      gl.activeTexture(was);
      c.posterLoaded = true;
    } catch (e) { console.warn('adboards: poster upload failed', c.id, e); }
  };
  img.onerror = () => { console.warn('adboards: poster failed to load', c.id, c.poster); };
  img.src = c.poster;
}

function adMakeVideo(c) {
  if (!c.video || c.videoEl) return;
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.volume = 0;
  v.loop = true; v.autoplay = true; v.playsInline = true;
  v.setAttribute('playsinline', '');            // legacy iOS Safari form
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'auto';
  v.src = c.video;
  v.addEventListener('error', () => { c.videoState = 'error'; try { AD_PROVIDER.reportError(null, { creative: c.id, type: 'video-error' }); } catch (e) {} });
  c.videoEl = v;
  adTryPlay(c);
}

function adTryPlay(c) {
  const v = c.videoEl; if (!v) return;
  let p;
  try { p = v.play(); } catch (e) { c.videoState = 'blocked'; return; }
  if (p && typeof p.then === 'function') {
    p.then(() => { if (c.videoState !== 'error') c.videoState = 'ready'; })
     .catch(() => { if (c.videoState !== 'error') c.videoState = 'blocked'; });   // autoplay refused
  } else {
    c.videoState = 'ready';
  }
}

let _adGestureWired = false;
function adWireGestureRetry() {
  if (_adGestureWired) return; _adGestureWired = true;
  const retry = () => { for (const id in AD_CREATIVES) { const c = AD_CREATIVES[id]; if (c.videoState === 'blocked') adTryPlay(c); } };
  document.addEventListener('pointerdown', retry, { passive: true });
  document.addEventListener('touchstart', retry, { passive: true });
  document.addEventListener('keydown', retry, { passive: true });
}

function adPauseAll() {
  for (const id in AD_CREATIVES) { const c = AD_CREATIVES[id]; if (c.videoEl && !c.videoEl.paused) c.videoEl.pause(); }
}

/* Throttled to AD_UPLOAD_MS by the caller. `needed` is the set of creative
   ids at least one ON-SCREEN board is currently showing — everything else is
   paused outright rather than merely skipped, so an off-screen billboard's
   clip is not still decoding somewhere off camera. */
function adUpdateCreatives(now, needed) {
  const perfOk = !(typeof perfScale !== 'undefined' && perfScale < 0.5) &&
                 !(typeof META !== 'undefined' && META.settings && META.settings.perf === 'low');
  const adsOn = !(typeof META !== 'undefined' && META.settings && META.settings.ads === false);
  const canPlay = perfOk && adsOn && !document.hidden;
  for (const id in AD_CREATIVES) {
    const c = AD_CREATIVES[id];
    const want = canPlay && needed.has(id) && !!c.video;
    if (want && !c.videoEl) adMakeVideo(c);
    if (!c.videoEl) continue;
    if (!want) { if (!c.videoEl.paused) c.videoEl.pause(); continue; }
    if (c.videoEl.paused && c.videoState !== 'error') adTryPlay(c);
    if (c.videoState !== 'ready' || c.videoEl.readyState < 2) continue;   // HAVE_CURRENT_DATA
    if (now - c.lastUpload < AD_UPLOAD_MS) continue;
    c.lastUpload = now;
    try {
      /* MUST NOT use the active unit. begin3D leaves TEXTURE0 = matTex, then
         re-enters 2-3 times per frame. Uploading here used to bind the video
         onto unit 0 and then bindTexture(null) — every ~15Hz that landed on
         the begin3D AFTER shadows, every model sampled an empty atlas and
         the whole army strobed. Unit 7 is the ad scratch unit; restore
         whatever was there (detail / fog / video) before returning. */
      const was = gl.getParameter(gl.ACTIVE_TEXTURE);
      gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT);
      const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
      gl.bindTexture(gl.TEXTURE_2D, c.videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c.videoEl);
      gl.bindTexture(gl.TEXTURE_2D, prev);
      gl.activeTexture(was);
      c.videoTexPrimed = true;
    } catch (e) { /* a mid-decode frame can throw on some mobile browsers — skip this tick, try again next */ }
  }
}

/* ============================================================================
   SCREEN QUAD — its own tiny GLSL program, its own texture unit
   ----------------------------------------------------------------------------
   The billboard's FRAME is ordinary geometry through the shared model shader
   (see adFlushFrames). The SCREEN can't be: it samples a texture that changes
   every frame and must read as self-lit regardless of the sun, which the
   shared material-atlas shader has no notion of. So it is one small unlit
   program of its own, drawing a handful of world-space quads computed on the
   CPU from the same AD_* layout constants the frame mesh uses, which is what
   keeps the video locked exactly into its bezel at any scale or yaw.
   ============================================================================ */
let adProg = null, AD_U = {}, adVAO = null, adVBO = null;
const AD_TEX_UNIT = 7;    // deliberately unused everywhere else — 0-3 are the model/terrain
                           // shaders' own samplers, 4/5/6 are the AO/bloom post chain
const _adVerts = new Float32Array(4 * 5);

function adInitScreenProgram() {
  const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP;
out vec2 vUV;
void main(){
  vUV = aUV;
  gl_Position = uVP * vec4(aPos, 1.0);
}`;
  const FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uTex2;
uniform float uBoost;
uniform float uMix;
out vec4 o;
void main(){
  // crossfade between two textures: when uMix==0 only uTex shows,
  // when uMix==1 only uTex2 shows. Both are self-lit screens —
  // no lighting, straight gamma through.
  vec3 a = texture(uTex, vUV).rgb;
  vec3 b = texture(uTex2, vUV).rgb;
  vec3 c = mix(a, b, uMix) * uBoost;
  o = vec4(c, 1.0);
}`;
  adProg = mkProg(VS, FS);
  AD_U.uVP = gl.getUniformLocation(adProg, 'uVP');
  AD_U.uTex = gl.getUniformLocation(adProg, 'uTex');
  AD_U.uTex2 = gl.getUniformLocation(adProg, 'uTex2');
  AD_U.uBoost = gl.getUniformLocation(adProg, 'uBoost');
  AD_U.uMix = gl.getUniformLocation(adProg, 'uMix');
  adVAO = gl.createVertexArray();
  gl.bindVertexArray(adVAO);
  adVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, adVBO);
  gl.bufferData(gl.ARRAY_BUFFER, _adVerts.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

/* World-space corners of one board's screen face, derived with EXACTLY the
   transform the instanced model shader applies (see VS3D in engine/mesh.js):
     world = R(yaw) * (local * scale) + (worldX, height, worldY)
   computed on the CPU because there are only ever a handful of these and a
   whole instancing path would be more machinery than the job needs. Corner
   order matches the engine's own quad convention (BL,BR,TL,TR as a
   TRIANGLE_STRIP — see quadB in engine/gl.js); v=0 is the TOP of the source
   image, matching how every canvas-sourced texture in this engine is already
   uploaded with no Y-flip (see the sprite atlas in engine/mesh.js). */
function adScreenVerts(b) {
  const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
  const gx = b.x, gz = b.y, gy = terrainH(b.x, b.y);
  const lx = AD_FACE_X * b.scale;
  const corners = [
    [-AD_HALFW, AD_BOT_Y],              // BL
    [ AD_HALFW, AD_BOT_Y],              // BR
    [-AD_HALFW, AD_BOT_Y + AD_SCR_H],   // TL
    [ AD_HALFW, AD_BOT_Y + AD_SCR_H],   // TR
  ];
  const uvs = [[0, 1], [1, 1], [0, 0], [1, 0]];
  for (let k = 0; k < 4; k++) {
    const lz = corners[k][0] * b.scale, ly = corners[k][1] * b.scale;
    const o = k * 5;
    _adVerts[o]     = gx + (lx * c - lz * s);
    _adVerts[o + 1] = gy + ly;
    _adVerts[o + 2] = gz + (lx * s + lz * c);
    _adVerts[o + 3] = uvs[k][0];
    _adVerts[o + 4] = uvs[k][1];
  }
  return _adVerts;
}

/* Draws the video/poster quad for every ON-SCREEN board, plus a soft additive
   halo (piggy-backed on the engine's existing bbAdd billboard-sprite batch —
   no extra shader for that part) so the screen reads as a light source once
   night falls, not just a texture. Saves and restores every piece of GL
   state the brief calls out, and — the one that matters most — leaves prog3D
   bound again before returning, because render3d.js's begin3D() (which this
   is called from) is what every OTHER model draw this frame assumes is still
   current. */
function adDrawScreens(list) {
  if (!adProg || !list.length) return;
  const wasBlend = gl.getParameter(gl.BLEND);
  const wasCull  = gl.getParameter(gl.CULL_FACE);
  const wasDepth = gl.getParameter(gl.DEPTH_TEST);
  const wasMask  = gl.getParameter(gl.DEPTH_WRITEMASK);

  gl.useProgram(adProg);
  gl.uniformMatrix4fv(AD_U.uVP, false, matVP);
  gl.uniform1i(AD_U.uTex, AD_TEX_UNIT);
  gl.uniform1i(AD_U.uTex2, AD_TEX_UNIT2);
  const na = (typeof nightAmt === 'function') ? nightAmt() : 0;
  gl.uniform1f(AD_U.uBoost, 0.95 + na * 0.85);   // self-lit; brighter once the sun's down
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);       // the quad's winding isn't worth chasing for ~10 draws/frame
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  gl.bindVertexArray(adVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, adVBO);

  for (const b of list) {
    const c = AD_CREATIVES[b.creative];
    const c2 = b.creative2 ? AD_CREATIVES[b.creative2] : null;
    // contextual texture overrides sponsor creative when available
    const ctxTex = b._contextual ? adMakeContextualTex(b) : null;
    // primary texture: contextual canvas, then video if playing, else poster, else fallback
    let tex1 = ctxTex || adFallbackTex;
    if (!ctxTex && c) tex1 = (c.videoTexPrimed && c.videoState === 'ready') ? c.videoTex : (c.posterTex || adFallbackTex);
    // secondary texture: during crossfade it's the incoming creative
    let tex2 = tex1;
    let mix = 0;
    if (b._blend > 0 && c2) {
      tex2 = (c2.videoTexPrimed && c2.videoState === 'ready') ? c2.videoTex : (c2.posterTex || adFallbackTex);
      mix = b._blend;
    }
    // bind both texture units up front — unit 7 for primary, unit 8 for secondary
    gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, tex1);
    gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT2);
    gl.bindTexture(gl.TEXTURE_2D, tex2);
    gl.uniform1f(AD_U.uMix, mix);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, adScreenVerts(b));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (typeof bbAdd !== 'undefined' && typeof sprites !== 'undefined' && sprites.glow) {
      const chx = b.x + Math.cos(b.yaw) * AD_FACE_X * b.scale;
      const chz = b.y + Math.sin(b.yaw) * AD_FACE_X * b.scale;
      const chy = terrainH(b.x, b.y) + (AD_BOT_Y + AD_SCR_H * 0.5) * b.scale;
      const ac = (c && c.accent) || [190, 220, 255];
      bbAdd.add(sprites.glow, chx, chz, chy, AD_HALFW * b.scale * 1.15, 0, ac[0], ac[1], ac[2], Math.round(46 + na * 130));
    }
  }

  gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT2);
  if (typeof fogTex !== 'undefined' && fogTex) gl.bindTexture(gl.TEXTURE_2D, fogTex);
  else if (typeof matTex !== 'undefined' && matTex) gl.bindTexture(gl.TEXTURE_2D, matTex);
  gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT);
  if (typeof matDetailTex !== 'undefined' && matDetailTex) gl.bindTexture(gl.TEXTURE_2D, matDetailTex);
  gl.activeTexture(gl.TEXTURE0);
  if (typeof matTex !== 'undefined' && matTex) gl.bindTexture(gl.TEXTURE_2D, matTex);
  if (wasCull) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE);
  if (wasBlend) gl.enable(gl.BLEND); else gl.disable(gl.BLEND);
  if (wasDepth) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(wasMask);
  gl.useProgram(prog3D);    // MUST leave the model program bound — see file header
}

/* ============================================================================
   FRAME MESH — the physical prop, through the shared lit/instanced pipeline
   ============================================================================ */
let adFrameMesh = null;
function adFlushFrames() {
  if (!adFrameMesh || !adBoards.length) return;
  for (const b of adBoards) adFrameMesh.add(b.x, b.y, terrainH(b.x, b.y), b.scale, b.yaw, 232, 232, 232, 255);
  adFrameMesh.flush(gl);
}

/* ============================================================================
   PER-FRAME HOOK — installed on begin3D (see adInstallHooks)
   ----------------------------------------------------------------------------
   begin3D() is NOT called once per rendered frame — render3d.js's render()
   re-enters it two or three times in the course of a single frame (once
   before terrain/shadows draw, once again immediately after to restore the
   lit model program, and once more after the AO resolve on the branch where
   AO is active). The throttled upload/impression logic below already
   self-gates on wall-clock time so re-entrancy there is harmless, but the
   DRAW calls are not idempotent the same way: adFlushFrames() redrawing the
   same opaque instances 2-3x/frame is merely wasted GPU time (depth-tested
   away, so at least nothing looks wrong), but adDrawScreens() also queues
   the night-glow halo onto the engine's shared ADDITIVE bbAdd batch, and
   that batch is only ever cleared by its own single flush() call late in
   the frame — so calling it more than once per frame stacks the halo 2-3x
   brighter than intended instead of drawing it once. adFrameTick() is an
   independent requestAnimationFrame ticker that exists purely to answer
   "has a new real frame started?" without needing a fourth hook into
   render3d.js: main.js's own loop is also driven by rAF, so both callbacks
   fire once per browser animation frame and _adFrameId is guaranteed stable
   across begin3D's entire synchronous burst of re-entries for that frame. */
let _adFrameId = 0;
(function adFrameTick(){ _adFrameId++; requestAnimationFrame(adFrameTick); })();
let _adDrawnFrame = -1;
let _adLastTick = 0;

function adVis(cb, x, y, pad) { return x >= cb.x0 - pad && x <= cb.x1 + pad && y >= cb.y0 - pad && y <= cb.y1 + pad; }
function adCamBoundsSafe() { try { return (typeof camBounds === 'function') ? camBounds() : null; } catch (e) { return null; } }

/* ============================================================================
   CONTENT ROTATION — 12s cycle with ~1s crossfade
   ============================================================================
   Each board tracks its own rotation timer. When the timer expires, the
   current creative becomes the "old" one (still displayed via tex unit 7)
   and a new creative is picked for the "incoming" slot (tex unit 8). The
   blend uniform lerps from 0 to 1 over AD_FADE_S seconds, then the old
   creative is dropped and the new one becomes primary. */
function adUpdateRotation(dt) {
  const ids = Object.keys(AD_CREATIVES);
  if (ids.length < 2) return;   // nothing to rotate to
  for (const b of adBoards) {
    if (!b.creative) continue;
    b._rotT += dt;
    if (b._blend > 0) {
      // mid-crossfade: advance blend
      b._blend = Math.min(1, b._blend + dt / AD_FADE_S);
      if (b._blend >= 1) {
        // crossfade complete — new creative becomes primary
        b.creative = b.creative2;
        b.creative2 = null;
        b._blend = 0;
        b._rotT = 0;
      }
    } else if (b._rotT >= AD_ROTATE_S) {
      // time to rotate — pick a different creative than current
      let next = b.creative;
      for (let tries = 0; tries < 6; tries++) {
        const pick = ids[(adHash(b.id + ':' + b._rotT + ':' + tries)) % ids.length];
        if (pick !== b.creative) { next = pick; break; }
      }
      if (next !== b.creative) {
        b.creative2 = next;
        b._blend = 0.001;   // start the crossfade — 0 would skip it
      } else {
        b._rotT = 0;        // only one creative available, just reset
      }
    }
  }
}

/* ============================================================================
   CONTEXTUAL AD CONTENT — faction lore, unit tips, sponsor branding
   ============================================================================
   During a match, billboards can cycle through contextual content: faction
   lore tied to who you're fighting, unit/structure tips, and the bundled
   sponsor brands. This is a content selector that assigns a _contentType
   to each board so the renderer can pick the right creative pool.

   Content types: 'lore', 'tip', 'sponsor' — rotated in that order per board
   so every board shows all three kinds over the course of a match. */
const AD_CONTENT_TYPES = ['sponsor', 'lore', 'tip'];

// faction lore lines — shown on boards during the match, tied to the enemy
const AD_LORE = {
  legion: [
    'The Ascendancy does not retreat. It reloads.',
    'Iron speaks louder than doctrine.',
    'Lord Vex commands. The column advances.',
    'Every shell finds its mark. Every fortress falls.',
  ],
  syndicate: [
    'The Coalition trades in futures — yours.',
    'Air superiority is not a luxury. It is a verdict.',
    'Broker Renn sends her regards. And a strike wing.',
    'Speed is the only armor that never jams.',
  ],
  horde: [
    'The Brood does not negotiate. It assimilates.',
    'You hear the swarm before you see it. Then you don\'t hear anything.',
    'The Sovereign remembers. The Sovereign sends more.',
    'Organic. Relentless. Hungry.',
  ],
};

// unit/structure tips — generic gameplay advice shown on billboards
const AD_TIPS = [
  'MASS EXTRACTORS win wars. Build early, build often.',
  'SCOUT before you commit. Knowledge is the best armor.',
  'RECLAIM wrecks. Free mass is winning mass.',
  'TERRAIN matters. High ground grants vision and range.',
  'TITANS change the game. Rush one, or prepare for one.',
  'SHIELDS absorb the first hit. Position matters.',
  'ARTILLERY outranges everything. Protect the battery.',
  'ENERGY MANAGEMENT — stall and your production halts.',
  'FLANKING deals bonus damage. Surround, don\'t face-tank.',
  'RADAR gives you seconds. Seconds win engagements.',
];

function adPickContextualType(board) {
  // cycle sponsor -> lore -> tip based on board index
  return AD_CONTENT_TYPES[board.id.charCodeAt(2) % 3] || 'sponsor';
}

function adAssignContextualCreatives() {
  if (typeof AI === 'undefined') return;  // not in a match
  const fac = (AI && AI.fac) || 'legion';
  const loreLines = AD_LORE[fac] || AD_LORE.legion;
  for (const b of adBoards) {
    const type = adPickContextualType(b);
    if (type === 'lore') {
      // pick a lore line for this faction, hashed to the board id
      const line = loreLines[adHash(b.id + ':lore') % loreLines.length];
      b._contextual = { type: 'lore', text: line, fac: fac };
    } else if (type === 'tip') {
      const tip = AD_TIPS[adHash(b.id + ':tip') % AD_TIPS.length];
      b._contextual = { type: 'tip', text: tip };
    } else {
      b._contextual = null;  // use the normal sponsor creative
    }
  }
}

/* Canvas-generated texture for contextual content — renders text onto a
   poster-sized canvas and uploads it as a GL texture. Created once per board
   per match start (not per frame). The canvas is reused and the texture is
   updated via texSubImage2D when content changes. */
const _adCtxCanvas = document.createElement('canvas');
_adCtxCanvas.width = 480; _adCtxCanvas.height = 270;
const _adCtx2d = _adCtxCanvas.getContext('2d');
const AD_CTX_TEX_CACHE = {};  // boardId -> {tex, lastType, lastText}

function adMakeContextualTex(board) {
  const ctx = _adCtx2d;
  const c = board._contextual;
  if (!c) return null;
  let cached = AD_CTX_TEX_CACHE[board.id];
  if (cached && cached.lastType === c.type && cached.lastText === c.text) return cached.tex;

  // draw the contextual content
  const facCol = c.type === 'lore' && typeof FACTIONS !== 'undefined' && FACTIONS[c.fac]
    ? FACTIONS[c.fac].col : [110, 190, 255];
  const accent = 'rgb(' + facCol[0] + ',' + facCol[1] + ',' + facCol[2] + ')';

  ctx.fillStyle = c.type === 'lore' ? 'rgba(12,20,34,0.96)' : 'rgba(18,28,18,0.96)';
  ctx.fillRect(0, 0, 480, 270);

  // border glow
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 468, 258);

  // header
  ctx.fillStyle = accent;
  ctx.font = '700 14px monospace';
  ctx.textAlign = 'center';
  if (c.type === 'lore') {
    ctx.fillText('FIELD BROADCAST', 240, 36);
  } else {
    ctx.fillText('TACTICAL ADVISORY', 240, 36);
  }

  // divider
  ctx.strokeStyle = 'rgba(' + facCol[0] + ',' + facCol[1] + ',' + facCol[2] + ',0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 48); ctx.lineTo(440, 48); ctx.stroke();

  // main text — word-wrap
  ctx.fillStyle = '#d0e8ff';
  ctx.font = '600 18px monospace';
  const words = c.text.split(' ');
  let line = '', y = 90;
  for (const w of words) {
    const test = line + (line ? ' ' : '') + w;
    if (ctx.measureText(test).width > 400 && line) {
      ctx.fillText(line, 240, y);
      line = w; y += 28;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, 240, y);

  // footer tag
  ctx.fillStyle = 'rgba(' + facCol[0] + ',' + facCol[1] + ',' + facCol[2] + ',0.5)';
  ctx.font = '700 10px monospace';
  ctx.fillText(c.type === 'lore' ? 'MASSFRONT FIELD NETWORK' : 'COMMAND ADVISORY SYSTEM', 240, 250);

  // upload to GL texture
  if (!cached) {
    cached = AD_CTX_TEX_CACHE[board.id] = { tex: adMakeTex(), lastType: '', lastText: '' };
  }
  const was = gl.getParameter(gl.ACTIVE_TEXTURE);
  gl.activeTexture(gl.TEXTURE0 + AD_TEX_UNIT);
  const prev = gl.getParameter(gl.TEXTURE_BINDING_2D);
  gl.bindTexture(gl.TEXTURE_2D, cached.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, _adCtxCanvas);
  gl.bindTexture(gl.TEXTURE_2D, prev);
  gl.activeTexture(was);
  cached.lastType = c.type;
  cached.lastText = c.text;
  return cached.tex;
}

/* ============================================================================
   POST-MATCH AD SLOT — 5s card on end-game screen, skippable after 3s
   ============================================================================
   Inserted into #gameOver before #goRewards. Shows a sponsor creative with
   a countdown timer. Touch/click dismisses after 3s. Auto-dismisses at 5s.
   The card is pure DOM, not a GL draw — the game renderer is paused. */
const AD_POSTMATCH_S = 5;
const AD_POSTMATCH_SKIP_S = 3;
let _adPostMatchTimer = null;
let _adPostMatchEl = null;

function adShowPostMatchAd(win) {
  adClearPostMatchAd();
  // pick a creative to feature
  const ids = Object.keys(AD_CREATIVES);
  const pick = ids.length ? AD_CREATIVES[ids[adHash('postmatch' + Date.now()) % ids.length]] : null;
  const brand = pick ? pick.brand : 'MASSFRONT';
  const accent = pick ? 'rgb(' + pick.accent.join(',') + ')' : '#6ec8ff';
  const tagline = (pick && pick.poster) ? '' : 'Tactical superiority, delivered.';

  const go = document.getElementById('gameOver');
  if (!go) return;
  const scroll = go.querySelector('.goResultScroll');
  if (!scroll) return;

  // inject CSS once
  if (!document.getElementById('adPostMatchCSS')) {
    const st = document.createElement('style');
    st.id = 'adPostMatchCSS';
    st.textContent =
      '.adPostMatch{margin:12px auto 4px;max-width:400px;border-radius:12px;overflow:hidden;' +
      'background:linear-gradient(160deg,rgba(20,32,50,.96),rgba(8,14,26,.98));' +
      'border:1px solid rgba(110,180,240,.28);cursor:pointer;position:relative}' +
      '.adPostMatchImg{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}' +
      '.adPostMatchBody{padding:10px 14px 12px;text-align:center}' +
      '.adPostMatchBrand{font:800 11px var(--fT);letter-spacing:.16em;color:' + accent + '}' +
      '.adPostMatchTag{margin-top:4px;font:600 10px var(--fU);color:#7a9cb8}' +
      '.adPostMatchBar{height:3px;background:rgba(110,180,240,.15);position:relative;overflow:hidden}' +
      '.adPostMatchBar>i{display:block;height:100%;background:' + accent + ';width:100%;' +
      'transition:width .1s linear}' +
      '.adPostMatchSkip{position:absolute;bottom:6px;right:10px;font:700 9px var(--fT);' +
      'letter-spacing:.12em;color:rgba(160,200,230,.6);opacity:0;transition:opacity .3s}' +
      '.adPostMatchSkip.show{opacity:1}';
    document.head.appendChild(st);
  }

  const el = document.createElement('div');
  el.className = 'adPostMatch';
  el.innerHTML =
    (pick && pick.poster
      ? '<img class="adPostMatchImg" src="' + pick.poster + '" alt="' + brand + '" onerror="this.style.display=\'none\'">'
      : '') +
    '<div class="adPostMatchBody"><div class="adPostMatchBrand">' + brand.toUpperCase() + '</div>' +
    (tagline ? '<div class="adPostMatchTag">' + tagline + '</div>' : '') + '</div>' +
    '<div class="adPostMatchBar"><i id="adPostMatchProg"></i></div>' +
    '<div class="adPostMatchSkip" id="adPostMatchSkip">TAP TO SKIP</div>';

  // insert before rewards
  const rewards = document.getElementById('goRewards');
  if (rewards) {
    scroll.insertBefore(el, rewards);
  } else {
    scroll.appendChild(el);
  }
  _adPostMatchEl = el;

  // track impression
  if (pick) {
    AD_STATS.total++;
    AD_STATS.impressions[pick.id] = (AD_STATS.impressions[pick.id] || 0) + 1;
    adStatsSave();
  }

  // timer — 100ms ticks, progress bar, skip reveal
  let elapsed = 0;
  const skipEl = el.querySelector('#adPostMatchSkip');
  const progEl = el.querySelector('#adPostMatchProg');

  const tick = () => {
    elapsed += 0.1;
    if (progEl) progEl.style.width = Math.max(0, (1 - elapsed / AD_POSTMATCH_S) * 100) + '%';
    if (elapsed >= AD_POSTMATCH_SKIP_S && skipEl) skipEl.classList.add('show');
    if (elapsed >= AD_POSTMATCH_S) { adClearPostMatchAd(); return; }
    _adPostMatchTimer = setTimeout(tick, 100);
  };
  _adPostMatchTimer = setTimeout(tick, 100);

  // touch/click to dismiss after skip window
  el.addEventListener('pointerdown', () => {
    if (elapsed >= AD_POSTMATCH_SKIP_S) adClearPostMatchAd();
  });
}

function adClearPostMatchAd() {
  if (_adPostMatchTimer) { clearTimeout(_adPostMatchTimer); _adPostMatchTimer = null; }
  if (_adPostMatchEl && _adPostMatchEl.parentNode) {
    _adPostMatchEl.parentNode.removeChild(_adPostMatchEl);
  }
  _adPostMatchEl = null;
}

/* ============================================================================
   PER-FRAME HOOK — installed on begin3D (see adInstallHooks)
   ============================================================================ */
function adFrameHook() {
  if (!adBoards.length) return;
  const freshFrame = _adDrawnFrame !== _adFrameId;
  if (freshFrame) adFlushFrames();                     // cheap, real geometry — draw once per frame

  const cb = adCamBoundsSafe();
  if (!cb) return;
  const visible = [];
  const needed = new Set();
  for (const b of adBoards) {
    b._onscreen = adVis(cb, b.x, b.y, 70);
    if (b._onscreen && b.creative) { visible.push(b); needed.add(b.creative); }
  }

  const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  /* Video upload used to run on EVERY begin3D once the 15Hz timer fired.
     render() re-enters begin3D after shadows, immediately before models.
     That path unbound the material atlas on unit 0 and every hull strobed.
     Uploads and screen draws are once per rAF, on the first begin3D, which
     is before terrain rebinds unit 0. */
  if (freshFrame) {
    if (now - _adLastTick >= AD_UPLOAD_MS) {
      const dt = Math.min(0.5, (now - _adLastTick) / 1000);
      _adLastTick = now;
      adUpdateCreatives(now, needed);
      adUpdateImpressions(dt);
      adUpdateRotation(dt);
    }
    if (visible.length) adDrawScreens(visible);
    _adDrawnFrame = _adFrameId;
  }
}

/* ============================================================================
   SETTINGS ROW — appended to #setList after renderSettings() runs
   ============================================================================ */
function adRenderSettingsRow() {
  const list = document.getElementById('setList');
  if (!list) return;
  const on = !(typeof META !== 'undefined' && META.settings && META.settings.ads === false);
  const row = document.createElement('div');
  row.className = 'sItem setRow adsRow';
  row.innerHTML =
    '<div class="sTx"><b>\u{1F4FA} In-World Ad Boards</b>' +
    '<div class="sDs">Billboards play looping video on the battlefield — off shows static art</div></div>' +
    '<div class="sBuy togB' + (on ? ' onT' : '') + '">' + (on ? 'ON' : 'OFF') + '</div>';
  row.addEventListener('pointerdown', () => {
    if (typeof META === 'undefined' || !META.settings) return;
    META.settings.ads = (META.settings.ads === false);   // toggle, defaulting true -> false -> true
    if (typeof metaSave === 'function') metaSave();
    if (typeof sfx === 'function') sfx('ui');
    renderSettings();   // rebuilds the list; the wrap below re-appends this row
  });
  list.appendChild(row);
}

/* ============================================================================
   HOOK INSTALLATION — wrap, never replace
   ============================================================================ */
function adInstallHooks() {
  if (window.__adboardsHooked) return;
  window.__adboardsHooked = true;

  if (typeof setupDoodads === 'function') {
    const orig = setupDoodads;
    setupDoodads = function () {
      const r = orig.apply(this, arguments);
      try { adPlaceBoards(); adAssignCreatives(); } catch (e) { console.error('adboards: placement failed', e); }
      return r;
    };
  }
  if (typeof begin3D === 'function') {
    const orig = begin3D;
    begin3D = function (nA) {
      const r = orig.apply(this, arguments);
      try { adFrameHook(); } catch (e) { console.error('adboards: draw hook failed', e); }
      return r;
    };
  }
  if (typeof renderSettings === 'function') {
    const orig = renderSettings;
    renderSettings = function () {
      const r = orig.apply(this, arguments);
      try { adRenderSettingsRow(); } catch (e) { console.error('adboards: settings row failed', e); }
      return r;
    };
  }
}

/* ============================================================================
   ENTRY POINT
   ----------------------------------------------------------------------------
   main.js calls initAdBoards() near the end of boot() if it exists — but by
   then boot() has ALREADY called setupDoodads() once (for the attract-mode
   menu diorama), so the hook install below also runs itself immediately, at
   script-load time, well before boot() runs at all. main.js's own call
   later is a harmless no-op thanks to the __adboardsInit guard. This is the
   one function in this file that touches the DOM/GL eagerly rather than
   lazily, and it is safe to do so here because gl.js/mesh.js/models.js have
   already run by adboards.js's turn in the manifest.
   ============================================================================ */
function initAdBoards() {
  if (window.__adboardsInit) return;
  window.__adboardsInit = true;
  adStatsLoad();
  adInstallHooks();
  adInitScreenProgram();
  adFallbackTex = adMakeTex();
  adFrameMesh = new InstMesh(gl, mdlAdBoard(), AD_MAX + 4);
  adWireGestureRetry();
  document.addEventListener('visibilitychange', () => { if (document.hidden) adPauseAll(); });
  AD_PROVIDER.init();   // fire-and-forget; loadCreative() awaits it itself if it's still pending
}
initAdBoards();

