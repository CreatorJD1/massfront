# Mobile QoL and full-game review — 2026-08-15

Walk of the live shell (intro → War Room → War Table → deploy → match HUD → victory) plus known debt. This is a review, not an implementation pass. Menu/research hub from the 2026-08-15 concept shots is **research only** (section 8).

---

## 1. What works

- **Boot / intro.** Pre-alpha title (`#mfIntroStart`), account portal close, then `startScreen`. Diorama attract when `menuBg !== 'off'`.
- **War Room.** Standard is the only playable door. Campaign / MMO / Co-op cards stay visible and locked with copy (`src/game/meta.js`).
- **War Table.** Galaxy → system → planet → region → deploy (`src/galaxyui.js`). Double-tap confirm on stars / regions / site cards (first tap highlights, second commits). Footer CONTINUE still one-taps.
- **Match.** Supreme Commander-style economy, four factions, commander signatures, airlift, veterancy chevrons, building LV marks, stacked factory queues (`×N` plates).
- **Victory.** Rewards grant once. Return to Menu + Continue (next unlocked site). Last theatre site can play a faction departure card (`src/departure.js`).
- **Audio.** Dual-codec SFX. Instrumental `mus_*` beds after vocal Suno tracks were removed. Browser Chrome needed a real gesture `play()` and must not sleep on `window.blur`.
- **OTA.** In-game updater on Hugging Face. Live at review time: **1.33.37**. Vocal-music deletion is local until the next OTA.

---

## 2. Mobile QoL — live issues

| Area | Issue | Severity |
|---|---|---|
| Build cards | Brood/Legion/Syndicate STRUCTURES showed `◇` diamonds (Codex PNGs missing, `makeIcon` was Nova-only). **Fix in this pass.** | High |
| Crystal / mex | Five additive deposit sprites + CRYST rim + extractor sphere = white disc. **Fix in this pass.** | High |
| Water | Mesh water read as thin/glassy vs old navy sheet. **Look tuned this pass;** crater fluid kept. | High |
| Page zoom | Browser pinch/Ctrl+wheel scaled the HUD. Viewport locked `maximum-scale=1`. | Medium (landed) |
| Minimap | Phone reports of a dead/wrong minimap after OTA art drop. Needs a dedicated visual pass. | High |
| Safe areas | HUD has `--sal/--sar` and a safe-area guide concept; War Room / command dock still clip on some cutouts. | Medium |
| Tap targets | Overlay `manipulation` + 44px floor exists; War Table chips and some settings rows still tight on 355px. | Medium |
| Haptics | `navigator.vibrate` is a no-op until a new APK. OTA cannot ship it. | Medium |
| Audio on Chromium | AAC playlist gone; `mus_ambient` ogg bed is the fallback. Fine if beds stay dual-codec. | Low |
| Version lie | Same `APP_VERSION` on 8901 and the phone does not mean the same bits. See `docs/FIVE_CHANNEL_UPDATE.md`. | High (process) |

---

## 3. Features vs incomplete

### Playable

Standard conquest (48 sites, sequential unlock), deploy plans, AI slots, infestation, hazards, research graph (`restree3d.js` takeover of `develop.js`), armory/store, dailies, ops/threat, profile/saves, intel/dossier, inbox/updater.

### Incomplete or disconnected

- **Custom is not a mode.** `mfQuickPlan==='custom'` is “player edited the plan.” `openPlanetarySetup` forces `activeWarMode='standard'`. See `docs/CUSTOM_VS_ARCADE_2026-08-15.md`. A Custom win today would still write `META.mapWins` if the gate were simply turned off.
- **Difficulty is four “threat” systems.** Easy/Hard, T1–T12, size cards labeled EASY THREAT, Front 1–48 (payout only). Size no longer floors the fight (`mfConquestDifficultyFloor` returns 0). See `docs/DIFFICULTY_REWARDS_2026-08-15.md`.
- **Campaign / MMO / Co-op** — locked cards, no playable loop.
- **Civic UV** — slat/atlas fix landed; CSM shadows still blocky; plaza cool tint remains.
- **WORLD_KIT** — seven packed meshes now decode; Citadel / Hab Stack / Foundry / Power Relay were never imported; `city_brutalist_grid` can fail its Standard Aelos stamp.
- **Codex icon sheets** — `icons-*.png` not in repo. Cards now fall back to the unit sheet; 3D thumbs still upgrade when the queue runs.

---

## 4. Match HUD

- Top: mass / energy / pop, mail, speed, pause, objective, hazard chip.
- Bottom: ARMY / IDLE / SELECT / STOP / BUILD / BASE + ORDERS / PLATOONS / ABILITIES / VIEW.
- Storage-full toast and comms banners compete with the objective row on a 412×915 phone.
- Strategic icons / tacticons exist; at tactical zoom they must not replace missing 3D (atlas unit 0 leak history).

---

## 5. Graphics debt (not this pass)

- CSM aliasing on civic pads.
- Authored beam ribbons can bloom hard in a volley.
- MEDIUM vs HIGH particle gap was closed; keep circular GPU points (no velocity ellipses).
- Post units 4/5/6; never steal unit 0.

---

## 6. Process debt

Five channels: source → `www`/8901 → HF OTA → native APK/IPA → HF Space. Checklist: `docs/FIVE_CHANNEL_UPDATE.md`. Pointer in `AGENTS.md`.

APK-only leftovers: vibrate, `boot.js`, GLES/cutout/FileProvider already in the Android shell if that APK was installed.

---

## 7. Recommended next implement (not done here)

1. Playable **Custom** War Room card, same 48 maps, gate off, **no** `mapWins` / first-clear.
2. Arcade T1–T5 from planet + size; Custom player-picked threat, ~0.65× payout.
3. Minimap phone pass.
4. Ship Codex `icons-*.png` when art exists.
5. Menu hub (section 8) as its own project.

---

## 8. Menu / research hub — research only

Concept shots (2026-08-15 images 3–5): gamified home with a 3D base diorama, resource header, Continue Campaign, mode cards, bottom tab bar; War Room as a base-node graph; research as a mobile minigame that shortcuts an MMO loop.

### What exists today

| Concept | Today |
|---|---|
| Home hub | `index.html` `#startScreen` over a live attract diorama (`src/main.js`) |
| Mode select | `#warScr` cards — Standard playable, others locked |
| Deploy | `#setupScr` + `galaxyui.js` War Table |
| Research | `#devScr` — `develop.js` data, `restree3d.js` 2D prerequisite graph |
| Ops / contracts / arsenal | Full-screen overlays, back-button stack — no bottom tab bar |
| MMO | Locked card copy only |

### Later phase (do not implement now)

- Hub chrome + shortcuts that **open the existing screens** (War Room, Development, Ops). No second progression system.
- Research-as-minigame and MMO preview stay out until Custom / MMO have a real loop.
- Do not rewrite `startScreen` in a VFX pass.

### 8.1 What the concept shots actually ask for

The 2026-08-15 images are a **home hub**, not a new game. Three layers:

1. **Chrome** — resource header, Continue Campaign, mode cards, bottom tabs. This is navigation. Every destination already exists (`#warScr`, `#devScr`, `#opsScr`, `#armory`, `#profileScr`).
2. **War Room as a base-node graph** — a spatial index over the same 48-site conquest, not a second map. `galaxyui.js` already owns galaxy → system → planet → region.
3. **Research as a mobile minigame** — a short session that **pays into the existing `RESEARCH[]` / `develop.js` graph**, not a parallel skill tree.

The failure mode to avoid: a hub that invents its own XP, a research toy that grants different bonuses than `applyResearch()`, or an MMO preview that writes `META.mapWins`.

### 8.2 Research minigame — options that reuse the live graph

Live match research (`src/game/sim.js` `RESEARCH[]`) is eleven nodes, paid in mass/energy while a Complex runs, with `req` edges (`bal1→bal2`, `plate1→plate2`, `hardpoint→defnet`). Account development (`src/develop.js`) is materials + a tree that unlocks **what you may build**, plus modules that wear out.

A menu minigame should be a **shortcut into one of those two graphs**, not a third.

| Option | Loop (phone, <90s) | Pays into | Why it fits | Why not yet |
|---|---|---|---|---|
| **A. Field sample** | Tap-trace a 2D vein / circuit on a still of the attract diorama. Accuracy + time → a **progress tick** on the next affordable `RESEARCH` node (or a material drip). | Match `RESEARCH[]` carry (`researchCarry`) or `META.mats` | Same language as crystal veins / salvage. One finger. | Needs a Complex (or a menu stand-in) so the tick has a legal sink. Without Custom/MMO, a menu tick that completes `bal2` skips the match economy. |
| **B. Module bench** | Drag a worn module onto a repair plate; hold to spend Alloy/Circuitry. Break risk if you release early. | `develop.js` wear / `matSpend` | Wear is already the point of Development. Makes the bench visible instead of a list row. | Repair-as-hold is a settings slider with extra chrome unless wear is felt in Standard (it is, but only after several matches). |
| **C. Doctrine hand** | Three cards from the next unlocked `develop.js` nodes. Pick one to **queue**, not grant. Queue spends on next match start. | `devHas` / next unlock | Forces a decision before War Room. No instant power. | Card UX fights the existing `#devScr` graph. Two UIs for one tree is how players lose track of `req`. |
| **D. MMO scout** | 30s flyover of a locked theatre with one salvage grab. | Nothing permanent; flavour + maybe 1 Alloy | Matches the concept-shot “preview the loop.” | Writes nothing. Harmless, also pointless until MMO has a loop. Do not let the grab call `matsFromMatch`. |

**Recommend A or B as the first prototype, never C+D together.** A is the one that looks like a minigame. B is the one that respects the economy that already exists.

Rules if A is built later:

- Grant **elapsed time** on an in-progress node (`bankResearchProgress`), or a small `matGrant`, never `applyResearch(id)` from the menu.
- Cap once per real-world day (dailies already exist — hook there, do not add a fourth streak).
- Fail / quit grants nothing. A skippable toy that always pays is a second store.
- Use the attract GL view as the board (`stopAttract` already shows `#gl`). Do not load a second WebGL context.

### 8.3 Mobile constraints

- One thumb, portrait 355–430 CSS px. No two-stick “play the RTS in the menu.”
- Session ≤ 90s or it blocks Continue Campaign — the actual door.
- Haptics: `buzz` / `rumbleHaptic` on success only. Menu shake would nudge the diorama (`rumbleInMatch` already refuses that).
- No new large media in the installer. Reuse `ITEM_ART`, unit sheet, attract scene.
- `#startScreen` stay the fallback. Hub chrome is a takeover that **calls** `showScr('devScr')` etc., same as `src/offline.js` wraps settings.

### 8.4 What maps to which file

| Hub beat | Owner today | Takeover later |
|---|---|---|
| Continue Campaign | `#startBtn` → War Room → last site | Same function, bigger button |
| Mode cards | `#warScr` / `meta.js` locked copy | Unchanged until Custom/MMO exist |
| Research graph | `develop.js` + `restree3d.js` | Minigame writes `researchCarry` / `matBag` only |
| Ops / contracts | `#opsScr` | Tab opens this screen |
| Arsenal | `#armory` | Tab opens this screen |
| 3D base | Attract in `main.js` | Keep; do not replace with a fake city |

### 8.5 Ship gate

Do **not** implement the hub or the minigame until:

1. Custom is a real War Room card (no `mapWins`) — section 7.1.
2. The match research Complex path is the one players still use (minigame is a drip, not a replacement).
3. MMO stays a locked card. A scout flyover (option D) may exist as flavour only.

This VFX pass does not rewrite `startScreen`.
