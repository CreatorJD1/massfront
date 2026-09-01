# Five-channel update — keep every ship surface on the same bits

The 1.33.35 failure: browser `www/` and live Android were both labeled **1.33.35**, but they were different builds. The updater said “up to date.” Same semver is not the same payload.

Every release that leaves this machine must move **all five channels** or the agent must say which one it skipped and why.

```
src/  →  pack-www  →  8901 verify
                 ├→  HF OTA  (phones already installed)
                 ├→  Capacitor Android APK
                 └→  HF Space HTML
```

Apple support rides the browser/PWA surfaces: install the HF Space build from
Safari with **Share → Add to Home Screen**. Native iOS/IPA/Xcode/TestFlight/App
Store delivery is permanently retired and is not a sixth channel or a release
gate.

---

## The five channels

### 1. Canonical source

Edit only: `src/`, `boot.js`, `index.html`, `assets/`.

After **every** `src/` change:

```bash
node tools/bundle.mjs
```

One global scope. Two files declaring the same `const` crash at load. `bundle.mjs` is the syntax gate.

New files go in **both** `boot.js` `MANIFEST` and `assets/data/manifest.json` `order`.

### 2. Packed www (local browser)

```bash
node tools/pack-www.mjs
# serve www/ on 8901 only — not npm run dev / 8100
```

`http://127.0.0.1:8901/` is the live verify server. One hard refresh after pack. Hardware GPU via `tools/pw-browser.mjs` — never SwiftShader.

### 3. Hugging Face OTA (in-game updater)

- Dataset: `CREATORJD/massfront-releases`
- Client: `src/updater.js` polls `update.json`
- Publisher: `tools/publish-hf-release.ps1` (or `PUBLISH_HF_RELEASE.bat`)
- Payload: an ordered `v<ver>/artifacts.json` inventory plus independently
  hashed source artifacts and deterministic 4 MiB range tables. **Not** the
  complete `www/` tree and not one opaque update blob.
- Activate `update.json` **last**. Leave older payloads on the dataset.

Large world/model/audio content is not placed in executable `files[]`. It uses
the optional-pack registry, section/dependency manifests and its own resumable
install/repair/remove lifecycle. Full player releases exclude the monolithic
Galactic tree from the base package unless a deliberately approved packaged
content boundary says otherwise.

OTA **cannot** replace the pre-script `boot.js` already inside an Android
wrapper, AndroidManifest permissions, or `navigator.vibrate`. A `boot.js`
change needs repacked browser surfaces and a new Android package for installed
Android users; Android-native changes need channel 4. Descriptor-capable new
boots consume content-addressed source records directly; older wrappers retain
the compatible assembled-bundle path.

### 4. Android native (Capacitor APK)

```bash
npx cap sync android
cd android && ./gradlew assembleDebug --offline
bash tools/shrink-apk.sh    # mandatory — 51 MB → ~28 MB
```

`publish-hf-release.ps1` bumps Android `versionName` / `versionCode` before
syncing the Android wrapper. There is no native-iOS version, sync, build,
signing or upload gate.

### 5. HF Space browser playtest

- Space: `CREATORJD/massfront-playtest`
- URL: `https://creatorjd-massfront-playtest.static.hf.space/`
- Upload packed `www/` (not the OTA JS).
- `publish-hf-release.ps1` does **not** do this. Do it explicitly or write “Space skipped.”

Do not POST to `7924` unless the user asks. Cloudflare Workers update path is obsolete.

---

## Version strings that must move together

| File | Field |
|---|---|
| `boot.js` | `PACKAGED_REV` |
| `src/updater.js` | `APP_VERSION`, `APP_NOTES` |
| `package.json` | `version` |
| `package-lock.json` | root `version` (both places) |
| `index.html` | `?v=` on CSS / icons |
| `assets/app.webmanifest` | version |
| `android/app/build.gradle` | `versionCode`, `versionName` |
| `update.json` | `version` + payload URL + sha256 + size |

Android `versionCode` = semver without dots (`1.33.37` → `13337`). Apple PWA
installs use the web/OTA version and have no separate native version.

---

## Agent checklist (copy this)

1. Bump **every** row in the table above to the same semver.
2. `node tools/bundle.mjs` — fail = stop.
3. `node tools/pack-www.mjs`.
4. Hard-refresh `http://127.0.0.1:8901/` once. Look at the screenshot. Console-clean is not success.
5. `tools/publish-hf-release.ps1` (or the documented hf.exe path). Confirm live `update.json` version, size, sha256 match local.
6. If Android-packaged bits changed (`boot.js`, vibrate, manifest): build and shrink the APK. Else say “Android APK not required.”
7. Upload exact `www/` to Space and verify it. If explicitly skipped, say “HF Space skipped.”
8. Verify Apple support through Safari/WebKit: Add to Home Screen, standalone launch, safe areas/rotation, AAC gesture unlock, storage/offline behavior and OTA/rollback. Do not create or wait for a native iOS artifact.
9. Do not git-commit unless the user asked. Do not force-push `main`.

The publisher does not build or upload the large collaborator source archive by
default. That handoff artifact is opt-in and independent from the five player
channels; canonical source synchronization is not evidence that an archive was
uploaded.

---

## Do not

- Leave `update.json` on an old payload after a local bump.
- Publish OTA without packing `www/` first.
- Treat 8901 and the live phone as the same build because the version string matches.
- Re-upload over a previous `MASSFRONT-v*-update.js` — new patch number.
- Add a native iOS/IPA/Xcode/TestFlight/App Store task or gate; that release lane
  is permanently retired.
- Ship vocal/lyric music (Suno playlist songs were removed; keep `mus_*` beds only).
- Add `import`/`export` under `src/`.

---

## GitHub remote (private `CreatorJD1/massfront`)

Canonical remote: `https://github.com/CreatorJD1/massfront`

```bash
git remote add origin https://github.com/CreatorJD1/massfront.git
git push -u origin main
```

Do not force-push `main`. Do not commit secrets. Uncommitted local work is not on the remote until someone commits and pushes.
