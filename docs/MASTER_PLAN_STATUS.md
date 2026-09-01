# MASSFRONT 18-stage status

Last documentation reconciliation: 2026-08-31  
Plan authority: [`MASTER_PLAN.md`](MASTER_PLAN.md)  
Authority SHA-256: `4f04c18ede6b0cee911f33040cc6c03718e735544ea5a6d96b2592754366f9a5`

This is the only mutable master status surface. “Locally verified” does not
mean released, physically accepted, or production-enabled. Missing current,
source-matched evidence is reported as unknown or incomplete.

| Stage | Delivery scope | Honest state | Current evidence | Remaining blocker / next acceptance |
|---:|---|---|---|---|
| 01 | Evidence foundation | Implemented and in active use; final cross-stage acceptance remains ongoing | `tools/evidence-foundation/**` and workspace guard | Every later visual/runtime claim must remain source-matched and validated. |
| 02 | Navigation, movement, population | **Partial; high-unit command defects source-confirmed** | [Gameplay command audit](GAMEPLAY_COMMAND_SYSTEM_HANDOFF_2026-08-31.md), current source, Stage 12 population evidence | Multiplayer consumes/rejects orders above 64 unit refs; formation authoring can synchronously build many 384x384 fields against an eight-slot cache. Complete the deterministic shared-field, byte-chunked order, spatial picking and 1/48/100/250/500-unit acceptance matrix before saved control slots. |
| 03 | Projectile, turret, charge, singularity | Unknown against the current plan | Historical mechanics and VFX audits only | Create a current source-bound deterministic acceptance ledger. |
| 04 | Beams, trails, intelligence, utility AI | Partial; no current-plan completion ledger | Historical combat and mechanics audits only | Verify real call sites, keyed beams, trail continuity, contacts, claims, and manual overrides. |
| 05 | Air warfare | Unknown against the current plan | No dedicated current-stage ledger | Complete deterministic air-mission and target-device presentation acceptance. |
| 06 | Commander identity, voice, Deployment Arena | Partial | [Stages 11–13 handoff](STAGES_11_13_HANDOFF_2026-08-30.md) | Dedicated Stage 6 roster/arena acceptance and missing approved performances remain open. |
| 07 | Mobile UI and progression | Engineering complete; human acceptance pending | [Stage 7 ledger](MASTER_PLAN_STAGE7_PROGRESS_2026-08-28.md) | Fresh-profile comprehension and final physical-device sign-off. |
| 08 | Faction VFX, gore, terrain response | Incomplete / not reconciled | [Historical combat VFX record](COMBAT_VFX_2026-08-14.md) | Produce a current Stage 8 ledger and phone evidence; the archived old “Stage 8” record used a different plan. |
| 09 | Planet-aware map grammar | Bounded engineering complete; visual acceptance pending | [Stage 9](MASTER_PLAN_STAGE9_PROGRESS_2026-08-28.md), [exact locations](MASTER_PLAN_STAGE9_LOCATION_PROGRESS_2026-08-29.md) | Current phone visual acceptance and remaining recovery-fidelity debt. |
| 10 | Blender modular content | **CREATOR ACCEPTED — RUNTIME ADMITTED** | [Runtime admission](STAGE10_RUNTIME_ADMISSION_HANDOFF_2026-08-31.md), [pre-admission model ledger](STAGE10_MODEL_REVIEW_LEDGER_2026-08-29.md) | Exact accepted set is 320 world-kit + 7 retained Spline. The lazy-loaded optional runtime catalog contains 327 models; rejected/discarded assets and road-QA files remain excluded. No regeneration or source overwrite. |
| 11 | Galactic Exploration | Locally functionally verified; production blocked | [Stages 11–13](STAGES_11_13_HANDOFF_2026-08-30.md), [tutorial](STAGE11_TUTORIAL_ONBOARDING_PROGRESS_2026-08-30.md), [durable evidence](evidence/stage11/evidence.json) | Optional-pack size/budget, compression-quality comparison, construction visibility, and physical-phone acceptance. |
| 12 | S25 performance | Desktop contract verified; S25 acceptance pending | [Durable population report](evidence/stage12/population-cap-report.json) | Sustained physical Galaxy S25 Ultra 1v1–1v4 runs, including 2,500 units. |
| 13 | Music and audio | Source/runtime routing verified; content/device acceptance incomplete | [Stages 11–13](STAGES_11_13_HANDOFF_2026-08-30.md) | Approved masters, provenance/loudness, missing performances, and phone speaker/headphone tests. |
| 14 | PWA and OTA | **v1.33.60 OVERHAUL active and remote-verified; device probation open** | [Release status](RELEASE_STATUS.md), [serialized updater plan](ONE_UPDATE_AT_A_TIME_MASTER_PLAN_2026-08-31.md), [launcher/updater rebuild](UPDATER_LAUNCHER_REBUILD_PLAN_2026-08-31.md), launcher/updater/interruption/two-launch/PWA/asset-pack gates | Stable, mirror and historical manifests are byte-identical; all 111 full artifacts/ranges were pinned and verified before activation. Exact packed v1.33.60 is live on HF Space and clean-profile account -> launcher -> main-menu passed on hardware WebGL2. Physical Android update/rollback and Apple Safari-installed PWA acceptance remain open. Native iOS/store work is permanently retired. |
| 15 | Social and multiplayer | **Supported modes remain active; v1.33.60 client shipped, updated Worker source not deployed** | [Stage 15 / 1.33.49 handoff](CURSOR_HANDOFF_STAGE15_RELEASE_1.33.49_2026-08-31.md), [release status](RELEASE_STATUS.md), current Social/Worker probes | 2-player PvP Skirmish and 2–4-player Co-op vs AI remain enabled. v1.33.60 adds persistent username/profile cards, online count and World Chat actions; 437/437 Worker, 53/53 client and 35/35 UI checks pass locally. Live pre-alpha config already makes e-mail verification non-blocking, but exact Worker/D1 production deploy, device acceptance and the >64-unit order protocol fix remain open. |
| 16 | Final source-quality review | Inventory/tooling complete; retention gate blocked safely | `audit/stage16-source-quality/` | Repair legacy release pointer/hash drift before pruning; unknown and source assets remain preserved. |
| 17 | Documentation reset | Complete for this pass | [Documentation index](README.md), [archive ledger](archive/README.md) | Continue normal maintenance as later handoffs change. |
| 18 | Release | **v1.33.60 OVERHAUL live on Stable and HF Space; last phone-accepted release is v1.33.58 SYSTEM** — partial five-channel | [Release status](RELEASE_STATUS.md), [serialized release ledger](ONE_UPDATE_AT_A_TIME_MASTER_PLAN_2026-08-31.md), [five-channel procedure](FIVE_CHANNEL_UPDATE.md) | v1.33.60 immutable payloads/manifests, signed Android installer and exact HF Space web build are published and remote-verified. Physical Download -> Stage -> Apply -> restart/rollback, Apple Safari-PWA acceptance, exact Worker/D1 deploy, canonical Git record and unresolved stage gates remain open. No native iOS artifact or store submission is required. |

## Naming rule

The numbered sections under “Implementation Tracks” in the immutable plan are
thematic tracks. The “Delivery Order” is the sole 18-stage execution namespace.
New status and handoff filenames must follow the delivery-stage numbering.
