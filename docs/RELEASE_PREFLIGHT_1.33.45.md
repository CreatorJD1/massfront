# MASSFRONT 1.33.45 — first update pass, preflight

**Pipeline: Hugging Face (file host) · Cloudflare (Workers + D1) · Google Drive
(asset source). No GitHub.** "Publish" here means one thing:
`tools/publish-hf-release.ps1`. Nothing else ships anything.

Live now: **1.33.44**, a single 54.62 MB blob at
`CREATORJD/massfront-releases`. This release replaces that with **79 per-file
artifacts** under `v1.33.45/`.

---

## 0. THE ONE DECISION THAT CANNOT BE GOT WRONG

**This release MUST be published as a FULL release, never with `-PatchFrom`.**

Every device in the field runs 1.33.44, whose updater cannot read a patch
manifest: it would download the delta files and install them *as the entire
build*, leaving a payload of a handful of files. `boot.js` quarantines after two
failed starts and rolls back, so a device recovers — but it is a visibly broken
update for every player who takes it.

Deltas become available for the release **after** this one, because the client
that understands them ships *in* this one. That ordering is structural, not a
preference.

    tools/publish-hf-release.ps1 -Version 1.33.45 -Notes "..."      # correct
    tools/publish-hf-release.ps1 -Version 1.33.45 -PatchFrom 1.33.44  # DO NOT

---

## 1. Blocking prerequisites

| # | Item | State |
|---|---|---|
| P1 | **iOS version bump is MANUAL** — the publisher does not touch it. `ios/App/App.xcodeproj/project.pbxproj` holds `MARKETING_VERSION = 1.33.44` and `CURRENT_PROJECT_VERSION = 13344` in **two** build configs each (4 edits) | ☐ not done |
| P2 | `hf` CLI on PATH and authenticated to `CREATORJD/massfront-releases` — it is not on PATH in the current shell | ☐ verify |
| P3 | Android SDK build-tools present (the APK step resolves `.toolchains/android-sdk/build-tools/*`) | ☐ verify |
| P4 | Working tree clean of unrelated changes — they get archived into the source zip | ☐ check |
| P5 | Disk headroom for `releases/`: 79 artifacts (~55 MB) + APK + ~960 MB source archive | ☐ check |

The publisher bumps these five automatically: `boot.js`, `src/updater.js`,
`package.json`, `index.html`, `assets/app.webmanifest`. It **fails** the release
if any of them does not end up containing the new version, which is the guard
that stopped a partial bump shipping before.

---

## 2. What is in this release

Twenty commits. The ones a player will notice:

**Fixed and measured**
- Ten HIGH-severity gameplay bugs — veterancy was unreachable for **23 of 29**
  armed chassis; Infestation OFF silently disabled *all* weather; AoE splash hit
  structures with the aimed unit's armour multiplier (3.9× swing); two
  wallet-theft primitives (cancel-refund, recycle-refund).
- **AI allies actually fight.** `B.allyAI` had four readers and zero writers, so
  an ally never produced a single unit after its opening squad, donated its
  reactor income to the player, and mis-billed the player's population cap.
- Ally seats now earn from real structures (6.52 mass/s with an Extractor →
  0.60 when it dies) and their Extractors finally deplete deposits.
- A resume could bind your HUD, abilities, XP and the victory check to the
  **ally's** commander.
- Slope gating — terrain shapes movement for the first time.
- Unit shatter restored (1.62 MB of payload had been shipping dead).
- Touch: two-finger tap issuing ground orders; pinch during box-select; pinch
  firing an artillery barrage.

**Delivery**
- Per-file OTA payload; a future hotfix is **358 KB instead of 54.6 MB (156×)**.
- Integrity is now mandatory (`sha256` + `size`), PREVIEW is no longer a one-tap
  OTA kill switch, and a half-executed payload can no longer be promoted to good.

**Server (Cloudflare, not shipped to devices in this pass)**
- Both `/username` routes had returned **500 on every call since they shipped** —
  the CLAIM button never once worked.
- Friends / blocking / reports / e-mail verification, 146/146 checks green.
  Deliberately **inert** until a mail provider is wired.

---

## 3. Sequence

1. `git status --porcelain --untracked-files=no` → expect empty.
2. Bump iOS by hand (4 edits, P1 above).
3. Dry run: `-Version 1.33.45 -Notes "..." -DryRun` → must print
   `Preparing MASSFRONT v1.33.45 (Android code 13345), replacing v1.33.44.`
   *(verified working after the publisher rewrite)*
4. Real run **without** `-PatchFrom`.
5. **Verify from the dataset, not the exit code** — v1.33.41 shipped with no
   source archive and nobody noticed:
   - live `update.json` reports `1.33.45`
   - `files.length === 79`, every entry has `size` + `sha256`
   - every `url` is absolute and pinned to `/resolve/<40 hex>/`, not `/main/`
   - all four artifacts present: OTA folder, APK, source archive, historical manifest
6. Install over a real 1.33.44 device and confirm it reaches a frame.

---

## 4. Unverified — watch these first if anything misbehaves

Ranked by how likely they are to bite, and all flagged in their commits:

1. **The HF upload path itself.** The folder upload, per-entry commit pinning
   and `-Resume` have **never been exercised** — `-DryRun` exits before the
   manifest is built, so it cannot cover them. This is the single largest
   unknown in the release.
2. **79 requests instead of 1**, on mobile connections. Total bytes went *down*
   (54.62 vs 57.27 MB), but request count went up two orders of magnitude.
   Partial-failure behaviour mid-download is untested against real network loss.
3. **Anything visual.** Device checks were waived; slope gating, clustering,
   debris arcs and the Tier-E shader change have never been seen on a phone.
4. **Production D1 is unconfirmed.** `wrangler.toml` records that the database
   "does NOT exist yet". Nothing in this pass depends on it — the social routes
   ship dormant — but no social feature can be scheduled until a human with
   dashboard access confirms it.

---

## 5. Explicitly NOT in this pass

- Realtime co-op/versus — no transport exists; not reachable this release.
- Player-to-player messaging — gated behind e-mail verification, a content
  filter, a report path and a **store build** (never OTA: introducing an
  unreviewed UGC surface to devices whose listing carries no UGC rating is the
  one item that risks removal rather than rejection).
- Texture/resolution overhaul, brood tier behaviours, VO banks (blocked on
  recordings, not code), revenue model (owner decision).
