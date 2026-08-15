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
- Do not rewrite `startScreen` in the glow/icon/water pass.
