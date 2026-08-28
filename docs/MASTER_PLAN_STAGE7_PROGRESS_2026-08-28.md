# MASSFRONT — Stage 7 completion record · 2026-08-28

**Status: ENGINEERING COMPLETE; HUMAN ACCEPTANCE PENDING.** All authored Stage 7
implementation items and the deterministic currency gate are complete in the
canonical source checkout. Stage 8 engineering may begin. A real fresh-profile
player must still pass the comprehension check below before Stage 8 release
sign-off; automation is evidence that the answer is visible, not evidence that
a new player understood it.

## Completed Stage 7 work

- **One progression vocabulary:** the four duration labels are `PERMANENT`,
  `EQUIPPED`, `WEARS`, and `ONE MATCH`. Cosmetics render as
  `PERMANENT · COSMETIC`, where Cosmetic describes the item rather than adding
  a fifth duration. One helper owns the wording across Arsenal, Development,
  rank/identity, Operations, Vault/loadout, result loot, the live modifier HUD,
  and final deployment setup. Arsenal and Development also share a two-lane
  comparison guide.
- **One Core spending rule:** Cores buy permanent protocols, sidegrades, and
  cosmetics. The old repeatable Core restock route for one-match supplies is
  removed. Mission supplies are recovered through operations, consume one
  charge at launch, and never enter either the local or server Core catalog.
- **Overlapping upgrade retirement:** the direct Armor Plating, Targeting
  Algorithms, Salvage Protocol, and Reactor Tuning percentage upgrades are
  removed from the live Arsenal catalog and effects. A save-compatible,
  idempotent migration refunds nominal historical Core cost, deletes stale
  owned/deal keys, and preserves unrelated career state. Trade Network remains
  because it is flat logistics capacity, not Development's percentage fantasy.
- **Visible rank promises:** Career renders all ten actual rank milestones from
  the commander, title, frame, and rank-gated operation-rule catalogs. The next
  unlock rail uses the same authority instead of invented “clearance and perks”
  prose. Every rank currently has at least one real unlock.
- **One prebattle truth:** final `DEPLOY` shows retained permanent perks,
  Development modules and durability, fitted account gear, readied `ONE MATCH`
  supplies, battle commander, mode contract, battle plan, and solo/allied team.
  Empty states and live refreshes use the same underlying authorities as launch.
- **One Core grant path:** match/conquest, Daily, Training, and retirement refund
  grants route through `metaGrantCores`, use stable idempotency keys, and replay
  safely if network observation initializes later.
- **Fresh-player feasibility:** every one of 366 seeded days includes a directed
  starter order. The next-Arsenal rail uses the real owned tier and price.
  Development presents Research Data and recovered materials as its currencies;
  earned Cores no longer appear there as a competing spend balance.
- **Prepared-patch slice retained:** cap-safe craft/refit quotes, exact near-cap
  durability output, no zero-output spending, research graph touch bindings,
  live production locks, shared faction footprints, energy-cap telemetry, and
  cancellation-safe input remain integrated.
- **Channel-safe modifier art:** the exact 2,893,485-byte operations atlas is a
  cacheable external file in source and Capacitor `www/`, is verified byte-for-
  byte by the package freeze, and is inlined only by the archive and OTA build
  paths that promise self-contained output.

## Original checklist disposition

| Original requirement | Final engineering disposition |
|---|---|
| Remove/migrate overlapping permanent Arsenal percentage upgrades | PASS — four direct overlaps retired; nominal maximum refund 9,440 Cores; Trade retained |
| Consistent Permanent / Equipped / Wears / One Match badges | PASS — one duration authority plus a permanent-cosmetic qualifier and cross-screen contract test |
| Visible rank unlock milestones or reduced prominence | PASS — ten catalog-derived Career rows and next-rank summary |
| One prebattle Loadout summary | PASS — live authority comparison and real launch snapshot |
| Tune Core/material income to a target first-week curve | PASS — existing authored curve falls inside the recorded source-driven envelope; no reward or price was guessed or changed |
| New player can explain Arsenal versus Development | HUMAN PENDING — exact fresh-profile protocol below |
| Every currency has a clear, non-conflicting use | PASS — deterministic catalog/use audit and visible two-lane guide |

## Recorded first-week acceptance envelope

The deterministic fixture is Training once plus ten Standard T1 Easy first-clear
wins over five active days, two matches per day. Its committed-match boundary is
180 seconds.

| Measure | Acceptance | Source-executed result |
|---|---:|---:|
| Cores before directed Daily | 1,400–1,700 | 1,555 |
| Cores with one directed Daily per day | 2,000–2,400 | 2,073–2,245 |
| Research Data | 110–150 | 130 |
| Alloy | 150–200 | 170 |
| Circuit | 50–75 | 60 |
| Isotope | 15–25 | 20 |

Checkpoints after 1 / 3 / 6 / 10 wins are 276 / 557 / 966 / 1,555
Cores. This is now a regression contract; changing income or prices requires a
new measured curve rather than screen-local tuning.

## Verification

- `node tools/test-stage7-input-cancel.mjs`: PASS.
- `node tools/test-stage7-production-contracts.mjs`: PASS.
- `node tools/test-stage7-progression-coherence.mjs`: PASS — four duration labels, two
  systems, all ten rank rows, and shared DEPLOY scope authority.
- `node tools/test-stage7-armory-migration.mjs`: PASS — refunds, clamping,
  idempotence, state preservation, load/save sanitation, catalogs, effects, and
  stale-cart rejection.
- `node tools/test-stage7-economy-contracts.mjs`: PASS — 366/366 starter
  feasibility, client/server history agreement, one grant authority, and every
  first-week band above.
- `node tools/test-stage7-progression-presenters.mjs`: PASS — 25 nodes, eight
  modules, exact scope/outcome/recommendation/craft/refit presenters.
- `node tools/test-progression-rewards.mjs`: PASS on hardware AMD Radeon 610M
  through ANGLE D3D11 — 179-second loss earns zero, 180-second committed loss
  earns 27 XP / 11 Cores / 3 Data / 5 Alloy / 2 Circuit, and fresh debrief
  screenshots explain persistent Account Salvage.
- `node tools/probe-stage7-loadout-summary.mjs`: PASS at 412×900 and 344×760 on
  hardware AMD Radeon 610M through ANGLE D3D11 — complete
  Galaxy→System→Planet→Region→Deploy route, all four authority lanes and scope
  badges, live commander/plan/team/advanced refreshes, responsive layout, and
  one real battle launch with no page, request, or WebGL errors.
- `node tools/test-modifier-art-atlas.mjs <packaged-url>`: PASS — exact 1983×793
  atlas, ten row-major cards, progression locks, 335×96 targets, no obstruction,
  and visually inspected packaged screenshot.
- `node tools/probe-ui-control-interactions.mjs`: PASS, 13/13 executable cases.
- `node tools/probe-ui-computed-touch-targets.mjs`: PASS, 6/6 packaged touch
  families at 412×915 on hardware AMD/D3D11 with no page errors.
- `node tools/audit-ui-control-safety.mjs`: PASS — 137 static controls, five
  dynamic families, six destructive controls, zero unknown controls or blockers.
- `npm run gate`: PASS — 95 manifest scripts, 2,992 top-level names, zero
  collisions, 26.08 MiB self-contained archive, and fully resolved 140.4 MiB
  `www/`.
- `node tools/verify-release-freeze.mjs`: PASS, 4/4 — manifest order, runtime
  assets, package containment/atlas parity, and world-kit OTA coverage.
- Source/package parity: PASS for all 94 files under `src/`, plus `index.html`,
  `boot.js`, `sw.js`, `assets/data/manifest.json`, and the modifier atlas
  (99/99 byte-identical SHA-256).

Focused source-bound UI evidence is written after this document freeze to:

- `.tmp/stage7-completion-after-20260828/report.json`
- `tmp/stage7-loadout-summary/report.json`
- `tmp/ui-control-safety/computed-touch-probe.json`
- `releases/progression/mission-failed-rewards-mobile.png`
- `releases/progression/mission-failed-account-salvage-mobile.png`
- `tmp/continuity/handoff.md`

The runtime reports are accepted only when their own status is `PASS`, hardware
GPU is recorded, their source identity is stable, and the current screenshots
have been visually inspected. The earlier broad 196-view matrix at
`.tmp/stage7-completion-after-20260828/report.json` remains `UNKNOWN`, not
`PASS`, because a concurrent hard-surface authoring run changed the whole-
repository dirty fingerprint during capture. Its Stage 7 runtime fingerprint
was identical at capture start and end and it reported no UI/runtime blockers.
The final quiescent Stage 8 baseline is reserved at
`.tmp/stage8-baseline-orm-fixed-20260828/report.json`; accept it only from its
own stable fingerprints, clean defect summary, and visually inspected images.

## Human comprehension gate

Use a genuinely fresh local profile. Let the player open Arsenal once and
Development once without coaching, then ask:

1. What do Cores buy, and what do Research Data plus recovered materials buy?
2. Which effects persist, which crafted items wear, and which supplies apply to
   one match?

Pass only if the player distinguishes the two purchase lanes and at least three
of the four scope labels without being shown the answer. Record the player's
words and any wrong inference. A failed explanation is a Stage 7 copy defect to
fix before release sign-off, even if every automated gate remains green.

Assessor answer key (do not show before the test): Cores buy permanent
protocols/sidegrades and permanent cosmetics; they do not buy mission-supply
charges. Research Data buys permanent account unlocks, while recovered
materials craft modules. Permanent unlocks stay forever; owned gear contributes
an effect only while `EQUIPPED`; crafted modules `WEAR` and need refit; a
`ONE MATCH` supply consumes one charge when the operation launches.

## Stage 8 boundary

Stage 8 performance, accessibility, package/update, and device work may start
from this source state. The human comprehension result joins the Stage 8 device
acceptance ledger and must close before release. No version, release, APK, OTA,
Hugging Face, Cloudflare, or deployed D1 action was performed here.

## Failure history retained

- The first coherence-test extraction mishandled a regex literal; the test
  parser was corrected and rerun.
- The first coherence run exposed handwritten DEPLOY scope strings. They were
  replaced with the shared helper before acceptance.
- The progression browser fixture initially raced delayed boot/attract reset and
  timed out before the debrief. The harness now settles boot, enforces hardware
  GPU/source identity, and regenerates both screenshots.
- The first Loadout probe tapped `STANDARD` inside the production 180 ms
  cross-control bounce window. Its touch helper now follows every real tap with
  the same deliberate-finger separation used by acceptance paths.
- `ui.css` contained a malformed `../.data:image` URL whose decoded bytes were
  exactly the existing modifier atlas. Source and Capacitor now fetch one loose
  atlas; `bundle.mjs` inlines those bytes only into the self-contained archive,
  and the release-freeze gate rejects missing, extra, or divergent modifier art.
- The modifier-art harness still used the retired tab route, raced async boot,
  accepted assertions behind an account overlay, and scrolled using the wrong
  offset context. It now exercises the Stage 7 Deploy advanced drawer, asserts
  zero obstructions and hardware GPU, and captures the visible cards.
