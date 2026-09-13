# MASSFRONT owner decisions

This file records product choices that change architecture or acceptance. It is
not a task/status list.

## Confirmed

- The existing main menu remains. The War Table destination becomes **START
  MASSFRONT** and enters a unified mode flow.
- Standard/Classic, Campaign and Co-op Versus remain selectable game modes.
- Galactic Exploration is intended to serve offline standard and connected/MMO
  play rather than remain a disconnected second application.
- New careers begin with an art/cinematic world introduction and a skippable
  planet-side RTS tutorial, followed by faction selection and faction starter
  **Commander 1** before boarding the UGA ship.
- Keel is UGA and supplies contextual hints.
- Commander/Keel presentation must not flicker the minimap.
- Ship management uses a full side-profile cutaway.
- UI direction is image-, animation-, and interaction-led with progressive
  disclosure, not text-heavy panels.
- Stage 10 models are locked. Exactly 327 catalog entries are accepted. Clean,
  UV-cube and correct PBR/stretching problems only; do not regenerate models.
- Rejected low-quality assets and CityTower02 remain excluded.
- Multiplayer remains active. Current safe layouts are two-player PvP Skirmish
  and two-to-four-player Co-op vs AI.
- More players are a long-term goal. The architecture must expand to real
  variable player/team/seat collections; extra players must never be aliased
  onto two armies.
- Smoke Desert is optional and not a release prerequisite.
- Apple remains fully supported through the Safari-installed PWA using **Share
  → Add to Home Screen**. Native iOS/IPA/Xcode/TestFlight/App Store delivery is
  permanently retired: it must not be versioned, synced, built, signed,
  uploaded, submitted, or used as a release gate. Preserve Safari/WebKit, AAC,
  safe-area, standalone-PWA, storage, offline, OTA and rollback compatibility.
- The five release channels are canonical source, packed browser preview,
  Hugging Face OTA, Android native and Hugging Face Space. Apple installation
  is supported by the browser/PWA channels, not a sixth native channel.
- After the 18 stages, create visual editing tools for levels/content and a
  deliberate Hugging Face submission workflow.
- Only one update may be active at a time. Every player release is exactly one
  of SYSTEM, OVERHAUL, CONTENT, or HOTFIX; mixed candidates are split and
  delivered sequentially.
- Default release cadence is one compatible batch per stage acceptance
  boundary, not one public version per fix. Updater work is first and batched
  into its SYSTEM slice; only urgent updater, recovery or security repairs may
  preempt as minimum-scope HOTFIXes.
- Failed preparation/upload attempts are internal candidates, not player-facing
  releases. Only deliberately activated versions enter the visual history.
- Every update has two explicit owner gates: ask before uploading or activating
  it, then ask again after verification/device probation before beginning the
  next slice. Earlier or blanket authorization does not satisfy either gate.
- The visual updater/launcher is the gateway to both offline and connected
  play. Offline-compatible play stays available without a network; online-only
  actions remain visible but greyed and labeled **Requires Internet**.
- Galactic exploration media is optional and released section by section with
  independent resumable manifests, hashes, dependencies and install/remove
  state. It must not return to the base APK as one roughly 500 MB payload.
- The updater must support large source releases and massive aggregate content
  through bounded resumable ranges, persisted restart journals, per-range and
  whole-file integrity, immutable manifest roots, storage preflight and
  section-level repair/removal. It must not require one giant in-memory network
  transfer or restart completed sections after a connection loss.

## Unresolved

### Population meaning

Choose one authoritative contract:

- 500 units per playable faction/team, or
- 500 units per Commander seat (current behavior; up to 2,500 total in present
  configurations).

This decision affects performance budgets, UI wording, AI and multiplayer.
