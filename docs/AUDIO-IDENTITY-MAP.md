# MASSFRONT audio identity map

The previous soundtrack manifest named fifteen songs, but every entry was marked
`bundled:false`, the source paths only existed in a temporary `/tmp/music-in`
folder, and the live release channel had no `packs.json`. Nine authentic supplied
AAC masters were recovered intact from `releases/MASSFRONT.apk`; the game had
silently fallen back to the same three generic loops instead of playing them.

This pass uses music supplied by the project owner and keeps two delivery tiers:

- **Bundled seed:** an 18-second, stereo AAC excerpt for every faction and every
  intensity state, plus a menu seed. The thirteen files total 2.76 MB, so a
  fresh/offline install has the real supplied score immediately.
- **Optional soundtrack pack:** the nine recovered 92-second masters in
  `releases/audio-pack/pack/music`. The generated `packs.json` is ready to upload
  beside `update.json` later. The pack is 9.83 MB and does not inflate the APK.

The bundled tier is 44.1 kHz stereo AAC at 96 kbps, loudness-normalised to
-16 LUFS with -1.5 dB peak protection and short edge fades. The recovered masters
stay byte-identical in the optional pack. No MP3, Ogg, oscillator, chiptune or
retro-arcade music enters the playlist.

| Canonical faction | Supplied source | Explore | Tension | Combat identity |
| --- | --- | --- | --- | --- |
| Nova Federation / Terran Frontline | `Black Iron Pulse`, `Blackout Crown` | precise pulse | powered contact | Blackout overcharge |
| Red Ascendancy / Legion | `Ashes to Crown`, `Iron Crown` | disciplined march | gathering pressure | martial conquest |
| Syndicate Coalition / Machine Ascendancy | `Bassquake Chronicles Remastered`, `Black Flag Vulture` | electronic probe | covert trace | aggressive breach |
| Umbral Brood / Infestation Swarm | `Black Helmets`, `Black Iron Pulse` | dormant stirring | rising hunger | devouring surge |

The main menu uses the recovered `Cold Crown` master.

`src/audio.js` now changes state with hysteresis and a nine-second minimum hold,
so individual shots cannot repeatedly restart the score. Optional pack tracks
crossfade in through the same streaming player and compressor.

## Command feedback

Selection, move, attack, build, patrol, hold, stop, deploy and Commander ability
orders call the same restrained command-radio path. It combines one clean
walkie-talkie transient with a faction-coloured visual acknowledgement. Global
260 ms and per-action 620 ms gates prevent stacked chatter; normal positional
weapons, movement loops and structure ambience keep their existing proximity
mixing and voice caps.
