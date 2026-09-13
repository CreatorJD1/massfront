# MASSFRONT updater launcher and service rebuild

Owner: Jason  
Created: 2026-08-31  
Status: v1.33.58 SYSTEM updater/large-delivery foundation is live and accepted
on the user's physical phone. The visual launcher/updater/history and
offline/online gateway overhaul is locally complete, verified and held as a
prepared candidate. It has no release version; upload and activation remain
separate explicit-owner gates.

## Player-facing outcome

An installed Android app must no longer fall directly into the main menu while
an update check happens in the background. The supported cold-launch flow is:

1. branded native/web boot cover;
2. account identity, with the existing supported **Continue Offline** route;
3. a dedicated visual launcher and updater;
4. an explicit **PLAY MASSFRONT** ready state;
5. the existing main menu and **START MASSFRONT** game-mode flow.

A cached valid session may pass identity without asking for credentials again,
but it still visits the launcher. Offline Standard/Classic play remains a
supported product mode and must not be turned into a failed login.

The launcher is the gateway to both offline and connected play. It owns the
decision that the selected verified runtime is safe to start, then presents
**PLAY OFFLINE** or **PLAY CONNECTED** according to account, network and
compatibility state. Both routes enter the existing MASSFRONT main menu; game
mode selection remains in **START MASSFRONT** rather than being duplicated in
the updater.

No network connection may trap a player who has a compatible packaged or
last-known-good runtime. A minimum-online-version rule may block connected/MMO
services, but it must still explain the reason and preserve supported offline
play. An unfinished optional-pack download also cannot block core offline play.

When the device is disconnected, every online-only feature remains visible but
is greyed out and non-interactive. Each disabled surface carries a consistent
offline/cloud badge and a short **Requires Internet** explanation; it must not
open a dead screen, throw a network error, or silently substitute an offline/AI
mode. Offline-compatible modes remain full-color and usable. Reconnecting
refreshes capability state and restores eligible controls without requiring an
app restart.

The launcher is an app-owned screen shown after Android starts MASSFRONT. The
Android operating system continues to own APK download permission, signature
verification and the system install-confirmation screen; the game must not
pretend it can replace those security surfaces.

## What the launcher must look and feel like

The new surface is image-, motion- and state-led rather than a tall text panel.
It needs:

- an original MASSFRONT hero image or lightweight animated scene;
- a release banner with version, patch title, update class and concise summary;
- a prominent animated progress treatment with downloaded/total size, current
  phase, speed and recoverable status;
- illustrated cards for major features and optional content packs;
- separate **Features**, **Bug fixes** and **Upcoming** sections;
- a visual version-history timeline;
- clear Ready, Download, Resume, Apply, Repair and Play actions;
- secondary storage, network, integrity, channel and rollback details behind
  progressive disclosure;
- responsive portrait/landscape layouts, safe areas, 44 px touch targets,
  keyboard avoidance and reduced-motion behavior.

Actual release notes must read like player-facing release notes. Source
comments, commit prose, debugging explanations and internal agent summaries are
not release notes. **Upcoming** items are clearly labeled as not yet installed
and never counted as delivered features.

## Why the old version history disappeared

The current UI does not own a global release catalog. `src/updater.js` stores
only versions installed on that device in `mf_update_log`; a fresh install
seeds only its packaged `APP_VERSION` and `APP_NOTES`. `src/story.js` correctly
renders that device-local list, so reinstalling cannot recover earlier entries.

The replacement keeps two different truths:

1. **Published history** — a bundled, evidence-backed catalog of MASSFRONT
   releases, extended by a remotely fetched immutable catalog.
2. **This device** — versions actually staged, installed, reverted or repaired
   on this installation.

They may be displayed together, but must never be stored as if they were the
same data. Historical entries are reconstructed only from release manifests,
artifacts and dated release records. Gaps remain labeled gaps; comments and
filenames alone are not enough to invent a release.

## Release-note contract

Replace the flat free-text `notes` field with a backward-compatible structured
record. The publisher also emits a short legacy summary for old clients.

```json
{
  "schema": 3,
  "version": "1.33.58",
  "publishedAt": "2026-09-01T00:00:00Z",
  "channel": "stable",
  "kind": "patch",
  "category": "system",
  "title": "Updater reliability",
  "summary": "Faster recovery and clearer update progress.",
  "hero": "assets/launcher/releases/updater-reliability.webp",
  "features": ["Visual launcher before the main menu"],
  "fixes": ["Recovered interrupted staged updates safely"],
  "upcoming": ["Optional Galactic content downloads"],
  "legacyNotes": "Visual launcher, resumable updates and staged-update recovery."
}
```

Publisher validation rejects empty headings, internal-comment syntax, duplicate
items, an item appearing under both delivered and upcoming, and a claimed asset
that is absent from the release.

## Lessons that must become service requirements

- A version number is not a payload identity. Use channel + semantic version +
  immutable manifest root hash. Never publish different bytes under one version.
- A downloaded `pending` update is not the running update. Staging, applying,
  probation, active and rollback are explicit persisted phases.
- Retrying an already staged identity is an idempotent Resume/Apply operation,
  not an error and not another full download.
- An APK-side boot-loader defect cannot be repaired by code that executes only
  after the defective loader applies it. Maintain a small signed recovery APK
  path and test install-over-old-version migrations.
- Hugging Face delivered the verified v1.33.56 APK with correct length, MIME,
  ranges and hash. Chrome/Google Android finalization at 100% was a separate
  browser/security-scan problem; Samsung Internet proved the practical fallback.
- Old packaged clients legitimately receive a larger fallback than adjacent
  clients. The launcher must explain why instead of presenting an unexplained
  file list.
- The optional Galactic pack must not silently inflate the base APK. It receives
  its own resumable manifest, storage budget, install/remove controls and visual
  card.
- A channel with no endpoint is disabled. A decorative **PREVIEW · SOON** control
  must not persist a preview selection or fall through invisibly to Stable.
- A release is not counted because a local script chose a number. It is counted
  only after verified immutable artifacts are uploaded and the intended channel
  is deliberately activated.

## Engineering phases

### A — current full-core catch-up

- Keep the known-working v1.33.56 recovery APK immutable.
- Publish the next semantic version rather than replacing `.56` bytes.
- Restore current full **core** game content through the verified OTA pipeline.
- Keep the large Galactic exploration pack optional.
- Verify remote bytes, real Apply, restart, probation, running-version identity
  and rollback on a physical phone before calling this complete.

v1.33.58 completed the verified Stable OTA and was accepted after the user's
real phone update. It did not contain the launcher redesign merely to make the
release look larger. Recovery-APK, packaged-shell and broader platform parity
gates remain separate work below.

### B — updater state and recovery foundation

- Define a persisted journal with `idle`, `checking`, `offered`, `downloading`,
  `verifying`, `staged`, `applying`, `probation`, `active`, `repair` and
  `rollback` phases.
- Migrate legacy `.49`–`.56` records without deleting a valid staged payload.
- Key a payload by immutable manifest root rather than `Date.now()`.
- Make every transition idempotent and transactionally update state plus owner
  lease.
- Preflight available storage and IndexedDB quota before download.
- Persist bounded chunk completion so an interruption resumes completed ranges
  instead of restarting the file.
- Verify per-chunk and full-file SHA-256, exact byte totals, manifest root and
  compatibility metadata before staging.
- Keep the packaged runtime, last-known-good OTA and new pending release as
  distinct recoverable identities.
- Add a signed-manifest/authenticity design before production MMO scale.

Accepted v1.33.58 checkpoint: schema-3 ordered roots, 4 MiB source range tables,
restart-resumable transfer journals, re-hashed resume/quota inventory,
reachability-aware source-record cleanup and atomic optional-pack replacement
passed local and remote verification and the user's real phone update.
Descriptor-aware direct-record boot is implemented in current source, but
existing APK-bound boot loaders retain the assembled legacy-bundle path; that
capability still requires a later packaged PWA/APK-shell update and device
proof. Trusted-key signatures and cross-tab optional-pack leases remain open
hardening and are not claimed by v1.33.58 acceptance.

### C — visual launcher integration

This phase is locally complete and verified after v1.33.58 phone acceptance.
It is a prepared, unversioned candidate; no publication has been approved or
claimed.

- Preserve `boot.js` packaged/OTA selection and the current intro safety gate.
- Refactor `src/authportal.js` to emit an explicit identity completion event for
  signed-in and offline outcomes.
- Refactor `src/updater.js` to emit state/progress events while retaining its
  tested download, Apply and rollback authority.
- Add one launcher controller that sequences identity -> update -> ready. It
  does not infer state by scraping text from the existing panel.
- Ship the launcher markup and CSS through the existing verified OTA shell
  artifact, which atomically replaces the visible body and linked styles before
  the updated sources run. Keep only pre-shell recovery UI independent of new
  markup, because `boot.js` and the earliest packaged paint remain APK-bound.
- Register new binary launcher art in the OTA binary-asset set and resolve it
  through the existing asset URL layer; a shell reference alone does not put a
  new image onto an older APK.
- Delay the full WebGL attract scene and nonessential game assets during a large
  download to reduce heat and memory pressure.
- **PLAY MASSFRONT** calls the current main-menu/War Room route only after the
  updater is Ready, Up to date or intentionally Offline.

### D — history, notes and optional content

The launcher history/notes surfaces and current optional-pack controls are
locally complete in the prepared candidate. Real Galactic section manifests,
player network-choice policy and their later release acceptance remain open.

- Add a bundled release-history baseline and remote immutable history catalog.
- Backfill only releases supported by source-matched evidence.
- Keep the existing device-installed log and migrate it without erasing read,
  rollback or packaged flags.
- Add validated release hero art and category cards.
- Wire the implemented resumable optional-pack install, verify, mount, update
  and remove APIs into the launcher UI, then publish real section manifests.
- Expose installed size, required free space, download size and Wi-Fi/mobile
  choice before a large pack begins.

The transport must handle both a large aggregate source release and massive
content without changing those into one memory-sized response. Executable
source remains split at real classic-script boundaries with deterministic 4 MiB
ranges and an ordered runtime root. Content remains split at pack/dependency
boundaries with bounded 2 MiB ranges, content-addressed final objects, atomic
active-manifest promotion and post-promotion garbage collection. Before massive
executable releases, add a measured per-source memory ceiling and automated
publisher gate. Any file over that accepted ceiling must block publication and
be split at a real source boundary; increasing a timeout is not a valid
large-update strategy.

The Galactic exploration payload must be released section by section, never as
one 541.84 MiB download. Inventory and dependency measurement determine the
final byte boundaries, but the player-visible catalog begins with these
independent sections:

1. shared Galactic command runtime and UI;
2. ship exterior/cutaway and shared interior materials;
3. Command Core rooms;
4. Navigation and Survey rooms;
5. Hangar and Logistics rooms;
6. Embassy, Crew and small-room character media;
7. Caldris survey content;
8. Ithara and later planet survey content;
9. mission/ground-operation sets, split again when their measured size demands
   it;
10. stations, boarding and relic content only when those loops become
    runtime-ready;
11. optional voice/music packs kept separate from visual geometry.

Each section owns an immutable manifest, full and downloaded byte counts,
content hashes, dependency IDs, install/update/remove state and a resumable
progress journal. Shared assets live in the smallest common prerequisite pack
instead of being duplicated. A section may be installed or repaired without
redownloading unrelated sections, and unfinished later sections remain visibly
locked rather than producing missing-content controls.

### E — resume the Galactic Command Layer plan

Only after the full-core OTA and launcher/updater overhaul pass their physical
device gates, resume
`GALACTIC_COMMAND_LAYER_HANDOFF_2026-08-31.md` (pass-down removed 2026-09-12 — see docs/CODEX_HANDOFF.md).
That handoff remains the authority for the paused work; do not replace it with
a newly invented Galactic plan.

Resume order:

1. **R0 only:** repair the 412 px overlay/layout problems, hub fold, resource
   clipping, Galaxy/Ship reachability and Settings route.
2. **R1:** bind the existing nine-row commander roster and approved portraits;
   do not add or remap commanders.
3. **P1–P6 in order:** ship-room readability, hiring, local Galactic research,
   Caldris/Ithara scanning, honest production mission routes, then one real
   station/relic interaction loop.

The main menu and **START MASSFRONT** remain intact. Experimental Galactic is a
same-tab command layer over the live game, not a replacement game. Online
Co-op/MMO cards remain locked until real supported services exist, and the
existing MASS EFFECT 2 SCANNER interaction copy remains while all art, planets,
resources and fiction stay original MASSFRONT.

## Verification matrix

The release cannot pass from a clean console alone. Test and visually inspect:

- fresh APK install, install-over-old APK and cached-session launch;
- login, registration, valid cached session and Continue Offline;
- launcher entry on every cold start; Play Offline with no network; Play
  Connected with a valid current session; connected minimum-version rejection
  that still leaves compatible offline play available;
- online-only launcher, Social, World Chat, friends/messages/invites,
  matchmaking/MMO and cloud actions visibly greyed and labeled **Requires
  Internet** while disconnected, then restored after reconnection without a
  reload;
- no update, small hotfix, full fallback and optional-pack download;
- interruption at every persisted phase, process kill, reboot and network swap;
- a legacy already-staged record, same-identity retry and corrupted chunk;
- insufficient storage/quota, server outage, wrong channel and stale manifest;
- Apply restart, probation success, probation failure and rollback;
- reconstructed published history versus this-device history;
- Android Back, focus, keyboard, safe areas, portrait, landscape and tablet;
- Galaxy S24/S25 Chrome and Samsung Internet installer delivery;
- Safari-installed Apple PWA update/rollback and offline launch;
- reduced motion, readable contrast and touch-target acceptance;
- hardware-GPU screenshots of every major launcher state.

Prepared-candidate local checkpoint:

- portrait 412x900 and landscape 900x412 plus 812x375 pass visual and layout
  inspection;
- reduced motion passes;
- runtime is hardware AMD WebGL2 and captured zero browser errors;
- **PLAY MASSFRONT** hands off to the existing main menu rather than entering a
  game mode directly;
- launcher gateway, identity and updater-event tests pass;
- updater interruption, executable two-launch recovery, browser asset-pack and
  large-content asset-pack gates pass.

This checkpoint does not claim the fresh/upgrade APK, S24/S25 browser, Safari
PWA, published-update probation or rollback rows above. Those remain release
and physical-device gates after explicit publish approval.

## Initial file ownership map

- `boot.js`: selection/recovery boundary only.
- `src/authportal.js` and `src/styles/auth.css`: identity event and identity UI.
- `src/updater.js`: update authority, journal, downloads and progress events.
- `src/story.js`: device-history consumer; no longer the only history surface.
- new launcher controller/style files: sequencing and presentation.
- `index.html` and linked CSS: verified OTA shell plus APK/PWA package host.
- `tools/bundle-update.mjs`: shell composition and new launcher-art inclusion.
- `tools/publish-hf-release.ps1` and release builders: structured catalog,
  immutable identity, validation and activation gates.

No implementation agent owns two of these shared boundaries concurrently.

## Activation boundary

Preparation, local verification, artifact upload and live manifest activation
remain four separate decisions. v1.33.58 is the accepted Stable base. The
launcher/hardening overhaul is now a prepared local candidate and requires its
own explicit publish instruction before it receives a target version or before
Hugging Face or another player-facing channel is changed. It receives its own
review and
physical-device gate and is not silently activated under the earlier v1.33.58
approval.

Local launcher verification is complete, so stop now for explicit publish
approval. After any future launcher release passes remote verification and
device probation, stop again for next-slice approval before Galactic Command
Layer R0. Launcher work must not quietly absorb or claim any R0–P6 completion.
