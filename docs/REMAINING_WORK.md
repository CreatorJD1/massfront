# MASSFRONT ordered remaining work

Authority for stage definitions: [`MASTER_PLAN.md`](MASTER_PLAN.md).  
Authority for current state: [`MASTER_PLAN_STATUS.md`](MASTER_PLAN_STATUS.md).

This order replaces date/version-based “next steps.” It is risk- and
dependency-ordered; it does not renumber the 18 stages.

## P0 — release identity, security and player safety

1. Complete v1.33.60 physical-device probation: Download -> Stage -> Apply ->
   restart, launcher entry, gameplay smoke and rollback. The release is active
   and remote-verified, but v1.33.58 remains the last phone-accepted base until
   Jason reports that result.
2. Verify the published v1.33.60 Android installer over an existing install and
   the Safari-installed Apple PWA for offline boot, safe areas, WebGL2, AAC,
   updater and rollback. Native iOS remains retired.
3. Deploy the exact tested Worker only through its own gate: Skirmish=2,
   Co-op=2–4, invalid tuples fail closed, World Chat/online count/realtime stay
   active, and e-mail verification remains non-blocking for gameplay. Record a
   non-sensitive Worker build identity and migration-ledger level in health.
4. Ship the implemented direct-record boot/storage migration in a later packaged
   PWA/APK shell, keep the legacy reader, and prove install-over-old plus
   rollback on real devices.
5. Add trusted manifest signing/key rotation plus ETag/If-Range continuity.
   The publisher already enforces exact HTTP 206, Content-Range, length, CORS
   exposure and first/last chunk hashes before activation; hashes alone do not
   authenticate a compromised release account.
6. Replace the one-use migration wrapper with exact-prefix ongoing migrations;
   retain guarded backup/bookmark creation under ignored workspace `tmp/`.

## P1 — next release batch: high-unit command SYSTEM

Do not put saved hot-slots on the current broken large-order path. The audit
confirmed that multiplayer consumes/rejects selections above 64 units and that
formation authoring can synchronously build many full 384x384 flow fields on
the main thread.

1. Instrument command-author, input-to-ack, picker, field cache/rebuild and long
   task timing for 1/48/100/250/500-unit orders offline and online.
2. Share strategic destination fields by cohort/clearance, deterministically
   queue rebuilds, use active-aware cache ownership, oriented blockers and
   progress-based stall recovery.
3. Chunk multiplayer orders by serialized bytes/command budget while preserving
   one order/cohort identity and exact generation/ownership cardinality.
4. Replace allocation-heavy/global picking with precomputed scratch and spatial
   unit/building/type/box queries; tap intent may not expire because the main
   thread stalled.
5. Accept only when 500-unit author/local-queue entry is <16 ms, picker p95 is
   <4 ms at 500 units/300 buildings, visible local tap feedback p95 is <75 ms,
   network acknowledgement is measured separately against RTT, no path task is
   >50 ms, no active field is evicted, >64 multiplayer orders apply exactly
   once, and deterministic field/state hashes match.

## P2 — following release batch: cinematic command OVERHAUL

Batch the saved palette, non-obstructive HUD and War Table/interface rewrite as
one cohesive release after P1 is accepted, not one version per control.

1. **V0 — audit routes and density:** map every War Table step to its owning
   controller and inventory text density, touch targets, safe-area collisions,
   hidden actions and duplicated confirmations across portrait and landscape
   phone layouts.
2. **V1 — streamline the War Table:** remove unnecessary intermediary and
   confirmation steps while retaining clear progress, Back behavior and the
   next meaningful player choice. Preserve Classic, Campaign, Training and
   Co-op as distinct authoritative modes; do not merge, rename, fake or bypass
   their real controllers to reduce taps.
3. **V2 — cinematic gameplay HUD and saved palette:** use original MASSFRONT imagery,
   recognizable icons, stateful visual controls, short labels and purposeful
   motion. Keep tactical resources, orders and warnings immediately legible;
   put secondary explanations behind tap/hold/details progressive disclosure.
   Retain v1.33.60's dedicated notification feed. Add tap/double-tap/long-press
   and edit-mode drag slots for one entity, all owned entities of one type,
   exact mixed groups, build placement and unit production. Persist semantic
   favorites to profile/cloud; keep entity/group refs generation-safe and
   match-only.
4. **V3 — detextify submenus and Settings:** replace text walls in mode,
   mission, faction, commander, research, social and Settings flows with
   illustrated cards, previews, diagrams, toggles and contextual help using
   original or approved MASSFRONT art.
5. **V4 — mobile acceptance:** verify 412x900, 900x412 and supported smaller
   screens, 44 px targets, safe areas, Android Back, focus/keyboard, reduced
   motion, contrast, unclipped primary actions and real launch of every
   preserved mode on hardware.
6. **V5 — visibility:** resting UI <=28% portrait / <=22% landscape, one
   contextual deck, outside battlefield action collapses noncritical sheets,
   and cinematics leave only captions plus a >=48px Skip before exact HUD state
   restoration. Commander/KEEL minimap replacement suspends map input, puts
   readable captions above the dock and archives transcripts in COMMS.

## P3 — simulation and Galactic integration

1. Thread the canonical nine-row CommanderCatalogContext through initial state,
   store, progression, UI, eligibility and ground-operation construction.
   Remove production dependence on the retired three-row sandbox fixture.
2. Prove Commander 1 ticket → commissioning → Pale Bloom tactical launch →
   exact-once result application.
3. Replace legacy War Room routing behind START with the unified Galactic mode
   layer while preserving the main menu and real Classic/Campaign/Training
   controllers.
4. Mark eight non-adapted Galactic missions honestly strategic/locked or add a
   real base-game request/result adapter for each.
5. Give station, derelict, relic, discovery and Brood-intelligence contacts
   persistent actions/rewards instead of toast-only fallthrough.
6. Re-run Stages 2–6 and 8 as current-source deterministic acceptance, after
   resolving the 500-unit population contract.

## P4 — devices, content and presentation

1. Implement the already-decided optional, section-by-section Galactic delivery:
   set byte budgets, publish real section/dependency manifests, and make package
   metadata, installer size and runtime routing agree.
2. Complete physical S25 Ultra performance/thermal/memory acceptance for all
   supported player layouts and the chosen population contract.
3. Promote Settings from the bottom of the 360px service sheet and verify that
   portrait UGA Command/Starchart icons are discoverable and unobstructed.
4. Replace/finish the procedural Navigation and Mission Ops box geometry and
   regrade PBR/fog/exposure on an actual phone.
5. Complete approved audio masters, rights/provenance, loudness, dual-codec and
   phone output checks.
6. Extend the accepted Update 5 visual grammar into later Galactic and
   content-specific panels without copying another game's protected
   presentation; do not use this lane to defer the base HUD, War Table,
   submenus or Settings overhaul.

## P5 — multiplayer expansion and tooling

1. Generalize deterministic simulation, matchmaking, teams, seats, UI and
   observability for more than two PvP players.
2. Load/latency/loss/host-migration/abuse test each larger layout before its
   server capability and UI option can appear.
3. Reconcile the source inventory and archive/retention ledger without deleting
   unknown or accepted source art.
4. Complete documentation links and remove false current-state claims from
   stale comments/handoffs.
5. After Stage 18 acceptance, build the lore-aware visual editor and guarded
   Hugging Face submission workflow.
