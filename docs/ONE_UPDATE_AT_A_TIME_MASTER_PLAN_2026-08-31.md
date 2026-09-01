# MASSFRONT one-update-at-a-time master plan

Owner: Jason  
Created: 2026-08-31  
Current accepted release: v1.33.58 **SYSTEM**  
Current live release: v1.33.60 **OVERHAUL** — remote verified; physical-device
probation is still open  
Product scope authority: [`MASTER_PLAN.md`](MASTER_PLAN.md)  
Current stage truth: [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md)

This plan controls how remaining work is grouped and released. It does not
renumber or replace the authoritative 18 delivery stages. The default is one
category-correct release batch at a stage acceptance boundary; every
player-facing release follows the serialized rules below.

## Non-negotiable release rule

MASSFRONT has one active update at a time.

- One version is prepared, uploaded, verified, activated and placed through
  device probation before another version-changing update begins.
- The live channel advertises one target version. The client owns at most one
  pending payload and one last-known-good rollback payload.
- A new update cannot be stacked on an unaccepted update merely because its
  download finished.
- A HOTFIX may preempt queued work, but the currently active release must first
  be accepted or rolled back. There are no concurrent release candidates.
- Read-only research and isolated source-art authoring may continue, but cannot
  mutate the active runtime/package/version boundary.
- Never publish different bytes under the same semantic version.

### Stage-batched cadence

- Accumulate compatible fixes and stage deliverables, then publish them
  together at that stage's acceptance boundary. Ordinary fixes do not receive
  individual public versions.
- If size, risk, platform or category boundaries require a split, use the
  fewest sequential releases needed and preserve their dependency order.
- Update-path work is first in the queue and is batched into its updater SYSTEM
  slice. Only an urgent updater, recovery or security repair may preempt as a
  minimum-scope HOTFIX.
- After an accepted preemption, rebase and resume the queued stage batch. Do
  not turn its remaining fixes into a stream of public micro-updates.

Every release moves through one ledger:

`PLANNED -> FROZEN -> PREPARED -> IMMUTABLE UPLOADED -> REMOTE VERIFIED ->`
`ACTIVE -> DEVICE PROBATION -> ACCEPTED` or `ROLLED BACK`.

Owner authorization is normally required at two gates and may never be inferred
from a prepared candidate or a successful test:

1. **Publish approval:** after preparation and local verification, stop and ask
   Jason for explicit approval before uploading or activating that update on
   any player-facing channel.
2. **Next-slice approval:** after the published update is remotely verified and
   its device-probation result is reported, stop again and ask Jason for
   explicit approval before beginning the next update slice.

Local planning, inspection and preparation may proceed up to the first gate.
Neither gate can be bypassed by an agent, automation, release script or prior
blanket authorization. A rollback needed to protect players may be prepared
immediately, but its publication also requires explicit owner approval unless
Jason has issued a specific standing rollback instruction for that release.

For the unattended continuation begun on 2026-08-31, Jason explicitly granted
standing authorization to publish and activate each remaining numbered section
and to proceed to the next section while he is away. That authorization applies
only to this recorded plan and does not waive any technical gate: each batch
must still bundle, pass hardware/mobile/runtime verification, upload immutable
bytes, activate last, and pass remote verification. A failing batch stops and
is not activated; each successful section receives a concise user-visible
checkpoint. This is explicit authorization, not inferred approval.

A failure before **ACTIVE** is not shown in the player's version history and is
not counted as a released update. Preparation uses a candidate/build identity;
the public semantic version is finalized only for frozen bytes. A partially
uploaded immutable path may be resumed only when every hash matches. Different
bytes receive a new immutable candidate and are never written over that path.

## Exactly four update categories

Each release has exactly one category. If a candidate needs two categories, it
must be split and delivered sequentially.

| Category | Purpose | Allowed scope | Not allowed |
|---|---|---|---|
| **SYSTEM** | Updater, launcher plumbing, compatibility, accounts, backend, packaging, performance infrastructure | Reliability, migrations, protocol/schema changes, diagnostics, accessibility foundations | Large content drops or unrelated redesigns |
| **OVERHAUL** | A major player-facing workflow or presentation replacement | Launcher UI, tutorial, Galactic Command flow, broad image/motion UI work | Hidden infrastructure bundles or unrelated asset libraries |
| **CONTENT** | One bounded playable or audiovisual content section | Rooms, planets, missions, maps, models, characters, voice or music packs | Updater architecture changes or broad UI rewrites |
| **HOTFIX** | Small urgent regression, recovery or security repair | Minimum changed files required to restore safe behavior | New content, feature expansion or opportunistic cleanup |

The release category is distinct from changelog headings. Every category still
uses honest player-facing **Features**, **Bug fixes** and **Upcoming** sections.
Internal comments, commit messages and agent summaries are never displayed as
release notes.

## Accepted update — v1.33.57 HOTFIX

Goal: complete the updater-recovery sequence from the verified v1.33.56 APK
without another installer, source archive or monolithic Galactic upload.

Prepared local candidate:

- base: v1.33.56;
- changed payload: 3 core artifacts, 28,248,755 bytes;
- full off-base recovery inventory: 110 artifacts, 93,287,016 bytes;
- optional Galactic media: excluded;
- APK: unchanged v1.33.56;
- source archive: unchanged;
- target: Hugging Face Stable, activated only after immutable remote hashes
  pass.

Acceptance:

1. updater interruption, two-launch, boot-retry and candidate integrity gates;
2. immutable upload and pinned remote byte/hash comparison;
3. live manifest activated last;
4. physical phone Download -> Stage -> Apply -> restart -> probation;
5. running version reports v1.33.57 and rollback remains available;
6. no `already staged` loop on an accepted v1.33.56 base.

Release result on 2026-08-31:

- owner approved publication;
- immutable upload, pinned artifact hashes and all three manifest mirrors
  verified;
- physical-phone Download -> Stage -> Apply -> restart completed without an
  update failure;
- v1.33.57 is accepted;
- known presentation defect: the updater displayed **OVERHAUL** because it
  inferred category from the 26.94 MiB transfer while `kind: "patch"` was
  reserved for transport behavior.

Do not rewrite v1.33.57 in place. Its presentation defect is included in the
next updater SYSTEM batch rather than being published as another micro-hotfix.

## Accepted update — v1.33.58 SYSTEM

Jason approved local preparation on 2026-08-31. An early v1.33.58 HOTFIX
candidate was prepared locally, then superseded before upload when the owner
chose stage-batched releases and required large-update support. It is not a
release and must never be activated. The rebuilt v1.33.58 candidate is the
Stage 14 updater SYSTEM batch:

- keep `kind` as the `patch` / `full` transport contract;
- add player-facing `category` with exactly SYSTEM, OVERHAUL, CONTENT or
  HOTFIX;
- preserve legacy category-less manifests through safe size inference;
- prove a delta larger than 20 MiB remains labeled HOTFIX at offer and during
  transfer;
- update the publisher and manual release entry point together.
- emit schema-3 deterministic payload/full/manifest roots;
- publish exact ordered 4 MiB range tables with per-range and whole-file
  SHA-256;
- persist verified ranges and completed source artifacts across interruption
  or process restart;
- resume only missing ranges and tolerate a legacy mirror that answers one
  verified full `200` response instead of `206`;
- preflight IndexedDB quota before the first network byte and report required,
  available and shortfall sizes;
- treat a retry of the exact already-staged manifest root as Ready/Apply, while
  refusing same-version root equivocation;
- add resumable, integrity-checked optional-pack install/repair/remove support
  for aggregate massive content without one monolithic Galactic download.
- stage new packaged clients as ordered, content-addressed source records rather
  than one giant in-memory JavaScript bundle, while retaining a legacy-bundle
  compatibility path for already-installed wrappers;
- reclaim only transfer/source records which are unreachable from pending,
  active, rollback or live-resume journals, so interrupted large updates do not
  leak storage and shared rollback bytes are never collected early.

No gameplay/content cleanup belongs in this batch. Jason gave the separate
publish approval; immutable upload, pinned verification and activation-last are
complete. Jason then confirmed that the update completed successfully on his
physical phone and instructed work to proceed. The v1.33.58 device-probation
gate and next-slice approval are therefore closed; v1.33.58 is the accepted
Stable base. This acceptance does not authorize publication of another update.
The compatible OTA layer still materializes the final legacy bundle because
existing APK-bound `boot.js` versions require it. New packaged/PWA boot code
uses direct content-addressed source references and reachability-aware cleanup;
those capabilities cannot be retrofitted into the pre-script native `boot.js`
of an already-installed old wrapper through an ordinary JavaScript OTA. Signed
manifests and exact ETag/If-Range service behavior remain SYSTEM acceptance
work and must not be falsely claimed by the first OTA-compatible slice.

### Large source and massive-content delivery contract

Large updates are supported through two deliberately different paths. They are
never converted into one opaque archive simply because their aggregate size is
large.

**Executable source updates**

- preserve the exact classic-script order from `assets/data/manifest.json`;
- publish each source artifact independently with whole-file SHA-256 plus a
  deterministic 4 MiB range table;
- persist verified ranges and resume only missing ranges after interruption;
- verify the complete ordered runtime root before executing the first staged
  script;
- new boot clients keep content-addressed source records and execute one
  reverified record at a time, bounding boot memory by the largest source file;
- legacy installed wrappers receive the compatible assembled bundle until a
  wrapper/PWA-shell update supplies the descriptor-aware boot path;
- before a massive executable release, establish a measured per-source memory
  ceiling and enforce it in the publisher; any artifact over that ceiling blocks
  publication until it is split at a real source boundary, never merely given a
  larger timeout.

**Massive content updates**

- use optional-pack manifests, never executable `files[]` or the base APK/web
  payload;
- split by playable section and dependency, with 2 MiB resumable chunks,
  per-chunk and whole-file hashes, quota preflight and offline mount state;
- keep the installed pack authoritative while a replacement downloads; promote
  the new dependency set atomically only after every final object verifies;
- address final objects by content identity so same-name/same-size replacement
  files cannot overwrite a working pack before activation;
- support Resume, Verify, Repair and Remove without redownloading unrelated
  accepted sections;
- garbage-collect superseded objects only after the active manifest pointer has
  moved, preserving shared dependencies and rollback/recovery owners.

The aggregate catalog may span many hundreds of MiB or more; the limit is the
player's measured quota and the per-pack/device budget, not one HTTP response.
Before massive packs ship, add one shared cross-tab lease spanning executable
updates and content-pack operations. Launcher presentation may queue later
sections, but it must not run them concurrently or mark them installed before
atomic promotion.

## Update 2 — SYSTEM: updater and delivery foundation

The foundation is split between locally implemented work and remaining release
gates in
[`UPDATER_LAUNCHER_REBUILD_PLAN_2026-08-31.md`](UPDATER_LAUNCHER_REBUILD_PLAN_2026-08-31.md):

Implemented and locally verified:

- persisted operation journals, immutable roots, idempotent recovery, bounded
  HTTP-range chunks, quota preflight and exact already-staged repair;
- legacy `.49`–`.57` bundle compatibility plus descriptor-aware direct-record
  boot for new packaged/PWA shells;
- publisher candidates that do not count as releases, independent artifact
  resume, activation-last gates and sectioned optional-pack transport;
- optional-pack dependency graphs, resumable install/repair/remove, atomic
  promotion, offline mount state and post-promotion cleanup.

Still open before the foundation is fully accepted:

- trusted manifest signing/key rotation and ETag/If-Range continuity;
- a shared cross-tab lease between executable and content-pack installers;
- an automated maximum executable-artifact size gate;
- stable recovery link plus install-over-old/rollback verification;
- Android, desktop browser, Safari-installed Apple PWA and offline parity;
- packaged/physical-device proof for the locally completed launcher and
  structured-history integration.

This is infrastructure, not the visual launcher overhaul. Its UI may expose the
minimum state needed to verify the system, but it does not claim the finished
MMO presentation.

## Update 3 — OVERHAUL: visual launcher and game gateway

**Published as v1.33.60 after v1.33.58 acceptance.** The visual launcher,
updater/history integration, offline/online gateway, Social presentation,
commander/building navigation, performance diagnostics and battle event feed
were frozen, independently verified, uploaded immutably and activated last.
Remote verification is complete; physical-device Download -> Stage -> Apply ->
restart probation is still required before v1.33.60 becomes the accepted base.

Local acceptance evidence covers:

- portrait 412x900 and landscape 900x412 plus 812x375;
- reduced-motion presentation;
- hardware AMD WebGL2 rather than a software renderer;
- zero captured browser errors and the explicit launcher-to-main-menu handoff;
- launcher gateway, identity and updater contracts;
- updater interruption and executable two-launch recovery;
- browser and large-content asset-pack gates.

Cold launch becomes:

`boot cover -> account/identity -> visual updater -> Play Offline or`
`Play Connected -> existing main menu -> START MASSFRONT`.

Requirements:

- image-, animation- and interaction-led MMO-quality presentation;
- original hero art/lightweight motion, illustrated update cards and meaningful
  progress animation;
- Features, Bug fixes and Upcoming cards rather than comment-like text;
- evidence-backed published version timeline plus separate this-device history;
- clear download size, installed size, speed, phase, integrity and storage;
- Resume, Repair, Apply, Rollback and Play actions with progressive disclosure;
- cached sessions pass identity without needless repeated login;
- Continue Offline remains supported and never requires a network;
- launcher is always the gateway, including when no update exists;
- connected services may enforce a minimum online version while compatible
  offline play remains available;
- online-only controls remain visible but greyed, non-interactive and labeled
  **Requires Internet**; reconnecting restores them without restart;
- game modes remain under START MASSFRONT rather than being duplicated in the
  updater;
- safe areas, Android Back, focus, keyboard, reduced motion and 44 px touch
  targets;
- avoid loading the full WebGL attract scene during large downloads.

The released gameplay presentation also includes the dedicated battle
notification feed. Routine notices, loot and status events collect in one
discoverable, timestamped feed with unread state instead of stacking across or
blocking the battlefield; genuinely urgent alerts retain a compact live rail.
This is v1.33.60 scope, not a feature deferred to a
later interface update. The later visual overhaul may refine its art and motion,
but must preserve its non-modal routing and history.

Release result on 2026-08-31:

- Stable advertises v1.33.60, category OVERHAUL, full transport, 111 artifacts
  and 93,486,258 bytes with manifest root
  `f30a15b04854ab8dcf059be165a0c95cde78cdd61a5eeb1058ef00b25354ecb7`;
- live, mirror and historical manifests are remotely byte-identical;
- all advertised Range payloads were pinned and verified before activation;
- the signed v1.33.60 Android installer is published, but install-over-old and
  rollback probation remain physical-device gates;
- the exact packed v1.33.60 browser build is on HF Space and its clean-profile
  account -> launcher -> offline main-menu route passed on hardware WebGL2;
- the exact updated Worker source was not deployed in this release. The live
  pre-alpha configuration already has the e-mail-verification gameplay blocker
  disabled, while the newer Worker build still requires its own deploy gate.

## Update 4 — SYSTEM: high-unit command responsiveness

This is the first implementation slice after v1.33.60 device probation. The
source audit confirmed two player-visible failures: multiplayer consumes and
rejects orders above 64 unit references, and ordinary formation authoring can
synchronously build many complete 384x384 flow fields with an eight-slot cache.
Do not add saved hot-slots on top of those broken control paths first.

Deliver one stage-batched SYSTEM release in this order:

1. **Measure the real failure.** Add command-author, input-to-ack, picker,
   flow-field hit/miss/build/eviction/invalidation and long-task telemetry for
   1, 48, 100, 250 and 500-unit orders, mixed clearances, 100–300 structures,
   rotated large footprints, build/destroy during movement, offline and live
   multiplayer.
2. **Share and schedule navigation work.** Use one strategic destination field
   per cohort/clearance, reserve exact formation slots for the final approach,
   replace blind eight-slot eviction with active-aware LRU/refcounts, reuse
   buffers, coalesce blocker dirtying, use oriented structure footprints, and
   add progress-based stall recovery. Worker completion may not introduce
   lockstep nondeterminism; activation uses deterministic operation budgets or
   an agreed apply tick plus field hash.
3. **Repair large multiplayer orders.** Chunk by serialized bytes and command
   budget, preserve one order/cohort/formation identity, validate exact
   generation and ownership once on every client, and never silently cap or
   consume an order that was not applied.
4. **Make picking allocation-light and spatial.** Precompute unit spans, reuse
   projection scratch, query nearby building-grid cells, spatialize box/type
   selection, and classify tap intent independently of main-thread delay.
5. **Prove it.** A 500-unit order authors and enters the local deterministic
   command queue within 16 ms, picker p95 is below 4 ms with 500 units/300
   buildings, and visible local tap feedback p95 is below 75 ms. Network/server
   acknowledgement is budgeted separately against measured RTT rather than
   falsely promised inside 16 ms. No active field is evicted, no path task
   exceeds 50 ms, multiplayer applies the exact selected cardinality once, and
   deterministic replays keep matching field/state hashes.

Detailed source evidence and the implementation contract live in
[`GAMEPLAY_COMMAND_SYSTEM_HANDOFF_2026-08-31.md`](GAMEPLAY_COMMAND_SYSTEM_HANDOFF_2026-08-31.md).

## Update 5 — OVERHAUL: cinematic command interface, saved palette and War Table

This follows the accepted Update 4 command foundation. It is one cohesive
player-facing interaction overhaul, not a public version per panel or control.

The overhaul is delivered in this internal acceptance order:

1. **V0 — mobile route and density audit.** Inventory every War Table route,
   gameplay HUD region, submenu and Settings surface at portrait and landscape
   phone widths. Record duplicate confirmations, hidden actions, label density,
   touch size, safe-area collisions and the controller that owns every game
   mode before removing a step.
2. **V1 — War Table route compression.** Remove redundant intermediary and
   confirmation screens, preserve progress and back-navigation, and take the
   player to the next meaningful choice sooner. Classic, Campaign, Training
   and Co-op remain distinct authoritative game-mode choices backed by their
   real controllers; visual simplification must not merge, rename, fake or
   bypass those modes.
3. **V2 — cinematic battle HUD and saved command palette.** Replace persistent prose, repeated
   labels and crowded button rows with original MASSFRONT imagery, readable
   icons, stateful visual controls, short labels and purposeful motion. Keep
   critical resources, orders and warnings immediately legible. Secondary
   explanations move behind tap/hold/details progressive disclosure. Retain
   the dedicated notification feed delivered by v1.33.60 rather than rebuilding
   alerts as gameplay-blocking overlays. Add saved thumb slots for one entity,
   every owned entity of one type, exact mixed selections, structure placement
   and unit production. Tap executes, double-tap focuses, long-press assigns or
   clears, and drag reorders only in an explicit edit mode so world panning is
   never stolen. Semantic favorites persist with the profile/cloud save;
   generation-safe entity/group references remain match-scoped.
   Build the complete original MASSFRONT GUI family needed by this shell:
   scalable frame/corner primitives, resource capsules, commander and KEEL
   receivers, faction crest/accent masks, selection plates, live-model build and
   production cards, queue/progress states, Repair/Recycle service states,
   saved-palette cards, notification/COMMS controls, minimap/transmission
   states, and focus/disabled/offline variants. Use CSS/vector/icon-atlas assets
   for simple controls and authored raster art only where imagery materially
   improves recognition. The generated concept is a composition target, not a
   production bitmap or a substitute for real controllers.
4. **V3 — submenu and Settings detextification.** Apply the same visual grammar
   to mode, mission, faction, commander, research, social and Settings flows:
   illustrated cards, previews, diagrams, toggles and contextual help instead
   of walls of text. Use only original or approved MASSFRONT art and animation;
   other games are quality references, never layout or asset sources.
5. **V4 — mobile acceptance.** Verify portrait 344x780, 360x800, 393x852 and
   412x915; landscape 740x360, 780x360 and 900/915x412; tablet/desktop 1024x768,
   1280x720 and 1920x1080. Exercise DPR 1/1.5/2/3, text scaling through 200%,
   safe-area/notch simulation, reduced motion, Android Back, keyboard/focus,
   color/contrast and every real controller route. Primary targets remain at
   least 44 px with zero clipped controls, overlaps, scroll traps or click-
   through. Visual inspection on hardware is mandatory; a clean console is
   insufficient.

6. **V5 — battlefield visibility acceptance.** Resting UI occupies no more than
   28% of portrait or 22% of landscape; panels collapse on battlefield action;
   only one contextual deck is open; full cinematics remove gameplay hit targets
   except a 48px Skip/caption surface and restore the exact prior HUD afterward.
   Commander/KEEL transmissions keep the requested minimap replacement but
   suspend minimap input, place readable captions above the dock and archive the
   transcript in COMMS.

Completion means faster direct control, fewer War Table interactions and
materially less text/clutter without losing authority, accessibility or tactical
readability. C&C3, Supreme Commander 2 and similar games are interaction-quality
references only; all art, layout, copy and motion remain original MASSFRONT work.

## Update 6 — OVERHAUL: Galactic Command repair and authority wiring

Resume the existing **Cursor Space Command plan audit**:
[`GALACTIC_COMMAND_LAYER_HANDOFF_2026-08-31.md`](GALACTIC_COMMAND_LAYER_HANDOFF_2026-08-31.md),
not a newly invented replacement plan.

The audit's current-state findings remain part of this master plan:

- HOLDING ORBIT toast overlaps the expedition/Keel story rail;
- the 412 px hub inspector hides session cards below the fold;
- the resource ribbon clips RESEARCH and conceals later resources;
- STARCHART/Galaxy and UGA COMMAND/Ship become unreachable from the hub;
- Settings appears missing because its live host route sits below the fold;
- ship interiors still read as schematic boxes/washed hulls rather than rooms;
- Embassy/Crew still reference three retired commander IDs instead of the
  existing nine-row roster;
- only Pale Bloom has a production ground-operation adapter, so other mission
  rows must remain honestly local/locked;
- station/relic interaction is still toast-only and cannot be presented as a
  completed boarding loop.

The audit's build order is binding: **R0 -> R1 -> P1 -> P2 -> P3 -> P4 -> P5
-> P6**. A later section cannot be marked complete to hide an earlier mobile
navigation or authority failure.

First release slice is R0 and R1 only:

- repair 412 px overlay collisions, hub fold, clipped resource ribbon,
  Galaxy/Ship reachability and Settings access;
- bind the existing nine-row commander roster and approved portraits;
- preserve the existing main menu and home START MASSFRONT War Room route;
- keep Experimental Galactic a same-tab command layer over live MASSFRONT;
- keep online Co-op/MMO locked until real supported services exist;
- preserve the existing MASS EFFECT 2 SCANNER interaction copy while using
  only original MASSFRONT planets, resources, art and fiction;
- Keel remains UGA.

Cursor-audit constraints also remain binding: do not hijack home START, invent
War Table IDs, enable fake MMO/online Co-op, map AI Allied Strike as networked
Co-op, add a fifth session family, copy BioWare art/N7/Normandy/eezo, or claim
toast-only stations/relics are playable.

Acceptance is mobile-first R0 evidence plus commander-catalog contract tests.
This update does not claim P1–P6 content completion.

## Update 7 — OVERHAUL: new-career introduction and tutorial

- Begin in space or an original art/cinematic sequence leading to a planet,
  never directly inside the ship cutaway.
- Run a rebuilt planet-side RTS tutorial covering camera/navigation, selection,
  movement, attack, construction, production, economy and objectives.
- Allow a clean skip with the same valid post-tutorial profile state.
- Keel supplies contextual, rate-limited, dismissible UGA hints.
- After completion/skip, choose a playable faction and award that faction's
  starter **Commander 1**.
- Transition into the UGA ship and unified Galactic layer.
- Commander/Keel battle transmissions use a stable reserved comms frame without
  minimap flicker; exploration uses a dedicated conversation surface.
- Ship management uses a full side-profile cutaway.

## Sectioned CONTENT updates — one section per accepted release

The current roughly 541.84 MiB Galactic media tree is never one download. The
optional catalog is dependency-driven and each section has its own immutable
manifest, hashes, sizes, installed state, progress journal and remove/repair
action.

Planned order, subject to measured dependency inventory:

1. shared Galactic command runtime/UI;
2. ship exterior/cutaway and shared interior materials;
3. Command Core rooms;
4. Navigation and Survey rooms;
5. Hangar and Logistics rooms;
6. Embassy, Crew and small-room character media;
7. Caldris survey content;
8. Ithara and later survey bodies;
9. mission/ground-operation set A, then later measured sets;
10. station/boarding/relic section only when the runtime loop is real;
11. voice pack(s) and music pack(s), separate from geometry.

No section redownloads an unrelated accepted section. Common dependencies live
in the smallest prerequisite pack. A pack that exceeds its measured phone,
storage or download budget is split again before release.

Content rules carried forward:

- Stage 10's 327 accepted catalog entries are locked; integrate, optimize and
  correct UV/PBR/stretching only—never regenerate or aesthetically replace;
- rejected low-quality assets and CityTower02 remain excluded;
- Smoke Desert stays optional;
- VRoid/approved character tools are for small-room characters, not major RTS
  battlefield sections;
- P1–P6 proceed in handoff order: ship rooms, hiring, Galactic research,
  Caldris/Ithara scanning, honest production missions, then boarding/relics;
- no fake online persistence, fake MMO docking or dead toast-only controls.

## Later serialized updates preserved from the 18-stage work

### OVERHAUL — continued image/motion-first game UI

After Update 5 establishes the shared mobile visual grammar, extend it to later
Galactic and content-specific screens as those real controllers become
available. Do not defer the base War Table, gameplay HUD, submenu or Settings
work into this later lane, and do not regress v1.33.60's dedicated
notification feed into stacked overlays. Art of War 3 is a quality reference
only; never copy its protected art, layout or trade dress.

### CONTENT — commanders, Keel, characters and audio

- Finish approved commander/Keel portraits, animation, subtitles and voice;
- preserve UGA/faction identity and the non-flickering comms placement;
- approve music/voice provenance, loudness and `.ogg` + `.m4a` mobile pairs;
- verify speakers/headphones and gesture unlock on physical devices.

### SYSTEM — supported multiplayer and social hardening

- Keep current two-player PvP Skirmish and two-to-four-player Co-op vs AI
  active when production contracts pass;
- World Chat shows usernames and supports profile, friend, block, private
  message and supported invite actions;
- Social displays the live online count;
- all online-only surfaces obey the grey **Requires Internet** contract;
- production Worker/D1, moderation, rate limits, observability, reconnect and
  compatibility gates precede broader rollout;
- more players require real variable armies/teams/seats and must never be
  aliased onto the current two-army simulation.

### SYSTEM/HOTFIX — performance and original-stage acceptance debt

Close current-source evidence for Stages 2–6 and 8, resolve the 500-population
contract, and run sustained S24/S25 mobile acceptance. Measured regressions are
fixed in bounded category-correct updates; acceptance work alone does not
invent a release.

### SYSTEM — platform and final release closure

- Android app and browser/PWA remain supported;
- Apple remains supported through Safari Add to Home Screen, not native iOS;
- verify offline, OTA, rollback, safe areas, AAC and WebKit behavior;
- align canonical source, packed preview, HF OTA, Android and HF Space, or
  explicitly record a skipped channel;
- activate immutable artifacts first and the mutable manifest last.

## HOTFIX lane

HOTFIX is a controlled exception, not a place to hide unfinished scope.

- cut only from the currently accepted Stable identity;
- minimum changed files and no content/overhaul additions;
- same interruption, integrity, Apply, probation and rollback gates;
- if it preempts a queued update, that candidate returns to PLANNED and must be
  rebuilt against the newly accepted Stable base;
- one failed upload is resumed with identical hashes, not assigned several new
  public versions;
- only activated hotfixes enter the published history.

## Post-Stage 18 creator tools

After the 18-stage release gates are genuinely closed, build the lore-aware
visual editor described in
[`POST_STAGE18_VISUAL_EDITOR_UI_HANDOFF_2026-08-31.md`](POST_STAGE18_VISUAL_EDITOR_UI_HANDOFF_2026-08-31.md):

- visual level/object placement, snapping, layers, paths, spawns, objectives,
  collision, lighting and budget validation;
- deterministic edit manifests rather than rewriting source GLBs;
- lore-bible validation, preview, diff, screenshots and recovery path;
- explicit creator review before a Hugging Face submission—never automatic.

## Definition of accepted

An update is accepted only when:

- source/global-scope and package gates pass;
- immutable remote bytes match recorded size and SHA-256;
- real-path browser/device behavior is verified, including visual inspection;
- Apply, restart, probation and rollback work against the exact candidate;
- player-facing notes accurately separate Features, Bug fixes and Upcoming;
- the live manifest names only verified immutable content;
- the owner-visible ledger records passed, failed, skipped and blocked gates;
- the next update has not already overwritten its version or state.
