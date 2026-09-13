# MASSFRONT — Repository Taxonomy & Source Migration Plan

**Status:** Proposed Architecture & Safe Migration Blueprint.  
**Rule:** Zero moves or deletions during active sprint; preserves dirty worktree and backwards compatibility across all build scripts.

---

## 1. Current Repository Sprawl & Friction Analysis

Over 40+ release iterations, rapid iteration created flat file accumulation in root and `tools/`:
- **`tools/` (150+ files):** Mixed test harnesses (`test-*.mjs`), capture scripts (`capture-*.mjs`), Python bake scripts (`bake-*.py`), Blender exporters, and build scripts (`bundle.mjs`, `pack-www.mjs`) all sit in one flat directory.
- **Root Directory:** Contains debug text files (`ab.txt`, `perf.txt`, `cloud.txt`, `match.txt`), standalone release batch scripts, and experimental modules.
- **`assets/` vs `archive/`:** Authoring assets, source textures (`assets/source/`), and runtime textures (`assets/textures/`) sit beside each other.

---

## 2. Proposed Target Taxonomy Structure

```
massfront-rts-mobile-game-for-apple/
├── src/                               # Runtime WebGL2 Engine (1 global scope, ordered classic scripts)
│   ├── engine/                        # Core GL, geometry, materials, physics, terrain
│   ├── game/                          # Sim, AI, economy, commander, meta
│   ├── ui/                            # HUD, input, render3d, social UI
│   └── *.js                           # Self-contained feature modules (audio, tutorial, daily)
├── assets/                            # Production Shipped Assets (Strictly runtime accessible)
│   ├── audio/                         # Dual-format SFX (.ogg/.m4a) and curated music
│   ├── data/                          # manifest.json, unitsheet.js, unitrows.js
│   ├── terrain/                       # Compressed terrain splatmaps and detail textures
│   └── textures/                      # Shipped PBR atlases and VFX flipbooks
├── authoring/                         # OFFLINE Creative Sources (NEVER packaged into APK)
│   ├── blender/                       # Source .blend rigs and high-poly models
│   ├── audio-masters/                 # 24-bit WAV library recordings and raw voice takes
│   └── substance/                     # Raw PSD and Substance Painter project files
├── tools/                             # Developer & Build Toolchain (Categorized)
│   ├── build/                         # bundle.mjs, pack-www.mjs, bundle-update.mjs
│   ├── bakes/                         # bake-worldkit-*.py, bake-combat-fx.py, artv2/
│   ├── audio/                         # make-audio.py, ingest-sfx.py, make-voices.py
│   ├── design/                        # extract-design-db.mjs, build-design-db.py
│   ├── perf-lab/                      # Performance probes, deterministic scenarios, metrics
│   ├── interface-audit/               # Fail-closed interface verifiers & fixture tests
│   └── qa/                            # capture-*.mjs, verify-*.mjs automated captures
├── cloudflare/                        # Cloudflare Workers Backend
│   ├── massfront-auth/                # Auth, accounts, D1 migrations
│   ├── massfront-update/              # Release delivery & OTA manifests
│   └── massfront-economy/             # Economy and progression services
├── design/                            # Extracted Design Databases (SQLite, XLSX, HTML, JSON)
├── docs/                              # Engineering & Design Architecture Documentation
│   ├── performance/                   # Performance audits, scaling plans, update architecture
│   └── *.md                           # Subsystem handoffs and release postmortems
├── tmp/                               # Ephemeral Test & Audit Outputs (.gitignore)
│   ├── perf-lab/                      # Raw benchmark JSONs and screenshots
│   └── interface-audit/               # Fail-closed audit reports and fixture outputs
├── android/                           # Capacitor Android Studio Native Project
└── ios/                               # Capacitor Xcode Native Project
```

---

## 3. Step-by-Step Zero-Risk Migration Playbook

### Phase 1: Establish Forwarding Aliases & Tool Shims
Before moving any script, create lightweight forwarding wrapper scripts in `tools/` that delegate to the categorized subdirectory:
```javascript
// tools/bundle.mjs (Forwarder Shim)
import './build/bundle.mjs';
```
This guarantees that existing npm scripts (`npm run build`, `npm run bundle`), CI pipelines, and developer habits remain 100% functional without breaking changes.

### Phase 2: Staging Filter Update in `pack-www.mjs`
Update `shouldPack(path)` in `tools/build/pack-www.mjs`:
- Exclude `authoring/**`, `tools/**`, `tmp/**`, `docs/**`, `design/**`.
- Verify `www/` staging directory produces identical byte-level output.

### Phase 3: Manifest & Boot Script Audit
Verify that `boot.js` (`MANIFEST`) and `assets/data/manifest.json` (`order`) continue referencing only runtime files under `src/**` and `assets/**`.

### Phase 4: Git Move (`git mv`) & CI Verification
Execute migration during an explicit maintenance window:
```bash
# Example atomic move commands (executed only after approval)
git mv tools/bundle.mjs tools/build/bundle.mjs
git mv tools/pack-www.mjs tools/build/pack-www.mjs
git mv tools/make-audio.py tools/audio/make-audio.py
```
Run `node tools/build/bundle.mjs` and `node tools/build/pack-www.mjs` to verify build integrity.

---

## 4. Acceptance Criteria & Safety Checklist

- [ ] `node tools/build/bundle.mjs` produces identical single-file bundle `dist/massfront.html`.
- [ ] `node tools/build/pack-www.mjs` produces zero 404s and identical `www/` payload size.
- [ ] No changes to runtime load order in `boot.js` or `manifest.json`.
- [ ] All CI and test commands pass with exit code 0.
