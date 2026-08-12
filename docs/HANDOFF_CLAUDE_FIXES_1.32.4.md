# Claude fix handoff — intro gate, account portal, save file, menu brand

Date: 2026-08-03
Base: shipped **1.32.3** (verified against the published OTA payload + the live HF Space)
Status: **committed to source, verified headless, NOT yet bundled or released**

## Files Claude changed (committed with mtime guards, no rejections)

| File | Change |
|---|---|
| `index.html` | `#mfBootCover` + critical inline `<style>`; menu brand art replaces the emblem SVG + wordmark |
| `src/intro.js` | opens on the next frame (not `setTimeout 650`), `revealFront()` drops the cover, 9s failsafe |
| `src/styles/intro.css` | mirrors the cover/overlay gate so it survives the OTA `<head>` reuse |
| `src/authportal.js` | `apBindTap` ignores an out-of-range input-guard deadline |
| `src/account.js` | `#saveFileGet` bound through `mfBindTap` (pointer-up + slop) |

**Claude did NOT touch:** `boot.js`, `src/uistack.js`, `src/styles/ui.css`, `assets/data/manifest.json`,
`src/main.js`, or anything else. Those remain Codex's.

## Root causes (each confirmed in code, not inferred)

**1. Intro played after the menu.** `#startScreen` is an `.overlay` visible from first paint, and
`initIntro()` deferred `openIntro()` behind `setTimeout(…, 650)`. Nothing covered the menu in that
window, so the menu painted first and the title faded in on top of it.

**2. Account area completely dead.** `apBindTap` (`authportal.js`) suppresses a tap whenever
`Date.now() < window.__MASSFRONT_INPUT_GUARD_UNTIL`. `boot.js` parks that value at
`Number.MAX_SAFE_INTEGER` and it is only lowered by
first frame → `confirmBoot` → `__MASSFRONT_RELEASE_INPUT_GUARD()` / `__bootOk()` → `releaseBootShield()`.
`__MASSFRONT_RELEASE_INPUT_GUARD` is **referenced in `main.js` but never defined in the packaged tree**
— it is the OTA shell's hook — so on that path the value can stay at the infinite sentinel forever.
`apBindTap` is the **only** consumer of that guard in the whole tree (verified by grep), which is exactly
why the Account button dies while every other menu control keeps working.

**3. SAVE FILE dead.** `#saveFileGet` used a plain `addEventListener('click', …)` and sits inside the
scrollable Transfer panel. Android WebView cancels the synthesized compatibility click on a few pixels
of finger drift — the precise failure `mfBindTap` was written to solve. The writer was never at fault:
every `mfWriteFile()` path toasts, so the total absence of a toast proves the handler never ran.

## Verification (headless Chromium, 412×900 + 360×780, trusted touch)

Gates: every changed file passes `node --check`; the full 39-file concatenated scope parses with no
duplicate lexical binding (the one-global-scope crash this codebase is prone to).

| Check | Pristine 1.32.3 | After fix |
|---|---|---|
| Menu exposed before the title | **yes** (the bug) | **no** — sampled every animation frame from document-start |
| Menu reachable after the intro | yes | yes |
| Account portal under a stuck guard | **dead** | **opens, REGISTER switches, email accepts typing** |
| SAVE FILE handler | no toast, never fired | fires → `"Game save file downloaded"` |
| Menu brand art | old SVG + CSS wordmark | new art, no overflow at 412 or 360 |

The account A/B is the important one: the harness forces
`__MASSFRONT_INPUT_GUARD_UNTIL = Number.MAX_SAFE_INTEGER` to reproduce the device condition, then taps.
Pristine stays dead; fixed works. That is the reported bug, reproduced and closed.

## Still open — for Codex

**`boot.js` watchdog (recommended, not committed).** Claude deliberately did not write `boot.js`: Codex
had just modified it to register `uistack.js`, and the upload mount could not serve its current bytes,
so overwriting risked destroying that. It is also **not OTA-deliverable**, so it is the backstop, not
the fix that reaches phones. Apply by hand:

```js
// 1. add the watchdog var
var bootShield=null, bootShieldTimer=0, bootShieldWatchdog=0;
var BOOT_SHIELD_MAX_MS=6000;

// 2. in installBootShield() — bounded deadline, never the infinite sentinel
window.__MASSFRONT_INPUT_GUARD_UNTIL=Date.now()+BOOT_SHIELD_MAX_MS;
// …and after the addEventListener loop:
bootShieldWatchdog=setTimeout(clearBootShield,BOOT_SHIELD_MAX_MS);

// 3. at the top of clearBootShield()
if(bootShieldWatchdog){ clearTimeout(bootShieldWatchdog); bootShieldWatchdog=0; }
if(bootShieldTimer){ clearTimeout(bootShieldTimer); bootShieldTimer=0; }
```

Also worth defining `window.__MASSFRONT_RELEASE_INPUT_GUARD` as a no-op in `boot.js` so the packaged
path never calls an undefined hook.

## Release steps (not done)

Nothing was bundled or published. To ship: bump every canonical version together, then
`node tools/bundle.mjs` → `node tools/bundle-update.mjs <ver>` → `node tools/pack-www.mjs` →
`npx cap sync android`, then the usual payload-first / manifest-last publish.

Note the OTA payload has been growing fast (8.37 MB at 1.31.0 → 26.6 MB at 1.32.3); `bundle-update.mjs`
ships the whole payload each time rather than a delta.

## Icon note

Corrected Android adaptive-icon foregrounds (art at 62% on transparency, all five densities) were
committed earlier to `android/app/src/main/res/mipmap-*/ic_launcher_foreground.png`. Circular launchers
were cropping the full-bleed square art mid-wordmark. Reaches devices only via a new APK.
