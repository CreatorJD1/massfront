# Five-channel update — keep every ship surface on the same bits

The 1.33.35 failure: browser `www/` and live Android were both labeled **1.33.35**, but they were different builds. The updater said “up to date.” Same semver is not the same payload.

Every release that leaves this machine must move **all five channels** or the agent must say which one it skipped and why.

```
src/  →  pack-www  →  8901 verify
                 ├→  HF OTA  (phones already installed)
                 ├→  Capacitor APK / IPA
                 └→  HF Space HTML
```

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
- Payload: `MASSFRONT-v<ver>-update.js` (~45–57 MB). **Not** the 81 MB `www/` tree.
- Activate `update.json` **last**. Leave older payloads on the dataset.

OTA **cannot** replace `boot.js`, AndroidManifest permissions, or `navigator.vibrate`. Those need channel 4.

### 4. Native (Capacitor Android + iOS)

```bash
npx cap sync android
cd android && ./gradlew assembleDebug --offline
bash tools/shrink-apk.sh    # mandatory — 51 MB → ~28 MB
```

`publish-hf-release.ps1` bumps Android `versionName` / `versionCode`. **iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` is manual** — bump it in the same pass.

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
| `ios/App/App.xcodeproj/project.pbxproj` | `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` |
| `update.json` | `version` + payload URL + sha256 + size |

`versionCode` / `CURRENT_PROJECT_VERSION` = semver without dots (`1.33.37` → `13337`).

---

## Agent checklist (copy this)

1. Bump **every** row in the table above to the same semver.
2. `node tools/bundle.mjs` — fail = stop.
3. `node tools/pack-www.mjs`.
4. Hard-refresh `http://127.0.0.1:8901/` once. Look at the screenshot. Console-clean is not success.
5. `tools/publish-hf-release.ps1` (or the documented hf.exe path). Confirm live `update.json` version, size, sha256 match local.
6. If native bits changed (`boot.js`, vibrate, manifest): APK + shrink + iOS bump. Else say “APK not required.”
7. If Space should match: upload `www/`. Else say “Space skipped.”
8. Do not git-commit unless the user asked. Do not force-push `main`.

---

## Do not

- Leave `update.json` on an old payload after a local bump.
- Publish OTA without packing `www/` first.
- Treat 8901 and the live phone as the same build because the version string matches.
- Re-upload over a previous `MASSFRONT-v*-update.js` — new patch number.
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
