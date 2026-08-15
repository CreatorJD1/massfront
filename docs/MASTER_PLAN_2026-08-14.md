# MASSFRONT — master plan 2026-08-14

Grok 4.6 leftover-systems refresh. Local source identity is now **`1.33.34`**
(`boot.js` `PACKAGED_REV`, `src/updater.js` `APP_VERSION`). **Live in-game
updater = `1.33.33`** (HF `resolve/main/update.json`). Next hotfix being
staged = **`1.33.34`**. `1.33.31` is previous live. `1.33.32` was prepared
earlier and never uploaded. Repo-root `update.json` is the live **`1.33.33`**
body. Do not upload `1.33.34` from this desk.
Do not treat generated `*-v2` templates as authored packs.
Do not revive InstMesh civic roads.

Evidence: `docs/QA_SWEEP_2026-08-14.md` (morning),
`docs/VERIFY_2026-08-14.md` (12 PASS; FAIL7 + FAIL13 later rechecked),
`docs/LOAD_HEALTH_2026-08-14.md` (72/72 then; bundle is now **75** sources),
`docs/HF_UPDATE_2026-08-14.md` (live **`1.33.33`**; next hotfix **`1.33.34`**),
`docs/COMBAT_VFX_2026-08-14.md`.

## Process lock (verify on 8901)

`http://127.0.0.1:8901/` is `node serve.mjs www 8901`. It serves `www/`, not
`src/`. After every `src/` change: `node tools/bundle.mjs` then
`node tools/pack-www.mjs`, then **one** hard refresh of 8901. Testing `src/` or
`dist/` looks like a full revert.

`tools/pw-browser.mjs` reuses the project CDP. Do not launch a second Chromium.
Real GPU only (ANGLE D3D11). Never SwiftShader. Do not open extra 8901 tabs.
Never `git add -A`. Commit per track if asked.

`pack-www.mjs` **wipes** `www/`. A QA load that overlaps a pack reports phantom
404s. Re-request before believing a 404. Do not pack on top of a sibling
capture that is mid-8901.

## Product locks (do not undo)

- Campaign / MMO / Co-op stay locked War Room cards. Taps toast, do not enter.
- Production battle renderer is hand-written WebGL2. No Filament / Three /
  Babylon in battle. `experimental/preview/` is Babylon and is not the ship path.
- `FACTION_POP_CAP` stays 1000 per seat (`src/game/sim.js`). Theatre sum is
  2000/3000/4000. Do not raise the per-seat cap.
- The Four: 4 systems (`sombrero` / `andromeda` / `orion` / `helios`), 4
  playable homeworlds (`aelos` / `pyraeth` / `nordhall` / `vespera`). No moons.
  4 regions × 3 maps = 48 sites. Keys stay for saves.
- Standard theatres are `*_medium` (`MAPDEFS.size === 'standard'`). Fresh
  Standard landing is `aelos_north_medium`. Compact dailies may stay `*_small`.
- Post-process texture units 4/5/6 never move to 0.
- Do not rewrite `src/galaxyui.js` wholesale. Locked-chip early-return is live.
- Training **skips** the war table on purpose (fixed `vanguard` drop). That
  skip is now explicit in War Room / Operations / Settings copy.

## Agent ownership (do not duplicate)

| Lane | Files | Status this close |
|---|---|---|
| Leftover systems + this board | `galaxyui.js`, `tutorial.js`, `hud.js` (non-settings), `hudflow.js`, `input.js`, `ai.js`, `intro.js`, `daily.js`, `endgame.js` (read), `docs/MASTER_PLAN_*` | **58a1f88e finished.** HUD/War Room leftovers landed. A second leftover desk absorbed that inventory and **did not re-edit those files.** |
| Advanced graphics / presets | `src/game/meta.js` `GFX_PRESETS` + Display override rows, quality gates, `gl.js` / `render3d.js` | **In flight.** Source already has `dprCap` / World V2 / override rows. Do not start a parallel settings rewrite. |
| Terrain impact destruction | `src/engine/terrain.js` `deformTerrain` takeover | **In flight.** Takeover is in source. Sibling recapture was live on 8901. |
| Brood organic VFX | `src/engine/organicfx.js` | **In source** (MANIFEST + dealDamage/killUnit takeover). Not visually signed off here. |
| Rumble / shake / haptics | `src/rumble.js` | **In source** (MANIFEST + `superDetonation` wrap). Device haptics unverified. |
| Water crater fluid | `terrain.js` `stampWaterRipple` + sibling crater-near-water pass | **In flight.** Recapture script was on 8901 this close. |
| Tower crumble + HQ glow | `render3d.js` / `materials-v2.js` / mesh HQ | **In flight.** `capture-tower-hq-fx` failed; no `towerCrumble` symbol found. |
| Trail / smoke / energy punch | `gpufx.js` / `render3d.js` / `sim.js` hooks / `commander.js` EMP+cluster sparks | **Landed.** HIGH still `.tmp/combat-vfx-punch-2026-08-14/combat-trails-smoke-energy.png`. Do not expand into water / HQ / brood blood / settings. |
| Nova cluster vs Legion blackhole | `src/game/sim.js` `superDetonation` | **Landed in source** (shooter faction, not victim team). |
| Hugging Face staging | `docs/HF_UPDATE_2026-08-14.md`, `update.json` | **Live `1.33.33`.** Next hotfix being staged = **`1.33.34`**. `1.33.31` is previous live. `1.33.32` was never uploaded. Repo-root `update.json` is the live `1.33.33` body. Do not upload `1.33.34` from this desk. |

Do not start a parallel rewrite in a sibling-owned file. If a leftover lives
there, it stays on this board.

---

Second leftover desk (this pass): **no `src/` edits.** Absorbed 58a1f88e's HUD/War
Room close. Did **not** re-touch those strings/CSS. Did **not** sign off
graphics / crater / organic / rumble / water / tower / trails / HF.

## 1. Landed this close (leftover agent — do not list as unfinished)

| Track | Where it lives |
|---|---|
| Galaxy hologram chrome | `src/galaxyui.js` — removed on-canvas `LOCAL CLUSTER` / `4 SYSTEMS` / `LOCAL THEATRE`. HTML eyebrow already says FOUR-SYSTEM THEATRE. |
| Help under hologram | Help is a sibling **below** the viewport (galaxy / planet / system), not an absolute overlay on the canvas. |
| System sun name once | No second `S.star` stamp through the disc. Eyebrow still prints DOMINION FURNACE / etc. |
| Continue-conquest banner | Planet · site only (`AELOS · Parade Circle`), 2-line wrap. Region name no longer overflows to `Parade Cir…`. |
| Training skip is explicit | `src/tutorial.js`: War Room foot `RECOMMENDED · SKIPS WAR TABLE`; toast + Operations card + Settings row say the same. Still a dedicated `vanguard` drop — does **not** walk the war table. |
| Phone HIGH→MEDIUM one-time | `src/game/meta.js` `metaHarden` `gfxPhoneMed`. Stock HIGH (empty `gfxOver`) on `mfGuessMobile()` only. Does not steal HIGH when Advanced overrides exist. Does **not** rewrite Settings → Display. Advanced panel is sibling `24a5eb72`. |
| HUD `willReadFrequently` | `src/ui/hud.js` fog + minimap + minimap-bg 2D contexts. `gl.js` leftover call sites stay with the graphics sibling. |
| Enemy-commander HUD flash | `hud.js`: annihilate + live 0 + AI seats on + `stats.t<12` → `enemy commanders inbound: N` instead of a fake win-zero. |
| Daily order title | `src/daily.js` `Full Purge` (was `Full purge`). |
| War Room reward wrap | `src/styles/ui.css` `.warReward small` 3-line + `overflow-wrap`. Long item names still live in `meta.js` (`Campaign Command Intel`, `Warfront Logistics Beacon`) — sibling file. |
| Bundle gate | `node tools/bundle.mjs` — **75** sources, clean. |
| Trail / smoke / energy punch | `gpufx.js` velocity streaks + `gpfxEnergyBlast`; `render3d.js` hotter cores / stacked smoke lobes; `sim.js` impact/explosion/cluster/artillery smoke hooks; `commander.js` EMP + Nova bomblet sparks only. Capture: `.tmp/combat-vfx-punch-2026-08-14/combat-trails-smoke-energy.png` (HIGH, cam 480, 2338 GPU particles, RTX 4060). |

## 1b. Already live (verified in source this close — do not rebuild)

These were on the morning board as open or “documented.” Source now disagrees.
This agent did **not** re-walk 8901 for all of them.

| Track | Source check |
|---|---|
| Locked chips stay on galaxy | `mfGalaxySelectSystem` toasts and **returns**. |
| Standard = `*_medium` | `mfGalaxyDefaultSite` + `main.js` remap. |
| FAIL7 retreat + STOP vs HOLD | `input.js` second `pointerdown`; `stopSelected` writes `uhold=1`; `hudflow.js` readout. VERIFY 15:44 PASS. |
| Mastery includes Nova | `endgame.js` `endgameEnemyFactions()` → `enemyFactions()`. |
| Legion Titan Gate builds TITAN | `factiondoctrine.js` `FAC_ARSENAL.legion.tgate` = `[8,26]`. |
| Intro aria-hidden focus | `intro.js` `closeIntro` blurs **before** `aria-hidden`. |
| Primer skip / must-see | `warprimer.js` `MUST_SEE=['galaxy','region']`; locked-chip copy matches. |
| Inner titles match nav | `index.html` RESEARCH / CONTRACTS / CAREER / INTEL. |
| Arsenal STYLE | `storeui.js` `ARM_CATS`. |
| Nova cluster vs Legion well | `sim.js` `superDetonation` keys off shooter faction. |
| Repair bay + intel | `repairbay.js` / `intel.js` hooked (aprons, GHOST/scout/radar). Connected. |
| Identity `1.33.34` (local; live updater is `1.33.33`) | `boot.js` / updater / gradle / xcode. Repo-root `update.json` is the live `1.33.33` body. Next hotfix being staged = `1.33.34` (not uploaded). |
| Pack-www filters | No `experimental/`, no `assets/packs`, no brand/modifiers/cinematic originals, no generated material stubs. |

Also live, do not rebuild: AO resize / `perfScale` quality gate / 2816px atlas;
roads+city = terrain paint+masks (`WORLDSITES_ENABLED = false`); Brood AI-only;
`?assetskin=` opt-in; Sea Bastion / Stormcaller; Four doctrine; Guard+queue;
ARM 36; AI `bias`; onboarding smoke in `AGENTS.md`; a11y ~44px menus;
`FACTION_POP_CAP` 1000.

`experimental/preview/` is a Babylon pad. Never point it at the APK or 8901.

---

## 2. In flight (sibling lanes — do not poach)

Name the owner. Do not mark these done from this desk.

| Lane | Sev | Files | Note |
|---|---|---|---|
| Advanced graphics toggles / preset fidelity | P1 | `meta.js` `GFX_PRESETS`, Settings Display rows, `gl.js` `resize`, quality gates | **Sibling `24a5eb72` owns close-out.** Panel + `gfxOver` are in source. This desk only added `gfxPhoneMed` (stock phone HIGH→MEDIUM). Do not re-implement the panel. |
| Terrain impact destruction | P1 | `terrain.js` deform takeover, `gl.js` deformQ | Takeover present. Recapture was running on 8901 this close. |
| Brood blood / organic VFX | P1 | `src/engine/organicfx.js` | File + takeovers present. Visual sign-off is that lane. |
| Rumble / shake / vibration | P2 | `src/rumble.js` | File + wraps present. Phone haptics unverified. |
| Water crater fluid | P1 | `terrain.js`, `gpufx.js` | `stampWaterRipple` exists; crater-near-water pass was recapturing. |
| Tower crumble + HQ glow | P1 | `render3d.js`, `materials-v2.js`, HQ mesh | Capture script failed. No `towerCrumble` symbol. |
| Hugging Face 1.33.34 hotfix | P0 publish | `docs/HF_UPDATE_2026-08-14.md` | Live in-game updater is **`1.33.33`**. Next hotfix being staged = **`1.33.34`**. `1.33.31` is previous live. `1.33.32` was never uploaded — skip it. Do not upload from this desk. |

---

## 3. Still open (leftover / product)

| Item | Sev | Files | Owner suggestion |
|---|---|---|---|
| **Trail punch leftover** | P3 watch | `sim.js` `gpfxEnergyBlast` hooks | Punch landed. Tracers stay directed lines (not glow clouds). MEDIUM: 2 smoke lobes / `gpfxN` 0.52× / point cap 34. Re-check `gpfxEnergyBlast` in `sim.js` before ship — a sibling overwrite dropped those hooks once. |
| **APK `www/` weight** | P1 | `tools/pack-www.mjs`, `android/app/build.gradle`, `tools/shrink-apk.sh` | Staged `www/` is **80.8 MiB** after current filters (left out 41.9 MiB of packs/brand/cinematic/stubs). Morning board said 122 MB — that number is stale. Old 28 MB installer story is still dead; shrink-apk is page-align, not this payload. |
| **iOS StoreKit** | P1 store | `docs/IOS-BUILD.md` | Not this Windows tree. |
| **Brood not playable** | P1 product | `src/factions.js` `playableFactions()` | Product call. Do not silent-flip. |
| **Basilisk T3 vs Goliath** | P1 documented | `src/game/sim.js` `TYPES` | `docs/BALANCE_REVIEW_2026-08-14.md` §4.2. Not applied. |
| **Cascaded shadows leftover** | P3 | `mesh.js` csmApply, `render3d.js` | **Landed HIGH/CINEMATIC** sun-depth atlas (unit **4** apply-only; 2 clips HIGH / 3 CINEMATIC; 4-tap PCF). Living walk + gated FK. Carrier/modules on InstMesh path. Terrain casts HIGH near-clip / CINEMATIC near+mid (Z-strip). Far CINEMATIC clip skipped (205k tris / 1900-radius tile — fillrate). MEDIUM/LOW 0 cascade draws. `cutMul=1` hoisted. **Still leftover:** apply is screen-space multiply, not material `ndl` (unsafe vs civic filmic write + World V2 unit-4 skins). |
| **Metal crush** | P2 | `materials-v2.js`, `render3d.js` | Graphics sibling. HIGH polish. |
| **Physical-notch** | P0 release | `ui.css` `--sat`, Android `shortEdges` | 412×915 CDP is not a device. |
| **3D radar overlay** | P2 | `intel.js`, `hud.js` `fogRadar` | Command-map by design. Do not turn uplink into omni. |
| **Campaign / MMO / Co-op** | P3 locked | `meta.js` War Room | Toast only. |
| Pack-www skipped → stale 8901 | P0 process | `pack-www.mjs`, `serve.mjs` | Every `src/` edit packs. |
| Next HF hotfix `1.33.34` | P0 publish | `src/updater.js`, `update.json` | Live channel is **`1.33.33`**. Local source is `1.33.34`. Do not upload from this desk. |
| `gl.js` Canvas2D `willReadFrequently` | P3 | `src/engine/gl.js` | Helper at ~154. Other `getContext('2d')` sites still bare. **Graphics sibling** — do not edit `gl.js` from leftover. |
| War Room locked-card reward names | P2 | `meta.js` `INV_CONSUMABLES` | Long exclusive-item names. CSS wraps; shortening the string is a `meta.js` edit. |
| Training still skips war table | — | `tutorial.js` | **By design.** Copy is now explicit. Do not route Training through galaxy. |

### 3b. Found after 58a1f88e — closed 2026-08-14 (parked-collision desk)

Collisions with 58a1f88e / graphics siblings are gone. This desk owned
`session.js` / `audio.js` / `daily.js` / `hudflow.js` / `hazards.js` /
`input.js` only. Did **not** edit `meta.js`, `endgame.js`, HUD/War Room
strings, or any graphics file. Did **not** sign off crater / organic /
rumble / water / tower / trails / HF.

| Item | Sev | Status | Note |
|---|---|---|---|
| Session wallets + orders | P2 | **FIXED** | `session.js` snapshots AI seat/ally wallets, remaps `utgt` / `umarch` / guard / queue / patrol. `ufield` rebuilt via `requestField` (field ring dies with the match). Old v1 snaps still load. Live resume not GPU-proved this close. |
| Guard radio copy | P2 | **FIXED** | `RADIO_COPY` + Brood lines + icon. VO aliases `guard→hold` (no new clip). `input.js` acks `'guard'`. |
| `mfBindTabs(...,'threat')` | P3 | **FIXED** | Dead call still in `endgame.js` (not ours). `hudflow.js` wraps `renderOps` and remaps stale `threat`/`mastery` tab state through `opsTab()`. |
| No `vsNova` daily | P2 | **FIXED** | `Frontline front` / `winNova`. Completes when `AI.fac==='nova'` (playable enemy). Pays cores + XP booster like the other fronts. |
| Profile mastery grid | P2 | **FIXED** | `#masteryGrid` is already on Career. `hudflow.js` wraps `renderProfile` — no `meta.js` write. Covers profile-switch and post-match without visiting Ops. |
| `flood` → `isles` alias | P3 | **FIXED** | Own `flood` mode + channel pick + phase-7 surge. No `deformTerrain` / `stampWaterRipple`. No live MAPDEFS site uses `flood` yet. |
| Dead `solray_corridor` | P3 | **FIXED** | Profile aliases to `heat`. Tick is `heat` only. |
| `clearSel` / `ustopDisp` | P3 | **FIXED** | `clearSel` fills the HUD bit array. |

8901 GPU proof (one hard refresh, reused tab, ANGLE D3D11 RTX 4060):
`RADIO_COPY.guard`, `vsNova`/`winNova`, mastery wrap **49 rows / 192 cells /
4 banners**, flood mode, solray→heat, `clearSel`/`orderGuard`/`sess*` helpers.
Shot: `.tmp/parked-leftover-2026-08-14/profile-mastery.png`. Session *resume*
itself was not walked (needs a dropped match).

Do not start: Campaign, MMO, Co-op, flowfield Worker, Filament/Three battle,
global assetskin, InstMesh civic roads, pop-cap raise, galaxyui rewrite,
silent Brood-as-player, cascaded battle shadows, sim buoyancy, seventh dock
button, uplink-as-omni.

---

## 4. Recommended order

1. **Pack discipline.** Any `src/` edit → bundle + pack-www + one 8901 refresh.
   Do not pack on top of a sibling capture.
2. **Close in-flight sibling lanes** (graphics toggles, craters, organic, rumble,
   water-fluid, tower/HQ, trail punch) or drop them from the HF notes.
3. **HF 1.33.34** — next hotfix after live `1.33.33`. `1.33.31` is previous live.
   See `docs/HF_UPDATE_2026-08-14.md`. Do not upload `1.33.32`. Do not upload
   `1.33.34` from this desk.
4. **APK `www/` weight** — leftover pack this close measured **80.8 MiB**
   staged. Further cuts wait on sibling audio/map decisions, not another
   filter pass of the same stubs.
5. **Physical-notch** on a real phone.
6. **Basilisk / Brood-as-player** — product calls only.
7. Never `git add -A`.

---

## 5. Cannot ship this run

- Campaign / MMO / Co-op as playable modes.
- Server-authoritative store (worker undeployed; Armory unwired).
- Play Store AAB / production signing.
- iOS IPA from this machine (StoreKit also still open).
- Live AdMob.
- “All units are bespoke V2” — false. Semantic V2 is live; authored packs are
  Rhino hull+turret and Gorger hull, opt-in.
- `FACTION_POP_CAP` > 1000.
- Extra solar systems, moons, or non-Four homeworlds.
- InstMesh civic-road revival.
- Material Lab or asset skins as the default battle path.
- Babylon/Three/Filament in production battle. Material-sampled CSM (atlas is apply-pass only).
- OTA publish without a frozen version + packed `www/` + HF payload-last
  manifest. Live channel is **`1.33.33`**. Next hotfix **`1.33.34`** is not uploaded.
- Physical-phone / notch sign-off (not captured).
- The old 28 MB installer story (`www/` is 80.8 MiB after filters).
- Brood-as-player without a product call.
- **Nova catalog GLB/OBJ files are not in the repo.** The ten-building
  “NOVA RTS BRUTALIST SCI-FI” pack exists only as seven packed
  `WORLD_KIT_DATA` meshes in `assets/data/worldkit.js` (barracks, tower,
  block, depot, watchtower, gauss, gatehouse). Distinct Command Citadel /
  Hab Stack / Industrial Foundry / Power Relay GLBs were never imported.
  `city_brutalist_grid` still fails to stamp on Standard Aelos
  (`SITE_REJ` resource + required-plot). Kit now draws via outpost templates
  + Nova district fill. `MF_BLENDER_GEO` city keys in `meshes.js` are unused
  duplicates of live `WORLD_MODELS` — not rebound.

## Tiny defects noted, not this close

- `armorPlate` `tilt` unused; MeshBuilder transform stack unused by factories.
- `CHARACTERS` includes Brood Sovereign at rank 8 while Brood is unplayable.
- Weekly fallback / daily first-site stats still name `aelos_north_small`
  (Compact contracts — leave unless those contracts are wrongly used as Standard).
- City/deployment tests still assert dead InstMesh APIs
  (`tools/test-city-terrain-integration.mjs`, `tools/test-deployment-fog.mjs`).
- `HANDOFF.md` / terrain-city next-pass docs are not current.
- `LOAD_HEALTH` AGENTS.md smoke note is stale — `AGENTS.md` already has the
  intro → account gate → War Room → Standard → five `#setupStart` → `#deployBtn`
  flow.
