# MASSFRONT mobile HUD stack handoff

Date: 2026-08-03  
Status: implemented, bundled, staged, and visually verified  
Release status: source fix only; `1.32.3` was not bumped or republished

## Reported problem

On a portrait Android phone, the production/build browser, category preview,
wave warning, economy coach, command-deck tabs, ability row, permanent command
row, selection HUD and minimap could all remain visible at once. None of those
systems owned the shared screen space, so individually valid UI became an
unreadable stack during combat.

Reference screenshot supplied by the tester:

`/.codex-remote-attachments/019fbdb1-d2a2-75d0-90a1-1ac651a97947/5294a38f-8d3f-4cb9-9a50-91ef864875a3/1-Photo-1.jpg`

Verified post-fix screenshot:

`releases/ui-stack-fix-portrait.png`

## Implemented policy

The new priority order is:

1. Critical wave/base-attack alerts
2. Direct feedback from the player's latest tap
3. One primary panel: build, production, structure control, or pinned intel
4. Economy coaching after higher-priority UI closes

While a primary panel is open:

- Orders, Powers, Platoons and View tabs and their secondary row collapse.
- The minimap, selection card, commander bar, modifier row and infestation
  meter yield their space.
- Army, Select, Stop and Build remain available as one emergency command row.
- Category previews retain their live 3D art but compress to an 80px header.
- Every build/production/structure panel receives a sticky 44px close target.
- Pinned intel temporarily hides the underlying panel rather than overlapping
  it. Closing intel restores the original panel and scroll context.
- Automatic first-seen intel cards do not open on top of another primary panel.
- Coach banners are queued while a primary panel or critical alert is visible.

## Files changed

- `src/uistack.js`
  - Late takeover loaded after `src/main.js`.
  - Observes the existing panel and critical-alert elements.
  - Owns body state classes and coach queuing.
  - Wraps `showCoach`, `showIntelMarkup`, `closeMenus`, `openBldMenu`,
    `renderBuildMenu`, `renderProdMenu`, and `renderBldPanel`.
  - Injects sticky panel headers and close buttons without changing `index.html`.
- `src/styles/ui.css`
  - Adds panel chrome and portrait primary-panel rules.
  - Adds alert/toast spacing and compact category-preview treatment.
- `assets/data/manifest.json`
  - Registers `src/uistack.js` last.
- `boot.js`
  - Registers `src/uistack.js` last in the runtime manifest.

Do not move `src/uistack.js` before `src/main.js`: it intentionally takes over
globals declared by HUD and main after all normal input handlers are wired.

## Verification evidence

Commands completed:

```powershell
node tools/bundle.mjs
node tools/pack-www.mjs
```

Bundle result: 41 sources, 8.17 MB single-file output. Capacitor web staging
reported a fully resolved boot manifest.

An automated Chrome/Playwright reproduction used a 412x900 touch viewport and
forced the original worst-case state: build panel + Powers deck + wave alert +
storage coach + locked-tech toast.

Measured results:

| Check | Result |
| --- | ---: |
| Category role preview height | 80px |
| Panel close target | 44x44px |
| Wave-to-toast gap | 6px |
| Panel-to-command-dock gap | 16px |
| Economy coach while busy | opacity 0, queued |
| Deck tabs while panel open | hidden |
| Powers row while panel open | hidden |
| Permanent command row | visible |
| Browser page errors | 0 |

The restoration test also passed:

- Pinned intel set `uiIntelOpen` and hid the build browser.
- Closing intel revealed the same build browser.
- Closing the build browser removed `uiPrimaryOpen`.
- The deck tabs and selected Powers row returned to `display:flex`.

## Next steps for Claude

1. Run one physical-device match at the tester's Android resolution and open a
   real Factory during a wave. Confirm the system-bar safe area matches Chrome.
2. Exercise Android Back in this order: pinned intel, production panel, pause.
   Each press should close only the topmost layer.
3. Verify the queued coach appears after the wave and panel are both gone, and
   that an obsolete storage warning is not distracting if mass has been spent.
4. If device QA passes, bump all canonical versions together and release as the
   next patch. Re-run `bundle.mjs`, `pack-www.mjs`, Capacitor sync, the Android
   installable build, APK shrinking/signing, OTA publication, and live hashes.

## Design constraint

Do not solve future crowding by permanently removing the graphical previews or
the permanent Stop action. The verified direction is contextual collapse and
single-panel ownership, preserving visual teaching and emergency combat input.
