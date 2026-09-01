/* --------------------------------------------------------------------------
   MASSFRONT — GALACTIC SHARED AUDIO BRIDGE

   Galactic Exploration is a separate document, so the base-game AudioContext
   cannot survive the same-tab navigation. This adapter deliberately mirrors
   the base mixer's four buses and persisted levels. One compressor/master is
   the only connection to the hardware destination; no room or story feature
   is allowed to create an orphan context or bypass the mixer.

   Only already-approved MASSFRONT recordings are addressed here. Missing
   commander/story takes remain silent with their visible subtitle; this file
   never synthesizes replacement speech or populates the music catalog.
   -------------------------------------------------------------------------- */

export const SPACE_AUDIO_LEVELS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);

const PROFILE_KEY_PREFIX = 'massfront_meta_';
const AUDIO_ROOT = new URL('../../../../assets/audio/', import.meta.url);
const SFX_FILES = Object.freeze({
  click: 'ui0',
  confirm: 'confirm0',
  notify: 'notify0',
  radio: 'radio0',
  warp: 'deploy',
  scan: 'sonic',
  probe: 'missile0',
  recruit: 'level0'
});
const SFX_SLOTS = Object.freeze({
  click: 'ui', confirm: 'confirm', notify: 'notify', radio: 'radio',
  warp: 'deploy', scan: 'sonic', probe: 'missile', recruit: 'level'
});
/* KEEL is the UGA character. The shipped filenames retain the older internal
   `keen_*` bank stem; keeping that alias private prevents it becoming identity
   or faction metadata anywhere in the experience. */
const KEEL_FILE_STEM = 'keen';
const KEEL_ACTIONS = new Set([
  'greeting', 'skip', 'graduation',
  'react_base_attack0', 'react_base_attack1', 'react_hazard_crater',
  'react_hazard_default', 'react_hazard_highland', 'react_hazard_isles',
  'react_hazard_vanguard', 'react_low_power', 'react_unit_lost0',
  'react_unit_lost1', 'react_wave',
  ...['ability', 'attack', 'camera', 'cloud', 'commander', 'deploy', 'fac',
    'fog', 'formation', 'intel', 'mex', 'objective', 'pickup', 'platoon',
    'power', 'queue', 'tech', 'territory', 'train', 'turret']
    .flatMap(name => [`step_${name}`, `done_${name}`])
]);

function clampLevel(value, fallback) {
  const parsed = Number(value);
  const step = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return SPACE_AUDIO_LEVELS[Math.max(0, Math.min(4, step))];
}

export function normalizeSpaceAudioSettings(source = {}) {
  const legacy = source.audioLevelSteps !== 2;
  const step = (key, fallback) => {
    const raw = Number.isFinite(Number(source[key])) ? Math.round(Number(source[key])) : fallback;
    return legacy ? Math.max(1, Math.min(4, raw + 1)) : Math.max(0, Math.min(4, raw));
  };
  return {
    sound: source.sound !== false,
    music: source.music !== false,
    sfx: clampLevel(step('sfxVol', legacy ? 3 : 4), 4),
    ambience: clampLevel(step('ambVol', legacy ? 3 : 4), 4),
    musicLevel: clampLevel(step('musicVol', legacy ? 2 : 3), 3),
    voice: clampLevel(step('voiceVol', legacy ? 3 : 4), 4)
  };
}

function profileSettings(profileId) {
  try {
    const raw = window.localStorage?.getItem(`${PROFILE_KEY_PREFIX}${profileId || 'default'}`);
    const record = raw ? JSON.parse(raw) : null;
    return normalizeSpaceAudioSettings(record?.settings || {});
  } catch (_) {
    return normalizeSpaceAudioSettings({ audioLevelSteps: 2 });
  }
}

function preferredExtensions() {
  try {
    const audio = document.createElement('audio');
    const can = type => audio.canPlayType(type);
    if (can('audio/ogg; codecs="vorbis"') === 'probably') return ['ogg', 'm4a'];
    if (can('audio/mp4; codecs="mp4a.40.2"')) return ['m4a', 'ogg'];
  } catch (_) {}
  return ['ogg', 'm4a'];
}

export class SpaceAudio {
  constructor(options = {}) {
    this.profileId = options.profileId || 'default';
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.buses = null;
    this.buffers = new Map();
    this.pending = new Map();
    this.activeVoice = null;
    this.duckUntil = 0;
    this.extensions = preferredExtensions();
    this.settings = profileSettings(this.profileId);
    this.scene = 'galactic';
    this.external = typeof window !== 'undefined' ? window.__MASSFRONT_AUDIO_BRIDGE__ || null : null;
    this.allowDocumentFallback = options.allowDocumentFallback !== false;
    this.lifecycleTarget = options.lifecycleTarget
      || (typeof window !== 'undefined' ? window : null);
    this.handleDocumentExit = () => this.dispose();
    /* Same-tab Galactic -> battle navigation does not call the experience's
       ordinary destroy path. Close before the document and its renderer are
       replaced so Chromium never carries an abandoned AudioContext into the
       next WebGL document. Both events are idempotent; pagehide covers normal
       navigation/BFCache and beforeunload starts teardown as early as possible. */
    this.lifecycleTarget?.addEventListener?.('pagehide', this.handleDocumentExit);
    this.lifecycleTarget?.addEventListener?.('beforeunload', this.handleDocumentExit);
  }

  init() {
    if (this.external) return this.external.init?.() !== false;
    /* Prefer a live host bridge. Same-tab navigation destroys the prior
       document and its AudioContext, though, so absence of that bridge means
       this document has no mixer at all. In that case this contained graph is
       the one authoritative mixer for both integrated and standalone routes. */
    if (!this.allowDocumentFallback) return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
      this.applyLevels();
      return true;
    }
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.ctx = new AudioContextClass();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 22;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.18;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.buses = {
        sfx: this.ctx.createGain(),
        ambience: this.ctx.createGain(),
        music: this.ctx.createGain(),
        voice: this.ctx.createGain()
      };
      Object.values(this.buses).forEach(bus => bus.connect(this.compressor));
      this.compressor.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyLevels();
      return true;
    } catch (_) {
      this.dispose();
      return false;
    }
  }

  refreshSettings() {
    if (this.external) {
      const levels = this.external.levels?.() || {};
      return { ...levels };
    }
    this.settings = profileSettings(this.profileId);
    this.applyLevels();
    return { ...this.settings };
  }

  applyLevels() {
    if (this.external) return this.external.applyLevels?.() !== false;
    if (!this.ctx || !this.buses) return false;
    const now = this.ctx.currentTime;
    this.buses.sfx.gain.setTargetAtTime(this.settings.sound ? this.settings.sfx : 0, now, 0.08);
    this.buses.ambience.gain.setTargetAtTime(this.settings.ambience, now, 0.08);
    this.buses.music.gain.setTargetAtTime(this.settings.music ? this.settings.musicLevel : 0, now, 0.08);
    /* Voice is intentionally independent from the Sound Effects toggle. */
    this.buses.voice.gain.setTargetAtTime(this.settings.voice, now, 0.08);
    return true;
  }

  setScene(scene) {
    this.scene = String(scene || 'galactic');
    if (this.external) return this.external.setScene?.(this.scene) || this.scene;
    return this.scene;
  }

  duck(durationMs) {
    const hold = Math.max(0, Math.min(60000, Number(durationMs) || 0));
    this.duckUntil = Math.max(this.duckUntil, performance.now() + hold);
    if (this.external) return this.external.duck?.(hold) || this.duckUntil;
    if (this.ctx && this.buses) {
      const target = this.settings.music && this.settings.musicLevel
        ? this.settings.musicLevel * 0.58
        : 0;
      this.buses.music.gain.setTargetAtTime(target, this.ctx.currentTime, 0.06);
      window.setTimeout(() => {
        if (!this.ctx || !this.buses || performance.now() < this.duckUntil) return;
        this.buses.music.gain.setTargetAtTime(
          this.settings.music ? this.settings.musicLevel : 0,
          this.ctx.currentTime,
          0.9
        );
      }, hold + 30);
    }
    return this.duckUntil;
  }

  async load(stem) {
    if (!this.init()) return null;
    if (this.buffers.has(stem)) return this.buffers.get(stem);
    if (this.pending.has(stem)) return this.pending.get(stem);
    const request = (async () => {
      for (const extension of this.extensions) {
        try {
          const response = await fetch(new URL(`${stem}.${extension}`, AUDIO_ROOT));
          if (!response.ok) continue;
          const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
          this.buffers.set(stem, buffer);
          return buffer;
        } catch (_) {}
      }
      return null;
    })().finally(() => this.pending.delete(stem));
    this.pending.set(stem, request);
    return request;
  }

  async playBuffer(stem, busName, options = {}) {
    if (!this.init() || !this.buses?.[busName]) return false;
    if (busName === 'sfx' && (!this.settings.sound || this.settings.sfx <= 0)) return false;
    if (busName === 'voice' && this.settings.voice <= 0) return false;
    const buffer = await this.load(stem);
    if (!buffer || !this.ctx || !this.buses?.[busName]) return false;
    if (busName === 'voice' && this.activeVoice) {
      try { this.activeVoice.stop(); } catch (_) {}
      this.activeVoice = null;
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1.5, Number(options.gain) || 1));
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.buses[busName]);
    if (busName === 'voice') {
      this.activeVoice = source;
      this.duck(buffer.duration * 1000 + 240);
    }
    source.onended = () => {
      if (this.activeVoice === source) this.activeVoice = null;
    };
    try { source.start(); } catch (_) { return false; }
    return true;
  }

  play(type) {
    if (this.external) return Promise.resolve(Boolean(this.external.playSfx?.(SFX_SLOTS[type] || type)));
    const stem = SFX_FILES[type];
    return stem ? this.playBuffer(stem, 'sfx') : Promise.resolve(false);
  }

  playVoice(speaker, action) {
    if (String(speaker || '').toLowerCase() !== 'keel') return Promise.resolve(false);
    const normalizedAction = String(action || '').toLowerCase();
    if (!KEEL_ACTIONS.has(normalizedAction)) return Promise.resolve(false);
    if (this.external) return Promise.resolve(Boolean(this.external.playVoice?.('keel', normalizedAction)));
    return this.playBuffer(`voice/${KEEL_FILE_STEM}_${normalizedAction}`, 'voice');
  }

  playStory(cue) {
    if (!cue || cue.speakerId !== 'keel' || !cue.voiceAction) return Promise.resolve(false);
    return this.playVoice('keel', cue.voiceAction);
  }

  endStory() {
    /* Do not truncate a recorded line just because its subtitle timed out. The
       next KEEL cue owns interruption and playBuffer replaces it atomically. */
    return Boolean(this.activeVoice);
  }

  dispose() {
    const lifecycleTarget = this.lifecycleTarget;
    this.lifecycleTarget = null;
    lifecycleTarget?.removeEventListener?.('pagehide', this.handleDocumentExit);
    lifecycleTarget?.removeEventListener?.('beforeunload', this.handleDocumentExit);
    if (this.external) {
      this.external = null;
      return;
    }
    if (this.activeVoice) {
      try { this.activeVoice.stop(); } catch (_) {}
    }
    this.activeVoice = null;
    const context = this.ctx;
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.buses = null;
    this.buffers.clear();
    this.pending.clear();
    try {
      const closing = context?.close?.();
      if (closing && typeof closing.catch === 'function') {
        closing.catch(error => console.warn('[MASSFRONT AUDIO TEARDOWN]', error));
      }
    } catch (error) {
      console.warn('[MASSFRONT AUDIO TEARDOWN]', error);
    }
  }
}
