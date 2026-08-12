# MASSFRONT — research, music and field-cache continuation

## Current source state

This handoff is source-only. `node tools/bundle.mjs` and `node tools/pack-www.mjs`
both passed after the changes below. No APK or OTA release was produced.

## Research network

`src/restree3d.js` is still the renderer takeover for `renderDevelop()`.

- The research view has four real faction tabs: `nova`, `ascendancy`,
  `syndicate`, and `horde`.
- Existing untagged research remains Nova's account tree, preserving old saves.
- `src/develop.js` adds three unlock nodes per non-Nova faction, each with unique
  ids and prerequisite path. They are stored through the existing `META.res`
  ownership system.
- Selecting a node opens a dedicated inspector instead of stacking the graph and
  detail card. The inspector has a wide **Network** control. Returning restores
  the graph and centres the previously selected node where possible.
- State is inspectable through `window.__MF_RESEARCH_TREE__.snapshot()`:
  `faction`, `inspecting`, node and edge counts are included.

Visual verification: `releases/research-faction-inspector-portrait.png`.
At 412 x 900 it showed 16 Nova nodes, 14 edges, an accessible Back to research
network control, and no page errors. Horde showed its own 3-node path and 2 edges.

## Audio and KEEL

`src/audio.js` preloads `music.json` at sample-audio initialisation and invokes
the playlist synchronously inside `initAudio()` when a user gesture creates the
AudioContext. This fixes the important mobile timing problem where async playlist
loading missed the gesture permission window and title/menu music never started.

`DEF_SETTINGS.tutorialVoice` now defaults to `true`, so KEEL will use supported
device speech synthesis by default. It remains an opt-out setting and degrades
silently on unsupported devices.

## Field progression caches

`src/game/sim.js` adds two visible crate kinds to the existing fog-aware,
unit-collection system:

- Research Archive: +4 permanent Research Data.
- Crafting Salvage: a permanent focused Alloy, Circuitry, or Isotope grant.

They spawn through the existing crate rules and require a friendly unit to reach
them, so they can be discovered only through active field vision. Relic Cores
remain tied to the hive/ruin progression route.

## Important follow-up

The current player-facing faction selection is not yet a gameplay-side player
faction picker. The tabs let the player inspect and research the separate faction
doctrines now; when a player faction setting is added, gate the active tab and
production unlocks from that selected faction rather than removing these tabs.

The version fields in the working tree are inconsistent: `APP_VERSION`, boot
revision and `index.html` are 1.32.5, while Android/package/webmanifest retain
1.32.3. Reconcile them together before building any next APK or OTA manifest.
