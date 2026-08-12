# MASSFRONT handoff for Claude Code

> v1.32 continuation note: read `docs/V1.32_RELEASE_HANDOFF.md` first. It
> supersedes older version numbers, release-channel notes, and the weekly queue
> below while retaining this document's deeper architecture reference.

Snapshot: 2026-08-03. This handoff is for continuing the current workspace, not
restarting the game from an older archive. Read `AGENTS.md` first, then this
file, `docs/MULTI_STAGE_PRODUCTION_PLAN.md`, `docs/UI_SYSTEM_BLUEPRINT.md`, and
`docs/RELEASE_PREFLIGHT.md`.

## Mission

MASSFRONT is a touch-first, large-scale RTS/RPG inspired by the strategic scale
of Supreme Commander and the readable defensive play of Command & Conquer. It
is a plain-JavaScript/WebGL2 game that runs on the web and is wrapped by
Capacitor for Android and iOS. The immediate goal is a polished vertical slice
in which large battles, tower-defense preparation, faction identity, commander
progression, and mobile usability reinforce each other.

Do not replace the engine, add a framework, or convert the source to modules.
Work in small, measured tranches and show an in-game PNG after every meaningful
visual change.

## Current source of truth

- Canonical game source is the repository root: `index.html`, `boot.js`,
  `src/**`, and `assets/**`.
- Runtime script order is duplicated in `boot.js` and
  `assets/data/manifest.json`. A new source file must be added to both, in a
  dependency-safe order.
- `www/**`, `dist/massfront.html`, Android `public/**`, and iOS `public/**` are
  generated/staged copies. Never hand-edit them.
- `MASSFRONT-source.zip` is an old 373-entry, roughly 14.2 MB archive. It does
  not contain the current production/art history and must not be used as the
  continuation baseline.
- Canonical app version sources currently say `1.30.0`. The repo-root
  `update.json` is stale at `1.28.0`. Do not publish it.
- The currently configured OTA source is the Hugging Face dataset
  `CREATORJD/massfront-releases`; the playtest is the static Space
  `CREATORJD/massfront-playtest`.
- This workspace has no Git metadata. Preserve unrelated files and make a
  dated source archive before any broad mechanical rewrite.

## Architecture that must not be broken

1. All files in `assets/data/manifest.json` execute as classic scripts in one
   global scope. Duplicate top-level `const` or `let` names are fatal. There are
   no `import` or `export` statements under `src/`.
2. Run `node tools/bundle.mjs` after every source edit. It is the syntax and
   global-collision gate, not merely an optional distribution build.
3. Prefer feature takeover/wrapping in a top-level feature module over invasive
   rewrites of `src/game/**` or `src/ui/**`. Existing examples are `audio.js`,
   `restree3d.js`, and `offline.js`.
4. Units use structure-of-arrays storage. A unit slot can be recycled; retain
   `(slot, ugen[slot])`, never a bare slot, across delayed actions.
5. Post-processing owns texture units 4, 5, and 6. Custom render passes must
   restore blend, cull, depth-test, and depth-write state and resume with
   `begin3D(S_nA)`.
6. Audio effects need Ogg and M4A/AAC. Open-source Chromium cannot decode AAC;
   Safari/iOS needs AAC. Do not remove either path as "duplicate" media.
7. Balance must be checked against the live tables. Use
   `node tools/extract-design-db.mjs`; do not transcribe values into a separate
   balance document and assume they remain correct.
8. A clean console is not a visual pass. Render at a phone viewport and inspect
   the PNG.

## Canonical faction rules

Reference-sheet labels are aliases, not extra factions.

| Canonical faction | Reference aliases | Commander | Non-negotiable visual/gameplay language |
|---|---|---|---|
| Nova Federation | Terran Frontline Command | Captain Elara Kai | Blue/cyan, clean modular armor, advanced energy technology, precise capacitor light, disciplined combined arms. |
| Red Ascendancy | Crimson Dominion, Bloodward Legion | Lord Darion Vex | Red/black, heavy siege mass, oversized weapons, armor, recoil hardware, heat and suppression. |
| Syndicate Coalition | Machine Ascendancy, Emerald Triad | Broker Lys Renn | Green/violet, autonomous advanced machines, asymmetric hover forms, coils, holographic rings, intel and adaptation. |
| Umbral Brood | Infestation Swarm, Void Swarm, Brood Swarm | The Brood Sovereign | Fully biological insects/organisms. Chitin, flesh, membranes, sacs, claws, spores and grown weapon throats. No fabricated panels, vehicles, barrels, or other machines. |

Faction identity is a five-part contract: silhouette, materials, movement,
projectiles/audio, and roster role. Recoloring one shared chassis is not a
finished faction asset. Each faction also needs its own commander appearance
and base deployment craft/organism.

## Completed and protected work

| Production stage | Current state |
|---|---|
| Stage 0 - baseline | Complete: account/cloud-save resolution, portable `.mfsave`, Android back behavior, safe-area work, updater recovery, faction/audio gates and unit separation are protected by focused tests. |
| Stage 1 - battlefield intelligence | Complete: current vision plus explored terrain; fog hides enemy entities, effects, bars, selection, shadows and minimap data; five-rarity pickups; survey scan; live strong/weak cards; guarded radio confirmations. |
| Stage 2 - maps/hazards | Complete first pass: Compact/Standard/Grand opening spans, fair starter economy, contested caches, EMP/storm vision reduction, and telegraphed terrain faults. |
| Stage 3 - faction art | Structures complete at the geometry-identity level. Dedicated three-tier defensive families are live. Rhino has four bespoke faction forms. Brood unit roster is bespoke. Remaining shared role chassis: Nova 24, Red 24, Syndicate 22. Mobile-PBR work is an intermediate quality pass, not final high-detail art. |
| Stage 4A - RTS/tower defense | Complete first pass: emergency Research Complex containment/recovery, ten defenses with monotonic Mk1-Mk3 stats, corridor/coverage previews, formation slots, patrol quorum, visible waypoint loops, and exact-stack prevention without forcing loose armies. |
| Stage 4B - unit abilities | Charged Barrage is implemented for artillery behind the `firemission` doctrine leaf: selected artillery only, interruptible 2.8 s charge, six high-arc slow shells, splash, fog-safe presentation, cost/cooldown and a 60x48 px touch target. `bundle.mjs` and the focused Playwright gate passed twice without page errors. Reconfirm after any relevant source change and before release. |
| Stage 5 - meta/UI | In progress: Operations/category shell, weekly mission briefing, complete/failure debriefs, rewards/resources, persistent five-rarity gear and consumables, and live purpose/matchup cards exist. The broader menu and Development/inventory presentation still need consolidation and real previews. |
| Stage 6 - onboarding/content | First-time Training Operation brief and ten state-driven objectives exist. Guidance must be playtested through an entire first match and then extended into authored mission families. |
| Stage 7 - release | Not closed. Release preflight identified stale staging, a stale root manifest, an unpublished optional soundtrack index, and manual HF release steps. |

Current visual evidence lives under `releases/`, including:

- `releases/fog-pickups/`
- `releases/intel-cards/`
- `releases/map-depth/`
- `releases/platoon-orders/`
- `releases/tower-defense/`
- `releases/artillery-barrage/`
- `releases/ui-stage5/` and `releases/ui-stage6/`
- `releases/faction-*-live3d.png`
- the Blender/PBR labs in `releases/building-lab/`,
  `releases/faction-building-lab/`, `releases/tower-lab/`, and
  `releases/unit-lab/`

## This week's ordered task list

Do not attempt all of these in one rewrite. Close each tranche with the bundle
gate, one focused behavior test, and one inspected phone PNG.

### Day 1 - freeze the tactical vertical slice

1. Treat Charged Barrage as a protected baseline: its focused gate passed twice
   and its screenshot was captured. Re-run it only after relevant integration
   changes and fix demonstrated failures rather than redesigning the ability.
2. Run fog, unit-separation, platoon, tower-defense, and account-sync regression
   gates after the barrage integration.
3. Confirm dense armies may remain visually tight while no two large units
   occupy exactly the same point. Do not globally increase spacing.
4. Record any failing invariant before changing balance.

### Day 2 - finish the most visible faction unit identities

Use `design/faction-production-matrix.md` as the measured backlog. Replace
doctrine overlays with bespoke silhouettes in this priority order:

1. Nova: Striker, Goliath, Thumper/Bombard and Wasp.
2. Red: Goliath, Thumper/Bombard, Harbinger and frontline infantry.
3. Syndicate: Kestrel/Wasp/Raptor, Resonator and core ground attacker.
4. Preserve the already bespoke Brood forms; improve spring-bone/secondary
   biological motion without adding mechanical components.

For each asset family: hollow visible barrel/throat ends, eliminate UV
stretching, separate material zones, keep baked AO subtle, enforce a mobile LOD
budget, and recapture the in-engine contact sheet from current runtime models.

### Day 3 - class abilities and counter readability

1. Generalize the artillery implementation into a small, data-driven class
   ability contract without changing the one-global-scope architecture.
2. Add one tested ability per high-value class rather than many unfinished
   buttons: recon scan, armored overdrive/brace, support repair pulse, and
   anti-air lockdown are good candidates.
3. Unlock abilities from categorized doctrine nodes. Locked state, cost,
   cooldown, range, target validity, cancel/back behavior, and AI policy must be
   explicit.
4. Keep strong/weak preview symbols driven from the live weapon/armor matrices.

### Day 4 - RPG loop and mission content

1. Playtest reward cadence across win, committed loss and fast surrender. Gear
   must feel rewarding without allowing surrender farming.
2. Improve the five-rarity inventory with clear compare/equip feedback,
   filters, and a model/portrait preview; keep three gear slots and two readied
   consumables until evidence supports more complexity.
3. Author the first post-tutorial mission family with optional objectives,
   hazard modifiers and visible rewards.
4. Protect local and cloud save compatibility. New fields require migration and
   sanitization, not a save reset.

### Day 5 - mobile interaction and presentation

1. Audit every menu tab/toggle/back control at 393x852 and a landscape phone.
   Interactive bounds must match the visible control and be at least 48 CSS px.
2. Replace text-only high-value panels with commander portraits, faction crest,
   live unit/building preview, purpose icons, requirements and strong/weak
   symbols.
3. Verify Android back closes the top overlay/aiming state before it exits the
   app. Verify bottom safe-area spacer prevents controls hiding behind system
   navigation.
4. Reduce clutter by progressive disclosure; do not merely shrink text.

### Day 6 - performance and release candidate

1. Measure representative 30-, 100- and 300-unit scenes on the mobile renderer.
   Prioritize simulation cadence, draw submission and VFX budgets before visual
   downgrades.
2. Freeze source and bump every version source together.
3. Stage web/native copies, build the `installable` Android flavor, shrink and
   re-sign it, then verify package/version/signature/alignment.
4. Build the master source handoff described in
   `docs/MASTER_SOURCE_ARCHIVE_MANIFEST.md`.

### Day 7 - device validation and durable handoff

1. Upgrade over the prior `.mobile` APK on a real Android device and confirm
   the career survives.
2. Validate update discovery, download, restart, first-render confirmation and
   rollback. Publish payload first and manifest last.
3. Validate cloud pull/push conflict UI with two genuinely different saves.
4. Capture final phone PNGs, hashes and known issues. Do not claim an iOS IPA is
   installable without an Apple-signed cloud/macOS build.

## Focused verification commands (120-second hard cap each)

Every command below is a separate batch. In an agent shell, set
`timeout_ms: 120000`. For a human PowerShell session, use this wrapper:

```powershell
function Invoke-MFNode([string[]]$Arguments) {
  $p = Start-Process -FilePath node -ArgumentList $Arguments -PassThru -NoNewWindow
  if (-not $p.WaitForExit(120000)) {
    $p.Kill($true)
    throw "MASSFRONT gate exceeded 120 seconds: node $($Arguments -join ' ')"
  }
  if ($p.ExitCode -ne 0) {
    throw "MASSFRONT gate failed ($($p.ExitCode)): node $($Arguments -join ' ')"
  }
}
```

Mandatory after every source edit:

```powershell
Invoke-MFNode @('tools/bundle.mjs')
```

Focused behavior gates; run only those affected plus the short protected core:

```powershell
Invoke-MFNode @('tools/test-artillery-barrage.mjs')
Invoke-MFNode @('tools/test-fog-pickups.mjs')
Invoke-MFNode @('tools/test-unit-separation.mjs')
Invoke-MFNode @('tools/test-platoon-orders.mjs')
Invoke-MFNode @('tools/test-tower-defense.mjs')
Invoke-MFNode @('tools/test-account-cloud-sync.mjs')
Invoke-MFNode @('tools/test-intel-cards.mjs')
Invoke-MFNode @('tools/test-map-depth.mjs')
```

Faction/art gates:

```powershell
Invoke-MFNode @('tools/test-faction-structure-distinctiveness.mjs')
Invoke-MFNode @('tools/test-faction-structures.mjs')
Invoke-MFNode @('tools/test-faction-unit-identity.mjs')
Invoke-MFNode @('tools/test-faction-rhino-identity.mjs')
Invoke-MFNode @('tools/test-audio-identity.mjs')
```

Meta/onboarding gates:

```powershell
Invoke-MFNode @('tools/test-operations-shell.mjs')
Invoke-MFNode @('tools/test-weekly-briefing.mjs')
Invoke-MFNode @('tools/test-training-briefing.mjs')
Invoke-MFNode @('tools/test-training-operation.mjs')
```

Some Playwright tools expect a local server. Stage first when deliberately
testing packaged web content, start a separate server, run one gate with its
120-second cap, then stop the server. Never let a broad test loop consume the
entire work session.

## Release and updater rules

The detailed procedure is `docs/RELEASE_PREFLIGHT.md`; these are the stop-ship
rules:

1. Freeze canonical source before version bump or staging.
2. Change `src/updater.js`, `boot.js`, `index.html`, `package.json`,
   `package-lock.json`, Android `versionName/versionCode`, and iOS
   `MARKETING_VERSION/CURRENT_PROJECT_VERSION` together.
3. Run `bundle.mjs`, then `bundle-update.mjs <version>`, then `pack-www.mjs`,
   then Capacitor sync. Do not edit staged copies.
4. Android test delivery uses `assembleInstallable`, package
   `com.creatorjd.massfront.mobile`, followed by mandatory
   `tools/shrink-apk.ps1` on Windows.
5. Verify the final shrunk APK with `aapt`, `apksigner`, and `zipalign`. The
   established signer SHA-256 is
   `D61AAF77C171F0F1E7841394EB0ADAED196E146AD90226A0F07854C29EE073F0`.
6. Back up `%USERPROFILE%\.android\debug.keystore` outside the repository. A
   different signer cannot update installed test builds.
7. Upload an immutable OTA payload first. Verify its bytes and SHA-256 through
   the public pinned URL. Publish `update.json` last as the channel switch.
8. A `boot.js` defect cannot be fixed by the current OTA payload; it needs a new
   web/native package.
9. The optional remote soundtrack index is not live on the active HF channel.
   Keep music bundled until every file and the index are publicly verified.
10. An iOS wrapper/source handoff is valid from Windows. An installable IPA is
    not; it requires Apple signing through macOS or an authenticated cloud build.

## Known risks that remain

- Nova, Red and Syndicate still share many unit role chassis despite improved
  faction overlays. This is the largest art-direction gap.
- The economy Worker exists but is not deployed; currency remains client-side.
- Laser/gauss effect variant counts remain thin and can repeat audibly.
- Real-device AAC playback, large-battle performance and update-in-place save
  retention need hardware verification.
- `assets/AUDIO-LICENSES.md` now inventories bundled and optional audio, source
  hashes and the owner's ownership assertion. Vendor, creator, receipt and exact
  license fields still require owner documentation before commercial release.
- The audio provenance audit found 31 owner-supplied source WAVs and three
  current project masters under `.tmp`. Follow
  `docs/MASTER_SOURCE_ARCHIVE_MANIFEST.md` to copy them into durable
  `source-media/audio/**` paths before deleting or excluding temporary files.
- The current release process is manual. Old Cloudflare updater instructions
  describe an obsolete channel and must not replace the HF payload-first flow.

## Continuation report format

Every completed tranche should report:

1. Outcome in player terms.
2. Exact canonical files changed.
3. Focused gates run, each under 120 seconds.
4. PNG path and what was visually inspected.
5. Balance/performance measurements, when relevant.
6. What remains incomplete or unverified.
7. Whether staging, native packaging or remote publication occurred.
