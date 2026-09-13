import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPACE_AUDIO_LEVELS,
  SpaceAudio,
  normalizeSpaceAudioSettings
} from '../../src/audio/space_audio.js';

assert.deepEqual([...SPACE_AUDIO_LEVELS], [0, 0.25, 0.5, 0.75, 1]);
assert.deepEqual(normalizeSpaceAudioSettings({
  audioLevelSteps: 2,
  sound: false,
  music: true,
  sfxVol: 0,
  ambVol: 2,
  musicVol: 0,
  voiceVol: 4
}), {
  sound: false,
  music: true,
  sfx: 0,
  ambience: 0.5,
  musicLevel: 0,
  voice: 1
}, 'all four buses must support a true zero while voice stays independent of effects');
assert.deepEqual(normalizeSpaceAudioSettings({
  sfxVol: 3,
  ambVol: 3,
  musicVol: 2,
  voiceVol: 3
}), {
  sound: true,
  music: true,
  sfx: 1,
  ambience: 1,
  musicLevel: 0.75,
  voice: 1
}, 'legacy four-step saves must retain their audible percentages');

const disabledDocumentFallback = new SpaceAudio({ allowDocumentFallback: false });
assert.equal(disabledDocumentFallback.init(), false,
  'a caller must be able to prohibit document-owned audio explicitly');

const lifecycleListeners = new Map();
const lifecycleTarget = {
  addEventListener(type, listener) { lifecycleListeners.set(type, listener); },
  removeEventListener(type, listener) {
    if (lifecycleListeners.get(type) === listener) lifecycleListeners.delete(type);
  }
};
let closeCount = 0;
const lifecycleAudio = new SpaceAudio({ lifecycleTarget, allowDocumentFallback: false });
lifecycleAudio.ctx = { close() { closeCount++; return Promise.resolve(); } };
assert.equal(typeof lifecycleListeners.get('pagehide'), 'function');
assert.equal(typeof lifecycleListeners.get('beforeunload'), 'function');
lifecycleListeners.get('pagehide')();
assert.equal(closeCount, 1, 'pagehide did not close the document-owned AudioContext');
assert.equal(lifecycleAudio.ctx, null);
assert.equal(lifecycleListeners.size, 0, 'audio lifecycle listeners survived teardown');
lifecycleAudio.dispose();
assert.equal(closeCount, 1, 'audio teardown is not idempotent');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const source = fs.readFileSync(path.join(root, 'modules/space_exploration/src/audio/space_audio.js'), 'utf8');
const baseAudio = fs.readFileSync(path.join(root, 'src/audio.js'), 'utf8');
const experience = fs.readFileSync(path.join(root, 'modules/space_exploration/src/space_experience.js'), 'utf8');

assert.equal((source.match(/\.connect\(this\.ctx\.destination\)/g) || []).length, 1,
  'only the fallback master may connect to the hardware destination');
assert.doesNotMatch(source, /createOscillator|startAmbientSpaceDrone|startEngineHum/,
  'the retired orphan synthesizer must not return');
assert.match(experience, /allowDocumentFallback: true/);
assert.match(source, /this\.external\.playVoice\?\.\('keel', normalizedAction\)/);
assert.match(source, /if \(!this\.allowDocumentFallback\) return false/);
assert.match(source, /addEventListener\?\.\('pagehide', this\.handleDocumentExit\)/);
assert.match(source, /addEventListener\?\.\('beforeunload', this\.handleDocumentExit\)/);
assert.match(source, /context\?\.close\?\.\(\)/);
assert.match(baseAudio, /window\.__MASSFRONT_AUDIO_BRIDGE__=/);
assert.match(baseAudio, /!mfStage13VoiceSlot&&typeof sfxOn/,
  'effects-off must be evaluated only for non-voice slots');
assert.match(experience, /voiceAction: 'greeting'/,
  'the existing KEEL greeting must be explicitly matched, not inferred from subtitle text');
assert.doesNotMatch(experience, /voiceId: 'keen'/,
  'player-facing story metadata must identify KEEL, not the legacy filename alias');

for (const stem of [
  'ui0', 'confirm0', 'notify0', 'radio0', 'deploy', 'sonic', 'missile0', 'level0',
  'voice/keen_greeting'
]) {
  for (const extension of ['ogg', 'm4a']) {
    assert.ok(fs.existsSync(path.join(root, 'assets/audio', `${stem}.${extension}`)),
      `approved dual-codec audio is missing: ${stem}.${extension}`);
  }
}

console.log('PASS shared Galactic audio bridge, zero-volume buses, and KEEL identity contract');
