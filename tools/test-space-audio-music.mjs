/* Deterministic ownership/codec contract, not a claim of real audio playback.
   The companion probe-space-audio-music.mjs exercises actual browser decoding. */
import assert from 'node:assert/strict';
import { SpaceAudio } from '../modules/space_exploration/src/audio/space_audio.js';

class Events {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn(event); }
}
class Param {
  value = 0;
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param();
  connections = [];
  connect(target) { this.connections.push(target); }
  disconnect() { this.connections = []; }
}
function environment(options = {}) {
  const lifecycle = new Events();
  const documentTarget = new Events();
  documentTarget.hidden = false;
  documentTarget.createElement = () => ({ canPlayType: type => type.includes('ogg')
    ? options.aacFirst ? '' : 'probably' : 'probably' });
  let settings = { audioLevelSteps: 2, sound: true, music: true, musicVol: 3, voiceVol: 4, ...options.settings };
  const contexts = [];
  const requests = [];
  class Context extends Events {
    constructor() {
      super(); this.state = options.suspended ? 'suspended' : 'running'; this.unlocked = !options.suspended;
      this.currentTime = 1; this.destination = new Node(); this.sources = []; contexts.push(this);
    }
    createGain() { return new Node(); }
    createDynamicsCompressor() {
      return Object.assign(new Node(), Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new Param()])));
    }
    createBufferSource() {
      const source = new Node();
      source.start = () => { source.started = true; };
      source.stop = at => {
        if (at > this.currentTime) { source.stopAt = at; return; }
        source.stopped = true; source.onended?.();
      };
      this.sources.push(source); return source;
    }
    async decodeAudioData(bytes) { return options.decode ? options.decode(bytes) : { duration: 24, length: 48000 }; }
    async resume() { if (this.unlocked) { this.state = 'running'; this.emit('statechange'); } }
    async close() { this.state = 'closed'; this.emit('statechange'); }
  }
  globalThis.window = Object.assign(lifecycle, {
    AudioContext: Context, setTimeout, clearTimeout,
    localStorage: { getItem: () => JSON.stringify({ settings }) }
  });
  globalThis.document = documentTarget;
  globalThis.fetch = async url => {
    requests.push(String(url));
    if (options.fetch) return options.fetch(String(url));
    return { ok: true, arrayBuffer: async () => new Uint8Array([1]).buffer };
  };
  const audio = new SpaceAudio({ profileId: 'audio-contract', lifecycleTarget: lifecycle, documentTarget });
  return { audio, lifecycle, documentTarget, contexts, requests,
    change: values => { settings = { ...settings, ...values }; audio.refreshSettings(); } };
}
const settle = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
const cases = [];
async function test(name, run) { await run(); cases.push(name); }

await test('gesture unlock starts one approved bed on the music bus', async () => {
  const { audio, contexts, requests } = environment({ suspended: true });
  audio.init(); await settle();
  assert.equal(requests.length, 0, 'suspended context must not preload/start music');
  contexts[0].unlocked = true; await contexts[0].resume(); await settle();
  assert.equal(audio.activeMusic.stem, 'mus_ambient');
  assert.equal(audio.activeMusic.source.loop, true);
  assert.equal(audio.activeMusic.gain.gain.value, 0.28);
  assert.equal(audio.activeMusic.gain.connections[0], audio.buses.music);
  assert.equal(audio.buses.music.gain.value, 0.75);
  assert.equal(requests.length, 1); audio.dispose();
});
await test('scene transitions and repeated init never stack or restart the loop', async () => {
  const { audio, contexts, requests } = environment();
  audio.init(); for (let n = 0; n < 10; n++) { audio.init(); audio.setScene('rooms'); }
  await settle(); const source = audio.activeMusic.source;
  for (const scene of ['galactic', 'galaxy', 'rooms', 'survey']) { audio.setScene(scene); audio.refreshSettings(); }
  await settle(); assert.equal(audio.activeMusic.source, source);
  assert.equal(contexts[0].sources.filter(item => item.loop).length, 1);
  assert.equal(requests.length, 1); audio.dispose();
});
await test('music remains independent of SFX mute, voice ducking survives settings refresh', async () => {
  const { audio } = environment({ settings: { sound: false, sfxVol: 0 } });
  assert.equal(await audio.play('click'), false); await settle();
  assert.ok(audio.activeMusic); assert.equal(audio.buses.sfx.gain.value, 0);
  assert.equal(await audio.playVoice('keel', 'greeting'), true);
  audio.refreshSettings(); assert.equal(audio.buses.music.gain.value, 0.75 * 0.58);
  assert.equal(audio.buses.voice.gain.value, 1); audio.dispose();
});
await test('mute and zero volume stop; rapid unmute retires old nodes without stacking', async () => {
  const { audio, change, contexts } = environment(); audio.init(); await settle();
  const first = audio.activeMusic.source;
  change({ music: false }); assert.equal(audio.activeMusic, null); assert.equal(audio.retiringMusic.size, 1);
  change({ music: true }); await settle(); assert.equal(first.stopped, true);
  assert.equal(audio.retiringMusic.size, 0); assert.ok(audio.activeMusic);
  change({ musicVol: 0 }); await settle(); assert.equal(audio.activeMusic, null);
  change({ musicVol: 2 }); await settle(); assert.equal(audio.buses.music.gain.value, 0.5);
  assert.equal(contexts[0].sources.filter(source => source.loop && !source.stopped).length, 1); audio.dispose();
});
await test('hidden and non-exploration scenes stop; valid return resumes one cached bed', async () => {
  const { audio, documentTarget, requests } = environment(); audio.init(); await settle();
  const first = audio.activeMusic.source;
  documentTarget.hidden = true; documentTarget.emit('visibilitychange');
  assert.equal(first.stopped, true); assert.equal(audio.activeMusic, null);
  documentTarget.hidden = false; documentTarget.emit('visibilitychange'); await settle(); assert.ok(audio.activeMusic);
  audio.setScene('battle'); assert.equal(audio.activeMusic, null);
  audio.setScene('galactic'); await settle(); assert.ok(audio.activeMusic);
  assert.equal(requests.length, 1); audio.dispose();
});
await test('OGG decode failure falls through to accepted AAC file', async () => {
  let decodeCount = 0;
  const { audio, requests } = environment({ decode: async () => {
    if (++decodeCount === 1) throw new Error('OGG decoder unavailable');
    return { duration: 24, length: 48000 };
  } });
  audio.init(); await settle(); assert.ok(audio.activeMusic);
  assert.ok(requests[0].endsWith('mus_ambient.ogg')); assert.ok(requests[1].endsWith('mus_ambient.m4a')); audio.dispose();
});
await test('AAC-first platform retains OGG fallback without playlist population', async () => {
  const { audio, requests } = environment({ aacFirst: true }); audio.init(); await settle();
  assert.ok(audio.activeMusic); assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('mus_ambient.m4a')); audio.dispose();
});
await test('both-codec failures are bounded until a new document mixer', async () => {
  const { audio, requests } = environment({ fetch: async () => ({ ok: false }) });
  audio.init(); await settle(); for (let n = 0; n < 8; n++) audio.init(); await settle();
  assert.equal(requests.length, 2); assert.equal(audio.activeMusic, null); assert.equal(audio.musicFailed, true); audio.dispose();
});
await test('pagehide closes owned graph and re-entry binds teardown again', async () => {
  const { audio, lifecycle, contexts } = environment(); audio.init(); await settle();
  const first = audio.activeMusic.source; lifecycle.emit('pagehide');
  assert.equal(first.stopped, true); assert.equal(contexts[0].state, 'closed'); assert.equal(audio.ctx, null);
  assert.equal(audio.retiringMusic.size, 0); assert.equal(lifecycle.listeners.get('pagehide').size, 0);
  audio.init(); await settle(); assert.equal(contexts.length, 2); assert.ok(audio.activeMusic);
  lifecycle.emit('beforeunload'); assert.equal(contexts[1].state, 'closed'); assert.equal(audio.ctx, null);
});
await test('pending fetch/decode cannot revive or contaminate disposed mixer', async () => {
  let resolveDecode;
  const { audio, contexts } = environment({ decode: () => new Promise(resolve => { resolveDecode = resolve; }) });
  audio.init(); await settle(); assert.equal(typeof resolveDecode, 'function');
  audio.dispose(); resolveDecode({ duration: 24 }); await settle();
  assert.equal(audio.ctx, null); assert.equal(audio.buffers.size, 0); assert.equal(audio.pending.size, 0);
  assert.equal(contexts.length, 1); assert.equal(contexts[0].sources.length, 0);
});
await test('pending old decode cannot erase or start a new mixer request', async () => {
  const resolves = [];
  const { audio, contexts } = environment({ decode: () => new Promise(resolve => resolves.push(resolve)) });
  audio.init(); await settle(); audio.dispose(); audio.init(); await settle();
  assert.equal(resolves.length, 2); resolves[0]({ duration: 11 }); await settle();
  assert.equal(audio.pending.size, 1); assert.equal(audio.buffers.size, 0); assert.equal(audio.activeMusic, null);
  resolves[1]({ duration: 24 }); await settle(); assert.equal(audio.activeMusic.source.buffer.duration, 24);
  assert.equal(contexts[0].sources.length, 0); assert.equal(contexts[1].sources.length, 1); audio.dispose();
});
await test('late decode after mute cannot start a silent orphan loop', async () => {
  let resolveDecode;
  const { audio, change, contexts } = environment({ decode: () => new Promise(resolve => { resolveDecode = resolve; }) });
  audio.init(); await settle(); change({ music: false }); resolveDecode({ duration: 24 }); await settle();
  assert.equal(audio.activeMusic, null); assert.equal(contexts[0].sources.length, 0);
  change({ music: true }); await settle(); assert.ok(audio.activeMusic); assert.equal(contexts[0].sources.length, 1); audio.dispose();
});
console.log(JSON.stringify({ pass: true, cases: cases.length, checks: cases, evidence: 'mock ownership and codec selection only; browser probe required for real playback' }, null, 2));
