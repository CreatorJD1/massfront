#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/adboards.js', import.meta.url), 'utf8');
function slice(a, b) {
  const i = source.indexOf(a), j = source.indexOf(b, i);
  assert.ok(i >= 0 && j > i, `missing ad source slice: ${a} -> ${b}`);
  return source.slice(i, j);
}

// Persisted ad-off settings are restored by boot() after this file auto-inits;
// the provider must wait for the later guarded map setup instead of fetching early.
assert.doesNotMatch(slice('function initAdBoards', 'initAdBoards();'), /AD_PROVIDER\.init\(/);
assert.match(slice('async function adAssignCreatives', '/* ============================================================================\n   IMPRESSION COUNTING'),
  /if \(!adAdsEnabled\(\)\) return;/);

// Image/video uploads may throw in a WebView. They must restore the original
// active texture and detail-atlas binding, and a failed video frame must retry.
{
  const gl = {
    ACTIVE_TEXTURE: 'ACTIVE_TEXTURE', TEXTURE_BINDING_2D: 'TEXTURE_BINDING_2D', TEXTURE0: 100,
    TEXTURE_2D: 'TEXTURE_2D', RGBA8: 'RGBA8', RGBA: 'RGBA', UNSIGNED_BYTE: 'UNSIGNED_BYTE',
    TEXTURE_MIN_FILTER: 1, TEXTURE_MAG_FILTER: 2, TEXTURE_WRAP_S: 3, TEXTURE_WRAP_T: 4,
    LINEAR: 5, CLAMP_TO_EDGE: 6, active: 103, bindings: new Map([[100, 'material'], [107, 'detail']]),
    throwUpload: false, createTexture: () => 'new-texture', texParameteri() {},
    getParameter(p) { return p === this.ACTIVE_TEXTURE ? this.active : this.bindings.get(this.active) ?? null; },
    activeTexture(n) { this.active = n; },
    bindTexture(_target, tex) { this.bindings.set(this.active, tex); },
    texImage2D() { if (this.throwUpload) throw new Error('decode-upload'); },
  };
  const ctx = vm.createContext({ gl, Uint8Array, console, document: {}, Set });
  vm.runInContext('const AD_TEX_UNIT=7, AD_UPLOAD_MS=66;\n' +
    slice('function adMakeTex', 'function adResetCreativeTextures') +
    '\nthis.make=adMakeTex;this.upload=adUploadTex;', ctx);
  gl.throwUpload = true;
  assert.throws(() => ctx.make(), /decode-upload/);
  assert.equal(gl.active, 103); assert.equal(gl.bindings.get(107), 'detail');
  assert.equal(gl.bindings.get(100), 'material');
  assert.throws(() => ctx.upload('video', {}), /decode-upload/);
  assert.equal(gl.active, 103); assert.equal(gl.bindings.get(107), 'detail');
  gl.throwUpload = false;
  ctx.upload('video', {});
  assert.equal(gl.active, 103); assert.equal(gl.bindings.get(107), 'detail');
  const creative = { id: 'c', video: '/clip.mp4', videoEl: { paused: false, readyState: 3 },
    videoState: 'ready', videoTex: 'video', videoTexPrimed: false, lastUpload: 0 };
  ctx.AD_CREATIVES = { c: creative };
  ctx.adAdsEnabled = () => true;
  ctx.adMeasurableScene = () => true;
  ctx.adUploadTex = () => { throw new Error('decode-upload'); };
  vm.runInContext('this.update=' + slice('function adUpdateCreatives', '/* ============================================================================\n   SCREEN QUAD') + ';', ctx);
  ctx.update(1000, new Set(['c']));
  assert.equal(creative.videoTexPrimed, false);
  assert.equal(creative.lastUpload, 0, 'failed frame must be retried, not throttled as a success');
  ctx.adUploadTex = () => {};
  ctx.update(1000, new Set(['c']));
  assert.equal(creative.videoTexPrimed, true); assert.equal(creative.lastUpload, 1000);
}

// A local impression is only a viewable, submitted sponsor creative. Lore,
// neutral no-fill, hidden tabs and a rotation boundary reset the dwell clock.
{
  let enabled = true, hidden = false;
  const reports = [];
  const board = { _onscreen: true, _shownCreative: null, _dwell: 0,
    _dwellCreative: null, _counted: false };
  const ctx = vm.createContext({ adBoards: [board], AD_DWELL_S: 1.5,
    AD_CREATIVES: { a: { id: 'a' }, b: { id: 'b' } },
    AD_PROVIDER: { reportImpression: (_slot, c) => reports.push(c.id) },
    adAdsEnabled: () => enabled, adMeasurableScene: () => !hidden,
    document: { get hidden() { return hidden; } } });
  vm.runInContext(slice('function adResetDwell', '/* ============================================================================\n   VIDEO TEXTURE MANAGEMENT') +
    '\nthis.update=adUpdateImpressions;', ctx);
  ctx.update(2);
  assert.deepEqual(reports, [], 'unfilled board must not count');
  board._shownCreative = 'a';
  ctx.update(0.75); ctx.update(0.75); ctx.update(2);
  assert.deepEqual(reports, ['a'], 'same shown creative counts once per continuous view');
  board._shownCreative = null; ctx.update(0.1);
  board._shownCreative = 'b'; ctx.update(1); ctx.update(0.5);
  assert.deepEqual(reports, ['a', 'b'], 'lore interval resets before a rotated sponsor counts');
  board._shownCreative = 'a'; hidden = true; ctx.update(2);
  assert.deepEqual(reports, ['a', 'b'], 'hidden tab must not count');
  hidden = false; enabled = false; ctx.update(2);
  assert.deepEqual(reports, ['a', 'b'], 'ad-off must not count');
}

// The renderer also runs behind menus and pause/result screens. These are not views.
{
  const ctx = vm.createContext({ document: { hidden: false }, running: false,
    paused: false, gameEnded: false });
  vm.runInContext(slice('function adMeasurableScene', 'function adResetDwell') +
    '\nthis.measurable=adMeasurableScene;', ctx);
  assert.equal(ctx.measurable(), false);
  ctx.running = true; assert.equal(ctx.measurable(), true);
  ctx.paused = true; assert.equal(ctx.measurable(), false);
  ctx.paused = false; ctx.gameEnded = true; assert.equal(ctx.measurable(), false);
  ctx.gameEnded = false; ctx.document.hidden = true; assert.equal(ctx.measurable(), false);
}

// A projected board in unexplored fog must neither render its frame/screen nor
// accumulate local dwell. Use the same conservative footprint gate as large FX.
{
  let covered = false, queried;
  const ctx = vm.createContext({ AD_HALFW: 18,
    fogFxFootprintVisible: (x, y, radius) => { queried = [x, y, radius]; return covered; } });
  vm.runInContext(slice('function adFogVisible', '/* Draws the video/poster quad') +
    '\nthis.fogVisible=adFogVisible;', ctx);
  const board = { x: 120, y: 240, scale: 1.25 };
  assert.equal(ctx.fogVisible(board), false);
  assert.deepEqual(queried, [120, 240, 22.5]);
  covered = true; assert.equal(ctx.fogVisible(board), true);
  assert.match(slice('function adFlushFrames', '/* ============================================================================\n   PER-FRAME HOOK'),
    /if \(adFogVisible\(b\)\)/, 'the physical prop must not leak through fog');
  assert.match(slice('function adFrameHook', '/* ============================================================================\n   SETTINGS ROW'),
    /adProjectedVisible\(b\) && adFogVisible\(b\)/, 'screen/dwell visibility must include fog');
}

// The setting belongs to a reachable category, not a detached row after tabs.
{
  let inserted = null;
  const anchor = {}, panel = {
    querySelector: selector => selector === '#gfxDiagRow' ? anchor : null,
    insertBefore(row, before) { inserted = { row, before }; }, appendChild() {}
  };
  anchor.parentNode = panel;
  const list = { querySelector: selector => selector === '#setGroup-display' ? panel : null };
  const ctx = vm.createContext({ document: {
    getElementById: id => id === 'setList' ? list : null,
    createElement: () => ({ addEventListener() {} })
  }, adAdsEnabled: () => true });
  vm.runInContext(slice('function adRenderSettingsRow', '/* ============================================================================\n   HOOK INSTALLATION') +
    '\nthis.render=adRenderSettingsRow;', ctx);
  ctx.render();
  assert.equal(inserted.before, anchor);
  assert.equal(inserted.row.className, 'sItem setRow adsRow');
}

// A blocked autoplay retry must not restart video after the setting turns off.
{
  let enabled = false, hidden = false, plays = 0;
  const listeners = {};
  const ctx = vm.createContext({ AD_CREATIVES: { a: { videoState: 'blocked' } },
    adAdsEnabled: () => enabled, adTryPlay: () => { plays++; },
    document: { get hidden() { return hidden; }, addEventListener: (type, fn) => { listeners[type] = fn; } } });
  vm.runInContext(slice('let _adGestureWired', 'function adPauseAll') +
    '\nthis.wire=adWireGestureRetry;', ctx);
  ctx.wire();
  listeners.pointerdown(); assert.equal(plays, 0);
  enabled = true; hidden = true;
  listeners.pointerdown(); assert.equal(plays, 0);
  hidden = false; listeners.pointerdown(); assert.equal(plays, 1);
}

// Verify the GL draw itself selects the reported creative, including crossfade.
{
  const gl = {
    BLEND: 'BLEND', CULL_FACE: 'CULL_FACE', DEPTH_TEST: 'DEPTH_TEST', DEPTH_WRITEMASK: 'DEPTH_WRITEMASK',
    TEXTURE0: 100, TEXTURE_2D: 'TEXTURE_2D', ARRAY_BUFFER: 'ARRAY_BUFFER', TRIANGLE_STRIP: 'TRIANGLE_STRIP',
    activeTexture() {}, bindTexture() {}, useProgram() {}, uniformMatrix4fv() {}, uniform1i() {},
    uniform1f() {}, disable() {}, enable() {}, depthMask() {}, bindVertexArray() {}, bindBuffer() {},
    bufferSubData() {}, drawArrays() { this.draws++; }, draws: 0,
  };
  const creatives = { a: { id: 'a', posterTex: 'a-tex', posterLoaded: false, accent: [1, 2, 3] },
    b: { id: 'b', posterTex: 'b-tex', posterLoaded: true, accent: [3, 2, 1] } };
  const board = { creative: 'a', creative2: null, _contextual: null, _blend: 0,
    _shownCreative: null, x: 0, y: 0, yaw: 0, scale: 1 };
  const ctx = vm.createContext({ gl, adProg: 'ad-program', prog3D: 'model-program',
    AD_U: { uVP: 1, uTex: 2, uTex2: 3, uBoost: 4, uMix: 5 }, matVP: new Float32Array(16),
    AD_TEX_UNIT: 7, AD_TEX_UNIT2: 8, adVAO: {}, adVBO: {}, adFallbackTex: 'neutral',
    matTex: 'material', matDetailTex: 'detail', fogTex: 'fog', AD_CREATIVES: creatives,
    adMakeContextualTex: () => 'lore', adScreenVerts: () => new Float32Array(20),
    nightAmt: () => 0, Float32Array, Math });
  vm.runInContext(slice('function adDrawScreens', 'function adFlushFrames') + '\nthis.draw=adDrawScreens;', ctx);
  const state = { blend: false, cull: true, depth: true, depthMask: true };
  ctx.draw([board], state);
  assert.equal(board._shownCreative, null, 'undecoded sponsor must show neutral, not count');
  creatives.a.posterLoaded = true; ctx.draw([board], state);
  assert.equal(board._shownCreative, 'a');
  board._contextual = { type: 'lore' }; ctx.draw([board], state);
  assert.equal(board._shownCreative, null, 'lore must never count as sponsor');
  board._contextual = null; board.creative2 = 'b'; board._blend = 0.6;
  ctx.draw([board], state); assert.equal(board._shownCreative, 'b');
  creatives.b.posterLoaded = false;
  ctx.draw([board], state); assert.equal(board._shownCreative, null, 'unloaded incoming creative is no-fill');
  assert.equal(gl.draws, 5);
}

// Metadata is assigned through DOM text/URL properties, not parsed as HTML.
{
  const unsafe = '<img src=x onerror=alert(1)>';
  let nowMs = 0, enabled = true;
  const pending = [], reports = [];
  const scroll = { children: [], clipTop: 400,
    appendChild(n) { this.children.push(n); n.parentNode = this; n.isConnected = true; },
    removeChild(n) { this.children = this.children.filter(c => c !== n); n.parentNode = null; n.isConnected = false; },
    getBoundingClientRect() { return { left: 0, top: this.clipTop, right: 400, bottom: 800 }; },
    querySelector: () => null };
  const gameOver = { querySelector: () => scroll };
  function element(tag) {
    return { tag, children: [], style: {}, classList: { add() {} },
      appendChild(n) { this.children.push(n); n.parentNode = this; }, addEventListener() {},
      getClientRects() { return this.isConnected ? [{}] : []; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200 }; },
      closest() { return scroll; },
      removeChild(n) { this.children = this.children.filter(c => c !== n); n.parentNode = null; } };
  }
  const document = { baseURI: 'https://game.example/play/', hidden: false, head: element('head'),
    createElement: element, getElementById: id => id === 'gameOver' ? gameOver : null };
  const ctx = vm.createContext({ document, location: { origin: 'https://game.example' }, URL,
    window: { innerWidth: 400, innerHeight: 800 }, performance: { now: () => nowMs },
    AD_CREATIVES: { a: { id: 'a', brand: unsafe, poster: 'javascript:alert(1)', accent: [1, 2, 3] } },
    adAdsEnabled: () => enabled, adHash: () => 0, adRgb: a => a,
    AD_DWELL_S: 1.5, AD_PROVIDER: { reportImpression: (_slot, c) => reports.push(c.id) }, Date,
    setTimeout: fn => { pending.push(fn); return 1; }, clearTimeout() {}, Math });
  vm.runInContext(slice('const AD_POSTMATCH_S', 'function adFrameHook') +
    '\nthis.show=adShowPostMatchAd;this.safe=adSafeMediaUrl;', ctx);
  assert.equal(ctx.safe('javascript:alert(1)'), null);
  assert.equal(ctx.safe('https://evil.example/ad.png'), null);
  assert.equal(ctx.safe('../assets/ads/poster.jpg'), 'https://game.example/assets/ads/poster.jpg');
  ctx.show(false);
  const card = scroll.children[0];
  assert.equal(card.children.length, 3, 'unsafe poster is not inserted');
  assert.equal(card.children[0].children[0].textContent, unsafe.toUpperCase());
  assert.equal(card.children.some(c => c.tag === 'img'), false);
  function advance(ticks) { for (let i = 0; i < ticks; i++) { nowMs += 100; pending.shift()(); } }
  advance(16);
  assert.deepEqual(reports, [], 'below-fold card must not count');
  scroll.clipTop = 0; advance(16);
  assert.deepEqual(reports, ['a'], 'continuously visible card counts once after dwell');
  enabled = false; advance(1);
  assert.equal(scroll.children.length, 0, 'ad-off removes the active post-match card');
  ctx.show(false);
  assert.equal(scroll.children.length, 0, 'ad-off prevents a new post-match card');
}

console.log('ad-board safety contract: PASS');
