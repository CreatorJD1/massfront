# MASSFRONT Kokoro voice pipeline

MASSFRONT renders speech offline with the official `hexgrad/Kokoro-82M`
pipeline. The game does not run an 82M-parameter model on a phone. It ships the
finished, compressed takes through the existing optional audio pack, so Android
and iPhone playback stays fast, deterministic and fully offline.

Kokoro-82M and its weights are Apache 2.0. Its model card and official voice
catalogue are:

- https://huggingface.co/hexgrad/Kokoro-82M
- https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md

## One-click render on this Windows workspace

```bat
tools\render-kokoro-voices.bat
```

The first run installs Kokoro under `.toolchains/kokoro` and downloads its
weights to `.toolchains/kokoro-cache`. Both folders are ignored build tooling;
neither is copied to `www`, Android, iOS, a source release, or an OTA patch.

Useful focused runs:

```bat
tools\render-kokoro-voices.bat --take keen_greeting --force
tools\render-kokoro-voices.bat --speaker nova
tools\render-kokoro-voices.bat --check --deep
```

The renderer extracts the actual tutorial and radio copy from `src/`, then
creates `.ogg` for Chromium/Android and `.m4a` for Safari/iOS. Both formats pass
through the existing comms filter, silence guard, peak guard and manifest hash.
After rendering, rebuild the downloadable pack with:

```bat
node tools\build-voice-pack.mjs
```

The current casting keeps speakers distinguishable:

- KEEL guide: `af_heart`
- Terran/Nova field radio: `am_michael`
- Dominion/Ascendancy field radio: `bm_george`
- Coalition/Syndicate field radio: `af_bella`
- Brood dossier/AI radio treatment: `bm_fable`, lowered and heavily filtered

Voice weights are tools, not game assets. Adding the model itself to the APK is
forbidden because it would increase installer size and consume memory during an
RTS match for no gameplay benefit.
