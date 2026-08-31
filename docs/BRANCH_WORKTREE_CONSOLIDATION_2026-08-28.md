# MASSFRONT branch and worktree consolidation · 2026-08-28

## Current consolidation status — supersedes the audit-time action list

This section is the current authority ledger. It supersedes every later
audit-time statement that Claude is still writing, a listed deletion is still
pending, the detached baseline still exists, or no branch/worktree deletion
has occurred. The original inventory remains below as historical evidence of
why each decision was made.

For this ledger, **SHARES `cursor/strip-mass-node-bloom`** means the ref or
worktree is the live authority branch at the exact committed authority tip.
Being an ancestor of that tip does not count: an older branch can share Git
history while still failing to share the current source and dirty integration
state. By that operational definition, only one branch and one worktree share
authority.

### Every remaining local branch

| Authority marker | Branch and tip | Attachment | Current disposition |
|---|---|---|---|
| **SHARES `cursor/strip-mass-node-bloom`** | `cursor/strip-mass-node-bloom` · `c4090cc` | Main Source Local checkout | **ONLY CURRENT SOURCE.** All integration and acceptance happen here. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `main` · `fc0b5d1` | No worktree | Old baseline, 62 commits behind with no unique payload. Preserve until the accepted authority can advance it; never merge it back into authority. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `claude/dazzling-cerf-31fcdf` · `55adb9f` | Clean linked worktree | Review only the reusable ORM/resize/verifier mechanisms. Do not treat its superseded atlas binaries as current source. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `worktree-wf_66829925-1f4-1` · `fc0b5d1` | Dirty linked worktree | Commander Clearance UI semantic-port candidate. Never copy its stale whole files. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `worktree-wf_66829925-1f4-2` · `3ff2a18` | No worktree | AI counter-composition/test semantic-port candidate; adapt and test against authority. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `worktree-wf_66829925-1f4-3` · `fc0b5d1` | Dirty linked worktree | Counter-hint UI semantic-port candidate; current boot/manifest files remain authoritative. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `worktree-wf_66829925-1f4-5` · `fc0b5d1` | Dirty linked worktree | Historical `MAP_DESIGN_TARGETS` evidence only; rerun against current source before retaining any conclusion. |

Local Git metadata reinforces the table: `massfront.authorityBranch` is
`cursor/strip-mass-node-bloom`, whose description identifies it as the sole
Main Source integration target. Every other local branch description begins
with `DOES NOT SHARE authority tip`, categorized as legacy pointer (`main`),
tool/asset ORM (`claude/dazzling-cerf-31fcdf`), UI (`668…-1` and `668…-3`),
AI/tooling (`668…-2`), or documentation evidence (`668…-5`). These labels are
safety metadata, not proof that a candidate payload has been reviewed.

### Every remaining registered worktree

| Authority marker | Worktree | Branch and tip | State and rule |
|---|---|---|---|
| **SHARES `cursor/strip-mass-node-bloom`** | `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple` (also reached through `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`) | `cursor/strip-mass-node-bloom` · `c4090cc` | Dirty authority integration checkout; preserve unrelated owner work. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `.claude/worktrees/dazzling-cerf-31fcdf` | `claude/dazzling-cerf-31fcdf` · `55adb9f` | Clean review source; not a destination for new MASSFRONT work. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `.claude/worktrees/wf_66829925-1f4-1` | `worktree-wf_66829925-1f4-1` · `fc0b5d1` | Dirty: `src/ui/hud.js` and `src/styles/ui.css`; semantic port only. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `.claude/worktrees/wf_66829925-1f4-3` | `worktree-wf_66829925-1f4-3` · `fc0b5d1` | Dirty: stale boot/manifest registrations plus untracked `src/ui/counterhint.js`; semantic port only. |
| **DOES NOT SHARE `cursor/strip-mass-node-bloom`** | `.claude/worktrees/wf_66829925-1f4-5` | `worktree-wf_66829925-1f4-5` · `fc0b5d1` | Dirty only through untracked historical evidence; not current design authority. |

### Completed consolidation and Stage 8 kickoff

- Fourteen obsolete branch refs are gone. The first safe deletion pass removed
  `worktree-wf_66829925-1f4-4`, all six `worktree-wf_c731c446-089-*` refs, and
  all five `worktree-wf_f1bba01f-988-*` refs. Their exact tips remain in the
  historical table below and are recoverable through reflog only until Git
  garbage collection.
- The redundant dirty `worktree-wf_fb8d84cd-09c-3` worktree/ref was removed
  after its mesh diff produced the same stable patch ID as authority commit
  `a9256c7`; transplanting its older whole file would have removed later
  quality work.
- The `d2aa8eb` performance-settings payload was semantically ported into the
  current `src/game/meta.js`, preserving newer authority work, and its
  `worktree-wf_66829925-1f4-6` ref was then removed. The resulting behavior
  preserves an explicit low performance floor, avoids a second LOW-quality
  effects penalty, and reports the ignored live DPR honestly. The dynamic
  Stage 8 contract passed five scenarios plus source ordering, and
  `node tools/bundle.mjs` passed with 95 sources and a 26.08 MiB archive.
- The reusable ORM path from `claude/dazzling-cerf-31fcdf` was semantically
  ported rather than cherry-picked. Registry coverage passes for all 112
  material IDs. Real AMD/D3D11 verification passes compressed KTX2, PNG
  fallback, Android-size GPU blit, and procedural-raw paths. A source-stable
  Vespera capture also verifies distinct ordinary, gloss, metalness, and
  emissive views without full-screen atlas corruption; evidence is under
  `.tmp/stage8-material-orm-views-20260828/`.
- The missing `C:\Users\Jason\AppData\Local\Temp\mf-clean` registration was
  pruned. The detached `massfront-baseline-c4090cc` checkout was removed after
  recording its older verifier (47,547 bytes, SHA-256
  `6345AFE7054FCBF0A63CCD1CA63DC6C781131297E96DD7888C96D3D3FC6A4DFB`);
  authority already had the newer 49,356-byte verifier (SHA-256
  `CA2B4244629506A4104B0671246C79BF771AC807480D75DE2A83A6569DE05E76`).
- No remaining review branch/worktree was deleted. `main` remains intentionally
  preserved until authority acceptance; the three dirty UI/evidence worktrees
  remain protected pending semantic review.

### Claude hard-surface acceptance boundary

Claude's direct authority run is complete and paused. Its final Blender 5.2
suite **FAILED 100 of 652 checks**, so the generated hard-surface result is
**REJECTED `SOURCE_CANDIDATE`**, not accepted game content. The failures are 85
footprint, eight shell-count, two factory-startup, two UV, two smooth-shading,
and one sharp-edge check.

The primary defect is identified: the consolidator grouped unparented tiling-
proof LOD0 copies into production modules because it filters names but ignores
`mf_proof_only` / `mf_evidence_only`. This poisoned 90 LOD0 module groups and
explains 70 kilometre-scale footprint failures. The remaining 15 smaller
footprint discrepancies and the road-junction hygiene failures still require
individual resolution. Claude's later bounds-recentering and blanket
`shell_cap=0` edits do not repair the contaminated geometry and must not be
accepted as a pass.

None of the generated world-kit GLBs is registered in `boot.js`, either
manifest, or the live runtime, which still uses `assets/data/worldkit.js`.
Therefore the rejected candidate has no Stage 7/8 runtime impact. A safe future
repair requires validated pristine inputs, exclusion of proof/evidence objects,
root-relative consolidation/export, meaningful per-archetype shell contracts,
and a complete Blender rerun before any integration review.

Generated Blender saves, GLB exports, review exports, and evidence images are
ignored while generators, reports, provenance, and README files remain
reviewable. This keeps about 1,455 generated entries / 984,486,777 bytes out of
blanket staging without deleting any authored asset. Computer Use stopped the
Claude response after the final failed suite; no Blender, Python, or shell
writer remained active at the verification freeze.

### Agent/tool containment findings

- **Antigravity:** authority commit `1783f80` was already integrated. Seven
  capture scripts no longer write into `.gemini/antigravity/brain`; their
  file-relative output root is repository
  `.tmp/agent-captures/antigravity/`, required directories are created, and all
  seven scripts pass `node --check`. Old Antigravity audits remain stale
  evidence. Computer Use changed Antigravity's Security Preset from Full
  Machine to Default. The persisted policy now has command auto-execution off
  and asks before non-workspace file access. The global `read_file(*)` and
  `command(*)` grants are gone; the config parses with 220 remaining scoped
  grants and neither wildcard present. Terminal sandboxing itself remains off,
  so the Default request-review policy is the controlling safety boundary. The
  two existing Antigravity MASSFRONT project records, `massfront` and
  `amazing-lavoisier`, were corrected in place: both now use
  `file:///c%3A/Users/Jason/Documents/Codex/MASSFRONT-main-source` and default
  branch `cursor/strip-mass-node-bloom`. Both JSON records parse, their
  conversations were preserved, and no project was deleted or recreated.
- **OpenCode:** no reviewable OpenCode branch/ref exists. Its V2 material work
  remains an opt-in lab. The local OpenCode snapshot object store measured
  about 690.15 MiB and `opencode.db` about 1,348.39 MiB; OpenCode 1.18.14
  supports repository configuration with `"snapshot": false`, now set in
  repository `opencode.jsonc` to prevent new per-edit Git snapshots here. The
  existing snapshot/database state was not deleted while OpenCode may be
  running or before its provenance is reviewed.
- **Cursor:** all explicitly attributed Cursor commits are ancestors already
  integrated into authority. `origin/cursor/strip-mass-node-bloom` remains 61
  commits behind and `origin/main` represents obsolete topology; neither is a
  merge source. The 30-file, approximately 50.26 MiB `.cursor/dlds` embedded
  repository is ignored so blanket staging cannot turn it into a gitlink.
- **Main Source:** `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source` is
  the permanent user-facing Local entry and remains a junction to this single
  physical authority checkout. It is not another branch or copy. Antigravity's
  two existing projects already point to this alias and authority branch, so no
  Antigravity reopen, recreation, or conversation loss is required. The Codex
  desktop saved-project record is a separate migration concern; do not edit its
  live state database or create another dated source tree.

## Authority

`cursor/strip-mass-node-bloom` is the only current-quality authority. Its
committed HEAD during this audit was
`c4090cc5785e6c30b342f58beca52d34585e9bfc`. Claude's subsequent modular-
building run completed and was rejected at its final 100/652 failure result as
recorded in the current ledger above.

The location labels below are literal:

- **AUTHORITY** — committed or currently dirty in the authority checkout.
- **NON-AUTHORITY BRANCH** — a separate ref; it is not the current source.
- **DETACHED WORKTREE** — a separate checkout with no authority branch.
- **EVIDENCE/TOOL ONLY** — not live game source.

## Every local branch

| Location | Branch and tip | Category | Quality verdict |
|---|---|---|---|
| **AUTHORITY** | `cursor/strip-mass-node-bloom` · `c4090cc` | Current source | **KEEP.** Claude's active modular-building files must be inspected in place after its run stops. |
| **NON-AUTHORITY BRANCH** | `main` · `fc0b5d1` | Old release baseline | **OUTDATED, PRESERVE TEMPORARILY.** It has no unique content and is 62 commits behind authority. Advance it to the accepted authority later; do not merge it into authority. |
| **NON-AUTHORITY BRANCH** | `claude/dazzling-cerf-31fcdf` · `55adb9f` | Runtime material fix + capture/verifier tools | **PORT MECHANISMS.** Old atlas binaries are superseded, but alpha-safe GPU resize, raw ORM generation/capture, and the verifier are still relevant. Do not cherry-pick the binary triplet wholesale. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_66829925-1f4-1` · `fc0b5d1` | Dirty UI feature | **SEMANTIC PORT.** Commander Clearance Track exists only as dirty `src/ui/hud.js` and obsolete-blob `src/styles/ui.css`; transplant logic and 66 CSS lines, never the whole stale files. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_66829925-1f4-2` · `3ff2a18` | Runtime AI feature + test | **SEMANTIC PORT.** Armour/static-defense counter-composition is absent; adapt it to current AI/naval/air/population logic and refresh `tools/test-ai-counter-comp.mjs`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_66829925-1f4-3` · `fc0b5d1` | Dirty UI intelligence feature | **SEMANTIC PORT.** Preserve `src/ui/counterhint.js`; register it against current `boot.js` and manifest without copying the stale registration files. Add coverage. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_66829925-1f4-4` · `6d159f9` | Old terrain-shader fix | **SUPERSEDED — DELETE REF.** Derivative hoisting landed in `a9256c7`; the old hash-grain implementation was later removed. |
| **EVIDENCE/TOOL ONLY** | `worktree-wf_66829925-1f4-5` · `fc0b5d1` | Dirty historical design document | `docs/MAP_DESIGN_TARGETS.md` measures 1.33.42 and requires a current rerun. Preserve or discard deliberately before removing its worktree. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_66829925-1f4-6` · `d2aa8eb` | Runtime settings fix | **INTEGRATE REVIEW.** Effects-budget/DPR/perf-floor corrections remain absent and the patch applied cleanly at audit time. Verify after Claude stops. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-1` · `284eadd` | Economy runtime + verifier | **SUPERSEDED — DELETE REF.** Adapted and integrated as `580bc9c`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-2` · `8b5ad48` | Input/HUD runtime | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `293b459`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-3` · `b8165a4` | Sim/combat runtime + verifier | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `a2b4c92`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-4` · `09f5674` | Renderer/GL runtime | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `1217176`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-5` · `45b5d29` | Boot/updater/session runtime | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `29d07c5`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_c731c446-089-6` · `3fdd4b3` | Terrain/water runtime | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `90ad99d`. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_f1bba01f-988-1` · `03d14cc` | Economy/seat runtime | **SUPERSEDED — DELETE REF.** Current authority split, corrected, and expanded the work; the old patch would restore obsolete bank APIs. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_f1bba01f-988-2` · `9177557` | Dormant scatter experiment | **REJECT — DELETE REF.** Adds an unwired competing `mfClusterScatter`; current seeded grove/species rendering is live and measured. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_f1bba01f-988-3` · `a0619ef` | Debris runtime | **SUPERSEDED — DELETE REF.** Exact authority patch equivalent `58f2421`; reapplication risks duplicate globals. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_f1bba01f-988-4` · `8a15cc9` | Social backend | **SUPERSEDED — DELETE REF.** Integrated and corrected by `763de68`, `c7f79ac`, and later social work; old migration direction now conflicts. |
| **NON-AUTHORITY BRANCH** | `worktree-wf_f1bba01f-988-5` · `064fce1` | Social UI/client | **SUPERSEDED — DELETE REF.** Exact authority equivalent `bbe5a18`, followed by corrected `/social/friend/*` routes and expanded features. |
| **NON-AUTHORITY BRANCH + WORKTREE** | `worktree-wf_fb8d84cd-09c-3` · `00bda4d` | Old topology + one dirty mesh patch | **SUPERSEDED AFTER DIRTY RECORD.** Its mesh patch exactly matches `a9256c7`; copying the old file would remove later quality fixes and Claude work. Record the diff, then remove the worktree/ref. |

The six `c731…` refs and five `f1…` refs have no attached worktree or dirty
state. Their exact tip hashes above retain the audit trail after ref deletion.

## Other worktrees

- **DETACHED WORKTREE — TOOL/EVIDENCE ONLY:**
  `massfront-baseline-c4090cc` contains an older untracked
  `tools/verify-perf-terrain-acceptance.mjs`. The authority has a newer,
  runtime-ready file at the same path; do not integrate the detached copy.
- **DETACHED STALE REGISTRATION:** `C:\Users\Jason\AppData\Local\Temp\mf-clean`
  no longer exists and Git marks only its metadata as prunable.
- Dirty worktrees `668…-1`, `668…-3`, and `668…-5` remain protected until their
  exact UI/evidence payloads are ported or deliberately discarded.

## Tool and agent provenance

No committed local branch is exclusively a tool branch. Mixed runtime/tool
branches are `claude/dazzling-cerf-31fcdf`, `668…-2`, `c731…-1`, and `c731…-3`.
`668…-5` and the detached baseline verifier are evidence/tool only.

### Antigravity

- **AUTHORITY:** commit `1783f80` is already integrated. Its next-unlock rail,
  site intel, terrain blend, and species-impostor behavior remain in source.
- **EVIDENCE/TOOL ONLY:** old `tmp/agent-audits/antigravity-*` reports are stale,
  rejected, or explicitly `NOT_READY`; they are not merge inputs.
- **QUALITY/CONTAINMENT RISK:** seven capture scripts still hard-code output
  below `C:\Users\Jason\.gemini\antigravity\brain`. Redirect them to repository
  `tmp/` or `audit/` before they are run again.

### OpenCode

- No independently traceable OpenCode branch or commit exists. The handoff claim
  entered through baseline commit `284d305`.
- Its V2 texture builder, material catalog, and 549 clean template assets remain
  an **opt-in material lab**, not live battle art. Only the heavy tank and Nova
  factory satisfy the strict authored-UV reference gate. Keep as tooling and
  templates until each mesh has visual/runtime proof.

### Cursor

- The `cursor/` authority name is historical and does not prove present-day
  authorship. Explicit Cursor trailers exist on ancestor commits `f66e561`,
  `6cd28d5`, `bffa49c`, and `fc0b5d1`; all are already integrated, and the latter
  release/bloom work is obsolete or superseded.
- **NON-AUTHORITY BRANCH:** `origin/cursor/strip-mass-node-bloom` is 61 commits
  behind authority. `origin/main` merge `00bda4d` adds obsolete topology but no
  needed payload. Do not merge either into authority.
- **EVIDENCE/TOOL ONLY:** `tmp/agent-audits/cursor-*` binds old source hashes.
  `.cursor/dlds` is an untracked embedded repository containing 30 files / about
  50.26 MB. Keep it out of Git; blanket staging could create a nested-repository
  gitlink problem.

## Ordered consolidation

1. Wait for Claude's direct authority run to finish, inventory its final files,
   and review/build/visually verify that ownership slice.
2. Delete only the twelve superseded unlinked refs marked above and prune the
   missing `mf-clean` registration.
3. Review/port `d2aa8eb`, `3ff2a18`, the ORM mechanisms from `55adb9f`, and the
   dirty `668…-1` / `668…-3` UI features against the post-Claude authority.
4. Record and remove the redundant dirty `fb8…-3` mesh worktree. Decide whether
   the old map-design document and detached baseline are still worth keeping.
5. Contain Antigravity outputs and exclude `.cursor/dlds` from staging.
6. Run the source gate and hardware/runtime verification, then advance `main`
   to the accepted authority. Only afterward remove remaining clean temporary
   worktrees and complete the physical Main Source path migration.
