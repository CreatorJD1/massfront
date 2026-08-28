;
;
/* ============================================================================
   AUDIO — sample playback engine
   ----------------------------------------------------------------------------
   Replaces the realtime oscillator synthesis with rendered 44.1 kHz stereo
   assets from assets/audio (see tools/make-audio.py for how they are made).

   This file takes over `sfx()` and the music system by REASSIGNING those globals
   at init rather than editing src/ui/hud.js. That is deliberate: the procedural
   synthesiser stays intact and becomes the fallback, so a device that cannot
   decode AAC, a build where the audio folder is missing, or a decode that fails
   halfway still makes noise instead of going silent. Nothing about the rest of
   the game changes — every existing `sfx('boom', x, y)` call site keeps working.

   What a sample engine has to get right beyond "play the file":

   VARIATION      Firing the same buffer forty times a second is the loudest
                  possible tell that audio is fake. Every repeated sound has
                  three rendered takes, and each playback also gets a small
                  random detune and gain trim. Three takes times continuous
                  detune reads as an endless supply.
   VOICE LIMITS   A hundred units firing is a hundred overlapping buffers, which
                  on mobile means audible distortion and dropped frames. Voices
                  are capped globally and per-sound, and a sound that is already
                  playing within a few milliseconds is dropped rather than
                  stacked — that stacking is what makes volleys sound like
                  clipping rather than like a volley.
   SPACE          Pan and attenuation come from the world position relative to
                  the camera, so a battle at the edge of the screen sits at the
                  edge of the stereo field, and one off-screen is quieter.
   HEADROOM       Everything lands on a compressor before the destination.
                  Games mix unpredictably — forty explosions can coincide — and
                  without a limiter that is a clipped mess.
   ============================================================================ */

const AUD = {
  ready: false, base: './assets/audio/', ext: '', buf: {}, pending: 0, failed: 0,
  lastAt: {}, voices: 0, active: [], musicLayer: null, duckUntil: 0,
};

/* Pick a container the browser will actually decode.
   AAC is mandatory for Safari/iOS and is the only lossy codec it accepts. But
   AAC is licensed, and open-source Chromium builds ship without the decoder —
   every asset failed to decode on the first test run for precisely that reason,
   with no error beyond a rejected promise. Ogg Vorbis covers Firefox and every
   Chromium derivative. Asking the browser rather than sniffing the user agent
   means a browser that gains or loses a codec answers correctly by itself. */
function audExt(){
  let a;
  try{ a = document.createElement('audio'); }catch(e){ return 'm4a'; }
  const can = t => { try{ return a.canPlayType(t); }catch(e){ return ''; } };
  if(can('audio/ogg; codecs="vorbis"') === 'probably') return 'ogg';
  if(can('audio/mp4; codecs="mp4a.40.2"')) return 'm4a';
  if(can('audio/ogg; codecs="vorbis"')) return 'ogg';
  return 'm4a';
}

/* name -> the files that can satisfy it. Several game sounds intentionally
   share a source: an "attack" order and a shot are the same event to a player. */
let AUD_MAP = {
  shot:   ['shot0', 'shot1', 'shot2'],
  attack: ['shot0', 'shot1', 'shot2'],
  laser:  ['laser0', 'laser1', 'laser2'],
  gauss:  ['gauss0', 'gauss1', 'gauss2'],
  hit:    ['hit0', 'hit1', 'hit2'],
  boom:   ['boom0', 'boom1', 'boom2'],
  boombig:['boombig'], boomsmall:['boomsmall0','boomsmall'],
  cannon: ['cannon0','cannon1'], carrier_deploy:['carrier_deploy0'],
  flame:  ['flame'], missile:['missile0','missile1','missile2','missile'], sonic:['sonic'],
  ui:     ['ui0','ui1','ui2'], confirm:['confirm0'], alarm:['alarm0','alarm'], deploy:['deploy'],
  level:  ['level0','level1'], pickup:['pickup0','pickup1'], thrust:['thrust'],
  heal:   ['heal0','heal'], surge:['surge'], move:['move_vehicle0','move_vehicle1'],
  /* Floor matches the files that actually ship (ogg+m4a). audLoadSlots() still
     overlays assets/audio/sfx.json when it is present; this list is what plays
     if that manifest is late or missing. Brood creature slots stay on cre_*
     velociraptor takes — never sonic/hit, and never the human horde_* bank. */
  notify: ['notify0'], build:['build0'], radio:['radio0'], flyby:['flyby0'],
  reject: ['ui0'], deny:['ui0'],
  cre_attack:['cre_attack0','cre_attack1','cre_attack2','cre_attack3'],
  cre_pain:['cre_pain0','cre_pain1','cre_pain2','cre_pain3'],
  cre_death:['cre_death0','cre_death1','cre_death2','cre_death3'],
  cre_idle:['cre_idle0','cre_idle1','cre_idle2','cre_idle3'],
  amb_low:['amb_low0'], amb_high:['amb_high0'],
  alarm_loop:['alarm_loop0'], factory_hum:['factory_hum0'],
  move_air:['move_air0'], move_brood:['move_brood0','move_brood1'],
  move_vehicle:['move_vehicle0','move_vehicle1'],
  structure_hum:['structure_hum0','structure_hum1'],
};
const AUD_MUSIC = ['mus_ambient', 'mus_tension', 'mus_combat'];

/* MISSING-SAMPLE FLOOR. Every AUD_MAP lookup routes through here: a slot with
   no manifest entry (assets/audio/sfx.json is optional and ships late) resolves
   to a shared empty list instead of undefined. That turns every play path into
   the same quiet `list.length===0` decline — no throw, no red console error,
   and the callers' own fallbacks run exactly as if the slot were simply empty. */
const AUD_EMPTY=[];
function audMapList(name){ return AUD_MAP[name] || AUD_EMPTY; }

/* Per-sound mix trims and behaviour. `gap` is the minimum milliseconds between
   two plays of the same sound — the single most effective anti-mush control. */
let AUD_MIX = {
  shot:{g:0.55,gap:28,p:1}, attack:{g:0.5,gap:34,p:1}, laser:{g:0.5,gap:30,p:1},
  gauss:{g:0.55,gap:30,p:1}, hit:{g:0.42,gap:26,p:1}, boom:{g:0.85,gap:45,p:3},
  boombig:{g:1.0,gap:120,p:5}, boomsmall:{g:0.7,gap:35,p:2},
  cannon:{g:0.88,gap:105,p:5}, carrier_deploy:{g:0.92,gap:900,p:5},
  flame:{g:0.5,gap:110,p:1}, missile:{g:0.7,gap:60,p:2}, sonic:{g:0.7,gap:80,p:2},
  ui:{g:0.7,gap:40,p:4}, confirm:{g:0.75,gap:80,p:5}, alarm:{g:0.85,gap:600,p:5},
  deploy:{g:1.0,gap:900,p:4}, level:{g:0.9,gap:500,p:5}, pickup:{g:0.7,gap:80,p:3},
  thrust:{g:0.8,gap:400,p:2}, heal:{g:0.6,gap:180,p:3}, surge:{g:0.8,gap:200,p:3},
  move:{g:0.45,gap:70,p:3},
  notify:{g:0.8,gap:220,p:4}, build:{g:0.85,gap:300,p:4}, radio:{g:0.9,gap:120,p:4},
  flyby:{g:0.55,gap:260,p:2}, cre_attack:{g:0.6,gap:40,p:1}, cre_pain:{g:0.5,gap:36,p:1},
  cre_death:{g:0.75,gap:60,p:2}, cre_idle:{g:0.35,gap:900,p:1},
  /* Brood command cues share the radio channel, not the battlefield creature
     slots — otherwise a select chirp would be culled as just another cre_idle. */
  vo_brood_call:{g:0.9,gap:420,p:5},
  /* REJECT is the UI blip pitched down. 154 of this codebase's sfx() calls are
     sfx('ui'), and refusals — no transport available, cargo empty, modifier
     locked, nothing selected — used the same blip as confirmations. The player
     taps, hears the ordinary acknowledgement, and nothing happens, which is
     worse than silence because it actively reports success. `rate` costs one
     new asset of zero. */
  reject:{g:0.8,gap:60,p:4,rate:0.74},
  deny:{g:0.8,gap:60,p:4,rate:0.74},
  amb_low:{g:0.3,gap:0,p:1}, amb_high:{g:0.26,gap:0,p:1},
  alarm_loop:{g:0.28,gap:0,p:4}, factory_hum:{g:0.2,gap:0,p:1},
  move_air:{g:0.2,gap:0,p:1}, move_brood:{g:0.22,gap:0,p:1},
  move_vehicle:{g:0.24,gap:0,p:1}, structure_hum:{g:0.18,gap:0,p:1},
};
const AUD_MAXVOICES = 22;
const AUD_CAP = {
  shot:5, attack:3, laser:4, gauss:4, hit:4, boom:4, boomsmall:3, boombig:2, cannon:2,
  missile:3, flame:2, sonic:2, cre_attack:2, cre_pain:2, cre_death:2,
  cre_idle:1, radio:1, alarm:1, notify:1, deploy:2, build:2, ui:2,
  reject:2, deny:2, vo_brood_call:1
};
const AUD_DUCK = new Set(['alarm','boombig','carrier_deploy','deploy','level','notify','radio','vo_brood_call']);
/* These cues are interface information, even when their caller supplies the
   location that caused them. They stay crisp and centred while battlefield
   voices pass through distance/zoom muffling. */
const AUD_CLEAR = new Set(['ui','confirm','radio','notify','level','reject','deny','vo_brood_call']);

let audMaster = null, audSfxBus = null, audAmbBus = null, audMusBus = null,
    audVoiceBus = null, audComp = null;

function audLevelSetting(key, fallback){
  const v=(typeof META!=='undefined'&&META.settings)?META.settings[key]:fallback;
  return [0.25,0.50,0.75,1.0][clamp(v|0,0,3)];
}
function audSfxLevel(){ return audLevelSetting('sfxVol',3); }
function audAmbienceLevel(){ return audLevelSetting('ambVol',3); }
function audMusicLevel(){ return audLevelSetting('musicVol',2); }
function audVoiceLevel(){ return audLevelSetting('voiceVol',3); }
function audIsVoiceSlot(name){ return typeof name==='string'&&name.lastIndexOf('vo_',0)===0; }
function audApplyLevels(){
  if(!AC) return;
  if(audSfxBus) audSfxBus.gain.setTargetAtTime(audSfxLevel(),AC.currentTime,0.08);
  if(audAmbBus) audAmbBus.gain.setTargetAtTime(audAmbienceLevel(),AC.currentTime,0.08);
  if(audVoiceBus) audVoiceBus.gain.setTargetAtTime(audVoiceLevel(),AC.currentTime,0.08);
}

function audUnique(){
  const s = new Set();
  for (const k in AUD_MAP) for (const f of AUD_MAP[k]) s.add(f);
  for (const m of AUD_MUSIC) s.add(m);
  return [...s];
}

/* Decode one file into an AudioBuffer. Failures are counted, never thrown —
   a missing asset must degrade to the synth, not break the game.
   Preferred container first, then the other: SFX ships ogg+m4a so a browser
   whose canPlayType lied, or a pack that only landed one sidecar, still plays. */
function audSidecarExts(){
  return AUD.ext === 'ogg' ? ['ogg','m4a'] : ['m4a','ogg'];
}
async function audLoad(name){
  if(typeof name==='string' && name.lastIndexOf('voice/horde_',0)===0) return;
  const exts = audSidecarExts();
  for(const ext of exts){
    try{
      let url = AUD.base + name + '.' + ext;
      if(name.lastIndexOf('voice/',0)===0 && typeof packURL==='function'){
        try{ const u = await packURL('voice', name.slice(6) + '.' + ext); if(u) url = u; }catch(e){}
      }
      const r = await fetch(url, {cache:'force-cache'});
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const ab = await r.arrayBuffer();
      const buf = await new Promise((res, rej) => {
        const p = AC.decodeAudioData(ab, res, rej);
        if(p && p.then) p.then(res, rej);
      });
      AUD.buf[name] = buf;
      return;
    }catch(e){}
  }
  AUD.failed++;
}

function audBuild(){
  if(!AC || audMaster) return;
  audComp = AC.createDynamicsCompressor();
  audComp.threshold.value = -12; audComp.knee.value = 22;
  audComp.ratio.value = 5; audComp.attack.value = 0.004; audComp.release.value = 0.18;
  audMaster = AC.createGain(); audMaster.gain.value = 0.9;
  audSfxBus = AC.createGain(); audSfxBus.gain.value = audSfxLevel();
  audAmbBus = AC.createGain(); audAmbBus.gain.value = audAmbienceLevel();
  audMusBus = AC.createGain(); audMusBus.gain.value = 0.0;
  audVoiceBus = AC.createGain(); audVoiceBus.gain.value = audVoiceLevel();
  audSfxBus.connect(audComp); audAmbBus.connect(audComp);
  audMusBus.connect(audComp); audVoiceBus.connect(audComp);
  audComp.connect(audMaster); audMaster.connect(AC.destination);
}

/* Merge assets/audio/sfx.json into the sound tables.

   This is what lets tools/ingest-sfx.py add a whole creature vocabulary — or a
   fourth cannon take — without a code change. The bundled defaults above stay
   as the floor, so a build with no sfx.json behaves exactly as before and a
   build whose sfx.json fails to parse degrades to the same place instead of
   losing audio entirely. */
async function audLoadSlots(){
  try{
    const r = await fetch('./assets/audio/sfx.json', {cache:'no-store'});
    if(!r.ok) return;
    const j = await r.json();
    if(!j || !j.slots) return;
    for(const slot in j.slots){
      const s = j.slots[slot];
      if(!s || !Array.isArray(s.files) || !s.files.length) continue;
      AUD_MAP[slot] = s.files.slice();
      const prior=AUD_MIX[slot];
      AUD_MIX[slot] = { g: (typeof s.gain === 'number' ? s.gain : 0.6),
                        gap: (typeof s.gap === 'number' ? s.gap : 40),
                        p: (typeof s.priority === 'number' ? s.priority : (prior&&prior.p)||2) };
      if(prior && prior.rate) AUD_MIX[slot].rate = prior.rate;
      if(typeof s.rate === 'number') AUD_MIX[slot].rate = s.rate;
    }
  }catch(e){}
}

/* The rendered voice bank — four factions of unit radio plus KEEN, the training
   liaison. Each line becomes an ordinary AUD_MAP slot, so voice inherits the
   whole existing pipeline for free: format selection, decoding, the dedicated
   voice bus and its volume slider, ducking, priority culling. AUD_CLEAR keeps them un-muffled
   by distance — a radio call arrives over the radio, not from wherever on the
   map the unit happens to be standing.

   Nothing here is speaker-specific: the loop walks whatever `lines` the manifest
   declares, so adding a speaker is a data change. KEEN's 54 authored ids arrive
   through exactly this path.

   Buffers are NOT fetched here. 162 takes is four factions plus a narrator and a
   player only ever hears one faction, so voPlay() loads a slot the first time it
   is actually asked for and voPrewarm() pulls the player's faction at match
   start. */
let VOICE_BANK = null;
async function audLoadVoiceBank(){
  try{
    const r = await fetch('data:application/json;base64,ewogIl9ub3RlIjogIkdFTkVSQVRFRCBieSB0b29scy9tYWtlLXZvaWNlcy5weSDigJQgZG8gbm90IGhhbmQtZWRpdC4gUmUtcnVuIHRoZSB0b29sOyBzZWUgZG9jcy9WT0lDRS1QSVBFTElORS5tZC4iLAogImdlbmVyYXRlZCI6ICIyMDI2LTA4LTA5VDAzOjA4OjEzWiIsCiAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogInZvaWNlcyI6IHsKICAiYXNjZW5kYW5jeSI6ICJibV9nZW9yZ2UiLAogICJob3JkZSI6ICJibV9mYWJsZSIsCiAgImtlZW4iOiAiYWZfaGVhcnQiLAogICJub3ZhIjogImFtX21pY2hhZWwiLAogICJzeW5kaWNhdGUiOiAiYWZfYmVsbGEiCiB9LAogImxpbmVzIjogewogICJhc2NlbmRhbmN5IjogewogICAiYWJpbGl0eSI6IFsKICAgICJhc2NlbmRhbmN5X2FiaWxpdHlfMCIsCiAgICAiYXNjZW5kYW5jeV9hYmlsaXR5XzEiLAogICAgImFzY2VuZGFuY3lfYWJpbGl0eV8yIgogICBdLAogICAiYXR0YWNrIjogWwogICAgImFzY2VuZGFuY3lfYXR0YWNrXzAiLAogICAgImFzY2VuZGFuY3lfYXR0YWNrXzEiLAogICAgImFzY2VuZGFuY3lfYXR0YWNrXzIiCiAgIF0sCiAgICJidWlsZCI6IFsKICAgICJhc2NlbmRhbmN5X2J1aWxkXzAiLAogICAgImFzY2VuZGFuY3lfYnVpbGRfMSIsCiAgICAiYXNjZW5kYW5jeV9idWlsZF8yIgogICBdLAogICAiZGVwbG95IjogWwogICAgImFzY2VuZGFuY3lfZGVwbG95XzAiLAogICAgImFzY2VuZGFuY3lfZGVwbG95XzEiLAogICAgImFzY2VuZGFuY3lfZGVwbG95XzIiCiAgIF0sCiAgICJob2xkIjogWwogICAgImFzY2VuZGFuY3lfaG9sZF8wIiwKICAgICJhc2NlbmRhbmN5X2hvbGRfMSIsCiAgICAiYXNjZW5kYW5jeV9ob2xkXzIiCiAgIF0sCiAgICJtb3ZlIjogWwogICAgImFzY2VuZGFuY3lfbW92ZV8wIiwKICAgICJhc2NlbmRhbmN5X21vdmVfMSIsCiAgICAiYXNjZW5kYW5jeV9tb3ZlXzIiCiAgIF0sCiAgICJwYXRyb2wiOiBbCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMCIsCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMSIsCiAgICAiYXNjZW5kYW5jeV9wYXRyb2xfMiIKICAgXSwKICAgInNlbGVjdCI6IFsKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8wIiwKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8xIiwKICAgICJhc2NlbmRhbmN5X3NlbGVjdF8yIgogICBdLAogICAic3RvcCI6IFsKICAgICJhc2NlbmRhbmN5X3N0b3BfMCIsCiAgICAiYXNjZW5kYW5jeV9zdG9wXzEiLAogICAgImFzY2VuZGFuY3lfc3RvcF8yIgogICBdCiAgfSwKICAiaG9yZGUiOiB7CiAgICJhYmlsaXR5IjogWwogICAgImhvcmRlX2FiaWxpdHlfMCIsCiAgICAiaG9yZGVfYWJpbGl0eV8xIiwKICAgICJob3JkZV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAiaG9yZGVfYXR0YWNrXzAiLAogICAgImhvcmRlX2F0dGFja18xIiwKICAgICJob3JkZV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgImhvcmRlX2J1aWxkXzAiLAogICAgImhvcmRlX2J1aWxkXzEiLAogICAgImhvcmRlX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAiaG9yZGVfZGVwbG95XzAiLAogICAgImhvcmRlX2RlcGxveV8xIiwKICAgICJob3JkZV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAiaG9yZGVfaG9sZF8wIiwKICAgICJob3JkZV9ob2xkXzEiLAogICAgImhvcmRlX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAiaG9yZGVfbW92ZV8wIiwKICAgICJob3JkZV9tb3ZlXzEiLAogICAgImhvcmRlX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJob3JkZV9wYXRyb2xfMCIsCiAgICAiaG9yZGVfcGF0cm9sXzEiLAogICAgImhvcmRlX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgImhvcmRlX3NlbGVjdF8wIiwKICAgICJob3JkZV9zZWxlY3RfMSIsCiAgICAiaG9yZGVfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgImhvcmRlX3N0b3BfMCIsCiAgICAiaG9yZGVfc3RvcF8xIiwKICAgICJob3JkZV9zdG9wXzIiCiAgIF0KICB9LAogICJrZWVuIjogewogICAiZG9uZV9hYmlsaXR5IjogWwogICAgImtlZW5fZG9uZV9hYmlsaXR5IgogICBdLAogICAiZG9uZV9hdHRhY2siOiBbCiAgICAia2Vlbl9kb25lX2F0dGFjayIKICAgXSwKICAgImRvbmVfY2FtZXJhIjogWwogICAgImtlZW5fZG9uZV9jYW1lcmEiCiAgIF0sCiAgICJkb25lX2Nsb3VkIjogWwogICAgImtlZW5fZG9uZV9jbG91ZCIKICAgXSwKICAgImRvbmVfY29tbWFuZGVyIjogWwogICAgImtlZW5fZG9uZV9jb21tYW5kZXIiCiAgIF0sCiAgICJkb25lX2RlcGxveSI6IFsKICAgICJrZWVuX2RvbmVfZGVwbG95IgogICBdLAogICAiZG9uZV9mYWMiOiBbCiAgICAia2Vlbl9kb25lX2ZhYyIKICAgXSwKICAgImRvbmVfZm9nIjogWwogICAgImtlZW5fZG9uZV9mb2ciCiAgIF0sCiAgICJkb25lX2Zvcm1hdGlvbiI6IFsKICAgICJrZWVuX2RvbmVfZm9ybWF0aW9uIgogICBdLAogICAiZG9uZV9pbnRlbCI6IFsKICAgICJrZWVuX2RvbmVfaW50ZWwiCiAgIF0sCiAgICJkb25lX21leCI6IFsKICAgICJrZWVuX2RvbmVfbWV4IgogICBdLAogICAiZG9uZV9vYmplY3RpdmUiOiBbCiAgICAia2Vlbl9kb25lX29iamVjdGl2ZSIKICAgXSwKICAgImRvbmVfcGlja3VwIjogWwogICAgImtlZW5fZG9uZV9waWNrdXAiCiAgIF0sCiAgICJkb25lX3BsYXRvb24iOiBbCiAgICAia2Vlbl9kb25lX3BsYXRvb24iCiAgIF0sCiAgICJkb25lX3Bvd2VyIjogWwogICAgImtlZW5fZG9uZV9wb3dlciIKICAgXSwKICAgImRvbmVfcXVldWUiOiBbCiAgICAia2Vlbl9kb25lX3F1ZXVlIgogICBdLAogICAiZG9uZV90ZWNoIjogWwogICAgImtlZW5fZG9uZV90ZWNoIgogICBdLAogICAiZG9uZV90ZXJyaXRvcnkiOiBbCiAgICAia2Vlbl9kb25lX3RlcnJpdG9yeSIKICAgXSwKICAgImRvbmVfdHJhaW4iOiBbCiAgICAia2Vlbl9kb25lX3RyYWluIgogICBdLAogICAiZG9uZV90dXJyZXQiOiBbCiAgICAia2Vlbl9kb25lX3R1cnJldCIKICAgXSwKICAgImdyYWR1YXRpb24iOiBbCiAgICAia2Vlbl9ncmFkdWF0aW9uIgogICBdLAogICAiZ3JlZXRpbmciOiBbCiAgICAia2Vlbl9ncmVldGluZyIKICAgXSwKICAgInJlYWN0X2Jhc2VfYXR0YWNrMCI6IFsKICAgICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMCIKICAgXSwKICAgInJlYWN0X2Jhc2VfYXR0YWNrMSI6IFsKICAgICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMSIKICAgXSwKICAgInJlYWN0X2hhemFyZF9jcmF0ZXIiOiBbCiAgICAia2Vlbl9yZWFjdF9oYXphcmRfY3JhdGVyIgogICBdLAogICAicmVhY3RfaGF6YXJkX2RlZmF1bHQiOiBbCiAgICAia2Vlbl9yZWFjdF9oYXphcmRfZGVmYXVsdCIKICAgXSwKICAgInJlYWN0X2hhemFyZF9oaWdobGFuZCI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF9oaWdobGFuZCIKICAgXSwKICAgInJlYWN0X2hhemFyZF9pc2xlcyI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF9pc2xlcyIKICAgXSwKICAgInJlYWN0X2hhemFyZF92YW5ndWFyZCI6IFsKICAgICJrZWVuX3JlYWN0X2hhemFyZF92YW5ndWFyZCIKICAgXSwKICAgInJlYWN0X2xvd19wb3dlciI6IFsKICAgICJrZWVuX3JlYWN0X2xvd19wb3dlciIKICAgXSwKICAgInJlYWN0X3VuaXRfbG9zdDAiOiBbCiAgICAia2Vlbl9yZWFjdF91bml0X2xvc3QwIgogICBdLAogICAicmVhY3RfdW5pdF9sb3N0MSI6IFsKICAgICJrZWVuX3JlYWN0X3VuaXRfbG9zdDEiCiAgIF0sCiAgICJyZWFjdF93YXZlIjogWwogICAgImtlZW5fcmVhY3Rfd2F2ZSIKICAgXSwKICAgInNraXAiOiBbCiAgICAia2Vlbl9za2lwIgogICBdLAogICAic3RlcF9hYmlsaXR5IjogWwogICAgImtlZW5fc3RlcF9hYmlsaXR5IgogICBdLAogICAic3RlcF9hdHRhY2siOiBbCiAgICAia2Vlbl9zdGVwX2F0dGFjayIKICAgXSwKICAgInN0ZXBfY2FtZXJhIjogWwogICAgImtlZW5fc3RlcF9jYW1lcmEiCiAgIF0sCiAgICJzdGVwX2Nsb3VkIjogWwogICAgImtlZW5fc3RlcF9jbG91ZCIKICAgXSwKICAgInN0ZXBfY29tbWFuZGVyIjogWwogICAgImtlZW5fc3RlcF9jb21tYW5kZXIiCiAgIF0sCiAgICJzdGVwX2RlcGxveSI6IFsKICAgICJrZWVuX3N0ZXBfZGVwbG95IgogICBdLAogICAic3RlcF9mYWMiOiBbCiAgICAia2Vlbl9zdGVwX2ZhYyIKICAgXSwKICAgInN0ZXBfZm9nIjogWwogICAgImtlZW5fc3RlcF9mb2ciCiAgIF0sCiAgICJzdGVwX2Zvcm1hdGlvbiI6IFsKICAgICJrZWVuX3N0ZXBfZm9ybWF0aW9uIgogICBdLAogICAic3RlcF9pbnRlbCI6IFsKICAgICJrZWVuX3N0ZXBfaW50ZWwiCiAgIF0sCiAgICJzdGVwX21leCI6IFsKICAgICJrZWVuX3N0ZXBfbWV4IgogICBdLAogICAic3RlcF9vYmplY3RpdmUiOiBbCiAgICAia2Vlbl9zdGVwX29iamVjdGl2ZSIKICAgXSwKICAgInN0ZXBfcGlja3VwIjogWwogICAgImtlZW5fc3RlcF9waWNrdXAiCiAgIF0sCiAgICJzdGVwX3BsYXRvb24iOiBbCiAgICAia2Vlbl9zdGVwX3BsYXRvb24iCiAgIF0sCiAgICJzdGVwX3Bvd2VyIjogWwogICAgImtlZW5fc3RlcF9wb3dlciIKICAgXSwKICAgInN0ZXBfcXVldWUiOiBbCiAgICAia2Vlbl9zdGVwX3F1ZXVlIgogICBdLAogICAic3RlcF90ZWNoIjogWwogICAgImtlZW5fc3RlcF90ZWNoIgogICBdLAogICAic3RlcF90ZXJyaXRvcnkiOiBbCiAgICAia2Vlbl9zdGVwX3RlcnJpdG9yeSIKICAgXSwKICAgInN0ZXBfdHJhaW4iOiBbCiAgICAia2Vlbl9zdGVwX3RyYWluIgogICBdLAogICAic3RlcF90dXJyZXQiOiBbCiAgICAia2Vlbl9zdGVwX3R1cnJldCIKICAgXQogIH0sCiAgIm5vdmEiOiB7CiAgICJhYmlsaXR5IjogWwogICAgIm5vdmFfYWJpbGl0eV8wIiwKICAgICJub3ZhX2FiaWxpdHlfMSIsCiAgICAibm92YV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAibm92YV9hdHRhY2tfMCIsCiAgICAibm92YV9hdHRhY2tfMSIsCiAgICAibm92YV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgIm5vdmFfYnVpbGRfMCIsCiAgICAibm92YV9idWlsZF8xIiwKICAgICJub3ZhX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAibm92YV9kZXBsb3lfMCIsCiAgICAibm92YV9kZXBsb3lfMSIsCiAgICAibm92YV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAibm92YV9ob2xkXzAiLAogICAgIm5vdmFfaG9sZF8xIiwKICAgICJub3ZhX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAibm92YV9tb3ZlXzAiLAogICAgIm5vdmFfbW92ZV8xIiwKICAgICJub3ZhX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJub3ZhX3BhdHJvbF8wIiwKICAgICJub3ZhX3BhdHJvbF8xIiwKICAgICJub3ZhX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgIm5vdmFfc2VsZWN0XzAiLAogICAgIm5vdmFfc2VsZWN0XzEiLAogICAgIm5vdmFfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgIm5vdmFfc3RvcF8wIiwKICAgICJub3ZhX3N0b3BfMSIsCiAgICAibm92YV9zdG9wXzIiCiAgIF0KICB9LAogICJzeW5kaWNhdGUiOiB7CiAgICJhYmlsaXR5IjogWwogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzAiLAogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzEiLAogICAgInN5bmRpY2F0ZV9hYmlsaXR5XzIiCiAgIF0sCiAgICJhdHRhY2siOiBbCiAgICAic3luZGljYXRlX2F0dGFja18wIiwKICAgICJzeW5kaWNhdGVfYXR0YWNrXzEiLAogICAgInN5bmRpY2F0ZV9hdHRhY2tfMiIKICAgXSwKICAgImJ1aWxkIjogWwogICAgInN5bmRpY2F0ZV9idWlsZF8wIiwKICAgICJzeW5kaWNhdGVfYnVpbGRfMSIsCiAgICAic3luZGljYXRlX2J1aWxkXzIiCiAgIF0sCiAgICJkZXBsb3kiOiBbCiAgICAic3luZGljYXRlX2RlcGxveV8wIiwKICAgICJzeW5kaWNhdGVfZGVwbG95XzEiLAogICAgInN5bmRpY2F0ZV9kZXBsb3lfMiIKICAgXSwKICAgImhvbGQiOiBbCiAgICAic3luZGljYXRlX2hvbGRfMCIsCiAgICAic3luZGljYXRlX2hvbGRfMSIsCiAgICAic3luZGljYXRlX2hvbGRfMiIKICAgXSwKICAgIm1vdmUiOiBbCiAgICAic3luZGljYXRlX21vdmVfMCIsCiAgICAic3luZGljYXRlX21vdmVfMSIsCiAgICAic3luZGljYXRlX21vdmVfMiIKICAgXSwKICAgInBhdHJvbCI6IFsKICAgICJzeW5kaWNhdGVfcGF0cm9sXzAiLAogICAgInN5bmRpY2F0ZV9wYXRyb2xfMSIsCiAgICAic3luZGljYXRlX3BhdHJvbF8yIgogICBdLAogICAic2VsZWN0IjogWwogICAgInN5bmRpY2F0ZV9zZWxlY3RfMCIsCiAgICAic3luZGljYXRlX3NlbGVjdF8xIiwKICAgICJzeW5kaWNhdGVfc2VsZWN0XzIiCiAgIF0sCiAgICJzdG9wIjogWwogICAgInN5bmRpY2F0ZV9zdG9wXzAiLAogICAgInN5bmRpY2F0ZV9zdG9wXzEiLAogICAgInN5bmRpY2F0ZV9zdG9wXzIiCiAgIF0KICB9CiB9LAogInRha2VzIjogewogICJhc2NlbmRhbmN5X2FiaWxpdHlfMCI6IHsKICAgInNoYSI6ICI2YjdiMDMzNjViZTFhYzFjIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi45MzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NDMxLAogICAibTRhIjogMTYxMjQKICB9LAogICJhc2NlbmRhbmN5X2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICI3ZTIyNGEyYzJkMzc5YmRkIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wOTksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE2MTM1LAogICAibTRhIjogMTY5MzYKICB9LAogICJhc2NlbmRhbmN5X2FiaWxpdHlfMiI6IHsKICAgInNoYSI6ICI1MGUyOTk5YzEzMWUwZDYxIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wNTEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NzQzLAogICAibTRhIjogMTY3NTQKICB9LAogICJhc2NlbmRhbmN5X2F0dGFja18wIjogewogICAic2hhIjogImNhNjc4ZWU1YzJiMmZhNmIiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjAzNywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE0OTUsCiAgICJtNGEiOiAxMTUyOAogIH0sCiAgImFzY2VuZGFuY3lfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiOGE5YjVlYTY1MjM4NTdiNSIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1MzgyLAogICAibTRhIjogMTY1MzkKICB9LAogICJhc2NlbmRhbmN5X2F0dGFja18yIjogewogICAic2hhIjogIjkyZTE4MDY5Y2Q3YTFjMTciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg1OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUyNDEsCiAgICJtNGEiOiAxNTgyOQogIH0sCiAgImFzY2VuZGFuY3lfYnVpbGRfMCI6IHsKICAgInNoYSI6ICIzMzdmYjM1NzQyOGEwNGY4IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4xOTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE2MzA1LAogICAibTRhIjogMTc0OTUKICB9LAogICJhc2NlbmRhbmN5X2J1aWxkXzEiOiB7CiAgICJzaGEiOiAiY2NhNDUwMjhmY2M1YTAwMyIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMzk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNzU3MiwKICAgIm00YSI6IDE4NTIyCiAgfSwKICAiYXNjZW5kYW5jeV9idWlsZF8yIjogewogICAic2hhIjogImViZGExZjE4NjRkMWIzZTYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjY0MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ0MTgsCiAgICJtNGEiOiAxNDYzMAogIH0sCiAgImFzY2VuZGFuY3lfZGVwbG95XzAiOiB7CiAgICJzaGEiOiAiNGQwOTcyZGYzYTRhNTg0NyIsCiAgICJ2b2ljZSI6ICJibV9nZW9yZ2UiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDIyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTY0MywKICAgIm00YSI6IDE2NjEyCiAgfSwKICAiYXNjZW5kYW5jeV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICI1MTQzY2NkNmNjMjY2Yzc5IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi45MjMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NjIzLAogICAibTRhIjogMTYwNzAKICB9LAogICJhc2NlbmRhbmN5X2RlcGxveV8yIjogewogICAic2hhIjogIjVmMTJlZTdiMzZhYzI0YTMiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUyNzksCiAgICJtNGEiOiAxNTg4MwogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8wIjogewogICAic2hhIjogIjQyNDg2YzAxNzhkNGRkZDciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI2MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI3MjQsCiAgICJtNGEiOiAxMjcwOAogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8xIjogewogICAic2hhIjogImMzODMyNDdiZTgzZDU2M2IiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjgwMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ3NTIsCiAgICJtNGEiOiAxNTQyNQogIH0sCiAgImFzY2VuZGFuY3lfaG9sZF8yIjogewogICAic2hhIjogImY1MThiYjgzNTFmNGQwYjAiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjM5NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTMxODYsCiAgICJtNGEiOiAxMzQzMgogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8wIjogewogICAic2hhIjogIjllOGU3YmU2MzE5NzhiMWQiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjQ5NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM3MTAsCiAgICJtNGEiOiAxMzg2OAogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8xIjogewogICAic2hhIjogIjc0OTRiZWJhNTdjY2NmODkiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjc5OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ1ODksCiAgICJtNGEiOiAxNTM5MwogIH0sCiAgImFzY2VuZGFuY3lfbW92ZV8yIjogewogICAic2hhIjogIjFhNTMyOThjYWY1NTIzYmYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjYwNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAwNTUsCiAgICJtNGEiOiA5NDQ0CiAgfSwKICAiYXNjZW5kYW5jeV9wYXRyb2xfMCI6IHsKICAgInNoYSI6ICI3MzFmZDQ3NjZkMDU3ODc3IiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4zOTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNjA5LAogICAibTRhIjogMTM0MTYKICB9LAogICJhc2NlbmRhbmN5X3BhdHJvbF8xIjogewogICAic2hhIjogImNjOTBmYWE2MmU0YjVjNDEiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjA2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjAxNSwKICAgIm00YSI6IDExNjUyCiAgfSwKICAiYXNjZW5kYW5jeV9wYXRyb2xfMiI6IHsKICAgInNoYSI6ICJlMzVjNWVmNmQ2YTE4MTIwIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42MzEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0MDkyLAogICAibTRhIjogMTQ2NTgKICB9LAogICJhc2NlbmRhbmN5X3NlbGVjdF8wIjogewogICAic2hhIjogImNmZTJlZjVlYmYwNDljZWYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTcwMCwKICAgIm00YSI6IDE2MzkyCiAgfSwKICAiYXNjZW5kYW5jeV9zZWxlY3RfMSI6IHsKICAgInNoYSI6ICIwYWQwZTBhZjVhMDljNTUyIiwKICAgInZvaWNlIjogImJtX2dlb3JnZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42NjYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0Mjg5LAogICAibTRhIjogMTQ3MjkKICB9LAogICJhc2NlbmRhbmN5X3NlbGVjdF8yIjogewogICAic2hhIjogIjA4YzVjMTE3MTI5YjdhNDMiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjYyOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM5NjIsCiAgICJtNGEiOiAxNDY2NQogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8wIjogewogICAic2hhIjogImE5ZTQ2MTE4OWI3NGIwMjYiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjg1OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ5MjgsCiAgICJtNGEiOiAxNTg4NgogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8xIjogewogICAic2hhIjogImNmYWFmYzRiOGI3Y2MxZjciLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjIzNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTIzMTQsCiAgICJtNGEiOiAxMjU1NAogIH0sCiAgImFzY2VuZGFuY3lfc3RvcF8yIjogewogICAic2hhIjogImRlMWI1MWZiZDk3YjdkMzgiLAogICAidm9pY2UiOiAiYm1fZ2VvcmdlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjk3OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE2NTQsCiAgICJtNGEiOiAxMTMxNgogIH0sCiAgImhvcmRlX2FiaWxpdHlfMCI6IHsKICAgInNoYSI6ICI5MDBiZmQyNjFjZGZhMWE3IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjgyNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTUwNjEsCiAgICJtNGEiOiAxNTU4MAogIH0sCiAgImhvcmRlX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICJhNzZhZDI4OTdkMDAwMDE2IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAzLjE5NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTY3MzgsCiAgICJtNGEiOiAxNzQ3NQogIH0sCiAgImhvcmRlX2FiaWxpdHlfMiI6IHsKICAgInNoYSI6ICIyMjFlYjQ0MTU2MzY2NTIxIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjkwNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTU1MDYsCiAgICJtNGEiOiAxNjA3MQogIH0sCiAgImhvcmRlX2F0dGFja18wIjogewogICAic2hhIjogImQxM2U1ZWJiZmMwZTIwNDYiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzU0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDI4OCwKICAgIm00YSI6IDEwMjA0CiAgfSwKICAiaG9yZGVfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiNjgyOGQwMmY1NmJiNTFlZCIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wNjQsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NjYwLAogICAibTRhIjogMTY4NjYKICB9LAogICJob3JkZV9hdHRhY2tfMiI6IHsKICAgInNoYSI6ICI1NWJlNTYxZTg3Y2UwYTllIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjY4OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQzODMsCiAgICJtNGEiOiAxNDk2NQogIH0sCiAgImhvcmRlX2J1aWxkXzAiOiB7CiAgICJzaGEiOiAiODhmZjc1NjZlYzhkMjVkOSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi43ODMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE0Njg3LAogICAibTRhIjogMTU0NjMKICB9LAogICJob3JkZV9idWlsZF8xIjogewogICAic2hhIjogImJhMWRhN2Y0NDViN2VmNmMiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMjI4LAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiAxNjc0MywKICAgIm00YSI6IDE3NzYyCiAgfSwKICAiaG9yZGVfYnVpbGRfMiI6IHsKICAgInNoYSI6ICI3ZDM2MWQ0NzcyYzUxZGUzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjEyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQ2NCwKICAgIm00YSI6IDEyMDgzCiAgfSwKICAiaG9yZGVfZGVwbG95XzAiOiB7CiAgICJzaGEiOiAiMzc0ZmI4NDBkZjcxZmQwMiIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy4wMDUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1NTc4LAogICAibTRhIjogMTY2MDYKICB9LAogICJob3JkZV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICIwMGQxOThkZGYwMjg3ODdiIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjk2MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTU2NzEsCiAgICJtNGEiOiAxNjM0OQogIH0sCiAgImhvcmRlX2RlcGxveV8yIjogewogICAic2hhIjogIjM0YmFjMWI1MDNiMjBlN2UiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuMDE0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNTU1OSwKICAgIm00YSI6IDE2NTM1CiAgfSwKICAiaG9yZGVfaG9sZF8wIjogewogICAic2hhIjogIjk2YTYxNDU3Y2UyYjNjNDYiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExMDYzLAogICAibTRhIjogMTA2NjUKICB9LAogICJob3JkZV9ob2xkXzEiOiB7CiAgICJzaGEiOiAiOTkwODU1OGI2MWI4NDBjNyIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi42MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM5ODMsCiAgICJtNGEiOiAxNDY3NAogIH0sCiAgImhvcmRlX2hvbGRfMiI6IHsKICAgInNoYSI6ICJkMDkwMDU3NTkwZGU1M2QzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjg4MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTExNjQsCiAgICJtNGEiOiAxMDg2MAogIH0sCiAgImhvcmRlX21vdmVfMCI6IHsKICAgInNoYSI6ICJhNTdjNjhkOTkzMTQ1NDU3IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI3NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5MTcsCiAgICJtNGEiOiAxMjgwMAogIH0sCiAgImhvcmRlX21vdmVfMSI6IHsKICAgInNoYSI6ICJkODI3YzFjOWY5ZTkyMDA4IiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI4MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1MDUsCiAgICJtNGEiOiAxMjg1OQogIH0sCiAgImhvcmRlX21vdmVfMiI6IHsKICAgInNoYSI6ICI1NzNhMWU1NWYwZDUyMzAzIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjMwOCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogOTAwOSwKICAgIm00YSI6IDc3MTgKICB9LAogICJob3JkZV9wYXRyb2xfMCI6IHsKICAgInNoYSI6ICJhZjYwODc5NDExZDRlMTRjIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjEzOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1OTgsCiAgICJtNGEiOiAxMjE0NAogIH0sCiAgImhvcmRlX3BhdHJvbF8xIjogewogICAic2hhIjogImY4ZjliMDUzZWVhY2I3MmIiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzU3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDg0MCwKICAgIm00YSI6IDEwMTc5CiAgfSwKICAiaG9yZGVfcGF0cm9sXzIiOiB7CiAgICJzaGEiOiAiMmQ1YWI3M2M4MGE1ZjFjZiIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi40ODksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNjgxLAogICAibTRhIjogMTM4NzgKICB9LAogICJob3JkZV9zZWxlY3RfMCI6IHsKICAgInNoYSI6ICI0ZGRmMjFjMDc0YjRkZDRiIiwKICAgInZvaWNlIjogImJtX2ZhYmxlIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjc2NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTQ3MDIsCiAgICJtNGEiOiAxNTM0MQogIH0sCiAgImhvcmRlX3NlbGVjdF8xIjogewogICAic2hhIjogImM2MDNlYTQzN2Y1ZDY2ZTIiLAogICAidm9pY2UiOiAiYm1fZmFibGUiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTgzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQ5MCwKICAgIm00YSI6IDEyMzg0CiAgfSwKICAiaG9yZGVfc2VsZWN0XzIiOiB7CiAgICJzaGEiOiAiNzIxOTQ0YjAwNGQ2N2VhMSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi40NjksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzMTc0LAogICAibTRhIjogMTM3NTYKICB9LAogICJob3JkZV9zdG9wXzAiOiB7CiAgICJzaGEiOiAiZWZmNTAzMGIzNGQzM2MxZSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi41NzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNzcyLAogICAibTRhIjogMTQ0MjkKICB9LAogICJob3JkZV9zdG9wXzEiOiB7CiAgICJzaGEiOiAiYzI4MTFmMWYyNThjZGZhOSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS44MTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwODE0LAogICAibTRhIjogMTA0NzYKICB9LAogICJob3JkZV9zdG9wXzIiOiB7CiAgICJzaGEiOiAiNDMxMWM4ODc2NTQyMTBjMSIsCiAgICJ2b2ljZSI6ICJibV9mYWJsZSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS44MTQsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwOTg4LAogICAibTRhIjogMTA0MTgKICB9LAogICJrZWVuX2RvbmVfYWJpbGl0eSI6IHsKICAgInNoYSI6ICI5OGU5ZDdkMjc4MWY3NDI3IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1Ljk2NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjczNTMsCiAgICJtNGEiOiAzMDEzMwogIH0sCiAgImtlZW5fZG9uZV9hdHRhY2siOiB7CiAgICJzaGEiOiAiNmJmZmYyOGU3YjIyYzFjMiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS41MjksCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI1MzgzLAogICAibTRhIjogMjgxNDMKICB9LAogICJrZWVuX2RvbmVfY2FtZXJhIjogewogICAic2hhIjogImRhNDc5OGQ4YmU3NGU4N2EiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDUuMzM1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAyNDgwMCwKICAgIm00YSI6IDI3MzA1CiAgfSwKICAia2Vlbl9kb25lX2Nsb3VkIjogewogICAic2hhIjogIjQzODMwZTAyNzkwNmRiZjAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDY3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3NywKICAgIm00YSI6IDExNzU2CiAgfSwKICAia2Vlbl9kb25lX2NvbW1hbmRlciI6IHsKICAgInNoYSI6ICIzMTczMTgyM2UzYWUxMDljIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1Ljc5OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjYyNjcsCiAgICJtNGEiOiAyOTQ2NAogIH0sCiAgImtlZW5fZG9uZV9kZXBsb3kiOiB7CiAgICJzaGEiOiAiYTg1MDRjZWU3YWM1N2IzMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMy44NjIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE5MTAxLAogICAibTRhIjogMjA2NzYKICB9LAogICJrZWVuX2RvbmVfZmFjIjogewogICAic2hhIjogImZmYmQ1MGIxMTkwOGU0ZDgiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDMuODkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxOTE3MCwKICAgIm00YSI6IDIwODc2CiAgfSwKICAia2Vlbl9kb25lX2ZvZyI6IHsKICAgInNoYSI6ICIzZTkyZDI2NTQzNmYxYzFhIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2Ljk2NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzEzOTcsCiAgICJtNGEiOiAzNDg1NAogIH0sCiAgImtlZW5fZG9uZV9mb3JtYXRpb24iOiB7CiAgICJzaGEiOiAiYWE4ZjA4ZDBmMzYwNzlmMCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4yNTgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI0Nzc3LAogICAibTRhIjogMjcyMjkKICB9LAogICJrZWVuX2RvbmVfaW50ZWwiOiB7CiAgICJzaGEiOiAiNGM4ODhkNmMzOWZkYTI5MiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTEuNDY4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0ODE3MSwKICAgIm00YSI6IDU1OTAyCiAgfSwKICAia2Vlbl9kb25lX21leCI6IHsKICAgInNoYSI6ICJmNjgzZmZkNDNlNzlmZDAxIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAzLjU0NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTgxODIsCiAgICJtNGEiOiAxOTE1MwogIH0sCiAgImtlZW5fZG9uZV9vYmplY3RpdmUiOiB7CiAgICJzaGEiOiAiNDdmODZjMDY1Y2FmYTk1NCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNy4zNTgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDMyODc3LAogICAibTRhIjogMzcwNjQKICB9LAogICJrZWVuX2RvbmVfcGlja3VwIjogewogICAic2hhIjogIjNmYjY0ZWU0ZWQwYmI2OGMiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDYuOTYyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMDg4MywKICAgIm00YSI6IDM0ODUyCiAgfSwKICAia2Vlbl9kb25lX3BsYXRvb24iOiB7CiAgICJzaGEiOiAiZTVhNzQxMWQwOTBkNzExZCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMTIsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNDI2LAogICAibTRhIjogMjU2OTEKICB9LAogICJrZWVuX2RvbmVfcG93ZXIiOiB7CiAgICJzaGEiOiAiYTVlNTk1MDQ4OTgxN2I0YyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMjEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNjk1LAogICAibTRhIjogMjYyMzMKICB9LAogICJrZWVuX2RvbmVfcXVldWUiOiB7CiAgICJzaGEiOiAiMDU0NTYxOWZkNmFiYzU0ZiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS4wMDEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDIzNDIyLAogICAibTRhIjogMjU2MjMKICB9LAogICJrZWVuX2RvbmVfdGVjaCI6IHsKICAgInNoYSI6ICI5YzIwNTNkODA2YmYwMDYyIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjYyNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjU4OTUsCiAgICJtNGEiOiAyODcwNgogIH0sCiAgImtlZW5fZG9uZV90ZXJyaXRvcnkiOiB7CiAgICJzaGEiOiAiN2FjOWM2ZmVjN2I1ODZlOCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi44NzEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDE1MzQ0LAogICAibTRhIjogMTU4MzEKICB9LAogICJrZWVuX2RvbmVfdHJhaW4iOiB7CiAgICJzaGEiOiAiYjFlNTAyNTI4ZDc2NTZiMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNi42OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjkyMTQsCiAgICJtNGEiOiAzMzQ5NwogIH0sCiAgImtlZW5fZG9uZV90dXJyZXQiOiB7CiAgICJzaGEiOiAiYmIyNWNiMTI0NmIzMzg3YiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTQuNTYyLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA1OTE0NSwKICAgIm00YSI6IDcxMTQ1CiAgfSwKICAia2Vlbl9ncmFkdWF0aW9uIjogewogICAic2hhIjogImU5ZDJkNGU5ZjY2MDFhMDAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEyLjA5NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNTA5MTAsCiAgICJtNGEiOiA1OTAwOQogIH0sCiAgImtlZW5fZ3JlZXRpbmciOiB7CiAgICJzaGEiOiAiM2YyZGQ2M2JjMmExYjQ3NiIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTIuMTIzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA1MDA5OSwKICAgIm00YSI6IDU4ODIwCiAgfSwKICAia2Vlbl9yZWFjdF9iYXNlX2F0dGFjazAiOiB7CiAgICJzaGEiOiAiNjdhY2M5NWI5MzliMWQxZSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS40MTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI1NDAwLAogICAibTRhIjogMjc5OTUKICB9LAogICJrZWVuX3JlYWN0X2Jhc2VfYXR0YWNrMSI6IHsKICAgInNoYSI6ICI2MDk3YWVhZmUwNGM0MDdhIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjA0NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTk4OTIsCiAgICJtNGEiOiAyMTM3NQogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2NyYXRlciI6IHsKICAgInNoYSI6ICIzOTE3ZDBhODlkZGExMzMwIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjgyMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjM1NTcsCiAgICJtNGEiOiAyNTIwNwogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2RlZmF1bHQiOiB7CiAgICJzaGEiOiAiNThhMDNmODJkYjQ5OTM5NSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS43NzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI2MjM5LAogICAibTRhIjogMjkzNzMKICB9LAogICJrZWVuX3JlYWN0X2hhemFyZF9oaWdobGFuZCI6IHsKICAgInNoYSI6ICJiMTBmNTUxYjFmYmM2NjA1IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjM4NCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjA4ODUsCiAgICJtNGEiOiAyMzA0NQogIH0sCiAgImtlZW5fcmVhY3RfaGF6YXJkX2lzbGVzIjogewogICAic2hhIjogImVlM2Q1ZGQ5ZGYxNDgzNjYiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDQuNjIzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAyMjM4NywKICAgIm00YSI6IDI0MDE1CiAgfSwKICAia2Vlbl9yZWFjdF9oYXphcmRfdmFuZ3VhcmQiOiB7CiAgICJzaGEiOiAiNzY1OGRkMTFiNmZkZDdmMyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNS41OTMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDI2MDE2LAogICAibTRhIjogMjg3NjIKICB9LAogICJrZWVuX3JlYWN0X2xvd19wb3dlciI6IHsKICAgInNoYSI6ICJlZGE4M2E5ZDBhMmU3NTEzIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0LjEzOCwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogMjAyNDIsCiAgICJtNGEiOiAyMjAxOAogIH0sCiAgImtlZW5fcmVhY3RfdW5pdF9sb3N0MCI6IHsKICAgInNoYSI6ICIzMGU4NmQzODFhMzk5NzY3IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjI1MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjQ4NTIsCiAgICJtNGEiOiAyNzAyMAogIH0sCiAgImtlZW5fcmVhY3RfdW5pdF9sb3N0MSI6IHsKICAgInNoYSI6ICIxYmEzMzE2MjM4YTVlYWNjIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA0Ljk2NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjMzMzksCiAgICJtNGEiOiAyNTg0NAogIH0sCiAgImtlZW5fcmVhY3Rfd2F2ZSI6IHsKICAgInNoYSI6ICIyNjQzMGVmMTU4YjA4M2ViIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2LjI5NSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjc3MjIsCiAgICJtNGEiOiAzMTk3MAogIH0sCiAgImtlZW5fc2tpcCI6IHsKICAgInNoYSI6ICIzNjMwOWJhN2EwNDk4MTc2IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA1LjMxNSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjQ5NjgsCiAgICJtNGEiOiAyNzI4NwogIH0sCiAgImtlZW5fc3RlcF9hYmlsaXR5IjogewogICAic2hhIjogIjQ1Yzg1OTdmZjEwNWJkNDAiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDguNjg1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzNzc2NywKICAgIm00YSI6IDQyODI4CiAgfSwKICAia2Vlbl9zdGVwX2F0dGFjayI6IHsKICAgInNoYSI6ICI4ZmNkYTA5YTViZGQwNDkwIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxNi43NTcsCiAgICJwZWFrIjogLTAuNiwKICAgIm9nZyI6IDY4Njc4LAogICAibTRhIjogODEzNzEKICB9LAogICJrZWVuX3N0ZXBfY2FtZXJhIjogewogICAic2hhIjogIjE5MGRkNTM1MWEzOWI5MTIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDkuNDE2LAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA0MDE2NSwKICAgIm00YSI6IDQ2NDk5CiAgfSwKICAia2Vlbl9zdGVwX2Nsb3VkIjogewogICAic2hhIjogIjVhM2ExMTYxNTcxYzAyZjUiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEyLjI0NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNTEzNjMsCiAgICJtNGEiOiA1OTg3OAogIH0sCiAgImtlZW5fc3RlcF9jb21tYW5kZXIiOiB7CiAgICJzaGEiOiAiNjQ2OGI2NTIwMzg3ZjRiMCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogNy40NTUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDMzNDQ4LAogICAibTRhIjogMzcyMTcKICB9LAogICJrZWVuX3N0ZXBfZGVwbG95IjogewogICAic2hhIjogIjRlMmQ3MWNhN2I2NDJjNjIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDYuODkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMDE2MiwKICAgIm00YSI6IDM0ODQ5CiAgfSwKICAia2Vlbl9zdGVwX2ZhYyI6IHsKICAgInNoYSI6ICIwNGNhMjMwMjY2ZDE2Y2UyIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA4LjQ4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzNzMzMiwKICAgIm00YSI6IDQyMDc2CiAgfSwKICAia2Vlbl9zdGVwX2ZvZyI6IHsKICAgInNoYSI6ICIxNjI3MzQyNzQ4Y2MyMmVkIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA5LjI0MywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzk2NzgsCiAgICJtNGEiOiA0NTgwMAogIH0sCiAgImtlZW5fc3RlcF9mb3JtYXRpb24iOiB7CiAgICJzaGEiOiAiNzBlMjllMWJmZmYxMmIwNCIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogOC4wODUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDM1MTgwLAogICAibTRhIjogNDAyMzQKICB9LAogICJrZWVuX3N0ZXBfaW50ZWwiOiB7CiAgICJzaGEiOiAiNjc0Mzk1M2U2ZTg4YmMyYyIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTcuNjUyLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiA3MTMwOCwKICAgIm00YSI6IDg0ODIwCiAgfSwKICAia2Vlbl9zdGVwX21leCI6IHsKICAgInNoYSI6ICIyN2FlMDI1N2NmMTg2ZWJlIiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA5Ljk4NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNDI4NzMsCiAgICJtNGEiOiA0OTU0MAogIH0sCiAgImtlZW5fc3RlcF9vYmplY3RpdmUiOiB7CiAgICJzaGEiOiAiZDg1YTY5MDg5N2JkYjM4ZSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTEuNjQ0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0ODk0NiwKICAgIm00YSI6IDU3MDE1CiAgfSwKICAia2Vlbl9zdGVwX3BpY2t1cCI6IHsKICAgInNoYSI6ICJmMjI2ODY5MjBhNTkyNTU5IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA4LjU5MiwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogMzc4NjIsCiAgICJtNGEiOiA0MjU2NwogIH0sCiAgImtlZW5fc3RlcF9wbGF0b29uIjogewogICAic2hhIjogImE4NjdhMGU4ZTA3NDFhMTIiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDkuODExLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA0MTY2MSwKICAgIm00YSI6IDQ4NTg1CiAgfSwKICAia2Vlbl9zdGVwX3Bvd2VyIjogewogICAic2hhIjogIjY2NWY3YWVlZjNiNTMxY2MiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEwLjE2NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogNDM3NjAsCiAgICJtNGEiOiA1MDI3OQogIH0sCiAgImtlZW5fc3RlcF9xdWV1ZSI6IHsKICAgInNoYSI6ICI4Zjg4MDE5MWRlYTE4YTk5IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA2Ljc1MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMjk4MTQsCiAgICJtNGEiOiAzMzgzOQogIH0sCiAgImtlZW5fc3RlcF90ZWNoIjogewogICAic2hhIjogIjM3MWYzZDU5NDA4MzNhNGYiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEwLjA2NiwKICAgInBlYWsiOiAtMC42LAogICAib2dnIjogNDM3MzIsCiAgICJtNGEiOiA0OTY4OQogIH0sCiAgImtlZW5fc3RlcF90ZXJyaXRvcnkiOiB7CiAgICJzaGEiOiAiOWJmYjVmMzlhNjliMGQzMSIsCiAgICJ2b2ljZSI6ICJhZl9oZWFydCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMTIuMTMzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA1MDk0OCwKICAgIm00YSI6IDU5NDM5CiAgfSwKICAia2Vlbl9zdGVwX3RyYWluIjogewogICAic2hhIjogImJjMjg0MDgwNjc4NjBiY2UiLAogICAidm9pY2UiOiAiYWZfaGVhcnQiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDcuMzc0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAzMjkwMSwKICAgIm00YSI6IDM2ODcxCiAgfSwKICAia2Vlbl9zdGVwX3R1cnJldCI6IHsKICAgInNoYSI6ICIzYTNkZjk1ZDZjMzdkODM4IiwKICAgInZvaWNlIjogImFmX2hlYXJ0IiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiA3Ljc4MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMzM5MjAsCiAgICJtNGEiOiAzODY5NQogIH0sCiAgIm5vdmFfYWJpbGl0eV8wIjogewogICAic2hhIjogIjUzNzcwZmZmYTUzZWM4NDgiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4xNzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyNDM3LAogICAibTRhIjogMTIyMzgKICB9LAogICJub3ZhX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICIxZTFkMjg4YzZmNWNjZTE0IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuNTc0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxNDQ0NywKICAgIm00YSI6IDE0MjY1CiAgfSwKICAibm92YV9hYmlsaXR5XzIiOiB7CiAgICJzaGEiOiAiMWE3YmMwZThhYWJjOTVjYSIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjY4OSwKICAgIm00YSI6IDEyODI3CiAgfSwKICAibm92YV9hdHRhY2tfMCI6IHsKICAgInNoYSI6ICJhMzJmMmZmNTIxN2M3ZWFhIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNjM0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA5ODI0LAogICAibTRhIjogOTQ5MgogIH0sCiAgIm5vdmFfYXR0YWNrXzEiOiB7CiAgICJzaGEiOiAiMWUxYWM2NWQ4MzBiNjUxZCIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjMwOCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5NTcsCiAgICJtNGEiOiAxMjk0MwogIH0sCiAgIm5vdmFfYXR0YWNrXzIiOiB7CiAgICJzaGEiOiAiYWU3MTQ0M2Q1YTM5MTZhNiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjIzNiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI3OTAsCiAgICJtNGEiOiAxMjU5MAogIH0sCiAgIm5vdmFfYnVpbGRfMCI6IHsKICAgInNoYSI6ICI2NjQyZjg2MzNjOTdjYzQ3IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuNDYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEzNDU2LAogICAibTRhIjogMTM3MDIKICB9LAogICJub3ZhX2J1aWxkXzEiOiB7CiAgICJzaGEiOiAiMDQ2MTA5YTg4N2Y4ZjcxNyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjQxOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTM3NzEsCiAgICJtNGEiOiAxMzUwMwogIH0sCiAgIm5vdmFfYnVpbGRfMiI6IHsKICAgInNoYSI6ICJiODY5ZGJkYWI0M2JkNjkyIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTkxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTk5NywKICAgIm00YSI6IDExMzk5CiAgfSwKICAibm92YV9kZXBsb3lfMCI6IHsKICAgInNoYSI6ICI2NDliYjMyMjkyMTZmNDY0IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMjg0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjc0NCwKICAgIm00YSI6IDEyODM2CiAgfSwKICAibm92YV9kZXBsb3lfMSI6IHsKICAgInNoYSI6ICI2YWVhYWVjZGMwNzBjMGVkIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTczLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjQyNywKICAgIm00YSI6IDEyMjY5CiAgfSwKICAibm92YV9kZXBsb3lfMiI6IHsKICAgInNoYSI6ICI2NGRiODcwOTE1NzBlYWRiIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTQ5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjM0NywKICAgIm00YSI6IDEyMTQyCiAgfSwKICAibm92YV9ob2xkXzAiOiB7CiAgICJzaGEiOiAiNjcyMTJkYzY5NDU4ODkzNiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjkxNCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEzOTcsCiAgICJtNGEiOiAxMDkxMQogIH0sCiAgIm5vdmFfaG9sZF8xIjogewogICAic2hhIjogIjhkMDQyYzE4NzkxZDlhNTIiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4xNDEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyMDgxLAogICAibTRhIjogMTIwNTUKICB9LAogICJub3ZhX2hvbGRfMiI6IHsKICAgInNoYSI6ICJhYjdkMDA1NGQ4NWQ2NDJmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODc4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTEwMSwKICAgIm00YSI6IDEwODY4CiAgfSwKICAibm92YV9tb3ZlXzAiOiB7CiAgICJzaGEiOiAiNDNiMTNiYjVmMWEyY2MyYiIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjgxOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEwNjEsCiAgICJtNGEiOiAxMDQyOAogIH0sCiAgIm5vdmFfbW92ZV8xIjogewogICAic2hhIjogIjNiZjJmYzU5MDgzYjAzYjQiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wMzYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExODc1LAogICAibTRhIjogMTE1NzcKICB9LAogICJub3ZhX21vdmVfMiI6IHsKICAgInNoYSI6ICIxYzNhNGNlZWU0M2Y4MTJjIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuMzkyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiA5MjAzLAogICAibTRhIjogODIwMQogIH0sCiAgIm5vdmFfcGF0cm9sXzAiOiB7CiAgICJzaGEiOiAiMGIxMzY1NmY5ZGU2YTRkYSIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjkzOSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE1NDksCiAgICJtNGEiOiAxMTA3OQogIH0sCiAgIm5vdmFfcGF0cm9sXzEiOiB7CiAgICJzaGEiOiAiNDc0YzJjZDFhYzZjODQwMyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjYzNiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAyNjksCiAgICJtNGEiOiA5NTEwCiAgfSwKICAibm92YV9wYXRyb2xfMiI6IHsKICAgInNoYSI6ICI4NGFmMWYyNWQwZTEwMWNmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDk5LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3MSwKICAgIm00YSI6IDExOTM5CiAgfSwKICAibm92YV9zZWxlY3RfMCI6IHsKICAgInNoYSI6ICIzZTdmMWFkZmQ0NWJmZDk5IiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDkzLAogICAicGVhayI6IC0wLjYsCiAgICJvZ2ciOiAxMjAyMiwKICAgIm00YSI6IDExODI4CiAgfSwKICAibm92YV9zZWxlY3RfMSI6IHsKICAgInNoYSI6ICI0NDFhNjJjOTE4NGIzYjhkIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDcyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjEyMCwKICAgIm00YSI6IDExODA5CiAgfSwKICAibm92YV9zZWxlY3RfMiI6IHsKICAgInNoYSI6ICJjZjU4YjJlM2E2OTA0NzNmIiwKICAgInZvaWNlIjogImFtX21pY2hhZWwiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDQzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTQ0MywKICAgIm00YSI6IDExNTQ4CiAgfSwKICAibm92YV9zdG9wXzAiOiB7CiAgICJzaGEiOiAiYmMwOTdhN2UyZmI5MjQ1YyIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjE4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTIyMzAsCiAgICJtNGEiOiAxMjI4MQogIH0sCiAgIm5vdmFfc3RvcF8xIjogewogICAic2hhIjogIjJmYzIxMWVmMzUyYWVlNmYiLAogICAidm9pY2UiOiAiYW1fbWljaGFlbCIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS42NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAxMjMsCiAgICJtNGEiOiA5NTk5CiAgfSwKICAibm92YV9zdG9wXzIiOiB7CiAgICJzaGEiOiAiYmI0MTNlOTJmNjA4YmQxZCIsCiAgICJ2b2ljZSI6ICJhbV9taWNoYWVsIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjY2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDIyMSwKICAgIm00YSI6IDk2NTgKICB9LAogICJzeW5kaWNhdGVfYWJpbGl0eV8wIjogewogICAic2hhIjogImNjMzE1OWJiMDdiNjQ5YzkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDAxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTU5NSwKICAgIm00YSI6IDExNDAwCiAgfSwKICAic3luZGljYXRlX2FiaWxpdHlfMSI6IHsKICAgInNoYSI6ICIzMzJhZmEwMWQ5ZmU3MzU5IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjI5NiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI5NDIsCiAgICJtNGEiOiAxMzA2OQogIH0sCiAgInN5bmRpY2F0ZV9hYmlsaXR5XzIiOiB7CiAgICJzaGEiOiAiZDJjZmZiZTYxM2E1MzhhOSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wMzUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExODc5LAogICAibTRhIjogMTE2MTUKICB9LAogICJzeW5kaWNhdGVfYXR0YWNrXzAiOiB7CiAgICJzaGEiOiAiMWJiMGYyOWJiZTA1MGRiZCIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS41MDUsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDkzMDAsCiAgICJtNGEiOiA4Nzc5CiAgfSwKICAic3luZGljYXRlX2F0dGFja18xIjogewogICAic2hhIjogIjA1NDlmNzc2ZmFlZDQ2YTkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTgzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjM5MCwKICAgIm00YSI6IDEyMzU3CiAgfSwKICAic3luZGljYXRlX2F0dGFja18yIjogewogICAic2hhIjogIjQzYTNhMjg0YTZkYjY4ZDIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMDYxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA4OCwKICAgIm00YSI6IDExNjU2CiAgfSwKICAic3luZGljYXRlX2J1aWxkXzAiOiB7CiAgICJzaGEiOiAiMGIyOWU2YmU1ZGRjZDQ3OSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMi4wOTYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEyMDEwLAogICAibTRhIjogMTE4OTYKICB9LAogICJzeW5kaWNhdGVfYnVpbGRfMSI6IHsKICAgInNoYSI6ICI2YjNiMDBkZWQxMWEwODE5IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjE4NywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTI1OTksCiAgICJtNGEiOiAxMjQwOAogIH0sCiAgInN5bmRpY2F0ZV9idWlsZF8yIjogewogICAic2hhIjogIjFjNDUzZTQyM2QyMWZiZTMiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzY2LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDgxNywKICAgIm00YSI6IDEwMjA0CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8wIjogewogICAic2hhIjogIjBhNWFlMTczNGFlNmQ5MTgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDIuMTE3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMjA3NiwKICAgIm00YSI6IDEyMDQ1CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8xIjogewogICAic2hhIjogIjM0Y2QxYTM4NTZhYmEwMjkiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTg0LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTg0NSwKICAgIm00YSI6IDExMzM5CiAgfSwKICAic3luZGljYXRlX2RlcGxveV8yIjogewogICAic2hhIjogIjFhMWQ3Zjk0NDRiZTg5NjgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTYsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDExNTc2LAogICAibTRhIjogMTEyMTMKICB9LAogICJzeW5kaWNhdGVfaG9sZF8wIjogewogICAic2hhIjogIjIyMDgzMGU5NTIxMzk5ODgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNjU3LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDIxNiwKICAgIm00YSI6IDk2NTQKICB9LAogICJzeW5kaWNhdGVfaG9sZF8xIjogewogICAic2hhIjogIjFkZTBjMzgwNzhiYjJmN2EiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTUyLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTQzMSwKICAgIm00YSI6IDExMTMyCiAgfSwKICAic3luZGljYXRlX2hvbGRfMiI6IHsKICAgInNoYSI6ICI5ZDE1NDk1NjFiN2JiZWY4IiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjcxMywKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTA0MjIsCiAgICJtNGEiOiA5OTczCiAgfSwKICAic3luZGljYXRlX21vdmVfMCI6IHsKICAgInNoYSI6ICI4MmU1OTY0MWY1Zjk4ZWVmIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjY1MiwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTAxNzgsCiAgICJtNGEiOiA5NzA1CiAgfSwKICAic3luZGljYXRlX21vdmVfMSI6IHsKICAgInNoYSI6ICI4MThmMjNiNzYzMjUxZGJkIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjg3OCwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTEwMjAsCiAgICJtNGEiOiAxMDg0MQogIH0sCiAgInN5bmRpY2F0ZV9tb3ZlXzIiOiB7CiAgICJzaGEiOiAiNDM3YWVmMmNlM2Q4YjhjZSIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS4zMjMsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDg5MDAsCiAgICJtNGEiOiA4MDA2CiAgfSwKICAic3luZGljYXRlX3BhdHJvbF8wIjogewogICAic2hhIjogIjU1ZTJkMzg1YWY4ZTRmYzIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzcsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDEwNzU0LAogICAibTRhIjogMTAyMzAKICB9LAogICJzeW5kaWNhdGVfcGF0cm9sXzEiOiB7CiAgICJzaGEiOiAiNjI3MGI4OWNlNGUxMTU3MiIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS40MzgsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDkyODMsCiAgICJtNGEiOiA4NDg0CiAgfSwKICAic3luZGljYXRlX3BhdHJvbF8yIjogewogICAic2hhIjogIjJkM2Y0MGFjNzk1OGQzOGYiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuODgxLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTAyMiwKICAgIm00YSI6IDEwODcwCiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8wIjogewogICAic2hhIjogIjhjYmU4ODUyNmU4MGM1MTIiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuOTE1LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMTM1MCwKICAgIm00YSI6IDEwOTM1CiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8xIjogewogICAic2hhIjogImYxMTg4ZTRhYzg1NzJhODgiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzQzLAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDU2MiwKICAgIm00YSI6IDEwMTAxCiAgfSwKICAic3luZGljYXRlX3NlbGVjdF8yIjogewogICAic2hhIjogIjhkMjg1OWY0NGE2ZjRkMTAiLAogICAidm9pY2UiOiAiYWZfYmVsbGEiLAogICAiY2hhaW4iOiAia29rb3JvLWNvbW1zLTEiLAogICAic2Vjb25kcyI6IDEuNzQ4LAogICAicGVhayI6IC0wLjcsCiAgICJvZ2ciOiAxMDM3MSwKICAgIm00YSI6IDEwMTQzCiAgfSwKICAic3luZGljYXRlX3N0b3BfMCI6IHsKICAgInNoYSI6ICJiNzcxYzUzZmZhYTgxOWIwIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAyLjA2OSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogMTE4MDQsCiAgICJtNGEiOiAxMTc4MgogIH0sCiAgInN5bmRpY2F0ZV9zdG9wXzEiOiB7CiAgICJzaGEiOiAiMDdhN2E4YzlkNmZlYzZmOCIsCiAgICJ2b2ljZSI6ICJhZl9iZWxsYSIsCiAgICJjaGFpbiI6ICJrb2tvcm8tY29tbXMtMSIsCiAgICJzZWNvbmRzIjogMS40OTEsCiAgICJwZWFrIjogLTAuNywKICAgIm9nZyI6IDk1NjEsCiAgICJtNGEiOiA4NzcxCiAgfSwKICAic3luZGljYXRlX3N0b3BfMiI6IHsKICAgInNoYSI6ICI4ZTdiYWE5YzY0YjA2NzEwIiwKICAgInZvaWNlIjogImFmX2JlbGxhIiwKICAgImNoYWluIjogImtva29yby1jb21tcy0xIiwKICAgInNlY29uZHMiOiAxLjQ4MSwKICAgInBlYWsiOiAtMC43LAogICAib2dnIjogOTI5MiwKICAgIm00YSI6IDg3NzYKICB9CiB9Cn0K', {cache:'no-store'});
    if(!r.ok) return;
    const j = await r.json();
    if(!j || !j.lines) return;
    VOICE_BANK = j;
    for(const fac in j.lines){
      /* horde_* takes are Kokoro bm_fable — a person. Brood command audio is
         layered creature SFX (audBroodCue), so these must never become slots. */
      if(fac==='horde') continue;
      for(const action in j.lines[fac]){
        const slot = 'vo_' + fac + '_' + action;
        AUD_MAP[slot] = j.lines[fac][action].map(stem => 'voice/' + stem);
        /* Speech is the most information-dense thing in the mix and there are at
           most two of it (see audVoiceChannel). Priority 1 put it at the bottom
           of audMakeRoom's eviction order, so the moment a firefight filled the
           22-voice pool the tutorial narration was the first thing thrown out. */
        AUD_MIX[slot] = { g: 0.9, gap: 1200, p: 5 };
        AUD_CLEAR.add(slot);
        AUD_DUCK.add(slot);
      }
    }
  }catch(e){ VOICE_BANK = null; }
}
/* Voice-bank speaker keys are nova / ascendancy / syndicate / horde / keen.
   Runtime and UI ids are nova / legion / dominion / brood. Mapping here means
   every caller can pass whatever the rest of the game uses. */
const VO_BANK_ALIAS={
  nova:'nova',terran:'nova',frontline:'nova',federation:'nova',
  ascendancy:'ascendancy',legion:'ascendancy',dominion:'ascendancy',
  syndicate:'syndicate',coalition:'syndicate',
  horde:'horde',brood:'horde',swarm:'horde',infestation:'horde',
  keen:'keen'
};
/* Pack has no dedicated retreat/underfire/victory/defeat takes. Alias onto the
   closest existing radio category rather than inventing a second VO library. */
const VO_ACTION_ALIAS={retreat:'stop',underfire:'attack',victory:'ability',defeat:'hold',guard:'hold'};
function voBankFac(fac){
  const raw=String(fac||'').toLowerCase();
  if(VO_BANK_ALIAS[raw]) return VO_BANK_ALIAS[raw];
  /* Commander speaker keys are `cmdr_<commanderId>` and are self-mapping: adding
     a commander must be a VOICE BANK data change, never an edit to this table.
     Tested before facArt on purpose, so an id like `cmdr_nova_kai` cannot be
     collapsed onto the shared `nova` unit-radio speaker. */
  if(raw.lastIndexOf('cmdr_',0)===0 && /^cmdr_[a-z0-9_]+$/.test(raw)) return raw;
  if(typeof facArtKey==='function'){
    const a=facArtKey(fac);
    if(a&&VO_BANK_ALIAS[a]) return VO_BANK_ALIAS[a];
  }
  if(typeof facArt==='function'){
    const A=facArt(fac);
    if(A&&A.id&&VO_BANK_ALIAS[A.id]) return VO_BANK_ALIAS[A.id];
    if(A&&A.id) return A.id;
  }
  return raw||'nova';
}
function voIsBrood(fac){ return voBankFac(fac)==='horde'; }
function voActionKey(action){ return VO_ACTION_ALIAS[action]||action; }
const BROOD_SFX_SLOTS=['cre_idle','cre_attack','cre_pain','cre_death','move_brood'];
function voBroodWarm(){
  if(typeof AC==='undefined'||!AC) return;
  for(const s of BROOD_SFX_SLOTS)
    audMapList(s).forEach(f=>{ if(!AUD.buf[f]) audLoad(f); });
}
/* True if the MANIFEST carries a take for this line, decoded or not. Separate
   from voReady on purpose: "is there a recording of this" and "can it start on
   this exact millisecond" are different questions, and answering the first with
   the second is what made every caller conclude there was no voice at all
   during the whole of a cold start.

   Brood reports a synthetic slot so speakVoice never falls through to a human
   TTS voice. The horde_* pack takes ARE a person (Kokoro bm_fable); we do not
   treat them as present. */
function voHas(fac, action){
  if(!fac || !action) return null;
  if(voIsBrood(fac)) return 'vo_brood_call';
  const slot = 'vo_' + voBankFac(fac) + '_' + voActionKey(action);
  const list = audMapList(slot);
  return list.length ? slot : null;
}
/* True if the slot is playable right now. Kicks off the decode when it is not,
   so the very next order in that category speaks. */
function voReady(fac, action){
  if(voIsBrood(fac)){
    voBroodWarm();
    return audMapList('cre_idle').some(f=>AUD.buf[f])||audMapList('cre_attack').some(f=>AUD.buf[f])
      ? 'vo_brood_call' : null;
  }
  const slot = 'vo_' + voBankFac(fac) + '_' + voActionKey(action);
  const list = audMapList(slot);
  if(!list.length) return null;
  if(list.some(f => AUD.buf[f])) return slot;
  if(typeof AC !== 'undefined' && AC) list.forEach(f => { if(!AUD.buf[f]) audLoad(f); });
  return null;
}
/* Duration of the take a slot would play, in seconds, straight out of the
   manifest — available before anything is decoded. Used to hold the music duck
   open for the length of a narration line rather than a fixed 650 ms. */
function voSeconds(slot){
  if(!VOICE_BANK || !VOICE_BANK.takes) return 0;
  const list = audMapList(slot);
  if(!list.length) return 0;
  let s = 0;
  for(const f of list){
    const t = VOICE_BANK.takes[f.lastIndexOf('voice/',0)===0 ? f.slice(6) : f];
    if(t && t.seconds > s) s = t.seconds;
  }
  return s;
}
/* KEEN alone is 345 seconds of speech. Decoded to float PCM at the context rate
   that is ~66 MB resident if every line the tutorial plays is kept — the exact
   arithmetic the playlist comment below refuses to pay for a soundtrack. Voice
   buffers are therefore released once the bank grows past a working set; a
   recall inside the window is still instant, and anything older simply decodes
   again the next time it is asked for.

   Budgeted in SECONDS, not files: a faction's whole radio vocabulary is 27 clips
   of about two seconds and must stay resident, while three KEEN narration lines
   are the same memory. 90 s is roughly 17 MB of mono float at 48 kHz. */
const VO_BUDGET_SEC = 90;
const voSeen = [];
function voFileSeconds(f){
  if(!VOICE_BANK || !VOICE_BANK.takes) return 2;
  const t = VOICE_BANK.takes[f.lastIndexOf('voice/',0)===0 ? f.slice(6) : f];
  return (t && t.seconds) || 2;
}
function voTouch(files){
  for(const f of files){
    const i = voSeen.indexOf(f);
    if(i >= 0) voSeen.splice(i, 1);
    voSeen.push(f);
  }
  let held = 0;
  for(const f of voSeen) held += voFileSeconds(f);
  while(voSeen.length > 1 && held > VO_BUDGET_SEC){
    const old = voSeen.shift();
    if(AUD.active.some(v => !v.done && audMapList(v.name).indexOf(old) >= 0)){
      voSeen.push(old); break;                 // still sounding: keep it, try later
    }
    held -= voFileSeconds(old);
    delete AUD.buf[old];
  }
}
/* Last cue fired — capture scripts read this; it is not a mixer. */
let VO_LAST=null;

/* BROOD COMMAND CUES — never speech.
   The pack's horde_* takes are Kokoro bm_fable (a person, lowered and radio-
   filtered). Pitch-shifting that still sounds like a person. These cues layer
   existing creature SFX plus oscillator chirps/clicks, with a different tune
   per order so attack ≠ move ≠ select. Oscillators are the floor: if the
   creature buffers have not decoded yet, the chirp still identifies the order. */
const BROOD_TUNE={
  select:   {life:.38,wave:'square',  f0:1720,f1:2460,mod:38,mg:.12,bp:1900,q:7,  clicks:3,clickGap:.045,clickHp:2800,
             layers:[['cre_idle',1.92,.20,0,.18],['cre_idle',2.45,.10,.03,.14]]},
  move:     {life:.52,wave:'triangle',f0:340, f1:780, mod:11,mg:.18,bp:720, q:2.4,clicks:0,clickGap:.05, clickHp:1800,
             layers:[['cre_idle',1.18,.24,0,.28],['move_brood',1.55,.16,.04,.22]]},
  retreat:  {life:.62,wave:'sawtooth',f0:980, f1:140, mod:7, mg:.22,bp:480, q:1.6,clicks:0,clickGap:.05, clickHp:1200,
             layers:[['cre_pain',.72,.28,0,.4],['cre_idle',.55,.12,.05,.3]]},
  attack:   {life:.58,wave:'sawtooth',f0:620, f1:1680,mod:55,mg:.28,bp:1100,q:4.2,clicks:5,clickGap:.038,clickHp:2200,
             layers:[['cre_attack',.88,.32,0,.36],['cre_pain',1.35,.14,.06,.22]]},
  build:    {life:.48,wave:'square',  f0:880, f1:440, mod:90,mg:.16,bp:1400,q:8,  clicks:4,clickGap:.07, clickHp:2400,
             layers:[['cre_idle',1.48,.22,0,.2],['cre_idle',1.05,.14,.07,.18]]},
  patrol:   {life:.50,wave:'triangle',f0:520, f1:520, mod:22,mg:.20,bp:860, q:3,  clicks:2,clickGap:.11, clickHp:1600,
             layers:[['cre_idle',1.32,.20,0,.24],['move_brood',1.7,.12,.08,.2]]},
  hold:     {life:.44,wave:'sine',    f0:90,  f1:70,  mod:3, mg:.30,bp:180, q:.8, clicks:0,clickGap:.05, clickHp:400,
             layers:[['cre_idle',.48,.26,0,.36]]},
  stop:     {life:.40,wave:'triangle',f0:210, f1:90,  mod:4, mg:.20,bp:240, q:1.1,clicks:0,clickGap:.05, clickHp:500,
             layers:[['cre_idle',.62,.22,0,.28]]},
  ability:  {life:.70,wave:'sawtooth',f0:400, f1:1600,mod:70,mg:.24,bp:980, q:3.5,clicks:3,clickGap:.09, clickHp:1500,
             layers:[['cre_attack',1.12,.26,0,.3],['cre_attack',.78,.18,.12,.32]]},
  deploy:   {life:.78,wave:'sawtooth',f0:180, f1:920, mod:18,mg:.22,bp:640, q:2,  clicks:2,clickGap:.14, clickHp:900,
             layers:[['cre_attack',.58,.28,0,.45],['cre_idle',1.22,.16,.08,.3]]},
  underfire:{life:.64,wave:'sawtooth',f0:1480,f1:220, mod:80,mg:.30,bp:760, q:5,  clicks:4,clickGap:.04, clickHp:2000,
             layers:[['cre_pain',.95,.30,0,.36],['cre_attack',1.55,.16,.04,.2]]},
  victory:  {life:.85,wave:'triangle',f0:280, f1:1480,mod:14,mg:.18,bp:1020,q:2.2,clicks:3,clickGap:.12, clickHp:1700,
             layers:[['cre_idle',1.70,.22,0,.4],['cre_attack',1.05,.14,.15,.28]]},
  defeat:   {life:1.05,wave:'sawtooth',f0:420, f1:55,  mod:5, mg:.28,bp:220, q:.9, clicks:0,clickGap:.05, clickHp:300,
             layers:[['cre_death',.70,.34,0,.8],['cre_pain',.5,.16,.1,.5]]}
};
function audBroodCue(action,wx,wy,idx){
  voBroodWarm();
  const now=performance.now();
  VO_LAST={fac:'brood',action:action,kind:'screech',at:now,human:false};
  if(!AC||!audSfxBus||muted||(typeof sfxOn!=='undefined'&&!sfxOn)) return true;
  const mix=AUD_MIX.vo_brood_call||{g:0.9,gap:420,p:5};
  if(now-(AUD.lastAt.vo_brood_call||-1e9)<mix.gap) return true;
  if(!audSlotHasRoom('vo_brood_call')) return true;
  if(!audMakeRoom(mix.p||5)) return true;
  const tune=BROOD_TUNE[action]||BROOD_TUNE[voActionKey(action)]||BROOD_TUNE.select;
  AUD.lastAt.vo_brood_call=now;
  const t0=AC.currentTime, life=tune.life;
  const master=AC.createGain();
  master.gain.setValueAtTime(0.0001,t0);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002,mix.g*0.9),t0+0.016);
  master.gain.exponentialRampToValueAtTime(0.0001,t0+life);
  const bp=AC.createBiquadFilter();
  bp.type='bandpass'; bp.frequency.value=tune.bp; bp.Q.value=tune.q;
  master.connect(bp); bp.connect(audSfxBus);

  /* FM chirp: carrier sweep + square modulator. This is the "tune" — attack
     rises, retreat falls, select is a high square, hold is a low drone.
     Never a formant filter; those reconstruct a mouth. */
  const car=AC.createOscillator(); car.type=tune.wave;
  car.frequency.setValueAtTime(Math.max(40,tune.f0),t0);
  car.frequency.exponentialRampToValueAtTime(Math.max(40,tune.f1),t0+life*0.92);
  const mod=AC.createOscillator(); mod.type='square';
  mod.frequency.value=Math.max(1,tune.mod);
  const mg=AC.createGain(); mg.gain.value=Math.max(40,tune.f0)*tune.mg;
  mod.connect(mg); mg.connect(car.frequency);
  const cg=AC.createGain(); cg.gain.value=0.20;
  car.connect(cg); cg.connect(master);
  car.start(t0); car.stop(t0+life);
  mod.start(t0); mod.stop(t0+life);

  if(tune.clicks>0){
    const nbuf=artWorldNoise();
    if(nbuf){
      for(let k=0;k<tune.clicks;k++){
        const src=AC.createBufferSource(); src.buffer=nbuf;
        const ng=AC.createGain();
        const st=t0+0.018+k*tune.clickGap;
        ng.gain.setValueAtTime(0.0001,st);
        ng.gain.exponentialRampToValueAtTime(0.18,st+0.003);
        ng.gain.exponentialRampToValueAtTime(0.0001,st+0.026);
        const hp=AC.createBiquadFilter(); hp.type='highpass';
        hp.frequency.value=tune.clickHp+k*380;
        src.connect(hp); hp.connect(ng); ng.connect(master);
        try{ src.start(st); src.stop(st+0.04); }catch(e){}
      }
    }
  }

  for(const L of tune.layers){
    const buf=audPick(L[0], typeof idx==='number'?idx:-1);
    if(!buf) continue;
    const src=AC.createBufferSource(); src.buffer=buf;
    src.playbackRate.value=L[1];
    const g=AC.createGain();
    const st=t0+(L[3]||0);
    const dur=Math.min(L[4]||life, Math.max(0.08, buf.duration/Math.max(0.25,L[1])));
    g.gain.setValueAtTime(0.0001,st);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002,L[2]),st+0.018);
    g.gain.exponentialRampToValueAtTime(0.0001,st+dur);
    src.connect(g); g.connect(master);
    const off=Math.random()*Math.min(0.12,Math.max(0,buf.duration-0.25));
    try{ src.start(st, off); src.stop(st+dur+0.02); }catch(e){}
  }

  const voice={src:car,name:'vo_brood_call',priority:mix.p||5,started:now,done:false};
  AUD.active.push(voice); AUD.voices++;
  car.onended=()=>{ audRetireVoice(voice); };
  AUD.duckUntil=Math.max(AUD.duckUntil,now+life*1000+200);
  return true;
}

/* Play a rendered line.

   Returns TRUE when this call has taken responsibility for the line — either it
   started, or the decode is in flight and playback/miss is scheduled. Returns
   FALSE only when no take exists at all, which is the caller's cue to fall back
   to synthesis IMMEDIATELY. `onMiss` fires when a take existed but could not be
   produced (fetch 404, decode reject), which is the deferred version of the same
   cue. Reporting false the instant a slot was merely undecoded is what pushed
   every first airing — and for KEEN, every airing — onto speechSynthesis.

   Brood always returns TRUE so speakVoiceFallback / speechSynthesis can never
   put a human mouth on the hive. */
function voPlay(fac, action, wx, wy, idx, onMiss){
  if(voIsBrood(fac)){
    audBroodCue(action, wx, wy, idx);
    return true;
  }
  const slot = voHas(fac, action);
  if(!slot) return false;
  const list = audMapList(slot);
  const want = (typeof idx === 'number' && idx >= 0) ? list[(idx | 0) % list.length] : null;
  if(want ? !!AUD.buf[want] : list.some(f => AUD.buf[f])){
    voTouch(list.filter(f => AUD.buf[f]));
    VO_LAST={fac:voBankFac(fac),action:action,kind:'speech',slot:slot,at:performance.now(),human:true};
    try{ if(sfx(slot, wx, wy, 1, idx) !== false) return true; }catch(e){}
    return false;
  }
  if(typeof AC === 'undefined' || !AC) return false;
  const t0 = performance.now();
  Promise.all(list.map(f => AUD.buf[f] ? null : audLoad(f))).then(() => {
    const got = list.filter(f => AUD.buf[f]);
    /* A take that arrives after the bubble it belonged to has gone is worse than
       silence — it talks over the next one. Past the deadline, drop it; the
       buffer stays decoded so the same line is instant if it comes round again. */
    if(!got.length || performance.now() - t0 > 6000){
      if(!got.length && typeof onMiss === 'function') onMiss();
      return;
    }
    voTouch(got);
    VO_LAST={fac:voBankFac(fac),action:action,kind:'speech',slot:slot,at:performance.now(),human:true};
    try{ if(sfx(slot, wx, wy, 1, idx) === false && typeof onMiss === 'function') onMiss(); }
    catch(e){ if(typeof onMiss === 'function') onMiss(); }
  });
  return true;
}
/* Called when a match starts: pull the one faction the player will actually
   hear, rather than paying for all four. Brood prewarms creature SFX, never
   the human horde_* bank. */
function voPrewarm(fac){
  fac=voBankFac(fac);
  if(fac==='horde'){ voBroodWarm(); return; }
  if(!VOICE_BANK || !VOICE_BANK.lines || !VOICE_BANK.lines[fac]) return;
  for(const action in VOICE_BANK.lines[fac]) voReady(fac, action);
}

/* ============================================================================
   COMMANDER VOICE — the PLAYBACK half of the commander dialogue system
   ----------------------------------------------------------------------------
   The event half (identity, priority, dedupe, deterministic ordering, subtitle
   and portrait metadata) lives in src/game/commander.js. This file owns only
   two things, and owns them because they are audio facts rather than narrative
   ones:

     1. Turning a cue into a spoken take, THROUGH THE EXISTING VOICE PIPELINE.
        A commander line is an ordinary bank slot: speaker key `cmdr_<id>`,
        action `<category>_<kind>`, slot `vo_cmdr_<id>_<category>_<kind>`. That
        is the same shape audLoadVoiceBank() already walks, so a future voice
        pack adds commander lines as DATA and this file does not change. There
        is no second decoder, no second mixer path and no second cache.

     2. Playback-level rate limiting: the minimum spacing between two spoken
        commander lines, and yielding to the training narrator.

   NO COMMANDER TAKES SHIP TODAY. The bank carries nine unit-radio actions per
   faction plus KEEN, and nothing else — so every call below currently reports
   `silent`, and the cue survives as a subtitle. That is deliberate: aliasing a
   commander line onto a unit-radio take is exactly the bug the VO_ACTION_ALIAS
   comment above describes (victory once said "Commander system armed"), and
   fabricating audio is not on the table. Silence with a correct subtitle beats
   a confident wrong sentence.
   ============================================================================ */
/* Minimum gap between two SPOKEN commander lines. Event-level cooldowns in
   commander.js are much longer and per-category; this is the last-ditch mixer
   guard that stops two independently-eligible cues from overlapping. */
const COMMANDER_VO_GAP_MS=2600;
const COMMANDER_VO={last:-1e9,spoke:0,gated:0,silent:0};
function commanderVoiceReset(){ COMMANDER_VO.last=-1e9; COMMANDER_VO.spoke=0; COMMANDER_VO.gated=0; COMMANDER_VO.silent=0; }
/* Speaker key for the bank. Kept as a function so callers never hand-build the
   string and the prefix stays in one place. */
function commanderVoiceBank(id){ return 'cmdr_'+String(id||'').toLowerCase(); }
function commanderVoiceAction(category,kind){
  return kind?String(category)+'_'+String(kind):String(category);
}
/* Does a RECORDING exist for this cue — decoded or not? Mirrors voHas(), and
   returns the slot name so a probe can report exactly what a voice pack would
   have to provide. */
function commanderVoiceSlot(id,category,kind){
  if(!id||!category) return null;
  const slot='vo_'+commanderVoiceBank(id)+'_'+commanderVoiceAction(category,kind);
  return audMapList(slot).length?slot:null;
}
/* TRAINING OWNS THE ROOM. KEEN is teaching; a commander talking over her is the
   one overlap this system must never produce, and it is why the commander lane
   is a gate rather than a second speech engine. Also refuses while another
   commander line is still running. */
function commanderVoiceBusy(){
  if(typeof AUD==='undefined'||!AUD||!AUD.active) return false;
  for(const v of AUD.active){
    if(v.done) continue;
    const ch=audVoiceChannel(v.name);
    if(ch==='keen'||ch==='cmdr') return true;
  }
  return false;
}
/* Verdict only — never plays, never mutates. commander.js calls this to decide
   whether a cue should be held, and the probe calls it to assert the gate. */
function commanderVoiceGate(now){
  const t=typeof now==='number'?now:(typeof performance!=='undefined'&&performance.now?performance.now():0);
  if(commanderVoiceBusy()) return {ok:false,reason:'busy'};
  if(t-COMMANDER_VO.last<COMMANDER_VO_GAP_MS) return {ok:false,reason:'spacing'};
  return {ok:true,reason:'clear'};
}
/* Speak a cue. Returns one of:
     'played' — a take exists and the pipeline accepted it
     'gated'  — a take may exist but the mixer said not now (caller may retry)
     'silent' — no take exists, or there is no audio at all; SUBTITLE ONLY
   Never throws, never awaits, and never falls through to speechSynthesis: a
   synthesised commander is worse than a quiet one. */
function commanderVoiceSpeak(cue,now){
  try{
    if(!cue||!cue.commanderId) return 'silent';
    const slot=commanderVoiceSlot(cue.commanderId,cue.category,cue.kind);
    if(!slot) return 'silent';
    if(typeof AC==='undefined'||!AC){ COMMANDER_VO.silent++; return 'silent'; }
    const g=commanderVoiceGate(now);
    if(!g.ok){ COMMANDER_VO.gated++; return 'gated'; }
    const t=typeof now==='number'?now:(typeof performance!=='undefined'&&performance.now?performance.now():0);
    const ok=voPlay(commanderVoiceBank(cue.commanderId),commanderVoiceAction(cue.category,cue.kind),
      cue.wx,cue.wy,typeof cue.take==='number'?cue.take:0);
    if(!ok){ COMMANDER_VO.silent++; return 'silent'; }
    COMMANDER_VO.last=t; COMMANDER_VO.spoke++;
    return 'played';
  }catch(e){ return 'silent'; }
}
/* Match start. Mirrors voPrewarm for the player commander only — an opponent
   commander the player never hears is not worth the decode. Harmless no-op
   while no commander takes exist. */
function commanderVoicePrewarm(id){
  if(!id||!VOICE_BANK||!VOICE_BANK.lines) return 0;
  const bank=commanderVoiceBank(id),lines=VOICE_BANK.lines[bank];
  if(!lines) return 0;
  let n=0; for(const action in lines){ voReady(bank,action); n++; }
  return n;
}

async function initAudioSamples(){
  if(typeof AC === 'undefined' || !AC) return;
  if(AUD._samplesBusy) return;
  AUD._samplesBusy = true;
  audBuild();
  AUD.ext = audExt();
  await audLoadSlots();
  await audLoadVoiceBank();
  const names = audUnique().filter(n => !n.startsWith('voice/'));
  AUD.pending = names.length;
  /* Effects first, music last: a player can be shooting within two seconds of
     the match starting, but the music bed has a whole intro to arrive in. */
  const sfxFirst = names.filter(n => !n.startsWith('mus_'));
  const music = names.filter(n => n.startsWith('mus_'));
  await Promise.all(sfxFirst.map(audLoad));
  /* THE SFX BANK AND THE VOICE BANK SHIP SEPARATELY, so the engine must not be
     declared dead when only one of them arrived. assets/audio/sfx.json and its
     clips are not in this repo (see AUD_MAP's floor above); the voice bank is.
     Gating readiness on "at least one SFX buffer decoded" therefore left
     sfxSample() returning false on its very first line for every caller — and
     voice runs through sfxSample, so a build with a complete voice bank sitting
     on disk still spoke nothing at all. A decoded-on-demand voice bank is a
     usable sample engine; slots with no file behind them still decline
     individually at audPick(). */
  AUD.ready = Object.keys(AUD.buf).length > 0 || !!(VOICE_BANK && VOICE_BANK.lines);
  await audLoadPlaylists();
  /* The title/menu has no match state, so it cannot wait for combat's frame
     intensity to start the first track. Once a user gesture created the audio
     context, start the selected menu bed immediately. */
  if(PLAY.lists&&musicOn&&!muted) audPlaylistTick();
  /* Always decode the three dual-codec adaptive beds. They are ~45 s loops,
     which this file already treats as buffer-sized, and they are the AAC
     playlist's fallback after three decode failures — waiting until then to
     start the fetch left a silent gap. */
  music.forEach(n => { if(!AUD.buf[n]) audLoad(n); });
}

/* `pickIdx` selects a SPECIFIC take instead of a random one. radioAck prints one
   of three lines and then asked for a random recording of the three, so the
   printed line and the spoken line disagreed about two times in three. Every
   existing caller passes nothing and keeps the random behaviour byte for byte. */
function audPick(name, pickIdx){
  const list = audMapList(name);
  if(!list.length) return null;
  /* Indexed against the FULL list, not the decoded subset — indexing the subset
     would silently shift which line you hear as buffers come and go. */
  if(typeof pickIdx === 'number' && pickIdx >= 0){
    const want = list[(pickIdx | 0) % list.length];
    if(AUD.buf[want]) return AUD.buf[want];
  }
  const avail = list.filter(f => AUD.buf[f]);
  if(!avail.length) return null;
  return AUD.buf[avail[(Math.random() * avail.length) | 0]];
}

function audRetireVoice(v){
  if(!v||v.done) return;
  v.done=true;
  AUD.voices=Math.max(0,AUD.voices-1);
  const i=AUD.active.indexOf(v);
  if(i>=0) AUD.active.splice(i,1);
}
function audMakeRoom(priority){
  if(AUD.voices<AUD_MAXVOICES) return true;
  let low=null;
  for(const v of AUD.active)
    if(!low||v.priority<low.priority||(v.priority===low.priority&&v.started<low.started)) low=v;
  if(!low||priority<=low.priority) return false;
  audRetireVoice(low);
  try{ low.src.stop(); }catch(e){}
  return true;
}
function audVoiceChannel(name){
  if(name.lastIndexOf('vo_',0)!==0) return null;
  /* A COMMANDER is a third character on a third net, exactly as KEEN is a second
     one. Folding commander lines onto `radio` would let any unit ack in a
     formation drag silently eat a mission-outcome line — the same failure that
     cost KEEN her narration before she got her own channel. No shipped slot
     begins `vo_cmdr_`, so no existing line changes channel here. */
  if(name.lastIndexOf('vo_cmdr_',0)===0) return 'cmdr';
  return name.lastIndexOf('vo_keen_',0)===0 ? 'keen' : 'radio';
}
/* TWO VOICE CHANNELS, each still capped at one.

   The cap was originally per-NAME, so three different vo_ lines could play at
   once — a burst of orders fired select, move and attack acks simultaneously and
   the result was unintelligible. Collapsing every vo_ line onto a single channel
   fixed that and created a worse bug: KEEN's narration is 3-15 seconds long and
   unit acks fire on every order the tutorial is asking the player to perform, so
   the tutorial voice lost that race by construction — and lost it SILENTLY,
   because sfxSample treats a full slot as handled and returns true, which
   suppresses the fallback too.

   KEEN is a different character on a different net. Unit radio can no longer
   block her and she can no longer block it; neither can stack on itself. */
function audSlotHasRoom(name){
  const cap=AUD_CAP[name]||3;
  const ch=audVoiceChannel(name);
  let n=0;
  for(const v of AUD.active){
    if(v.done) continue;
    const hit = ch ? (audVoiceChannel(v.name)===ch) : (v.name===name);
    if(hit && ++n >= (ch?1:cap)) return false;
  }
  return true;
}
/* A narrator interrupts herself; she does not queue. The KEEN channel holds one
   line, her lines run up to 15 seconds, and the bubble advances every 2.4-6.5 s,
   so without this the second and every subsequent line of a run is dropped and
   the player watches text they never hear. The fallback path does exactly this
   already — speakVoiceFallback calls speechSynthesis.cancel() first. Unit radio
   keeps the old drop behaviour: a formation drag must not machine-gun acks. */
function audVoiceYield(name){
  if(audVoiceChannel(name)!=='keen') return;
  for(const v of AUD.active.slice()){
    if(v.done||audVoiceChannel(v.name)!=='keen') continue;
    audRetireVoice(v);
    try{ v.src.stop(); }catch(e){}
  }
}
function audMusicGain(v){
  return v*audMusicLevel()*(performance.now()<AUD.duckUntil?0.58:1);
}

/* One world-audio law for weapons, engines, buildings, alarms and abilities.
   Distance is measured against the CURRENT command view rather than the whole
   2.6 km map, and strategic zoom deliberately trades detail for readability:
   far/zoomed voices get quieter and low-passed instead of forming a harsh wall.
   Returning plain numbers also makes the curve deterministic and testable
   without starting an AudioContext. */
function audWorldSpatial(name,wx,wy){
  if(wx===undefined||wy===undefined||AUD_CLEAR.has(name)||typeof cam==='undefined'||!cam)
    return {world:false,pan:0,gain:1,cutoff:22000,distance:0,zoom:0,culled:false};
  const span=typeof orthoSpan==='number'?orthoSpan:900;
  const zoom=clamp((span-540)/1900,0,1);
  const dx=wx-cam.x,dy=wy-cam.y;
  const norm=Math.max(300,span*.64),distance=Math.hypot(dx,dy)/norm;
  /* Proximity is the whole point: distant action must fall away fast, not play
     as if it were on top of the camera. Steeper distance/zoom falloff, a lower
     floor, and heavier muffling than before; the off-screen cull is tighter too
     so a fight one screen away is felt, not blared. */
  const gain=clamp(1-distance*.60-zoom*.40,.05,1);
  const cutoff=clamp(17800-distance*10500-zoom*9600,1100,19000);
  const halfW=Math.max(1,(typeof camBounds==='function'?(camBounds().x1-camBounds().x0)*.5:span*.5));
  const pan=clamp(dx/halfW,-1,1)*.9;
  const margin=clamp(span*.34,240,680),b=typeof camBounds==='function'?camBounds():null;
  const culled=!!(b&&(wx<b.x0-margin||wx>b.x1+margin||wy<b.y0-margin||wy>b.y1+margin));
  return {world:true,pan,gain,cutoff,distance,zoom,culled};
}

const ART_WORLD_AUDIO={last:{},active:0,noise:null,telemetry:null};
function artWorldNoise(){
  if(ART_WORLD_AUDIO.noise||!AC)return ART_WORLD_AUDIO.noise;
  const n=Math.max(1,(AC.sampleRate*.7)|0),buf=AC.createBuffer(1,n,AC.sampleRate),d=buf.getChannelData(0);
  let seed=0x51f15e;
  for(let i=0;i<n;i++){seed=(seed*1664525+1013904223)>>>0;d[i]=((seed>>>8)/0xffffff)*2-1;}
  ART_WORLD_AUDIO.noise=buf;return buf;
}
/* Restrained synthetic layers sit UNDER the owned cannon/explosion recordings:
   sine sub for weight, filtered deterministic noise for pressure/debris, and a
   very quiet falling whistle in flight. A separate three-event cap prevents a
   six-round volley becoming six subwoofers fighting the limiter. */
function artilleryWorldAudio(kind,wx,wy,team,scale){
  if(!AC||!audSfxBus||muted||(typeof sfxOn!=='undefined'&&!sfxOn))return false;
  if(typeof fogFxVisible==='function'&&!fogFxVisible(wx,wy,team))return false;
  const S=audWorldSpatial('artillery_'+kind,wx,wy),now=performance.now();
  const gap=kind==='flight'?680:kind==='impact'?210:170;
  if(S.culled||now-(ART_WORLD_AUDIO.last[kind]||-1e9)<gap||ART_WORLD_AUDIO.active>=3)return false;
  ART_WORLD_AUDIO.last[kind]=now;ART_WORLD_AUDIO.active++;
  ART_WORLD_AUDIO.telemetry={kind,world:S.world,gain:S.gain,cutoff:S.cutoff,pan:S.pan,zoom:S.zoom};
  const t0=AC.currentTime,life=kind==='impact'?.72:kind==='flight'?.58:.42;
  const master=AC.createGain();master.gain.setValueAtTime(0.0001,t0);
  const level=(kind==='impact'?.34:kind==='launch'?.27:.055)*(scale||1)*S.gain;
  master.gain.exponentialRampToValueAtTime(Math.max(.0002,level),t0+.012);
  master.gain.exponentialRampToValueAtTime(.0001,t0+life);
  const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=S.cutoff;lp.Q.value=.55;
  let tail=lp;
  if(AC.createStereoPanner){const p=AC.createStereoPanner();p.pan.value=S.pan;lp.connect(p);tail=p;}
  master.connect(lp);tail.connect(audSfxBus);

  const sub=AC.createOscillator();sub.type='sine';
  const f0=kind==='impact'?54:kind==='launch'?68:42,f1=kind==='impact'?25:kind==='launch'?31:34;
  sub.frequency.setValueAtTime(f0,t0);sub.frequency.exponentialRampToValueAtTime(f1,t0+life*.82);
  sub.connect(master);sub.start(t0);sub.stop(t0+life);
  if(kind!=='launch'||S.gain>.2){
    const noise=AC.createBufferSource();noise.buffer=artWorldNoise();
    const nf=AC.createBiquadFilter();nf.type=kind==='flight'?'bandpass':'lowpass';
    nf.frequency.value=kind==='flight'?620:kind==='impact'?480:720;nf.Q.value=kind==='flight'?1.6:.7;
    const ng=AC.createGain();ng.gain.value=(kind==='flight'?.12:.22)*S.gain*(scale||1);
    noise.connect(nf);nf.connect(ng);ng.connect(master);noise.start(t0);noise.stop(t0+life*.88);
  }
  if(kind==='flight'){
    const whistle=AC.createOscillator(),wg=AC.createGain();whistle.type='sine';
    whistle.frequency.setValueAtTime(285,t0);whistle.frequency.exponentialRampToValueAtTime(145,t0+life);
    wg.gain.setValueAtTime(.0001,t0);wg.gain.exponentialRampToValueAtTime(.035*S.gain,t0+.08);wg.gain.exponentialRampToValueAtTime(.0001,t0+life);
    whistle.connect(wg);wg.connect(master);whistle.start(t0);whistle.stop(t0+life);
  }
  sub.onended=()=>{ART_WORLD_AUDIO.active=Math.max(0,ART_WORLD_AUDIO.active-1);};
  return true;
}

/* The replacement for hud.js's sfx(). Same signature, same call sites. */
function sfxSample(name, wx, wy, scale, pickIdx){
  if(!AC || muted || (typeof sfxOn!=='undefined'&&!sfxOn) || !AUD.ready) return false;
  const buf = audPick(name, pickIdx);
  if(!buf) return false;

  const mix = AUD_MIX[name] || {g:0.6, gap:40, p:2};
  const now = performance.now();
  if(now - (AUD.lastAt[name] || -1e9) < mix.gap) return true;   // handled: swallow

  const spatial=audWorldSpatial(name,wx,wy);
  if(spatial.culled)return true;
  const pan=spatial.pan,dist=spatial.gain;
  /* Cull in world space before touching the voice pool. An off-screen alarm
     must not evict an on-screen cannon simply because alarms have priority. */
  audVoiceYield(name);
  if(!audSlotHasRoom(name)) return true;
  if(!audMakeRoom(mix.p||2)) return true;
  AUD.lastAt[name] = now;

  const src = AC.createBufferSource();
  src.buffer = buf;
  /* Detune in cents. ±90 is enough to defeat recognition without sounding
     like a broken tape. */
  /* A per-slot rate bias on top of the usual jitter. It lets `reject` be the
     UI blip dropped a fifth into an obvious "denied" without shipping another
     asset. `rate` is absent on every pre-existing slot, so ||1 preserves the
     old behaviour byte for byte. */
  src.playbackRate.value = (mix.rate || 1) + (Math.random() - 0.5) * 0.10;

  const g = AC.createGain();
  g.gain.value = mix.g * (scale || 1) * dist * (0.88 + Math.random() * 0.24);

  let node = g;
  if(spatial.world&&spatial.cutoff<18500){
    const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=spatial.cutoff;f.Q.value=.48;
    g.connect(f);node=f;
  }
  if(pan !== 0 && AC.createStereoPanner){
    const p = AC.createStereoPanner();
    p.pan.value = pan;
    node.connect(p); node = p;
  }
  src.connect(g); node.connect(audIsVoiceSlot(name)?audVoiceBus:audSfxBus);
  AUD.lastWorld={name,world:spatial.world,gain:spatial.gain,cutoff:spatial.cutoff,
    pan:spatial.pan,zoom:spatial.zoom,distance:spatial.distance};

  const voice={src:src,name:name,priority:mix.p||2,started:now,done:false};
  AUD.active.push(voice); AUD.voices++;
  src.onended = () => { audRetireVoice(voice); };
  try{ src.start(); }catch(e){ audRetireVoice(voice); return false; }
  /* 650 ms is right for an explosion and wrong for speech: a KEEN line runs 3-15
     seconds, so the music came back up over the top of her within the first
     sentence. A voice line holds the duck open for as long as it is actually
     talking, measured from the decoded buffer rather than assumed. */
  if(AUD_DUCK.has(name)){
    const hold = (name.lastIndexOf('vo_',0)===0 && buf.duration) ? buf.duration*1000+240 : 650;
    AUD.duckUntil=Math.max(AUD.duckUntil,now+hold);
  }
  return true;
}

/* ---- MUSIC ----------------------------------------------------------------
   Three stems rendered at the same tempo and key, crossfaded on combat
   intensity. Only one plays at a time here — layering all three simultaneously
   is the richer approach but costs three decoded beds resident and three
   sources running, which is the wrong trade on a phone. */
const AUD_MUSIC_FOR = i => (i > 0.55 ? 'mus_combat' : i > 0.22 ? 'mus_tension' : 'mus_ambient');
let audMusSrc = null, audMusName = '', audMusSwap = 0;

function audMusicTick(dt){
  if(!AC || !audMusBus) return;
  /* Bundled mus_* beds are MATCH stems while the AAC playlist is alive, so a
     rest gap cannot leak the combat stem under the title. After abandon
     (Chromium with no AAC decoder, empty pool) they are the only score left
     and must also cover menu / War Table. */
  const scene=PLAY.scene||'menu';
  const inMatch=scene==='ambient'||scene==='action';
  const inResult=scene==='result-victory'||scene==='result-defeat';
  const playlistDead=!PLAY.lists||PLAY.phase==='fallback';
  const intensity=(typeof musicInt==='number')?Math.max(0,Math.min(1,musicInt)):0;
  const want = (!musicOn || muted || (paused&&!inResult)) ? null
             : inMatch ? AUD_MUSIC_FOR(intensity)
             : (playlistDead&&scene==='result-victory') ? 'mus_ambient'
             : (playlistDead&&scene==='result-defeat') ? 'mus_tension'
             : (playlistDead ? (scene==='wartable'?'mus_tension':'mus_ambient') : null);

  if(!want){
    if(audMusSrc) audStopMusicBeds();
    return;
  }
  if(!AUD.buf[want]) return;

  audMusSwap -= dt;
  if(want !== audMusName && audMusSwap <= 0){
    /* Never cut a bed off — fade the old one down, start the new one under it,
       and hold a cooldown so a fight that flickers across the threshold cannot
       machine-gun the crossfade. */
    audMusSwap = 8;
    const old = audMusSrc;
    if(old){
      const og = old._g;
      og.gain.setTargetAtTime(0.0001, AC.currentTime, 1.2);
      setTimeout(() => { try{ old.stop(); }catch(e){} }, 4000);
    }
    const s = AC.createBufferSource();
    s.buffer = AUD.buf[want]; s.loop = true;
    const g = AC.createGain(); g.gain.value = 0.0001;
    s.connect(g); g.connect(audMusBus);
    s._g = g;
    try{ s.start(0, Math.random() * 4); }catch(e){}
    g.gain.setTargetAtTime(1, AC.currentTime, 1.6);
    audMusSrc = s; audMusName = want;
    audRenderNowPlaying();
  }
  /* Same duck arithmetic as audPlaylistTick: at tau = 0.8 s the bus travels only
     a fraction of the way to the ducked target before the duck expires, so the
     dip never reaches the depth AUD_DUCK's 0.58 asks for. Fast attack while
     ducked, slow release after — otherwise nothing cuts through the bed and the
     bundled-bed build stays exactly as deaf as before. */
  const target = audMusicGain(0.30 + (typeof musicInt === 'number' ? musicInt : 0) * 0.16);
  audMusBus.gain.setTargetAtTime(target, AC.currentTime,
    performance.now() < AUD.duckUntil ? 0.06 : 0.8);
}

/* ---- TAKEOVER --------------------------------------------------------------
   Wrap rather than replace: sample first, synth if the sample engine declines.
   `sfx` and `musicTickFrame` are function declarations in hud.js, which creates
   reassignable global bindings, so this is a supported takeover and not a hack. */
function initSampleAudio(){
  if(typeof sfx !== 'function') return;
  const synthSfx = sfx;
  const synthMusic = (typeof musicTickFrame === 'function') ? musicTickFrame : null;

  /* Fetch the playlist while the title is on screen. On mobile, `play()` must
     happen inside a later real tap; having the manifest ready before that tap
     prevents the intro/menu from waiting for an asynchronous fetch and then
     losing the browser's audio permission window. */
  audLoadPlaylists();
  const baseInitAudio=typeof initAudio==='function'?initAudio:null;
  if(baseInitAudio){
    initAudio=function(){
      baseInitAudio();
      if(!AC) return;
      audBuild();
      /* Start the decode on the same tap that created AC. The 250 ms poll
         used to leave the first second of UI clicks silent and delayed the
         playlist retry until after Chrome's gesture window had closed. */
      if(!AUD._samplesStarted){ AUD._samplesStarted=true; initAudioSamples(); }
      if(PLAY.lists) audPlaylistTick();
    };
  }
  /* Buttons call initAudio(), but a title skip, Android system back path, or
     first map tap can be the first real gesture. Keep one lightweight retry
     armed so any of those paths can unlock a preloaded menu/faction track. */
  if(!window.__mfMusicGestureBound){
    window.__mfMusicGestureBound=true;
    document.addEventListener('pointerdown',function(){
      if(typeof initAudio==='function') initAudio();
      if(AC&&PLAY.lists){
        PLAY.hidden=false;
        if(PLAY.phase==='locked'||PLAY.phase==='stalled') audPlaylistTick();
      }
    },{passive:true});
    document.addEventListener('visibilitychange',()=>{
      document.hidden?audPlaylistSleep():audPlaylistWake();
    });
    window.addEventListener('pagehide',audPlaylistSleep);
    window.addEventListener('pageshow',audPlaylistWake);
    /* Capacitor exposes the native lifecycle earlier and more reliably than a
       WebView visibility event after calls, lock-screen and task switching. */
    try{
      const cap=window.Capacitor,app=cap&&cap.Plugins&&cap.Plugins.App;
      if(app&&typeof app.addListener==='function')
        app.addListener('appStateChange',s=>{ s&&s.isActive?audPlaylistWake():audPlaylistSleep(); });
    }catch(e){}
  }

  sfx = function(name, wx, wy, scale, pickIdx){
    /* The shipped bank is dual-codec, so every supported device has a sample
       path. Do not expose the old oscillator/chiptune bank while decoding or
       for a missing slot: a brief silence is preferable to retro arcade audio
       in a cinematic RTS mix. Keep the binding only for legacy diagnostics.

       RETURN THE RESULT. Dropping it made sfx() yield undefined for every
       caller, and voPlay's `sfx(...) !== false` was therefore unconditionally
       true — a declined or impossible voice line reported success and
       suppressed its own fallback. voPlay is the only call site in the tree
       that reads this value, so returning it changes nothing else. */
    return sfxSample(name, wx, wy, scale, pickIdx);
  };

  if(synthMusic){
    musicTickFrame = function(dt){
      /* The synth music still owns the intensity envelope — it is the thing
         that reads combat damage — so run it, but with its own bus muted when
         the sampled beds are available. */
      if(PLAY.lists || AUD.ready){
        if(typeof mixMus !== 'undefined' && mixMus)
          mixMus.gain.setTargetAtTime(0.0001, AC.currentTime, 0.4);
        synthMusic(dt);
        if(!audPlaylistTick()) audMusicTick(dt);
        ambTick(); audWorldTick(dt);
      } else { synthMusic(dt); ambTick(); audWorldTick(dt); }
    };
  }

  /* Tiny hooks — other agents own sim.js / input.js / main.js. Guard so a
     second initSampleAudio cannot stack wrappers. */
  if(typeof dealDamage==='function' && !dealDamage.__mfVoice){
    const baseDeal=dealDamage;
    dealDamage=function(j,dmg,attTeam,attacker,mu,wk){
      const r=baseDeal(j,dmg,attTeam,attacker,mu,wk);
      try{
        if(typeof heroIdx==='number'&&j===heroIdx&&attTeam!==0&&dmg>=10&&typeof radioAck==='function')
          radioAck('underfire',1,ux[j],uy[j]);
      }catch(e){}
      return r;
    };
    dealDamage.__mfVoice=true;
  }
  if(typeof endGame==='function' && !endGame.__mfVoice){
    const baseEnd=endGame;
    endGame=function(win,reason){
      try{ if(typeof radioAck==='function') radioAck(win?'victory':'defeat',1); }catch(e){}
      try{ audMusicEnterResult(!!win); }catch(e){}
      return baseEnd.apply(this,arguments);
    };
    endGame.__mfVoice=true;
  }
  if(typeof deployCarrier==='function' && !deployCarrier.__mfVoice){
    const baseDep=deployCarrier;
    deployCarrier=function(){
      const r=baseDep.apply(this,arguments);
      try{
        if(typeof carrier!=='undefined'&&carrier&&carrier.phase===2&&typeof radioAck==='function')
          radioAck('deploy',1,carrier.x,carrier.y);
      }catch(e){}
      return r;
    };
    deployCarrier.__mfVoice=true;
  }
  if(typeof speakVoice==='function' && !speakVoice.__mfVoice){
    const baseSpeak=speakVoice;
    speakVoice=function(text,faction,action,idx,wx,wy){
      /* Brood must never reach speechSynthesis, even if a caller skipped voPlay. */
      if(voIsBrood(faction)){ audBroodCue(action||'select',wx,wy,idx); return; }
      return baseSpeak(text,faction,action,idx,wx,wy);
    };
    speakVoice.__mfVoice=true;
  }
  if(typeof speakVoiceFallback==='function' && !speakVoiceFallback.__mfVoice){
    const baseFB=speakVoiceFallback;
    speakVoiceFallback=function(text,faction){
      if(voIsBrood(faction)){ audBroodCue('select'); return; }
      return baseFB(text,faction);
    };
    speakVoiceFallback.__mfVoice=true;
  }

  /* Decoding needs a live AudioContext, which only exists after the first user
     gesture on mobile. initAudio() is called from every entry point, so poll
     briefly for it rather than racing. */
  let tries = 0;
  const arm = setInterval(() => {
    if(typeof AC !== 'undefined' && AC){
      clearInterval(arm);
      if(!AUD._samplesStarted){ AUD._samplesStarted=true; initAudioSamples(); }
    } else if(++tries > 600) clearInterval(arm);
  }, 250);
}

/* ============================================================================
   MUSIC PLAYLISTS — real tracks, streamed
   ----------------------------------------------------------------------------
   The rendered beds above are decoded into AudioBuffers, which is right for a
   45-second loop and completely wrong for a soundtrack. A four-minute track
   decoded to an AudioBuffer is 44100 x 2 x 4 bytes per second — roughly 42 MB
   of resident float PCM, per track. A dozen of those and a mid-range phone is
   out of memory before the first shot.

   So playlists use HTMLAudioElement through MediaElementAudioSourceNode: the
   browser streams and decodes incrementally, memory stays flat regardless of
   how many songs are added, and the audio still routes through the same bus and
   compressor as everything else. Two elements exist so one can fade up while
   the other fades down — a hard cut between tracks is the thing that makes a
   soundtrack feel like a folder of files.
   ============================================================================ */
const PLAY = { lists:null, ext:'m4a', formats:['m4a'], haveExtra:false, cur:null,
               scene:'menu', lockedScene:false, forceNext:false,
               expectMatch:false, wasLive:false,
               state:'explore', phase:'locked', reason:'awaiting gesture', idx:-1,
               els:[], gains:[], slot:0, fading:false, switchAt:0, nowTitle:'',
               restT:0, hidden:false, fails:0, generation:0, lastTrack:'',
               policy:{loop:false,seedRestMs:10000,fullRestMs:6500,
                       menuSeedRestMs:24000,crossfadeMs:4500} };

/* The runtime must be able to describe what it is playing without inventing
   ownership, composer, or licensing claims that are absent from the catalog.
   These titles match source-media/audio-library/music-catalog.json; the source
   label is deliberately functional (core fallback versus streamed cue). */
const AUD_SCORE_META=Object.freeze({
  mus_ambient:Object.freeze({title:'Generated Ambient Adaptive Bed',kind:'CORE ADAPTIVE FALLBACK'}),
  mus_tension:Object.freeze({title:'Generated Tension Adaptive Bed',kind:'CORE ADAPTIVE FALLBACK'}),
  mus_combat:Object.freeze({title:'Generated Combat Adaptive Bed',kind:'CORE ADAPTIVE BED'}),
});
function audMusicSceneLabel(scene){
  if(scene==='result-victory') return 'MISSION VICTORY';
  if(scene==='result-defeat') return 'MISSION DEFEAT';
  if(scene==='wartable') return 'WAR TABLE';
  if(scene==='ambient') return 'BATTLE · EXPLORE';
  if(scene==='action') return 'BATTLE · COMBAT';
  return 'COMMAND MENU';
}
function audMusicFallbackForScene(scene){
  if(scene==='result-defeat'||scene==='wartable') return 'mus_tension';
  if(scene==='action') return 'mus_combat';
  return 'mus_ambient';
}
function audMusicCurrentTrack(){
  /* idx belongs to the filtered playable pool, not the raw manifest list. A
     missing optional pack can remove entries ahead of it, so indexing the raw
     list would display metadata for a different song than the one playing. */
  const list=PLAY.lists&&PLAY.cur?audPlayableTracks(PLAY.cur,audSceneFilter()):null;
  return Array.isArray(list)&&PLAY.idx>=0?list[PLAY.idx]||null:null;
}
function audMusicPackStatus(){
  let extra=0;
  if(PLAY.lists) for(const list of Object.values(PLAY.lists||{}))
    if(Array.isArray(list)) extra+=list.filter(track=>track&&track.bundled===false).length;
  if(extra&&PLAY.haveExtra) return 'SOUNDTRACK PACK · INSTALLED';
  if(extra) return 'SOUNDTRACK PACK · NOT INSTALLED';
  return 'SOUNDTRACK PACK · NO TRACKS REGISTERED';
}
function audMusicStatus(){
  const scene=PLAY.scene||'menu';
  const enabled=(typeof musicOn==='undefined'||musicOn)&&
    (typeof muted==='undefined'||!muted);
  const track=audMusicCurrentTrack();
  const streamed=!!(track&&PLAY.nowTitle&&PLAY.phase!=='fallback');
  const bed=audMusName||audMusicFallbackForScene(scene);
  const meta=AUD_SCORE_META[bed]||null;
  let title='Tap to enable music',source='AUDIO PERMISSION REQUIRED';
  if(!enabled){ title='Music disabled'; source='NO CUE PLAYING'; }
  else if(streamed){
    title=PLAY.nowTitle;
    source=track.bundled===false?'DOWNLOADED SOUNDTRACK':'CORE SOUNDTRACK';
  }else if(meta){
    title=meta.title;
    source=meta.kind+(audMusName?'':' · QUEUED');
  }
  return {scene,sceneLabel:audMusicSceneLabel(scene),title,source,
          phase:enabled?(PLAY.phase||'locked'):'disabled',pack:audMusicPackStatus(),
          cue:streamed?(track.file||''):bed,active:!!(streamed||audMusName)};
}
function audRenderNowPlaying(){
  let host;
  try{ host=document.getElementById('audNowPlaying'); }catch(e){ return; }
  if(!host) return;
  const status=audMusicStatus();
  const put=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value||'';};
  host.dataset.scene=status.scene;
  host.dataset.phase=status.phase;
  host.setAttribute('aria-label','Now playing: '+status.title+'. '+status.sceneLabel+'. '+status.pack+'.');
  put('audNowScene',status.sceneLabel);
  put('audNowTitle',status.title);
  put('audNowSource',status.source+' · '+String(status.phase).toUpperCase());
  put('audNowPack',status.pack);
}

/* Playback and combat intensity are deliberately separate state machines.
   `state` is the score's explore/tension/combat programme; `phase` is what the
   browser is actually doing. The latter is diagnostic as well as functional:
   an autoplay lock must be retried on a gesture, while a decoder failure must
   fall back instead of retrying forever. */
function audPlayState(phase,reason){
  PLAY.phase=phase;
  PLAY.reason=reason||'';
  PLAY.changedAt=Date.now();
  audRenderNowPlaying();
}
/* Three consecutive HTMLAudio decode failures mean this browser cannot play the
   AAC playlist (open-source Chromium, a lying canPlayType, or a broken pack).
   Bump generation so an in-flight audPlaylistNext after fail #2 cannot start
   another silent track, then hand the bus to the dual-codec mus_* beds. */
function audAbandonPlaylist(reason){
  PLAY.generation = (PLAY.generation||0)+1;
  PLAY.lists = null; PLAY.cur = null;
  try{ PLAY.els.forEach(e => { try{ e.pause(); }catch(x){} }); }catch(e){}
  AUD_MUSIC.forEach(n => { if(!AUD.buf[n]) audLoad(n); });
  audPlayState('fallback', reason||'streamed soundtrack could not decode');
  try{ audMusicTick(0); }catch(e){}
}

function audCodecPlayable(ext){
  let el;
  try{ el=document.createElement('audio'); }catch(e){ return ext==='m4a'; }
  try{
    if(ext==='ogg') return !!el.canPlayType('audio/ogg; codecs="vorbis"');
    if(ext==='m4a'||ext==='aac') return !!el.canPlayType('audio/mp4; codecs="mp4a.40.2"');
    return !!el.canPlayType('audio/'+ext);
  }catch(e){ return false; }
}
function audTrackExt(track){
  const formats=(track&&Array.isArray(track.formats)&&track.formats.length)
    ? track.formats : PLAY.formats;
  for(const ext of formats) if(audCodecPlayable(ext)) return ext;
  return null;
}

async function audLoadPlaylists(){
  if(typeof netAllowed==='function' && !netAllowed()) { /* still read the
     bundled manifest — it is a local file, not a network call */ }
  /* Packaged manifest first. An empty packaged playlist is a curation decision
     (vocal/lyric songs were deleted from source) and must win over a stale
     channel music.json — remote-first is how sung seeds kept playing after
     the downloadable pack had already dropped them.

     A channel overlay is only consulted when the packaged list still names
     tracks. Failure at either step is silent — the dual-codec mus_* beds play. */
  let packaged = null, j = null;
  try{
    const r = await fetch('./assets/audio/music.json', {cache:'no-store'});
    if(r.ok) packaged = await r.json();
  }catch(e){}
  const packagedHasTracks = !!(packaged && packaged.playlists &&
    Object.values(packaged.playlists).some(a => Array.isArray(a) && a.length));
  try{
    if(packagedHasTracks && !(typeof netAllowed==='function' && !netAllowed())){
      const base = (typeof packEndpoint==='function' && packEndpoint()) || '';
      if(base){
        const rr = await fetch(base.replace(/\/+$/,'') + '/music.json?t=' + Date.now(), {cache:'no-store'});
        if(rr.ok){ const cand = await rr.json(); if(cand && cand.playlists) j = cand; }
      }
    }
  }catch(e){}
  if(!j) j = packaged;
  try{
    if(j && j.playlists){
      PLAY.lists = j.playlists;
      /* Music ships AAC-only — the dual-format insurance the effects carry was
         costing 24 MB here. The manifest states its own extension so the player
         never derives it from the effects' codec probe and asks for a .ogg that
         was never encoded. */
      PLAY.ext = j.ext || 'm4a';
      PLAY.formats = Array.isArray(j.formats)&&j.formats.length
        ? j.formats.slice() : [PLAY.ext];
      if(j.playback) PLAY.policy=Object.assign({},PLAY.policy,j.playback);
      /* Open-source Chromium reports canPlayType('mp4a.40.2') as '' (or a
         lie that then fails every seed). An empty curated playlist is the same
         outcome — hand the bus to the dual-codec mus_* beds now. */
      let any=false;
      if(PLAY.formats.some(audCodecPlayable)){
        for(const name of Object.keys(PLAY.lists)){
          if(audPlayableTracks(name).length){ any=true; break; }
        }
      }
      if(!any) audAbandonPlaylist(PLAY.formats.some(audCodecPlayable)
        ? 'no playable soundtrack' : 'no compatible soundtrack codec');
      else audPlayState('locked','soundtrack ready');
    } else audPlayState('fallback','soundtrack manifest unavailable');
  }catch(e){ audPlayState('fallback','soundtrack manifest unavailable'); }
}

function audMediaSlot(i){
  if(PLAY.els[i]) return i;
  const el = new Audio();
  /* Bundled seeds are ~220 KB. preload=none plus an element that was never
     inserted meant Chrome could sit in HAVE_NOTHING after play() and never
     fire `playing` — Android WebView still started. Keep the node in the
     tree (hidden, not display:none — some engines skip those) and let the
     browser buffer the seed before the gesture's play() returns. */
  el.preload = 'auto'; el.crossOrigin = 'anonymous';
  el.setAttribute('playsinline','');
  el.setAttribute('webkit-playsinline','');
  el.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
  try{ if(document.body) document.body.appendChild(el); }catch(e){}
  /* Not `loop`: a playlist advances. `ended` is the cue. */
  el.addEventListener('ended', () => {
    if(i!==PLAY.slot) return;                    // retired crossfade element
    audPlaylistRest();
  });
  el.addEventListener('loadstart',()=>{ if(i===PLAY.slot) audPlayState('loading','opening '+PLAY.nowTitle); });
  el.addEventListener('waiting',()=>{ if(i===PLAY.slot) audPlayState('stalled','buffering '+PLAY.nowTitle); });
  el.addEventListener('stalled',()=>{ if(i===PLAY.slot) audPlayState('stalled','network stalled'); });
  el.addEventListener('playing',()=>{
    if(i!==PLAY.slot) return;
    PLAY.fails=0;
    audPlayState('playing',PLAY.nowTitle);
  });
  /* A decode failure must not become an infinite skip. Music ships AAC-only,
     and a browser without an AAC decoder (open-source Chromium builds, some
     Linux distributions) fails EVERY track — advancing on error would spin the
     playlist forever in silence. After a few consecutive failures the playlist
     is abandoned and the bundled dual-format beds take over, which is the whole
     reason they were kept. */
  el.addEventListener('error', () => {
    if(i!==PLAY.slot) return;
    if(!el.getAttribute('src')) return;
    PLAY.fails = (PLAY.fails || 0) + 1;
    if(PLAY.fails >= 3){
      audAbandonPlaylist('streamed soundtrack could not decode');
      return;
    }
    audPlayState('failed','track could not decode');
    audPlaylistNext();
  });
  const src = AC.createMediaElementSource(el);
  const g = AC.createGain(); g.gain.value = 0.0001;
  src.connect(g); g.connect(audMusBus);
  PLAY.els[i] = el; PLAY.gains[i] = g;
  return i;
}

/* Six-state score: menu | wartable | ambient | action | result-victory |
   result-defeat.
   `running` alone cannot own this — orbital drop sets running before deploy,
   War Table is !running with playerFaction already filled, and a leftover
   PLAY.cur='nova' plus `pick('menu')||pick('nova')` kept the battle bed on
   the title. Scene is explicit; playlist name follows it. */
function audFrontScreenId(){
  try{
    if(document.body&&document.body.dataset&&document.body.dataset.frontScreen)
      return document.body.dataset.frontScreen;
  }catch(e){}
  return '';
}
function audFrontScene(){
  const id=audFrontScreenId();
  return (id==='warScr'||id==='setupScr')?'wartable':'menu';
}
function audSceneFilter(){
  return PLAY.scene==='action'?'combat':'explore';
}
function audMusicResetCombat(){
  try{
    if(typeof musicInt!=='undefined') musicInt=0;
    if(typeof musicFirstBlood!=='undefined') musicFirstBlood=false;
    if(typeof lastDmgTotal!=='undefined') lastDmgTotal=0;
    if(typeof lastKillsTotal!=='undefined') lastKillsTotal=0;
  }catch(e){}
  PLAY.state='explore';
  PLAY.switchAt=0;
}
function audStopMusicBeds(){
  if(!audMusSrc) return;
  const old=audMusSrc;
  if(old._g&&AC) try{ old._g.gain.setTargetAtTime(0.0001,AC.currentTime,0.4); }catch(e){}
  setTimeout(()=>{ try{ old.stop(); }catch(e){} },1600);
  audMusSrc=null; audMusName='';
  audRenderNowPlaying();
}
function audHaltPlaylist(){
  /* Bump generation so an in-flight audPlaylistNext (await packURL) cannot
     start a battle cue after we have already left the match. */
  PLAY.generation=(PLAY.generation||0)+1;
  clearTimeout(PLAY.restT); PLAY.restT=0;
  /* lastTrack survives scene changes. Clearing it here let the same song play
     on both sides of a menu/match/result transition, defeating no-repeat at
     exactly the moment the scene change made repetition most obvious. */
  PLAY.cur=null; PLAY.idx=-1; PLAY.nowTitle='';
  PLAY.forceNext=true;
  try{ PLAY.els.forEach(e=>{ try{ e.pause(); e.removeAttribute('src'); e.load(); }catch(x){} }); }catch(e){}
  audRenderNowPlaying();
}
function audMusicLeaveMatch(){
  PLAY.lockedScene=true;
  PLAY.expectMatch=false;
  PLAY.wasLive=false;
  PLAY.scene='menu';
  audMusicResetCombat();
  audStopMusicBeds();
  audMusSwap=0;
  try{ ambStop(); }catch(e){}
  try{ audWorldClear(); }catch(e){}
  audHaltPlaylist();
  if(AC&&PLAY.lists&&musicOn&&!muted) audPlaylistTick();
}
function audMusicEnterMatch(){
  PLAY.lockedScene=false;
  PLAY.expectMatch=true;
  PLAY.wasLive=false;
  PLAY.scene='ambient';
  audMusicResetCombat();
  audStopMusicBeds();
  audMusSwap=0;
  audHaltPlaylist();
  if(AC&&PLAY.lists&&musicOn&&!muted) audPlaylistTick();
}
function audMusicEnterResult(win){
  /* endGame is called while `running` is still true and the results panel is
     assembled 1.4 seconds later. Locking the scene prevents the normal live-
     match tick from immediately overwriting the terminal result cue. */
  PLAY.lockedScene=true;
  PLAY.expectMatch=false;
  PLAY.wasLive=false;
  PLAY.scene=win?'result-victory':'result-defeat';
  audMusicResetCombat();
  audStopMusicBeds();
  /* Threshold swaps use an eight-second anti-thrash hold. A terminal result is
     not threshold noise: it must replace the battle bed immediately, even if
     combat music began one frame before the final kill. */
  audMusSwap=0;
  try{ ambStop(); }catch(e){}
  try{ audWorldClear(); }catch(e){}
  audHaltPlaylist();
  const streamed=AC&&PLAY.lists&&musicOn&&!muted?audPlaylistTick():false;
  if(!streamed) try{ audMusicTick(0); }catch(e){}
  audRenderNowPlaying();
}
function audMusicEnterScreen(id){
  if(typeof running!=='undefined'&&running&&!PLAY.lockedScene) return;
  PLAY.expectMatch=false;
  const scene=(id==='warScr'||id==='setupScr')?'wartable':'menu';
  /* Navigation is authored intent, not a noisy intensity threshold. Let the
     next tick crossfade immediately when the player deliberately moves between
     menu and War Table; the eight-second hold remains inside live combat. */
  if(PLAY.scene!==scene) audMusSwap=0;
  if(PLAY.scene==='ambient'||PLAY.scene==='action'){
    audMusicResetCombat();
    audStopMusicBeds();
    try{ ambStop(); }catch(e){}
    try{ audWorldClear(); }catch(e){}
    audHaltPlaylist();
  }
  PLAY.scene=scene;
  if(AC&&PLAY.lists&&musicOn&&!muted) audPlaylistTick();
}
function audMusicDebug(){
  return {scene:PLAY.scene,cur:PLAY.cur,state:PLAY.state,phase:PLAY.phase,
          title:PLAY.nowTitle,bed:audMusName,amb:!!(typeof AMB!=='undefined'&&AMB.on),
          locked:!!PLAY.lockedScene,running:!!(typeof running!=='undefined'&&running),
          status:audMusicStatus()};
}

/* Which playlist the current context calls for. In a match it is the ENEMY's
   theme rather than the player's — you are listening to who you are fighting,
   which is the choice that makes the four factions feel distinct. */
function audPlaylistFor(){
  if(!PLAY.lists) return null;
  const pick = n => audPlayableTracks(n, audSceneFilter()).length ? n : null;
  const scene=PLAY.scene||'menu';
  /* The launch reveal gets its own piece, so the first thing anyone hears is
     not the same loop as the menu they are about to land on. */
  try{
    if(document.body && !document.body.classList.contains('mfIntroDone')){
      const sp = pick('splash'); if(sp) return sp;
    }
  }catch(e){}
  /* Menu and War Table must NEVER fall through to a faction list — that
     fallback is what left a battle cue on the title after a match. An empty
     menu list falls through to mus_ambient. */
  if(scene==='menu'||scene==='wartable') return pick('menu');
  /* Result lists are explicit and never borrow a faction combat track. Empty
     victory/defeat lists intentionally return null so the cataloged core beds
     carry the result until dedicated owned masters are supplied. */
  if(scene==='result-victory') return pick('victory');
  if(scene==='result-defeat') return pick('defeat');
  let fac = null, enemy = null;
  try{
    if(typeof playerFaction!=='undefined'&&playerFaction) fac=playerFaction;
    else if(typeof META!=='undefined'&&META.setup&&META.setup.pf) fac=META.setup.pf;
    if(typeof AI !== 'undefined' && AI.fac && typeof facArt === 'function'){
      const A = facArt(AI.fac);
      if(A) enemy = A.id;
    }
  }catch(e){}
  /* Playlists are keyed nova / ascendancy / syndicate / horde. playerFaction
     is legion for Dominion, so the raw string never hits `ascendancy` and the
     player army lost the score to the enemy fallback. Resolve through facArt
     the same way the opponent path already does. */
  let playerList=null;
  try{
    if(typeof facArt==='function'&&fac){
      const A=facArt(fac);
      if(A&&A.id) playerList=A.id;
    }
  }catch(e){}
  return pick(playerList) || pick(fac) || pick(enemy) || pick('nova');
}
/* Combat intensity is noisy by design: one hit raises it and the envelope then
   decays. Hysteresis plus a nine-second hold keeps that useful signal from
   turning the soundtrack into a rapid series of restarts around a threshold. */
function audPlaylistState(i, prior){
  const p=prior||'explore';
  if(p==='combat') return i<0.43?(i<0.16?'explore':'tension'):'combat';
  if(p==='tension') return i>0.62?'combat':(i<0.15?'explore':'tension');
  return i>0.62?'combat':(i>0.27?'tension':'explore');
}
function audTrackBed(t){
  if(t&&t.state) return t.state==='combat'?'combat':(t.state==='tension'?'tension':'explore');
  const f=String((t&&(t.file||t.title))||'').toLowerCase();
  if(/_combat|combat_|blackout_crown|black_flag|iron_crown/.test(f)) return 'combat';
  if(/_tension|tension_/.test(f)) return 'tension';
  return 'explore';
}
function audPlayableTracks(name,state){
  const all=((PLAY.lists&&PLAY.lists[name])||[])
    .filter(t=>(t.bundled!==false||PLAY.haveExtra)&&!!audTrackExt(t));
  /* Ambient must not draw a combat stem, even when a remote music.json dropped
     the state tags (those lists used to return the whole faction pool). */
  if(!state) return all;
  const want=state==='combat'?'combat':'explore';
  let exact=all.filter(t=>audTrackBed(t)===want);
  if(!exact.length&&want==='explore') exact=all.filter(t=>audTrackBed(t)!=='combat');
  if(!exact.length&&want==='combat') exact=all.filter(t=>audTrackBed(t)!=='explore');
  /* An explore pool that is only a combat offline-bed must not play. The
     dual-codec mus_ambient stem carries the match until a real explore cue
     exists. Combat may still use that seed. */
  if(!exact.length) return want==='explore'?[]:all;
  const full=PLAY.haveExtra?exact.filter(t=>t.bundled===false):[];
  return full.length?full:exact;
}

/* A playlist whose pool is one track restarts it the instant it ends, which
   does not read as music — it reads as a 20-second loop running over and over,
   and on the MENU (where you may sit for minutes) it is the first thing anyone
   notices. Rest between plays, longer the smaller the pool. In a match the
   soundtrack is doing real work following combat intensity, so it never rests. */
function audPlaylistRest(){
  const inMatch = PLAY.scene==='ambient'||PLAY.scene==='action';
  const pool = audPlayableTracks(PLAY.cur, audSceneFilter()).length;
  /* A 2-3 minute piece has already earned its silence; only the short bundled
     seeds need a rest inserted so they do not read as a loop. */
  const cur = audPlayableTracks(PLAY.cur, audSceneFilter());
  const longForm = cur.length && cur.every(t => (t.dur||0) >= 60);
  const track=cur[PLAY.idx]||null;
  /* A seed is an excerpt, never a loop. Even in combat it yields to the adaptive
     bed before it may return. Long-form pieces also breathe instead of exposing
     their trimmed seam with an immediate restart. Manifest minRest wins when
     the composer has authored a longer pause. */
  const authored=track&&Number(track.minRest)||0;
  const gap=Math.max(authored,longForm?(inMatch?PLAY.policy.fullRestMs:9000)
            :(inMatch?PLAY.policy.seedRestMs
              :(pool<=1?PLAY.policy.menuSeedRestMs:pool<=2?13000:6000)));
  clearTimeout(PLAY.restT);
  if (!gap) { audPlaylistNext(); return; }
  audPlayState('resting','next cue in '+Math.ceil(gap/1000)+'s');
  PLAY.restT = setTimeout(() => { PLAY.restT = 0; audPlaylistNext(); }, gap);
}

function audPlaylistPlay(el,slot){
  if(!el||slot!==PLAY.slot||PLAY.hidden) return;
  audPlayState('loading','starting '+PLAY.nowTitle);
  let p;
  try{ p=el.play(); }
  catch(e){ audPlayState('failed',(e&&e.message)||'playback failed'); return; }
  if(p&&p.catch) p.catch(e=>{
    if(slot!==PLAY.slot) return;
    const name=String(e&&e.name||'');
    if(name==='NotAllowedError'||name==='SecurityError')
      audPlayState('locked','tap to enable music');
    else if(name!=='AbortError')
      audPlayState('stalled',(e&&e.message)||'playback interrupted');
  });
}

async function audPlaylistNext(){
  clearTimeout(PLAY.restT); PLAY.restT = 0;
  const gen = PLAY.generation;
  const name = PLAY.cur;
  if(!name || !PLAY.lists || !PLAY.lists[name] || !PLAY.lists[name].length) return;
  /* Only tracks that can actually play. A track is playable if it shipped in
     the installer, or if the pack that carries it has been downloaded. Filtering
     up front beats letting a missing file error, because the error handler
     cannot distinguish "this one file is absent" from "this browser has no
     decoder" — and the second has to abandon the playlist while the first must
     not. */
  const list = audPlayableTracks(name,audSceneFilter());
  if(!list.length){
    AUD_MUSIC.forEach(n => { if(!AUD.buf[n]) audLoad(n); });
    audPlayState('fallback','no playable soundtrack');
    try{ audMusicTick(0); }catch(e){}
    return;
  }
  let n = (Math.random() * list.length) | 0;
  if(list.length > 1 && list[n].file===PLAY.lastTrack) n=(n+1)%list.length;
  PLAY.idx = n;
  const track = list[n];
  PLAY.lastTrack=track.file;
  PLAY.nowTitle=track.title||'';

  const prev = PLAY.slot, next = prev ^ 1;
  audMediaSlot(next); audMediaSlot(prev);
  const el = PLAY.els[next], g = PLAY.gains[next];
  /* A short seed rest is carried by the adaptive bed. Retire that bed before
     the streamed cue fades in or both scores remain layered indefinitely. */
  if(audMusSrc){
    const bed=audMusSrc;
    if(bed._g) bed._g.gain.setTargetAtTime(0.0001,AC.currentTime,0.7);
    setTimeout(()=>{ try{ bed.stop(); }catch(e){} },2600);
    audMusSrc=null; audMusName='';
  }
  const ext=audTrackExt(track);
  if(!ext){ audAbandonPlaylist('no compatible soundtrack codec'); return; }
  const fileName = track.file.split('/').pop() + '.' + ext;
  /* Pack first, bundled path second. A build that ships the music inside the
     installer and one that downloads it behave identically from here. */
  /* Seed tracks are bundled. Starting them must stay synchronous with the
     player's tap: awaiting packURL here made iOS treat `play()` as autoplay
     and silently reject the menu/intro music. Full downloaded tracks may use
     the asynchronous pack lookup after the seed has already unlocked audio. */
  let url = AUD.base + track.file + '.' + ext;
  if(track.bundled===false&&typeof packURL === 'function'){
    try{ url = (await packURL('music', fileName)) || url; }catch(e){}
  }
  if(gen !== PLAY.generation || !PLAY.lists) return;
  el.src = url;
  el.currentTime = 0;
  /* audPlaylistPlay refuses slot!==PLAY.slot so a stale crossfade cannot
     restart a retired element. The old order called play(next) BEFORE
     flipping PLAY.slot, so the gesture's play() was a no-op and the real
     start happened on a later tick — Chrome autoplay then rejected it,
     Android WebView often still allowed it. Flip first, then play. */
  PLAY.slot = next;
  audPlaylistPlay(el,next);

  const t = AC.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setTargetAtTime(1, t, 1.4);
  const old = PLAY.gains[prev];
  if(old){
    old.gain.cancelScheduledValues(t);
    old.gain.setTargetAtTime(0.0001, t, 1.2);
    const oe = PLAY.els[prev];
    setTimeout(() => { try{ oe.pause(); }catch(e){} }, PLAY.policy.crossfadeMs);
  }
}

function audPlaylistTick(){
  if(!AC || !audMusBus || !PLAY.lists) return false;
  const disabled=!musicOn||muted;
  const live=typeof running!=='undefined'&&running;
  const i = (typeof musicInt === 'number') ? musicInt : 0;
  if(PLAY.lockedScene){
    if(!live) PLAY.lockedScene=false;
  } else if(live){
    PLAY.expectMatch=false;
    PLAY.wasLive=true;
    const now=performance.now();
    if(now>=(PLAY.switchAt||0)){
      const nextState=audPlaylistState(i,PLAY.state);
      if(nextState!==PLAY.state){ PLAY.state=nextState; PLAY.switchAt=now+9000; }
    }
    /* Action only after combat hysteresis trips; otherwise the match bed is
       ambient. Tension rides inside ambient so a skirmish cannot machine-gun
       short combat seeds the way the old per-state restart did. */
    const matchScene=PLAY.state==='combat'?'action':'ambient';
    if(PLAY.scene!==matchScene){
      PLAY.scene=matchScene;
      PLAY.forceNext=true;
    }
  } else if(PLAY.expectMatch){
    /* hideFrontScreens arms ambient before newSkirmish sets running. */
    PLAY.scene='ambient';
  } else if(PLAY.wasLive && (PLAY.scene==='ambient'||PLAY.scene==='action')){
    /* running flipped false without a hook — do not keep the battle bed. */
    PLAY.wasLive=false;
    PLAY.scene=audFrontScene();
    PLAY.forceNext=true;
    audMusicResetCombat();
    audStopMusicBeds();
    try{ ambStop(); }catch(e){}
    try{ audWorldClear(); }catch(e){}
  } else if(!PLAY.scene){
    PLAY.scene=audFrontScene();
  } else if(!PLAY.lockedScene){
    const front=audFrontScene();
    if((PLAY.scene==='menu'||PLAY.scene==='wartable') && PLAY.scene!==front)
      PLAY.scene=front;
  }
  const want = disabled ? null : audPlaylistFor();
  if(!want){
    if(PLAY.cur){ PLAY.cur = null; audMusBus.gain.setTargetAtTime(0.0001, AC.currentTime, 0.6);
      PLAY.els.forEach(e => { try{ e.pause(); }catch(x){} }); }
    if(!disabled && PLAY.phase!=='fallback')
      audPlayState('fallback','no playable soundtrack');
    else if(disabled) audPlayState('locked','music disabled');
    /* Empty or unplayable playlist — return false so audMusicTick can run
       the dual-codec mus_* beds on menu / War Table / match. */
    return disabled;
  }
  /* A track is replaced when the SCENE changes (menu / wartable / ambient /
     action) or the playlist name changes. Intensity no longer chops a
     long-form piece except at the ambient↔action boundary, which is the
     authored combat stem swap. */
  if(want !== PLAY.cur || PLAY.forceNext){
    PLAY.forceNext=false;
    clearTimeout(PLAY.restT); PLAY.restT=0;
    PLAY.cur = want; PLAY.idx = -1;
    audPlaylistNext();
  } else if(!PLAY.restT&&!PLAY.hidden&&
            (PLAY.phase==='locked'||PLAY.phase==='stalled')&&PLAY.els[PLAY.slot]){
    /* The first mobile play often loses to autoplay policy. The old code left
       PLAY.cur set and therefore never attempted this element again. */
    audPlaylistPlay(PLAY.els[PLAY.slot],PLAY.slot);
  }
  /* MediaElementSource on desktop Chrome sometimes advances currentTime
     without firing `playing`. Believe the element so the state machine
     matches what is actually coming out of the speakers. */
  const liveEl=PLAY.els[PLAY.slot];
  if(liveEl&&!liveEl.paused&&liveEl.currentTime>0&&
     (PLAY.phase==='loading'||PLAY.phase==='stalled'))
    audPlayState('playing',PLAY.nowTitle);
  /* Intensity still rides the level, so a firefight lifts the music without
     needing separate stems for licensed tracks. */
  /* ONE TIME CONSTANT CANNOT DUCK. AUD_DUCK arms the duck for 650 ms and
     audMusicGain multiplies by 0.58 — but at tau = 0.9 s the bus only travels
     1-e^(-0.65/0.9) = 51% of the way in that window, landing near 0.78. That is
     a 2.1 dB dip where 4.7 dB was intended, and it starts recovering before it
     bottoms out, so no alarm, explosion or radio line ever actually cut
     through the music. A duck needs a fast attack and a slow release. */
  const ducked = performance.now() < AUD.duckUntil;
  const mixI=(PLAY.scene==='ambient'||PLAY.scene==='action')?i:0;
  audMusBus.gain.setTargetAtTime(audMusicGain(0.34 + mixI * 0.16), AC.currentTime, ducked ? 0.06 : 0.9);
  /* During an authored rest, or after streamed playback has failed, allow the
     dual-codec adaptive beds to carry the mix rather than returning silence. */
  return PLAY.phase!=='resting'&&PLAY.phase!=='fallback'&&PLAY.phase!=='failed';
}

function audPlaylistSleep(){
  PLAY.hidden=true;
  if(PLAY.cur) PLAY.els.forEach(e=>{ try{ e.pause(); }catch(x){} });
  if(PLAY.cur&&!PLAY.restT) audPlayState('stalled','application backgrounded');
}
function audPlaylistWake(){
  PLAY.hidden=false;
  if(!PLAY.restT&&PLAY.cur) audPlayState('locked','resume requires audio permission');
  setTimeout(()=>{ if(AC&&PLAY.lists) audPlaylistTick(); },0);
}


/* Called by the asset-pack downloader the moment the soundtrack lands, so music
   starts in the session that fetched it rather than after a restart. */
function audAttachPack(){
  PLAY.haveExtra = true;
  if(!PLAY.lists) { audLoadPlaylists().then(() => { PLAY.cur = null; audPlayState('locked','soundtrack pack ready'); }); return; }
  PLAY.cur = null;                     // force audPlaylistTick to re-pick
  audPlayState('locked','soundtrack pack ready');
  audRenderNowPlaying();
}

/* ============================================================================
   COMMAND RADIO — one acknowledgement, never a wall of chatter
   ----------------------------------------------------------------------------
   The shipped clip is a clean walkie-talkie open/close transient, not a
   synthesized voice. The short visual line supplies the specific information
   without forcing one recorded English performance onto every faction. Global
   and per-command cooldowns make repeated move taps feel responsive while a
   drag or double tap cannot stack a dozen squelches through the compressor.
   ============================================================================ */
const RADIO_ACK={last:0,by:{},timer:0,seq:0,voiceAt:0};
const RADIO_COPY={
  select:['Command link established','Unit telemetry linked','Formation on channel'],
  move:['Vector confirmed','Advancing to marker','Route locked'],
  retreat:['Breaking contact','Falling back to marker','Disengaging'],
  attack:['Weapons free','Target solution confirmed','Engaging marked contact'],
  build:['Fabricator order received','Construction marker accepted','Build crew dispatched'],
  patrol:['Patrol circuit locked','Route uploaded','Watch pattern confirmed'],
  hold:['Holding this ground','Defensive posture set','Position anchored'],
  guard:['Escort pattern set','Guard detail assigned','Protecting marked asset'],
  stop:['Formation standing by','Order cancelled','Units holding'],
  ability:['Commander system armed','Tactical system responding','Ability order confirmed'],
  deploy:['Landing vector confirmed','Deployment site accepted','Base package descending'],
  underfire:['Taking fire','Commander under attack','Contact on the command unit'],
  victory:['Objective complete','Field is ours','Mission accomplished'],
  defeat:['Command net lost','We are overrun','Mission failed']
};
/* HUD flavour only. Brood audio is audBroodCue — never these strings, never TTS. */
const RADIO_COPY_BROOD={
  select:['Hive-link locked','Brood-mind attuned','Swarm on channel'],
  move:['Swarm advancing','Mass in motion','Hunt-path set'],
  retreat:['Swarm withdrawing','Mass peeling back','Hive pulling in'],
  attack:['Swarm striking','Prey marked','Hive hunting'],
  build:['Growth-site marked','Spawning order set','Hive expanding'],
  patrol:['Hunt circuit set','Swarm circling','Watch-mass moving'],
  hold:['Swarm anchoring','Mass holding ground','Hive rooted'],
  guard:['Swarm escorting','Mass shielding the marked','Hive-guard set'],
  stop:['Swarm still','Order dissolved','Mass waiting'],
  ability:['Hive-gift loosed','Brood-mind surge','Gift of the nest'],
  deploy:['Hive-fall locked','Nest-site chosen','Brood descending'],
  underfire:['Hive-mind struck','Queen under bite','Command-mass bleeding'],
  victory:['Prey consumed','Field belongs to the hive','Swarm triumphant'],
  defeat:['Hive-mind silent','Swarm broken','Nest fallen']
};
const RADIO_ICON={select:'◇',move:'➤',retreat:'➤',attack:'⚔',build:'⬡',patrol:'↻',hold:'⛊',guard:'⛨',stop:'■',ability:'✦',deploy:'⌄',underfire:'⚠',victory:'★',defeat:'✕'};
function radioFaction(){
  let key='nova';
  try{
    if(typeof playerFaction!=='undefined'&&playerFaction) key=playerFaction;
    else if(typeof carrier!=='undefined'&&carrier.fac) key=carrier.fac;
  }catch(e){}
  const A=typeof facArt==='function'?facArt(key):null;
  return A||{id:'nova',nm:'Terran Frontline Command',cdr:'Command',col:'#5db6ff'};
}
function radioPanel(){
  let el=document.getElementById('radioAck');
  if(el) return el;
  el=document.createElement('div'); el.id='radioAck'; el.setAttribute('aria-live','polite');
  el.innerHTML='<span class="raPulse"></span><span class="raIcon">◇</span>'+
    '<span class="raCopy"><b>COMMAND NET</b><i>Channel ready</i></span><span class="raCount"></span>';
  document.body.appendChild(el);
  return el;
}
function radioAck(action,count,wx,wy){
  if(!RADIO_COPY[action]) action=RADIO_COPY[voActionKey(action)]?voActionKey(action):'select';
  const now=performance.now();
  const A=radioFaction();
  const brood=voIsBrood(A.id);
  /* underfire is a volley, not an order — 6.5s between screams, but a recent
     move ack must not swallow the first hit. victory/defeat fire once. Orders
     keep the old 260/620 UI cadence so a formation drag still feels responsive
     without stacking VO. */
  if(action==='victory'||action==='defeat'){
    if(RADIO_ACK.by[action]) return false;
  }else if(action==='underfire'){
    if(now-(RADIO_ACK.by.underfire||-1e9)<6500) return false;
  }else if(action==='retreat'){
    /* Double-tap empty ground fires move then retreat inside 500 ms. The 260 ms
       global gate would swallow the retreat cue every time. Same-action 620 ms
       still stops a drag from stacking retreats. */
    if(now-(RADIO_ACK.by.retreat||-1e9)<620) return false;
  }else{
    const same=RADIO_ACK.by[action]||-1e9;
    if(now-RADIO_ACK.last<260||now-same<620) return false;
  }
  RADIO_ACK.last=now; RADIO_ACK.by[action]=now;
  const lines=(brood&&RADIO_COPY_BROOD[action])||RADIO_COPY[action];
  const line=lines[RADIO_ACK.seq++%lines.length];
  let speaker=A.nm||'FIELD UNIT';
  if(action==='ability'||action==='deploy'||action==='underfire'||action==='victory'||action==='defeat'){
    try{
      const C=typeof playerCommanderDef==='function'?playerCommanderDef():null;
      speaker=C&&C.nm?C.nm:(A.cdr||speaker);
    }catch(e){speaker=A.cdr||speaker;}
  }else if(action==='build') speaker=(A.nm||'FIELD')+' ENGINEER';
  else speaker=(A.nm||'FIELD')+' UNIT';
  /* Radio text deliberately shares the single HUD notice rail with gameplay
     warnings. Two independent fixed overlays overlapped on phones whenever an
     order landed during a warning. */
  if(typeof radioNotice==='function') radioNotice(speaker+' // '+action.toUpperCase(),line+(count>1?' · '+count+' UNITS':''));
  else if(typeof toast==='function') toast(line);
  /* Human factions: walkie squelch then pack VO. Brood: no radio hiss — that
     click is a person on a handset. voPlay is the voice, not speakVoice:
     tutorialVoice / 5200ms throttle used to swallow almost every ack. */
  if(!brood && typeof sfx==='function') sfx('radio',wx,wy,0.9);
  RADIO_ACK.voiceAt=now;
  /* Pack has no retreat/underfire/victory/defeat/guard takes. Aliasing those
     onto stop/attack/ability/hold played the wrong spoken line (victory said
     "Commander system armed"; underfire said "Weapons free"). HUD copy stays;
     VO only plays when the bank actually has that action. */
  if(voActionKey(action)===action) voPlay(A.id, action, wx, wy, lines.indexOf(line));
  return true;
}

/* ============================================================================
   AMBIENCE — the bed under everything
   ----------------------------------------------------------------------------
   A battlefield with only music and gunfire has silence between the gunfire, and
   silence reads as "nothing is loaded" rather than as calm. An ambient bed fixes
   that for almost no cost: a continuous low hull rumble sitting beneath the mix,
   audible mostly when it stops.

   Two beds rather than one, crossfaded on combat intensity. `amb_low` is hull
   and machinery — the sound of a base that exists. `amb_high` is air and stress.
   Pushing between them on the same `musicInt` signal the music uses means the
   room itself tightens during a fight, which the player feels without ever
   noticing there is a second file.

   Looping is why these are AudioBuffers rather than media elements: a
   BufferSource with loop=true has a sample-accurate seam, while an
   HTMLAudioElement loop has an audible gap on most browsers. The 30-second beds
   cost about 5 MB of memory each decoded, which is affordable for two — and is
   exactly why the music, at fifteen tracks, streams instead.
   ============================================================================ */
const AMB = { on:false, srcs:{}, gains:{}, bus:null, filter:null };

function ambStart(){
  if(!AC || !audSfxBus || AMB.on) return;
  if(!AUD.buf.amb_low0 && !AUD.buf.amb_high0) return;
  AMB.bus = AC.createGain();
  AMB.bus.gain.value = 0.0001;
  /* Remove the abrasive upper hiss before ambience reaches the shared mobile
     compressor. This also protects future replacement beds from ear fatigue. */
  AMB.filter=AC.createBiquadFilter();
  AMB.filter.type='lowpass'; AMB.filter.frequency.value=2200; AMB.filter.Q.value=0.45;
  AMB.bus.connect(AMB.filter); AMB.filter.connect(audAmbBus || audSfxBus || audComp || AC.destination);
  for(const k of ['amb_low0','amb_high0']){
    const b = AUD.buf[k];
    if(!b) continue;
    const s = AC.createBufferSource();
    s.buffer = b; s.loop = true;
    /* Detune the high bed very slightly so the two 30-second loops do not
       re-align on the same seam every pass and become recognisable. */
    if(k === 'amb_high0') s.playbackRate.value = 0.997;
    const g = AC.createGain();
    g.gain.value = k === 'amb_low0' ? 1 : 0.0001;
    s.connect(g); g.connect(AMB.bus);
    try{ s.start(0, Math.random() * b.duration); }catch(e){ continue; }
    AMB.srcs[k] = s; AMB.gains[k] = g;
  }
  AMB.on = true;
}
function ambStop(){
  if(!AMB.on) return;
  if(AMB.bus) AMB.bus.gain.setTargetAtTime(0.0001, AC.currentTime, 0.5);
  const srcs = AMB.srcs;
  setTimeout(() => { for(const k in srcs){ try{ srcs[k].stop(); }catch(e){} } }, 1500);
  AMB.srcs = {}; AMB.gains = {}; AMB.filter=null; AMB.on = false;
}
function ambTick(){
  if(!AC) return;
  const want = (typeof running !== 'undefined' && running && !paused && !muted &&
                (typeof sfxOn==='undefined'||sfxOn));
  if(want && !AMB.on) ambStart();
  else if(!want && AMB.on){ ambStop(); return; }
  if(!AMB.on || !AMB.bus) return;
  const i = (typeof musicInt === 'number') ? musicInt : 0;
  const t = AC.currentTime;
  /* Quiet enough to be missed rather than heard. It lifts a little in combat
     because a fight should feel closer, not louder. */
  AMB.bus.gain.setTargetAtTime(0.14 + i * 0.04, t, 1.2);
  if(AMB.gains.amb_low0)  AMB.gains.amb_low0.gain.setTargetAtTime(0.88 - i * 0.18, t, 2.0);
  if(AMB.gains.amb_high0) AMB.gains.amb_high0.gain.setTargetAtTime(0.01 + i * 0.16, t, 2.0);
}

/* ============================================================================
   POSITIONAL WORLD LOOPS
   ----------------------------------------------------------------------------
   Movement and machinery are continuous sources, not repeated one-shots. The
   nearest five moving units and nearest three structures receive individual
   loop voices with their own pan and distance gain. That preserves proximity
   and direction while placing a hard eight-voice ceiling on a 20,000-unit map.
   ============================================================================ */
const WORLD_AUD={tick:0, emit:{}};

function audWorldDrop(key){
  const e=WORLD_AUD.emit[key];
  if(!e) return;
  delete WORLD_AUD.emit[key];
  try{ e.g.gain.setTargetAtTime(0.0001,AC.currentTime,0.08); }catch(x){}
  setTimeout(()=>{ try{ e.src.stop(); }catch(x){} },320);
}
function audWorldClear(){ for(const key in WORLD_AUD.emit) audWorldDrop(key); }
function audWorldEnsure(c){
  let e=WORLD_AUD.emit[c.key];
  if(e&&e.slot!==c.slot){ audWorldDrop(c.key); e=null; }
  if(e) return e;
  const buf=audPick(c.slot);
  if(!buf||!audSfxBus) return null;
  const src=AC.createBufferSource(); src.buffer=buf; src.loop=true;
  src.playbackRate.value=0.985+Math.random()*0.03;
  const g=AC.createGain(); g.gain.value=0.0001;
  let p=null;
  if(AC.createStereoPanner){ p=AC.createStereoPanner(); g.connect(p); p.connect(audSfxBus); }
  else g.connect(audSfxBus);
  src.connect(g);
  try{ src.start(0,Math.random()*Math.max(0.05,buf.duration)); }catch(x){ return null; }
  e={src:src,g:g,p:p,slot:c.slot}; WORLD_AUD.emit[c.key]=e;
  return e;
}
function audWorldTick(dt){
  if(!AC||!AUD.ready) return;
  const on=typeof running!=='undefined'&&running&&!paused&&!muted&&
           (typeof sfxOn==='undefined'||sfxOn)&&typeof camBounds==='function';
  if(!on){ if(Object.keys(WORLD_AUD.emit).length) audWorldClear(); return; }
  WORLD_AUD.tick-=dt;
  if(WORLD_AUD.tick>0) return;
  WORLD_AUD.tick=0.20;
  if(typeof unitHigh==='undefined'||typeof blds==='undefined') return;
  const bounds=camBounds(), cx=(bounds.x0+bounds.x1)*0.5, cy=(bounds.y0+bounds.y1)*0.5;
  const half=Math.max(1,(bounds.x1-bounds.x0)*0.5);
  const radius=Math.max(420,Math.max(bounds.x1-bounds.x0,bounds.y1-bounds.y0)*0.92);
  const r2=radius*radius, movers=[], structures=[];
  /* Reuse the smooth owned air-movement loop for the carrier instead of
     replaying the old synthetic thrust noise. */
  if(typeof carrier!=='undefined'&&carrier.active&&carrier.phase<2){
    const dx=carrier.x-cx,dy=carrier.y-cy,d2=dx*dx+dy*dy;
    if(d2<=r2){
      const flying=carrier.phase===0, driving=Math.hypot(carrier.tx-carrier.x,carrier.ty-carrier.y)>4;
      movers.push({key:'carrier-flight',slot:'move_air',x:carrier.x,y:carrier.y,d2:d2,
                   base:flying?0.24:(driving?0.20:0.11)});
    }
  }
  for(let i=0;i<unitHigh;i++){
    if(!ualive[i]||!umov[i]) continue;
    const dx=ux[i]-cx,dy=uy[i]-cy,d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    const T=TYPES[utype[i]];
    const brood=typeof unitIsBrood==='function'&&unitIsBrood(i);
    movers.push({key:'u'+i+'g'+ugen[i],slot:brood?'move_brood':(T.air?'move_air':'move_vehicle'),
                 x:ux[i],y:uy[i],d2:d2,base:brood?0.15:(T.air?0.16:0.13)});
  }
  for(let b=0;b<blds.length;b++){
    const B=blds[b]; if(!B||!B.alive||B.prog<1) continue;
    const dx=B.x-cx,dy=B.y-cy,d2=dx*dx+dy*dy;
    if(d2>r2) continue;
    const factory=B.type==='fac'||B.type==='tgate'||B.type==='harbor'||B.type==='airfield';
    const damaged=B.team===0&&B.hp<B.hpm*0.42;
    structures.push({key:'b'+b,slot:damaged?'alarm_loop':(B.type==='nest'?'move_brood':(factory&&B.queue&&B.queue.length?'factory_hum':'structure_hum')),
                     x:B.x,y:B.y,d2:d2,base:damaged?0.22:(factory?0.14:0.10)});
  }
  movers.sort((a,b)=>a.d2-b.d2); structures.sort((a,b)=>a.d2-b.d2);
  const chosen=movers.slice(0,5).concat(structures.slice(0,3)), seen={};
  for(const c of chosen){
    seen[c.key]=1;
    const e=audWorldEnsure(c); if(!e) continue;
    const dist=Math.sqrt(c.d2), near=clamp(1-dist/radius,0,1);
    e.g.gain.setTargetAtTime(Math.max(0.0001,c.base*near*near),AC.currentTime,0.10);
    if(e.p) e.p.pan.setTargetAtTime(clamp((c.x-cx)/half,-1,1)*0.82,AC.currentTime,0.08);
  }
  for(const key in WORLD_AUD.emit) if(!seen[key]) audWorldDrop(key);
}

