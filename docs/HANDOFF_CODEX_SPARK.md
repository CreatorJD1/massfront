# MASSFRONT weekly task board for Codex Spark

> v1.32 continuation note: read `docs/V1.32_RELEASE_HANDOFF.md` first. It is the
> current bounded queue; the packets below remain useful only where they do not
> conflict with the v1.32 protected baseline.

Snapshot: 2026-08-03. Use this board for bounded continuation tasks. The root
integrator owns shared-system merges, versioning, packages and publication.
Read `AGENTS.md` before editing.

## Rules for every task

- Edit canonical files only. Never edit `www/**`, `dist/**`, Android `public/**`
  or iOS `public/**` by hand.
- There is one classic-script global scope. No `import`/`export`; avoid new
  global names when an existing feature namespace can own the state.
- If a new script is unavoidable, register it in both `boot.js` and
  `assets/data/manifest.json` in the same dependency order.
- Run `node tools/bundle.mjs` after each source change, with a 120-second hard
  timeout.
- Run no test for more than 120 seconds. Prefer one focused test over a broad
  suite.
- Inspect one 393x852 or comparable phone screenshot after visual changes.
- Preserve save compatibility, cloud conflict resolution, Android back, safe
  areas, fog information security, and updater rollback.
- Tight armies are allowed. Prevent exact/near-exact single-position stacking;
  do not force a large group into an unnecessarily loose formation.
- Only the root integrator packages or publishes. A task agent returns source,
  focused test result and screenshot.

## Faction canon in one screen

| Faction | Visual doctrine |
|---|---|
| Nova Federation | Blue/cyan advanced energy technology, clean modular armor, disciplined precision. |
| Red Ascendancy | Red/black heavy armor, large weapons, recoil, heat, siege and suppression. |
| Syndicate Coalition | Green/violet autonomous machines, hover/asymmetric forms, coils and holograms. Machine Ascendancy is an alias for this faction. |
| Umbral Brood | Insectile/biological organisms only: chitin, tissue, sacs, claws, spores and grown throats. Infestation Swarm is an alias. Never add machines. |

## Current protected features

Do not reimplement these from scratch: true fog and explored terrain, five-tier
pickups, live matchup cards, fair map presets/hazards, dedicated faction
structures, four bespoke Rhino forms, tower Mk1-Mk3 progression, Research
Complex recovery, platoon formation slots/patrol visualization, Operations and
Training briefs, mission debrief/rewards, five-rarity inventory, account/cloud
save, portable `.mfsave`, OTA rollback, audio routing, and artillery Charged
Barrage.

## Queue for this week

Each packet is deliberately small enough to finish, test and show. Do not merge
two packets into one broad rewrite.

### SPARK-01 - Charged Barrage regression baseline (complete; rerun when touched)

Goal: preserve the already validated artillery doctrine ability. The bundle and
focused Playwright gate passed twice on 2026-08-03 with no page errors and a
60x48 px mobile control. Do not spend a work packet reimplementing it.

Allowed focus: `src/game/commander.js`, `src/game/sim.js`, `src/ui/input.js`,
`src/ui/hud.js`, `src/ui/render3d.js`, `src/develop.js`, `src/restree3d.js`,
`src/main.js`, barrage CSS and `tools/test-artillery-barrage.mjs`.

Acceptance:

- `firemission` unlock is required.
- Only selected artillery arms the action.
- One 240-energy payment, 52-second cooldown, interruptible charge.
- Six separated slow, high-arc shells; every structure in splash takes damage.
- Recycled projectile slots clear barrage metadata.
- Cancel, Escape and Android back exit targeting before app navigation.
- No unscouted information appears through VFX, audio, shadow or minimap.
- The visible button is at least 48x48 CSS px.
- Run `node tools/bundle.mjs` and
  `node tools/test-artillery-barrage.mjs`, each capped at 120 seconds.
- Inspect `releases/artillery-barrage/artillery-barrage-mobile.png`.

### SPARK-02 - Nova frontline art tranche (P1)

Goal: replace shared silhouettes for Striker, Goliath and one artillery role.

Allowed focus: model factory files, faction model routing, art-capture script and
one focused identity test. Do not rebalance stats.

Acceptance:

- Three full geometry fingerprints differ from Red and Syndicate equivalents.
- Nova reads as advanced blue/cyan energy technology at normal game zoom.
- Visible weapons have inner barrels/emitter depth, no flat black cap.
- Separate armor, mechanism, rubber/track/hover and emissive material zones.
- No severe UV stretch; AO supports form instead of dirtying every surface.
- Capture one current in-engine contact sheet, not an old icon sheet.

### SPARK-03 - Red siege art tranche (P1)

Goal: replace shared silhouettes for Goliath, Thumper/Bombard and Harbinger.

Acceptance is the same geometry/material gate as SPARK-02, plus: oversized
weapons, squat armored mass, visible recoil hardware and heat language. Do not
turn Red into a recolored Nova unit.

### SPARK-04 - Syndicate strike art tranche (P1)

Goal: replace shared silhouettes for Kestrel/Wasp/Raptor and Resonator.

Acceptance is the same geometry/material gate as SPARK-02, plus: asymmetric
hover/levitating mechanisms, green-violet coil light and autonomous-machine
silhouettes. Do not use biological forms.

### SPARK-05 - Brood secondary motion (P1)

Goal: make Brood movement feel grown and alive without destabilizing large
battles.

Acceptance:

- Spring/secondary motion is bounded, deterministic enough for replays and
  disabled or simplified by distance/LOD.
- No rigid machine parts are introduced.
- No per-unit garbage allocation in the hot simulation/render loop.
- A 100-Brood scene remains within the existing mobile frame budget.
- Capture close and normal-zoom screenshots.

### SPARK-06 - Ability framework, one class at a time (P1)

Goal: extend doctrine-unlocked active abilities using Charged Barrage as the
working reference.

Order: recon scan, support repair pulse, armored brace/overdrive, anti-air
lockdown. Ship only one per packet.

Acceptance:

- Unlock node, locked description, eligible class, cost, cooldown, range,
  target validity, visual preview, audio confirmation, cancel/back and AI policy
  are all explicit.
- Store delayed unit sources as `(slot, generation)`.
- Add one focused mechanic test and one phone PNG.
- Strong/weak descriptions derive from live matrices, never copied prose.

### SPARK-07 - First post-tutorial operation (P1)

Goal: create one replayable mission that follows Field Orientation.

Acceptance:

- Briefing includes commander portrait, faction crest, map/hazard, primary and
  optional objectives, duration, modifiers and visible rewards.
- Mission teaches one new system rather than repeating all ten tutorial steps.
- Completion and committed failure both produce a debrief; surrender cannot
  farm loot.
- Progress persists through the existing save schema with sanitization.
- Operations and Training entry points remain accessible after returning from a
  match.

### SPARK-08 - Inventory usability pass (P2)

Goal: make the existing five-rarity gear/consumable system understandable on a
phone.

Acceptance:

- Clear All/Gear/Supplies categories, owned count, equipped/readied state,
  rarity color plus text/icon, and a detail/compare panel.
- Keep weapon/armor/utility slots and the two-consumable limit.
- No control below 48 CSS px; no hidden bottom action behind system navigation.
- Do not change loot odds without a measured reward-cadence report.

### SPARK-09 - Mobile interaction regression (P0 before release)

Goal: eliminate blocked tabs, clipped back buttons and mismatched hitboxes.

Acceptance:

- Test portrait 393x852 and a landscape phone viewport.
- Visible and interactive rectangles match for tabs, toggles and close/back.
- Android back closes aiming, dialog, submenu and primary overlay in that order,
  then exits only from the root menu.
- Returning from a match leaves Operations, Development, Armory, Orders,
  Profile, Settings and Account tappable.
- Capture before/after PNGs for each repaired layout class.

### SPARK-10 - Release candidate (integrator only)

Follow `docs/RELEASE_PREFLIGHT.md` exactly. Required order:

1. Source freeze and focused gates.
2. Bump all canonical version sources together.
3. Build OTA payload, then stage `www`, then Capacitor sync.
4. Build Android `assembleInstallable`, shrink/re-sign, verify package,
   version, signer and alignment.
5. Build the master source artifact from
   `docs/MASTER_SOURCE_ARCHIVE_MANIFEST.md`.
6. Upload immutable payload and verify it; publish update manifest last.
7. Publish web playtest; device-test upgrade/save retention; then publish APK.

Never use the stale root `update.json`, old Cloudflare updater channel, old
`MASSFRONT.apk`, or old `MASSFRONT-source.zip` as current release inputs.

## Minimum regression set by change type

Run each command separately with a 120-second timeout.

| Change | Focused gates |
|---|---|
| Any source | `node tools/bundle.mjs` |
| Barrage/projectiles | `node tools/test-artillery-barrage.mjs`; `node tools/test-fog-pickups.mjs` |
| Movement/formations | `node tools/test-unit-separation.mjs`; `node tools/test-platoon-orders.mjs` |
| Towers/research defense | `node tools/test-tower-defense.mjs`; relevant faction-structure gate |
| Faction units | `node tools/test-faction-unit-identity.mjs`; role-specific identity gate |
| Faction structures | `node tools/test-faction-structure-distinctiveness.mjs`; `node tools/test-faction-structures.mjs` |
| Account/save | `node tools/test-account-cloud-sync.mjs` |
| Operations/tutorial | `node tools/test-operations-shell.mjs`; relevant briefing/training gate |
| Audio | `node tools/test-audio-identity.mjs` |
| Map/fog | `node tools/test-map-depth.mjs`; `node tools/test-fog-pickups.mjs` |

## Return-to-integrator template

```text
Packet:
Player-visible outcome:
Canonical files changed:
Bundle gate (duration/result):
Focused gate (duration/result):
Screenshot path and visual inspection:
Measured balance/performance result:
Known remaining issue:
Packaging/publication performed: no
```
