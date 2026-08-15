# Difficulty and rewards — research, 2026-08-15

Research only. No `src/` edits, no HF, no map splits. Sibling owns custom-vs-arcade **unlock** research; this note owns threat / difficulty / payout / first-clear / XP / cores.

**Bottom line.** Difficulty is four named systems plus a drawer of unpriced knobs. Rewards almost all go through one function (`metaGrant`) that does **not** know Custom from Standard. Any Standard-mode win on an unwon open site pays first-clear, including Easy + infestation off + rich veins. Victory Continue does not double-pay; it does carry the same farm settings onto the next site.

---

## 1. How difficulty is decided today

Too many knobs, and three of them are all labeled “threat.”

### 1.1 The four named systems

| Name | Where | What it actually does | Player-facing? |
|---|---|---|---|
| Easy / Normal / Hard | `main.js` `difficulty` 0–2 | AI income / HP / damage / build / wave cadence / opening grace; infestation quantity and hive-tier clock; XP `+40` per step; cores Challenge `0/14/30` | Yes — deploy buttons |
| Threat T1–T12 | `endgame.js` `META.threat` / `META.threatSel` | Extra AI econ / HP / dmg / tech; `payoutMult` | Yes — Advanced drawer + ops brief. **Not T1–T5.** |
| Conquest front 1–48 | `galaxyui.js` `mfConquestLocate` | First-clear XP/cores only. **Does not change the fight.** | Yes — map card `FRONT n / 48` |
| Size Compact / Standard / Large | `MAPDEFS.size` → `BATTLEFIELD_PRESETS` | Playable span, spawn spread, node/geyser count, infestation cap. **Does not set Easy/Hard or Threat T.** | Yes — but cards **label** it `EASY/NORMAL/HARD THREAT` |

`mfConquestDifficultyFloor()` used to lock Easy off medium/large sites. It now **always returns 0**. The toast and `.mapFloor` CSS are still wired. Size-as-difficulty is display copy only.

### 1.2 Threat ladder (the T1–T5 question)

`THREAT_MAX` is **12**, not 5.

| T | Name | Enemy econ | HP | Tech | Payout × |
|---|---|---|---|---|---|
| 1 | SKIRMISH | +0% | +0% | +0% | 1.00 |
| 2 | PROBE | +16% | +7% | +13% | 1.22 |
| 3 | RAID | +32% | +14% | +26% | 1.44 |
| 4 | OFFENSIVE | +48% | +21% | +39% | 1.66 |
| 5 | THEATRE | +64% | +28% | +52% | 1.88 |
| 6 | WAR | +80% | +35% | +65% | 2.10 |
| 7–12 | ATTRITION … ABSOLUTE | +96% … +176% | +42% … +77% | +78% … +143% | 2.42 … 4.02 |

T5 used to be named CAMPAIGN (renamed so it did not read as the locked War Room mode). Unlock rule: win **at** the current max rung; farming a lower T does not climb. Applied **on top of** Easy/Normal/Hard (`ai.js` `aiThreat()` × `threatEcon/Hp/Dmg/Tech()`).

Weekly rolls authored T **3–7**, then clamps to whatever the career has unlocked.

A **third** “tier I–V” lives on the hive clock (`sim.js` `infTier()`). That is match-time wildlife, not the career ladder. HUD copy (“Hive threat tier”) collides with Threat T and with the map-card “EASY THREAT” label.

### 1.3 Deploy knobs that change the fight but not the contract

These sit in Advanced / quick plans. None of them gate first-clear. None of them enter `payoutMult` except Threat and operation modifiers.

| Knob | Combat effect | Reward effect |
|---|---|---|
| AI faction | Brood = full hive war; others = wildlife | Daily vs-faction orders only |
| Infestation on/off | Nests, spread, tides | None (except nest daily) |
| Resource pace | Player + AI income × 0.7 / 1 / 1.6 | None |
| Time limit | Short (≤5 min) auto-sets rich pace + dense crates | Field-time / completion lines only |
| Defense focus | +structure combat, waves 18% sooner | None |
| Landing package | Prepared vs expedition opening | None |
| Goal | Win condition | Win/lose scale only |
| AI ally | Extra friendly lane (Standard/Large only) | None |
| God Mode | Invuln + infinite eco | **Still full payout** |

Quick plans (`galaxyui.js`):

- **First Command** — Easy (floor 0), 10 min, rich, infestation **off**, prepared
- **Classic War** — Normal, 15 min, infestation on
- **Fortress** — Hard, 25 min, infestation on, turtle AI
- **Custom** — anything else. Detection is `mfQuickDetectedPlan()`. It is a **highlight**, not a reward lane.

### 1.4 What is hidden

- Threat T lives in Advanced (`threatRow`), not on the three arcade tiles. The deploy hero reads `#opsBriefThreat` (T1–T12) and falls back to `T+(difficulty+1)` — so Easy can show as “T1” for two different reasons.
- Map cards say `EASY/NORMAL/HARD THREAT` from site index (`CQ.mi`), not from `difficulty` or `threatSel`.
- Region hero says `COMPACT · EASY` as the **next** site, which is conquest order, not the live AI setting.
- Standard (`_medium`) sites are **always open** once the region is open (`mfConquestMapOpen`). Compact can be skipped. Large still waits on the previous win.
- Weekly **loans** `META.threatSel` + `META.opmods`, then `endgameRecord` restores them. The match itself still runs as `activeWarMode === 'standard'`.
- `activeWarMode` is the only mode the reward contract understands. Playable drops are Standard. Training sets `'training'` (not in the contract table → falls back to Standard if `endGame` ever fires). Campaign start is stubbed.

### 1.5 Verdict

Yes: too many knobs, and the ones that look like difficulty (size, front number, “EASY THREAT”) are not the ones that scale the AI. The ones that scale the AI (Easy/Hard + Threat T + mods + infestation + pace + Brood) are mostly unpriced except Threat and mods.

---

## 2. How rewards are granted today

### 2.1 One payout function

`endGame` → `metaGrant(win)` (skipped only for `demoMode`). Then `developRecord` (materials) and `endgameRecord` (score, Threat unlock, mastery, weekly best, weekly restore).

`metaGrant` (`src/game/meta.js`):

```
XP  = round( (40 + kills×0.35 + (win?120:30) + difficulty×40)
             × payoutMult × xpBooster × rewardScale
             + firstClear.xp )
      × modeContract.xp

cores = round( ledger.base × payoutMult × coreBooster × rewardScale )
        + firstClear.cores          // NOT multiplied by threat or mode
```

`rewardScale` = 1 on win, 0.35 on a committed loss (≥180 s), 0 on a quick quit (ledger still shows a token 6-core “completion” path for the empty-panel case; uncommitted XP/cores stay 0).

`payoutMult` = `threatReward()` × (chosen op-mod sum, or `1 + 0.35 × random wildcard count`).

Mode contracts (`MODE_REWARD_CONTRACTS`):

| Mode | XP | Exclusive item | Live? |
|---|---|---|---|
| standard | ×1.10 | Skirmish Requisition | Yes |
| campaign | ×1.25 | Campaign Intel | Stub |
| mmo | ×1.50 | Warfront Beacon | Stub |
| coop | ×1.00 | none | Stub |
| training | **missing** | — | Falls back to **standard** if `metaGrant` runs |

`matchRewardMode()` = campaign if `storyCampaignActiveId`, else `activeWarMode` if it has a contract, else **standard**.

### 2.2 First-clear (`mfConquestReward`)

Paid when **all** of:

1. `mfConquestGateActive()` — `activeWarMode` is `'standard'` or undefined
2. No live story campaign id
3. Map is a homeworld site, **open**, and `META.mapWins[map]` is 0

Formula: `cores = 20 + tier×3`, `xp = 45 + tier×5`. Region wipe +45 / +90. Planet wipe +160 / +320.

| Site | Front | First-clear cores | First-clear XP (before ×1.10) |
|---|---|---|---|
| Aelos first Compact | 1 | 23 | 50 |
| Aelos first Standard | 2 | 26 | 55 |
| Aelos first Large | 3 | 29 + 45 region | 60 + 90 |
| Last Vespera Large | 48 | 164 + 45 + 160 | 285 + 90 + 320 |

Preview on the map card multiplies XP by the Standard contract (×1.10) and shows raw cores — same as the grant.

`mapWins` is the only first-clear bit. Difficulty, Threat T, size, infestation, and quick-plan are **not** stored.

Weekly can first-clear an **open unwon** site (same gate). A later locked homeworld loan does **not** first-clear and does **not** write `mapWins` (that skip is already in `metaGrant`).

### 2.3 Other payouts (same match)

- **Cores ledger:** Completion, field time (cap 24), combat √kills (cap 36), fortification (cap 24), research (cap 18), objective 50, challenge 0/14/30, daily first-win 25.
- **Research Data:** `researchDataFromMatch` — mission + studies + labs + challenge; × Threat; cap 24. Called from inside `metaGrant`.
- **Materials:** `developRecord` / `matsFromMatch` — scaled by Threat T, not by Easy/Hard.
- **Loot:** gear + consumable; rarity table uses Easy/Normal/Hard. Hard win can drop 2 consumables.
- **Mode item:** one exclusive consumable on any Standard **win**.
- **Daily orders:** auto-claimed from `metaGrant`; Hard-win / wildcard / map / goal / faction stats. Custom Easy still completes “win 1 match.”
- **Threat unlock + mastery:** `endgameRecord` on win. Mastery stores highest T beaten per map×enemy.
- **Score:** `matchScore` = base × speed × `payoutMult` × `(1 + difficulty×0.25)`. Losses score at 25%.
- **Training:** `finishTrainingMission` does **not** call `endGame`. +150 cores, version-gated. Replay pays 0. If the commander dies, `checkVictory` **will** call `endGame` → `metaGrant` as Standard (vanguard is not a conquest site, so no first-clear; still XP/cores/item-on-win).
- **Cloud:** `economy-net.js` wraps `metaGrant` and queues the same core total as `match_reward`.

### 2.4 Duplication

- `threatReward()` and `weeklyRewardForecast()` both inline `1+(t-1)*0.22+max(0,t-6)*0.10`.
- `OPMODS` (endgame) and `WILDCARDS` (meta) are two tables; `pickWildcards` bridges by id. The five that used to pay for nothing now have `WILDCARDS` rows.
- `wcRewardMult()` is a wrapper around `payoutMult()`.
- Map-card first-clear preview re-implements the XP × contract multiply that `metaGrant` already does.
- Easy/Normal/Hard, Threat T, size-as-“THREAT”, hive tier I–V, and Front 1–48 are five different numbers all sold as difficulty.

### 2.5 Custom vs Standard — the farm

There is **no Custom war mode**. Custom is `mfQuickPlan === 'custom'` when deploy settings do not match First / Classic / Fortress. `activeWarMode` stays `'standard'`.

Therefore a Custom drop gets:

- Standard ×1.10 XP
- Standard exclusive item
- Full `payoutMult` (usually ×1.00 at T1, no mods)
- **Full first-clear** if the site is unwon
- `mapWins` + region/planet unlock
- Threat-ladder progress if sitting on the max rung
- Daily / loot / Data / mats

Cheapest first-clear today: First Command or a Custom Easy, infestation off, rich pace, T1, no mods, Standard (`_medium`) site (always open in an open region). Continue then launches the next unwon site with those same globals.

God Mode does not strip the contract.

Weekly is also Standard for `matchRewardMode`. It can first-clear an open unwon roll.

Sandbox / attract: `demoMode` skips `metaGrant`.

---

## 3. Victory Continue and departure

Shipped in `src/departure.js` (takeover of `endGame`, `returnToMainMenu`, `frame`).

- `endGame` still grants **once**, immediately, before the results card.
- Continue is shown only on a Standard conquest win with another open unwon site. Hidden for weekly, training, story, demo, and theatre-complete.
- `continueToNextMap` (`main.js`): comment is correct — “Rewards already landed.” It picks `mfConquestNextMap()` (prefers a Standard-size open site), `syncBattlefieldFromMap`, `newSkirmish`. **Does not reset** Easy/Hard, Threat T, infestation, pace, or mods. Farm settings ride forward.
- Theatre complete: Continue hides. Return to Menu sets `mfDepart.fromVictory` and plays the carrier lift. **No extra XP/cores.** A notice is appended on the results card.
- Departure does not re-enter `metaGrant`.

Safe to keep Continue as a navigation button. It is not a second payout. The leak is the **lane** of the match that just paid, not the button.

---

## 4. Streamlined proposal

Do not split maps. Do not invent a second 48-site list. Add a **reward lane** the sibling unlock work can set, and make Standard arcade derive difficulty from the site the player already picked.

### 4.1 Two live lanes (plus Weekly / Training, unchanged in shape)

**Arcade (Standard conquest).** The site is the difficulty.

```
planetIndex 0..3  (Aelos … Vespera)
sizeIndex   0..2  (compact / standard / large)

threatSel = clamp(1 + planetIndex + sizeIndex, 1, 5)
difficulty = sizeIndex          // Compact Easy, Standard Normal, Large Hard
```

|  | Compact | Standard | Large |
|---|---|---|---|
| Aelos | T1 Easy | T2 Normal | T3 Hard |
| Pyraeth | T2 Easy | T3 Normal | T4 Hard |
| Nordhall | T3 Easy | T4 Normal | T5 Hard |
| Vespera | T4 Easy | T5 Normal | T5 Hard |

That is the T1–T5 the UI should mean. T6–T12 stay **Custom-only** (and Weekly if the roll asks). Arcade writes `META.threatSel` for the match so `payoutMult` and AI stay honest, then restores the player’s Custom pick the same way Weekly already restores.

Arcade also locks the fight to Classic-equivalent rules: infestation on (First Command exception for the first three `standardMatches` only), Normal pace, Annihilation, no random wildcards. Commander / faction / landing package can stay player-picked — they do not pay.

**Custom.** Player picks Threat T (unlocked ladder, still T1–T12 or a later trim to T1–T5 + “endgame” T6–T12), Easy/Normal/Hard, infestation, pace, mods. **No first-clear. No `mapWins`. No mode exclusive item.** XP/cores at **0.65×** the current formula (Threat and mods still multiply, so a T7 Custom Hard is a score/mastery fight, not a conquest stamp). Mastery may still record.

**Weekly.** Keep the authored loan. **Never first-clear.** Score + normal (or a small weekly bonus) only. Restore the plan as today.

**Training.** Keep the isolated +150 cores. `endGame` / `metaGrant` must no-op while `trainingMissionActive()`.

### 4.2 What first-clear means after this

First-clear is an **Arcade stamp** on `mapWins`, priced by Front 1–48 as today. Custom can replay any unlocked site for the reduced contract. That is the anti-farm rule: the cheap fight cannot mint the stamp.

Optional later: Arcade first-clear requires the derived T (already forced) so there is nothing to under-level.

### 4.3 What to stop showing as “threat”

- Map cards: `COMPACT · 2.2 KM` / `STANDARD · 2.6 KM` / `LARGE · 3.2 KM` + `ARCADE T n` from the table above. Drop `EASY THREAT` on the size row.
- Region bar: next site by size name, not `COMPACT · EASY`.
- Hive HUD: “HIVE TIER I–V”, never “threat.”
- Deploy hero: one line — `ARCADE T3 · HARD` or `CUSTOM T7 · EASY` — from the lane flag, not from `#opsBriefThreat` fallback.

### 4.4 Collapse or keep T6–T12

Recommendation: **keep T6–T12 for Custom + Weekly + mastery**, hide them on Arcade. Collapsing the whole ladder to five rungs now would break existing `META.threat` / mastery values and Weekly rolls (T3–T7). A later pass can remap saves (`T' = min(5, T)` for unlock display only).

### 4.5 Continue / departure

- Continue stays Arcade-only (already gated on conquest-next). After this change it should **re-apply the next site’s derived T/diff** so a Custom farm cannot Continue into a stamp.
- Departure stays cosmetic.

### 4.6 Interface for the sibling unlock pass

This pass needs one boolean (or enum) written at launch and read at `metaGrant`:

```
matchRewardLane() → 'arcade' | 'custom' | 'weekly' | 'training' | 'demo'
```

Sibling owns how Arcade sites unlock and whether Custom may pick locked later worlds. This pass only **prices** the lane. Do not fork `mfConquestMapOpen` here.

---

## 5. File touch-list (implement later)

Do not implement in this pass. Do not change mapping.

| File | Why |
|---|---|
| `src/game/meta.js` | `matchRewardLane`, `modeRewardContract` / `matchRewardMode` (training must not fall back to Standard), `metaGrant` first-clear + item + 0.65× Custom, `mapWins` only on Arcade |
| `src/galaxyui.js` | `mfConquestReward` gate on lane; derived T/diff helper; card copy; `mfQuickApplyPlan` writes lane; stop calling size “THREAT” |
| `src/endgame.js` | Single `threatReward(t)` used by weekly forecast; Arcade restore of `threatSel` (Weekly already has the loan pattern); `endgameRecord` Threat-unlock only if the rung was actually fought |
| `src/main.js` | `endGame` skip grant on training; `continueToNextMap` re-derive Arcade T/diff; floor toast either dies or comes back as the Arcade lock |
| `src/departure.js` | Continue already correct; maybe hide Continue when lane ≠ arcade |
| `src/tutorial.js` | Belt-and-braces: `endGame` no-op already handled in `main.js`; keep 150-core first-clear |
| `src/develop.js` | Optional: Custom 0.65× on Data/mats so the farm cannot move to salvage |
| `src/daily.js` | Decide whether Custom wins count as “win 1 match” (yes) vs “win on Hard” (only if they picked Hard) |
| `src/economy-net.js` | No formula change; still wraps `metaGrant` |
| `index.html` | Ops brief / threat row labels if Arcade hides T6–T12 |
| `src/game/ai.js` | No structural change if Arcade writes `difficulty` + `META.threatSel` before `aiSetup` |
| `src/game/sim.js` | No change; hive I–V stays a clock. Copy only. |

Out of scope (sibling or later): Custom unlocking later worlds, Campaign/MMO contracts, God Mode payout strip, T12→T5 save remap, map catalogue.

---

## 6. Worked numbers (today vs proposed)

Typical first Standard site (Front 2), Normal, T1, no mods, win, 8 min, 200 kills, no booster:

| | Today (also Custom Easy farm) | Proposed Arcade | Proposed Custom Easy T1 |
|---|---|---|---|
| Fight | Player-chosen | Forced T2 Normal, infestation on | Player-chosen Easy T1 |
| XP (no first-clear) | ~297 | ~362 (T2 ×1.22 on the same base) | ~253 × 0.65 ≈ 164 |
| First-clear XP | 55 (50×1.10) | 55 | **0** |
| Cores ledger | ~163 (Normal challenge 14) | ~199 (×1.22) | ~97 (Easy challenge 0, then ×0.65) |
| First-clear cores | 26 | 26 | **0** |
| Mode item | Yes | Yes | No |
| Unlocks next site | Yes | Yes | No |

The farm today is “Easy Custom, take the 26 cores + stamp.” After: Custom keeps a small payout; only Arcade mints the stamp.

---

## 7. What this note does not do

- No `src/` edits.
- No HF publish.
- No map splits, no new sites, no catalogue reorder.
- No Campaign/MMO/Co-op implementation.
- No decision on how Custom unlocks later theatres (sibling).
