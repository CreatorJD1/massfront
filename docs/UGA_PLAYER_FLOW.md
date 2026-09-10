# UGA player flow

This is the current product-flow contract for the integrated Galactic experience.
It refines the master plan without replacing it. A release must satisfy this
contract as one player session, not as a collection of independently working
screens.

## Product model

**UGA Command is the space-exploration experience and the player's persistent
strategic home.** It is not a standalone side mode, a stopping screen, or a
launcher in front of the old game. The player's ship/base, exploration,
scanning, live war front, progression, preparation, and ground RTS deployments
are one loop.

The older dashboard/War Table composition remains useful only as a compact
access pattern inside UGA: it may expose Play, ship development, research,
crafting, missions, social, settings, and other career services. It must not
replace flying, scanning, discovery, or ship progression as the primary
experience, and it must not grow into a second full main menu.

The canonical session is:

1. Launch into one coordinated update/loading experience.
2. Enter a stable, interactive UGA home only when its required controls and
   campaign state are ready; optional exterior/cutaway art may continue loading
   without covering or disabling the usable home.
3. Manage the ship/base, commanders, research, crafting, upgrades, and mission
   preparation from the persistent strategic interface.
4. Depart, travel, or pilot through the live front and choose a readable planet
   or point of interest.
5. Scan the selected planet. A successful scan yields resources, a
   mission-bearing area, or both, and always presents a clear next action.
6. Inspect system control, select the planet, select its region/area of control,
   and select a playable map. Missions unlock regions; regions expose or unlock
   maps through the established ground-operation flow.
7. Select an eligible commander and deployment package, then deploy into the
   real warfare RTS loop.
8. Resolve victory or defeat, settle rewards/progression exactly once, and
   return to a stable UGA home without restarting the app.

No successful scan may end in an unexplained dead end. No transition may strand
the player without a visible Back, Home/UGA, Settings, Exit, retry, or recovery
route appropriate to that state.

## Mobile interaction and presentation

Navigation must remain shallow, readable, and touch-safe like the base War
Table and RTS HUD. The persistent phone dock favors five clear destinations:
Play, Ship, Progress, Social, and More. Galaxy, crew, settings, and other
secondary services live one shallow step behind those destinations. Copy should
name the immediate decision or blocker; avoid paragraphs, duplicate headings,
decorative status text, and controls that only restate another control.

Space orientation uses a wide cinematic default. Normal/default framing is the
farthest practical gameplay view; medium is the closest allowed routine framing.
Selecting or recentering a destination must preserve overview context instead
of snapping to a close-up. Planets, points of interest, current location, route,
and protected/contested/enemy control must remain legible in portrait and
landscape. Touch orbit, pan, zoom, selection, and recenter must not compete with
the strategic interface.

Use the supplied MASSFRONT GUI pack for crisp structural frames and borders at
an appropriate resolution. Selection-state art is reserved for an actual
selected or focused state; it is not a generic border for top bars, inspectors,
or passive panels. Preserve the real MASSFRONT title/logo art. Do not introduce
a replacement wordmark.

## Loading and recovery contract

Updater, title, module bootstrap, travel, and tactical loading may have
state-specific copy, but they must behave as one synchronized player experience:
one active readiness owner, monotonic truthful progress, no overlapping loader
layers, and no visible `ready` state before required interaction is safe. A
delayed optional 3D asset failure must never repaint a fatal loader over an
already-interactive UGA home. Explicit Ship/Orbit actions own visual retries.
Synchronous GPU/bootstrap failures that prevent any usable controls must retain
an honest fatal/retry path.

All loading surfaces use the canonical MASSFRONT title art or logo, retain an
accessible text fallback if the image fails, fit mobile safe areas, and avoid
multiple unrelated loading-screen styles. Verification must cover the source
runtime and packed runtime, the exact canonical art identity, forced image/asset
failure, HTTP and console errors, readiness timing, and screenshots of every
loader-to-interactive handoff.

## Progression and deployment rules

The agreed player journey is updater → animated splash → login/local career →
stable UGA home → ship travel → scan and discover an objective → planet → region
→ playable map → select an available commander from the preferred faction and
optionally an AI ally or human co-op teammate → configure deployment → play the
ground RTS mission → settle the result → return to ship → upgrades, crafting and
equipment → next expedition, Classic, or supported Versus.

The updater is the first screen. Identity must not block checking or applying
updates. The splash hands off to authentication, which then opens the Galactic
career. Secure battle/submenu returns bypass this launch sequence. Existing
careers retain their commissioning, roster and campaign state.

The UGA follows the XCOM-inspired physical-headquarters design: a side-on
sectional cutaway of the existing authored 3D compartments, never a radial deck
diagram replacing those rooms. Select a section in the ship or
matching section list, inspect its function, choose a facility or upgrade, resolve
prerequisites, and return to the same section. Construction currently advances
through surveys, travel and mission results; wall-clock waiting does not advance
it. Do not imply real-time progress or add an unlimited free advance button.

Deployment step 5 selects an available commander of the player's preferred
faction, then independently offers solo, AI ally, or human co-op participation.
This is the owner's corrected target, not a claim that all three lanes work.
Only available canonical commanders may deploy; recovery and availability remain
enforced. Galactic currently uses a solo operation adapter. Human co-op needs a
separate authenticated session adapter binding the objective, commander roster,
deterministic scenario and exactly-once result settlement; it cannot be enabled
by relabeling a local AI slot. Human co-op and Versus must remain unavailable
until their actual synchronized session implementation is verified.

The preserved authored cutaway is being restored through an explicitly named
runtime derivative, `uga-authored-sections.glb`. Its first restoration copies
the original source bytes exactly: no decimation or texture replacement. The
81,372,160-byte payload is not an optimized-release approval. The attempted
Draco round-trip failed the strict transform preservation contract; retain that
failure until a separate fidelity-preserving compression pass is verified.

## Release gates

Implementation and acceptance proceed in this order:

1. Coordinated loading/readiness reaches stable interactive UGA.
2. UGA home preserves meta-game parity and basic War Table access.
3. Travel/piloting, wide camera, destination orientation, and recovery work on
   mobile.
4. A real scan creates resources and/or a mission-bearing next action.
5. Planet → area of control/region → playable map progression is visible and
   truthful.
6. Eligible commander selection and real deployment work.
7. Tactical victory/defeat, rewards/progression, and return to UGA complete
   exactly once.

Acceptance includes default settings, a fresh and returning career, damaged-save
preservation, section selection in portrait and landscape, truthful upgrade and
travel requirements, hired-commander deployment, exactly-once result return,
Classic submenu/back routing, and packaged/runtime parity. The final proof is a
reproducible bundled and packed full session covering all seven gates on the real
hardware-GPU browser path, with screenshots inspected for hierarchy, clipping,
scale, legibility, and artistic coherence. A clean console, source-contract test,
or model-count check alone does not establish acceptance.
