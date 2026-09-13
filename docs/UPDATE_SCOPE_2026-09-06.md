# September 6 full requested update scope

This is an internal preparation/acceptance ledger, NOT the post-release changelog.
The owner asked to include all fixes and content discussed in today's task, then
list them AFTER release. Nothing here establishes publication. Do not silently
drop unfinished features to describe this as the complete requested update.
`RELEASE_1.33.76_PREPARATION.md` holds artifact identities and earlier evidence.

## Complete scope reconciliation

| Request | Implemented content/fix retained | Remaining acceptance or implementation |
|---|---|---|
| Remove bad art from the original 330-model pack | All 42 visual-reject paths excluded from runtime, catalog and pack; current world catalog has 285 models (284 world-kit, one Spline). Source/provenance retained. | This is not proof that all retained art is excellent or every mesh is hole-free. Other historical exclusion sets overlap; do not subtract every ledger count from 330. |
| Keep detailed models without destructive optimization | Original eleven UGA compartments, thirty upgrade plots, shared glTF resources and existing title art retained. Lossless UGA transfer is 70,507,896 bytes. | No blanket reduction of geometry quality; phone GPU residency/performance and broader asset budgets remain unapproved. |
| Base APK contains game, models, exploration, voices and music | Complete default player pack includes exploration; 324 dual-format voice files and six files for three adaptive music beds are present. | The long-form music playlist is empty, not a hidden missing-download library. Raw Blender/authoring sources and rejected models are not playable content and stay out of the APK. |
| Automatic startup content download, staged self-updates, safe recovery | Hash-verified chunks, resumable storage, cross-document single writer, endpoint handoff, reconnect retries and status UI. Existing OTA channel authority retained. | Existing .74 installs still need the full-content staging/mounting adapter, atomic activation, boot probation, rollback and save-retention testing. Native Filesystem/WebView capabilities exist; mandatory APK replacement is NOT established. Multi-GB/OS-background behavior remains unverified. |
| Cinematic informative loading using the owner's title | Original menu title reused; animated planet/rings/sweep, progress phases, real script/source counts, elapsed time and reduced-motion path. | No title regeneration. Current entry/boot bytes are packaged; earlier visual evidence retains its original scope. |
| Updater, animated intro, login, then UGA career | Actual launch ordering, offline/local career and returning-player routes implemented. Submenu and mission returns bypass unnecessary launch replay. | Remote login/updater and physical mobile acceptance must not be inferred from blocked-network fixtures. |
| First-time basics and practical space onboarding | Ten-step planetary tutorial and faction/commander commissioning exist; UGA introduction is persistent and replayable. | Practical action-gated space scanning, POI deployment, return and first-upgrade onboarding is incomplete. A briefing is not the requested complete space tutorial. |
| Scan/find POI and deploy a preferred-faction hired commander | Survey/discovery state, eligible commander roster, portraits/fallback, specialist package and solo tactical bridge implemented. | Probe target currently selects first undepleted system entry, not a fully verified selected-planet/reticle signal flow. This behavior needs review before the full scan journey is accepted. |
| Optional ally/player at deployment | Hired commander and solo deployment are functional; choices are not disguised bots or fake sessions. | Galactic adapter explicitly permits one player/zero allies. Optional AI ally and authenticated human co-op need actual integration, lobby/reconnect/authority/result tests. Do not reclassify them as complete or remove them from scope. |
| Return to ship, upgrade/craft/buy | Accepted result, debrief, authored Command return, Engineering, existing Development/Crafting and Armory routes; exactly-once rewards survive reload and result-URL replay. | Six-step current packed proof is a controlled solo progression fixture with accelerated tactical outcome, not a fully played mission. |
| XCOM-like modeled room navigation and UGA upgrades | Side-on authored cutaway, tap/focus, readable room upgrade controls, visible costs/prerequisites, commissioning/tier/retrofit construction actions. Fifty facility definitions across three decks retained. | Full 33-room proof predates later UI changes; changed hangar/return paths have newer focused evidence. Further recommendation/dependency-return/persistent-queue usability suggestions are not all independently accepted. Construction advances through campaign actions, not idle waiting. |
| Classic is original Standard War Table; Versus remains distinct | Classic goes through the original Standard War Table, not a renamed exploration mode. Existing classic modes remain separate. | Galactic Co-op/Versus menu routes are deliberately locked; actual synchronized session integration still required. |
| Real-time navigation/flowfields around structures | Progress-based rerouting, preserved goals/queues, construction/destruction invalidation, crowd-gap routing, combat detours and strategic-route restoration after breach. | Eleven-case solo desktop proof is not every map/footprint/naval scenario or phone performance. No new guarantee of universal unsticking. |
| Repeat OFF and accurate rallying | Real button ON/OFF queue-drain evidence, clearer remaining-queue explanation, exact rally target without random scatter, distinct ground/water/air goal rules; deterministic production helper tests. | Reported endless OFF bug was NOT independently reproduced. Repeat/rally currently mutate local building state rather than tick-synchronized multiplayer commands; network-safe implementation and two-peer/reconnect proof remain required. |
| Fix Nova model and make its hangar massive | Hangar-only hull/winding/rotor repair, closed hatch, connected ramp and floor contacts; ship 60.2% shorter in a much larger authored bay; compact/expanded loadout preserves draft; all original placements restored on exit. | Older rear-hangar gray props remain visually rough. Nova uses semantic vertex colors, not restored original tactical atlas. Close-up evidence is labeled diagnostic, not default camera. |
| All systems work together | New review reproduced content status obscuring Confirm when deployment hides normal navigation. Narrow layout correction is being prepared. Existing music beds are being connected to Galactic's separate-document mixer. | Both integrations require fresh package-bound tests before replacing the r3 candidate. Only approved existing audio is used; missing character/story recordings stay subtitle-only. |

GoSpeed was discussed as a possible tool, not selected as a release dependency.
No new provider, paid service or runtime framework has been adopted. A multi-GB,
content-dense game remains a product goal, not a claim that new gigabytes of
finished content were authored today.

## Package inclusion versus execution proof

Before the follow-up integrations, the r3 audit compared all 1,308 packed runtime
files to Android public assets: zero mismatches. All 1,306 paths with direct
canonical counterparts matched; 112 classic sources and all 456 module-manifest
entries were present. The APK hash remained
`2d0797da1469114e60f158f141ff613a120ca743c4f7a78c62c3217ff4ed6ad0`.
476 total audio files use 15,998,916 bytes; this includes effects, voices and beds,
not 476 music tracks. `.gitkeep` is an excluded repository placeholder.

A naive raw-source-versus-OTA comparison initially differed on the scripts.
Inspection confirmed the publisher deliberately appends completion counters and
inlines art. The authoritative `test-runtime-compatibility-build.mjs` then passed
for all 123 canonical inputs and exact emitted transport hashes. Do not treat
delivery decoration as missing fixes, or canonical identity as proof that the
114-artifact classic OTA includes the separate exploration document—it does not.

## New candidate preparation and release hold

Root successfully updated the built-in `APP_NOTES` fallback with the broader
completed scope and explicitly labeled upcoming work. This supersedes the earlier
write-failure note; it changes release text, not updater behavior. The old r3
candidate manifest is preserved as
`releases/candidates/update-v1.33.76-candidate-r3.candidate.json`.
Module cache references are being advanced for the follow-up candidate. No
existing APK is being overwritten and no live pointer is being activated.

Release gates include: old-install migration/recovery, genuine optional ally/co-op,
unfinished space onboarding, multiplayer repeat/rally authority, broader current
visual/runtime acceptance, and Android/Safari performance/behavior. Do not weaken
budgets or relabel incomplete features to get a green release. Canonical Local,
packed preview, Android, HF OTA and HF Space must be identified separately.
Apple support remains Safari-installed PWA; native iOS is retired.

Ownership this pass: root owns scope/notes/cache references/package integration;
UI agent owns startup status placement and its continuity fixture; model/audio
agent owns the Galactic existing-bed mixer integration; verifier owns focused
packed hangar/status evidence. Existing tactical art/title/audio recordings are
untouched. Final acceptance and next candidate identities will be appended to
the preparation ledger. The user-facing full changelog is deferred until a
verified release, as requested.

## Final local preparation result

Candidate r4 now includes the status-layout and existing-bed audio corrections.
Clean 15-case startup/layout evidence, eight actual-module status layouts and
real browser decode/music-bus playback checks pass. Coverage confirms all
1,308 packed runtime files match the APK. See the r4 section of the preparation
ledger and `tmp/continuity/today-release-scope-final/coverage.json` for exact
identities, limitations and preserved failed attempts. This supersedes the
in-progress wording above for these two integrations only. All other pending
requirements remain pending; no live release or published changelog exists.

## Later r7 follow-up and current release status

`RELEASE_1.33.76_NATIVE_MIGRATION.md` supersedes the earlier in-progress rows for
native content mounting and multiplayer factory commands. r7 now contains the
bound native adapter and synchronized repeat/rally/cancellation implementation.
40 live transport/production checks, 11 packed navigation checks, complete APK
byte parity and the exact-.74-loader browser migration/return flow pass within
their documented scopes. The old report counts and r4 hashes above are history,
not the current release identity.

The latest request is both self-updater and APK, following the five-channel
pipeline. No channel was activated or uploaded. Actual Android interruption/
save-retention and Safari/PWA acceptance, the invalid-command multiplayer stall,
and the explicitly unfinished product requirements remain open. A local browser
fixture is not physical-device or network-update acceptance. See the current
migration ledger for r7 hashes, all retained failures, channel status and next
safe actions. The requested public fixes/content list still follows an actual
verified release, not preparation.

## v1.33.76 release outcome

The earlier no-publication status is superseded. v1.33.76 was activated through
the Cloudflare/Hugging Face updater pipeline and published as the signed Android
APK and exact HF Space browser package. Stable identity is manifest root
`58ab8d7216a78c005a72a01d904854249b46d18e45030db90600f66f76618e35`.
The APK is 260,570,743 bytes and embeds the complete Galactic content closure;
the active updater manifest has `optionalPacks: []`.
