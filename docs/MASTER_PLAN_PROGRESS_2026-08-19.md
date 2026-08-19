# MASSFRONT — Master Plan Progress Report · 2026-08-19

**Live version: 1.33.44. Release freeze holds — 11 commits accumulated on
`cursor/strip-mass-node-bloom`, nothing published.** Every commit carries its
own measurements; `git log` is the bisect for the eventual single release.

---

## 1. Commits this cycle (all verified at commit time)

| Commit | What | Proof |
|---|---|---|
| `1783f80` | Antigravity's work verified + committed (next-unlock rail, site intel, terrain blend, per-species impostors) | live-match measurements, not diff reads |
| `9cb6b8f` | **Ten HIGH-severity bugs**: veterancy unreachable for 23/29 chassis; AoE splash used the aimed unit's armour vs structures (3.9× swing); commander reclaim dead on 3/4 heroes; reclaim binned wreck energy; Infestation OFF silently killed all weather; two-finger tap fired ground orders; pinch during box-select / artillery aim; PREVIEW channel = OTA kill switch; sha256/size effectively optional | each measured before/after in live matches |
| `8a51d21` | Patch manifests **merge** over the cached payload instead of replacing it | end-to-end through the real download path |
| `1885ed8` | Two patch-base holes an adversarial review found in the above (fresh-install cohort broke; `full` fallback poisoned devices for the *next* release) | six regression cases, refusals proven at `downloads=0` |
| `4912f0f` | All-or-nothing boot (a half-executed split payload can no longer be promoted to good); `full` entries require absolute urls | 4-state boot matrix + 5-case url validation |
| `bad33da` | Unit shatter sheet wired — `loadUnitSheet` had zero call sites; 1.62 MB shipped dead in every payload | shards 4/9/0 (grid2/grid3/control) |
| `f0159d0` | **OTA payload split: 79 per-file artifacts, 54.62 MB** (smaller than the 57.27 MB blob — a 4.5 MB duplicate shell removed) | 79/79 artifacts boot, 79/79 sibling script tags survive, 0 errors |
| `440f670` | Publisher emits per-file manifests + real deltas (`-PatchFrom`) | **sim.js hotfix: 358 KB vs 54.62 MB = 156× smaller**; 11-check publisher↔client contract, all pass |
| `c42811f` | **Slope gating** — terrain finally shapes movement | threshold measured (45°, cuts 0.6–1.6 % of land), 0 deposits stranded vs no-gate control, 0 road cells blocked, kill switch proven |
| `5e52673` | Auth worker: both username routes **dead since they shipped** (missing rate-limit bucket → 500 on every call). This was the "broken find-user" | real handler driven in Node: 401/200/200 |
| `da3e248` | **Seat ledger**: `B.allyAI` had 4 readers, 0 writers — allies never produced units, donated income, mis-billed population. Per-seat wallets in all four spend paths + credit routing; both refund theft primitives closed | allies spawn 19 vs 0 control; eRate 28/28/42; wallet isolation exact; SP byte-identical |

---

## 2. Original master plan — status by area

### Complete and verified
- **Bloom disc fix** (shipped live as 1.33.44) · repair-beam twin
- **UI stage**: shift-drag additive select · build zones while placing · locked
  unit cards · production ETA · route chevrons + rally flags · threat arrow
- **GPU vendor tiering** (`mfGpuTier`, tested on 11 renderer strings)
- **Population throttle** re-scaled to the real 4k cap
- **Update system overhaul (Stage 10 — your priority) — COMPLETE**: patch
  taxonomy (hotfix/content/overhaul) · per-file download feed · per-file
  payload · delta publishing · integrity required · all-or-nothing boot ·
  PREVIEW no longer a kill switch. *Only the live HF upload itself is
  unexercised — blocked by the freeze, flagged in the commit.*
- **AI retreat + focus fire** (4.2) · **projectile Z state** (9.1)
- **Terrain relief** (`reliefGain`, PASS bit-identical) · scatter noise ·
  tree/rock billboard LOD · per-species impostors · map diversification
- **Loading-screen intel** (site dossiers, next-unlock rail)
- **Veterancy attribution** — the rank system now actually works (was
  unreachable for 23 of 29 chassis)
- **Slope gating** (Tier D) with reachability proof
- **Sky life** (clouds + birds), detailTex anisotropy

### Cancelled by adversarial review — with cause, on evidence
- **Night light shafts**: `FX.cone`'s instance transform locks height to base
  radius — the primitive *cannot* express a shaft, only a squat 45° bowl; yaw
  is a no-op on a solid of revolution. Needs a new primitive; not this release.
  (Tombstone comment still to land.)
- **Rapier physics + Rank-2 crater mesher**: the shard producer it planned to
  feed is dead code (now fixed separately); instance attribute 10 is already
  bound to Material V2 state — the plan would have corrupted 60 mesh streams;
  wasm delivery was mis-specified. **Surviving fragment**: real Z ballistics
  for debris particle type 7 (pending).
- **Tier E headline grain fix**: modelled against the wrong sampler (cited the
  *water* texture factory as terrain filter state; terrain has 16× aniso).
  **Reduced subset survives**: hoisting `dFdx/dFdy` out of non-uniform control
  flow (pending).

### Remaining from the original plan
| Item | State |
|---|---|
| Tier C scatter clustering ("forest" as a concept) | not started — largest believability lever left |
| Tier E reduced subset (derivative hoisting) | speced with exact anchors, not applied |
| Particle type 7 ballistics | speced, not applied |
| Night-shafts tombstone comment | one-line commit, pending |
| Texture compression / TEXTURE_2D_ARRAY resolution overhaul | not started (agents lost to a usage limit last cycle) |
| Brood behaviours at threat tiers · hellish chassis (5.5/5.6) | not started |
| Radio VO five missing banks (5.10) | **blocked on recording assets, not code** — path is ready |
| Revenue model decision (6.2) | needs an owner decision; infra exists |
| Veterancy promotion moment + roster (3.8) | ranks now earnable; UI moment not built |
| Galactic scan/intel layer (5.4) | not started |
| Counter hints on cards (3.4) · unit hotbars (1.6) · non-consecutive stacking (1.5) | not started |

---

## 3. New scope (added 2026-08-18): co-op / lobby / social

A 16-agent adversarial review (20 confirmed fatals) set the direction; your
two decisions locked it: **CO-OP card is rewritten to the async shared front**,
and **social ships verification-first**.

**The central call: realtime shared-battlefield multiplayer is not reachable
this release** — no transport exists anywhere (client or worker), the backend
D1 is not provisioned, and until `da3e248` a second commander was not even an
economic entity.

| Stage | What | Status |
|---|---|---|
| 0 | Worker triage — dead username routes, fail-closed rate limiter, oracle closed | ✅ `5e52673` |
| 1 | Seat ledger — allyAI written, per-seat wallets, theft primitives closed | ✅ `da3e248` |
| 1B | Real seat income (extractors, not a drip) · drawEnergy call sites · commander powers per seat · A6 zero-count sweep | **in progress** |
| 2 | Seat integrity — resume binds the *ally's* commander as your hero (shipped bug); AI must not fly a human seat; XP by seat | next |
| 3 | Social: email verification → friends + blocking (messaging only in a later store-reviewed build; human-review gate on all UGC) | after 0; schema designed |
| 4 | Async shared front — paired accounts, one campaign front, shared territory, relief drops through the existing ledger tables | after 1B |
| 5 | Muster on the War Table — roster, join code, map nomination; closes the progression hole where one co-op win unlocks all 48 solo sites | after 4 |

**Hard human-review gates (do not ship on agent verification alone):** all
player-to-player surfaces (store build, never OTA — app-store UGC rating),
content filter + report path + ban flag before messaging, `age_ok` enforced
server-side, usernames treated as UGC.

---

## 4. Standing constraints and risks

- **Freeze**: one large release at the end; every commit self-verifies because
  `git log` is the only bisect.
- **Unverified by design** (flagged in commits): live HF upload path / commit
  pinning / resume; whether the production D1 exists at all (needs your
  dashboard); anything visual (device checks waived — conservative, reversible
  steps taken instead).
- **Verification discipline**: seven audit claims refuted; the "a zero is the
  test, not the code" rule has now been right **seven times** (latest: seat
  income measured against combat-drain noise instead of `eRate`).
- iOS version bump remains manual at publish time; publisher carries the Xet
  fix; `www/` must be re-packed after every `src/` edit before any browser
  verification.

---

## 5. DISTRIBUTION — the record, corrected

**MASSFRONT does not ship through GitHub.** A `github.com/CreatorJD1/massfront.git`
remote exists in the repo config and the first draft of this plan carried a
"push and open a PR" step; the owner struck that, and it is struck here so it
stops reading as pending intent. Nothing in this session pushed, fetched from
`origin`, or opened a PR — git has been used **locally only**, for commit
history and for moving work between agent worktrees.

The actual pipeline, which every delivery change this cycle was built against:

| Layer | Role |
|---|---|
| **Hugging Face** | Release host — `CREATORJD/massfront-releases`. `update.json`, the OTA payload, the APK, the source archive. `tools/publish-hf-release.ps1` is the only publish path, and the per-file/delta manifest work emits absolute `huggingface.co/datasets/.../resolve/main/v<version>/...` urls pinned to an immutable commit sha. |
| **Cloudflare** | Workers + D1 — `massfront-auth` (users/sessions/saves/attempts, plus the new verification/friends/blocks/reports tables), `massfront-economy`, `massfront-update`. |
| **Google Drive** | Design and asset source material (map layout / reference art). |

Consequences that matter for the remaining plan:
- "Publish" means the HF script, never a git push. The release freeze is a
  freeze on **that script**, not on committing.
- The unverified item is HF-side: the folder-upload path, commit pinning and
  resume behaviour have never been exercised, and `-DryRun` exits before the
  manifest is built.
- The social system's blocking item is Cloudflare-side: the production D1 is
  still unconfirmed to exist (`wrangler.toml` records that it does not), and a
  human with dashboard access must check before any social feature is scheduled.
