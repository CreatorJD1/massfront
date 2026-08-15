# AGENTS.md — MASSFRONT

Read this before touching anything. It is short on purpose; the long version is
`docs/HANDOFF.md`.

MASSFRONT is a Supreme-Commander-style mobile RTS: a hand-written WebGL2 engine
in plain JavaScript, packaged for Android and iOS with Capacitor, with a
Cloudflare Workers backend for accounts, patches and asset delivery.

---

## Build and verify

```bash
node tools/bundle.mjs          # single-file build -> dist/massfront.html
                              #   ALSO the syntax gate: it parses the whole
                              #   concatenated source and fails on collisions
node tools/pack-www.mjs       # stage www/ for Capacitor; verifies nothing 404s
npx cap sync android          # copy www/ into the native project
cd android && ./gradlew assembleDebug --offline
bash tools/shrink-apk.sh      # MANDATORY — see "APK size" below
```

Run `node tools/bundle.mjs` after **every** source change. It is the fastest way
to catch the single most common failure mode in this codebase (below).

---

## The five things that will bite you

**1. One global scope, no modules.** Every file in `assets/data/manifest.json`
is a classic `<script>`, concatenated into one scope. There is no `import`, no
`export`, and no module boundary. Two files declaring `const RESEARCH` is a
crash at load, not a warning. `tools/bundle.mjs` parses the concatenation and
will tell you; nothing else will. This has bitten us four times (`bloomB`,
`RESEARCH`, `resDone`, `name`).

**2. New files must be registered in TWO places.** `boot.js` (`MANIFEST`, the
runtime load order) and `assets/data/manifest.json` (`order`, used by the
bundler and the OTA release packer). Miss either and the file silently does not
load. Order matters — a file may only reference globals declared in files
listed before it.

**3. Extend by takeover, not by editing.** Several modules replace a global
function at init rather than editing the file that owns it:
`src/audio.js` takes over `sfx()`, `src/restree3d.js` takes over
`renderDevelop()`, `src/offline.js` wraps `renderSettings()`. This keeps
features separable and lets the original stay as a fallback. Prefer it to
editing `src/game/*.js` or `src/ui/*.js`, especially for anything optional.

**4. The renderer's post-processing chain lives on texture units 4/5/6 and must
never move to unit 0.** A sampler that defaults to unit 0 once caused the
material atlas to fill the entire screen. Any custom GL pass must also
save/restore `BLEND`, `CULL_FACE`, `DEPTH_TEST` and `DEPTH_WRITEMASK`, and call
`begin3D(S_nA)` when it finishes, or the next draw uses your shader.

**5. Audio ships in two formats and it is not redundancy.** AAC is the only
lossy codec Safari/iOS decodes; open-source Chromium builds have **no AAC
decoder at all**, so every asset fails there. Effects ship `.ogg` + `.m4a` and
the engine asks `canPlayType`. Music is AAC-only for size, with a fallback that
abandons the playlist after three consecutive decode failures.

---

## APK size

A debug APK builds at ~51 MB and its contents compress to 28 MB. The difference
is 16 KB page-alignment padding on ~670 uncompressed entries. `tools/shrink-apk.sh`
re-deflates and aligns to 4 bytes, then re-signs (mandatory — changing one byte
invalidates the v2 signature). **Result: 51 MB → 28 MB.** Always run it.

---

## Testing

Headless Chromium is available; **use the real GPU**, never SwiftShader.
`tools/pw-browser.mjs` is the only Playwright launcher: it reuses a project CDP
endpoint if one is already up, otherwise kills this repo's orphaned capture
Chromiums and launches one ANGLE D3D11 Chrome (never SwiftShader, never a
second instance). `tools/chrome-gpu.mjs` still owns the GPU args and the
software-renderer abort. There is no test framework; verification is
Playwright scripts run ad hoc.

```js
import { launchPwBrowser, closePwBrowser } from './tools/pw-browser.mjs';
import { assertHardwareGpu } from './tools/chrome-gpu.mjs';
const b = await launchPwBrowser();
try {
  const p = await b.newPage({ viewport:{width:412,height:900}, hasTouch:true });
  p.on('pageerror', e => console.log('ERR ' + e.message));
  await p.goto('http://127.0.0.1:8901/');
  await assertHardwareGpu(p);             // fail loud if SwiftShader / no GPU
  await p.waitForTimeout(11000);          // boot is slow
  const intro=p.locator('#mfIntroStart');
  if(await intro.isVisible()) await intro.click();          // pre-alpha title
  const gate=p.locator('#apCloseBtn');
  if(await gate.isVisible()) await gate.click();            // #apForm swallows #startBtn
  await p.click('#startBtn');                               // WAR ROOM, not setup
  await p.click('.warCard[data-mode="standard"]');          // Standard = *_medium
  await p.waitForTimeout(500);
  await p.click('#setupStart'); await p.waitForTimeout(500); // ENTER SOMBRERO-I
  // Locked stars stay on galaxy — do not tap .mfWorldChip.locked
  await p.click('#setupStart'); await p.waitForTimeout(500); // ENTER AELOS
  await p.click('#setupStart'); await p.waitForTimeout(500); // planet → region
  await p.click('#setupStart'); await p.waitForTimeout(500); // region → deploy
  await p.click('#setupStart'); await p.waitForTimeout(16000); // START BATTLE + terrain gen
  await p.click('#deployBtn');            // THIS starts the match clock
} finally {
  await closePwBrowser();
}
```

Serve `www/` on a port (`python3 -m http.server 8901 --directory www`). Headless
runs at roughly half real-time, so 26 s of wall clock is ~13 s of match time —
budget for it.

**Verify visually.** Screenshot and actually look at the image. Several bugs in
this project's history rendered without throwing: hollow buildings from reversed
triangle winding, an atlas filling the screen, cards overflowing their
container. A clean console proves nothing about a renderer.

---

## Conventions

- Comments explain **why**, and especially why an obvious alternative was wrong.
  Several comments in this codebase record a failed approach and the measurement
  that killed it. Keep that habit; it is the most valuable thing in the source.
- Match surrounding style: 2-space indent, compact, no ceremony. No
  formatter is configured.
- Balance changes should be measured, not guessed. `node tools/extract-design-db.mjs`
  evaluates the real source and dumps every unit, building, research node and
  faction to `design/design.json`; `python3 tools/build-design-db.py` turns that
  into SQLite/XLSX/HTML.
- No dependencies in the game itself. `package.json` devDependencies are build
  and test only. Do not add a framework.

---

## Do not

- Add an `import`/`export` to anything under `src/`.
- Bundle new large media into the installer without checking APK size.
- Commit credentials. The Cloudflare workers are deployed; deploying again needs
  a scoped API token that is **not** in this repo.
- Trust `console.clean === success` for anything visual.

---

## Five-channel update

Shipping a change to only the browser, or only the OTA, or only the APK, is how
1.33.35 became two different builds with the same number. The checklist is
`docs/FIVE_CHANNEL_UPDATE.md`. Bump every version field together, pack `www/`,
verify 8901, then OTA / native / Space — or name the channel you skipped.
