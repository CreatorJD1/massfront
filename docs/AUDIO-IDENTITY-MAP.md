# MASSFRONT audio identity map

The Suno playlist songs (Cold Crown, Ashes to Crown, Iron Crown, Blackout Crown,
Black Iron Pulse, Bassquake Chronicles, Black Flag Vulture, Black Helmets) were
removed from source on 2026-08-15 because they are vocal/lyric tracks. The live
score is the three dual-codec instrumental beds `mus_ambient`, `mus_tension`,
and `mus_combat`. An empty `music.json` playlist abandons the AAC streamer so
the menu is not silent.

`src/audio.js` still changes scene with hysteresis and a nine-second minimum
hold. Command radio is unchanged.

## Command feedback

Selection, move, attack, build, patrol, hold, stop, deploy and Commander ability
orders call the same restrained command-radio path. It combines one clean
walkie-talkie transient with a faction-coloured visual acknowledgement. Global
260 ms and per-action 620 ms gates prevent stacked chatter; normal positional
weapons, movement loops and structure ambience keep their existing proximity
mixing and voice caps.
