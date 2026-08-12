# MASSFRONT

A Supreme-Commander-style mobile RTS. Hand-written WebGL2 engine in plain
JavaScript — no framework, no runtime dependencies — packaged for Android and
iOS with Capacitor, backed by Cloudflare Workers.

**Start here:** [`AGENTS.md`](AGENTS.md) for the rules that will save you time,
then [`docs/HANDOFF.md`](docs/HANDOFF.md) for architecture, current state and
open work.

## Run it

```bash
python3 -m http.server 8901        # then open http://127.0.0.1:8901/
```

No build step. `index.html` loads `boot.js`, which loads the source files in
order. That is deliberate — see the handoff.

## Build

```bash
node tools/bundle.mjs         # single-file build AND the syntax gate — run this often
node tools/pack-www.mjs       # stage www/ for Capacitor, verify nothing 404s
npx cap sync android && (cd android && ./gradlew assembleDebug --offline)
bash tools/shrink-apk.sh      # mandatory: 51 MB -> 28 MB, and re-signs
```

## Layout

| Path | |
|---|---|
| `boot.js` | loader — packaged files, or an OTA-patched bundle from IndexedDB |
| `src/engine/` | GL, meshes, materials, terrain, models |
| `src/game/` | simulation, economy, AI, progression |
| `src/ui/` | input, HUD, 3D scene composition |
| `src/*.js` | feature modules that hook in by taking over a global |
| `assets/` | baked unit sheet, item art, audio, faction art |
| `cloudflare/` | update, auth and economy workers |
| `tools/` | build, asset pipelines, design-database extraction |
| `design/` | generated balance database (SQLite / XLSX / HTML) |

## Non-negotiables

1. **One global scope, no modules.** Duplicate a top-level name and the game
   fails to load. `node tools/bundle.mjs` is the only thing that catches it.
2. **Register new files in two places** — `boot.js` and
   `assets/data/manifest.json`. Order matters.
3. **Verify visually.** A clean console proves nothing about a renderer; this
   project has shipped hollow buildings and a full-screen texture atlas without
   a single error being thrown.

## What is not in this archive

Three things are excluded to keep the source tree reviewable. All are
regenerable, none are code.

| Missing | Why | Restore with |
|---|---|---|
| `android/`, `ios/` (except config) | generated Capacitor scaffolding, ~150 MB of it | `npx cap add android && npx cap add ios` — the customised `AndroidManifest.xml`, `build.gradle`, `Info.plist` and `project.pbxproj` **are** included, so copy them back over |
| `assets/audio/music/` | 15 licensed tracks, ~16 MB | supply the source audio and run `python3 tools/ingest-music.py <dir> --apply`; `music-assign.json` preserves every assignment |
| `node_modules/`, `www/`, `dist/`, `*.apk` | build output | `npm install`, then the build commands above |

The 33 synthesised sound effects **are** included, and are also reproducible
from nothing with `python3 tools/make-audio.py`.
