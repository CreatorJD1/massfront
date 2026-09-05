# Stage 12 — high-unit performance deep dive

2026-09-04. Local engineering and verification only. No release, upload,
activation, version bump, model regeneration, quality reduction, or physical
phone test. The target remains four normal participants at 500 each, with an
optional 500-body authoritative Brood force. Visual proxy bodies are separate.

This continues [the resource-performance pass](STAGE12_MOBILE_RESOURCE_PERFORMANCE_2026-09-04.md).
Its failed, host-confounded diagnostic remains preserved, not overwritten or
promoted to passing evidence. The immutable 18-stage plan is unchanged.

## Implementation

- `src/game/ai.js`: one ordered, lazy army census per AI pulse feeds retreat,
  muster, production, harassment, dispatch, ambush and defense. Command-seat
  population remains distinct from nearest-base spatial membership; exact ties
  and active-list order are retained. Retask membership is indexed by unit slot
  and generation, with invalidation when snapshots change. Wave arrival and
  survival share a scan without per-pulse tuple allocation. No AI cadence,
  difficulty, random draw, targeting policy or unit-cap reduction.
- `src/game/sim.js`: a small row-occupancy bitset skips empty spatial buckets in
  target/domain/area queries. Short queries and fully occupied rows retain
  direct traversal: initial isolated tests found pure bit-scanning could be
  slower on dense rows. Traversal order, distance comparisons, callback
  mutations, incremental relinking and the fixed navigation budget are retained.
- `src/ui/render3d.js`: one relic terrain-height read replaces three or four;
  ordered building traversal avoids two temporary registry arrays. More precise
  timing spans separate terrain, world preparation, unit preparation/submission,
  ground overlays and additive effects. Rendering content is unchanged.
- `src/engine/terrain.js`: reuse three X and three Y interpolation coordinates
  across the original nine bilinear samples. Public `rawH`, sample weights,
  arithmetic order, live height-field reads, water and seabed rules are unchanged.
  36,084 `Object.is` comparisons pass, including deformed fields and boundaries;
  coordinate clamp evaluations fall from 18 to 6 per `terrainH` call.
- `src/adboards.js`, `src/ui/render3d.js`: the first `begin3D` after explicit
  opaque-state setup passes that exact four-flag contract to screen drawing.
  This removes four synchronous driver state reads at this measured boundary;
  unknown callers retain the queried fallback. Optional passes do not rely on
  an assumed global state tracker, and material/postprocessing texture units
  remain unchanged. The normal and fallback GL contracts pass focused tests.
  Draw mutations now restore those states and texture/program bindings in
  `finally`, including injected contextual-texture and glow failures.
- `src/main.js`, `src/engine/perf.js`: fixed-size chronological frame/hitch
  records expose authority step count, backlog, AI/fog and render phases, nested
  self time, heap changes, GPU freshness and outside-frame delay. Multi-second
  stalls are retained. Detailed records are exported explicitly, not copied by
  the dashboard on every refresh. Driver timer failures expire safely without
  blocking the game; unsupported measurements remain unavailable, not zero.
- `tools/perf-lab/`: sampled GPU results are no longer repeated as if new each
  frame. Long-task and host-memory histories are bounded. Optional CDP CPU
  profiles cover sampling windows only; a tested summarizer reports self and
  inclusive stacks without double-counting recursion.
  Capture/GL-lifetime resets discard stale GPU samples and pending queries;
  failed query handles are not recycled, lost-context handles are not deleted,
  and delayed old long-task records are excluded. Reused cheap snapshots clear
  removed banks only at reset/rebind boundaries. Visibility probes retain the
  original per-live-unit fog/intel-cache call schedule, reject invalid camera
  inputs as unavailable, and project only in-bounds bodies. Camera-visible
  Brood is recorded separately from fog-visible Brood.
- Benchmark rosters now validate all 33 chassis indices/names/domain flags
  against the executing source before spawning. Old purported aircraft were
  actually current ground chassis. The combined-arms and air-cavalry rosters
  now include real aircraft, and Brood uses its actual four chassis. The
  source-contract test covers 13,600 bodies across scenario/population ladders.
  Historical captures using the old roster are not matched baselines.

## Evidence and limits

The real-source AI fixture at 2,500 units reduces busy-pulse full-list visits
from 47,500 to 2,500, and base-distance calls from 34,190 to 8,904. A retask
fixture replaces 49,150 linear comparisons with a 24-entry index and 2,500
lookups. These are structural work counts, not FPS multipliers.

Spatial equivalence covers 500/1,000/2,000/2,500 units, clustered and saturated
cells, strict ties, domain queries, ordered area callbacks, same-slot respawn,
movement across cells and bit boundaries, reset/rebuild, and mutations during
callbacks. Dense-row fallback is deliberate; empty-cell savings must not be
advertised as universal query-time savings.

## Integrated profiling and remaining costs

The first deep-profile capture is retained as
[diagnostic.json](../audit/stage12-high-unit-deep-profile-20260904/diagnostic.json),
[CPU sample 1](../audit/stage12-high-unit-deep-profile-20260904/sample1.cpuprofile),
[CPU sample 2](../audit/stage12-high-unit-deep-profile-20260904/sample2.cpuprofile),
and [start](../audit/stage12-high-unit-deep-profile-20260904/start.png),
[mid](../audit/stage12-high-unit-deep-profile-20260904/mid.png),
[end](../audit/stage12-high-unit-deep-profile-20260904/end.png) PNGs.
The [archive map](../audit/stage12-high-unit-deep-profile-20260904/archive-map.json)
verifies all eight relocated profile/capture hashes against the unchanged
producer records. Their original `tmp/` paths are historical, not durable links.
The capture used the packed runtime, real offline
UI deployment, 412×900 CSS pixels at DPR 2, High graphics and hardware ANGLE
AMD Radeon 610M D3D11. The mobile branch was active; no phone was used.

The capture admitted exactly 2,500 bodies. It sampled 2,348 living bodies
(2,000 normal plus 348 Brood), with 459–500 normal units visible, zero visible
authoritative Brood, and only 0–12 proxy bodies across ten reconciliation
samples (the later end capture separately shows 19 bodies / 6 clusters).
This is a large off-camera army / strategic-camera diagnostic, not proof of
dense visible Brood combat or an all-model close-camera battle.

Across 240 presented intervals: frame p50 28.0 ms, p95 225.0 ms, p99 770.5 ms;
simulation p50 8.1 / p95 33.3 ms; render CPU p50 16.6 / p95 42.5 ms. Forty
fresh GPU samples had p50 16.45 / p95 18.73 ms, with one 423.39 ms outlier.
Heap peaked at 334.78 MiB. Host free RAM dropped below 1 MiB, a major
confounder: do not attribute all delay to the game or claim it is all OS delay.
The authority-time/wall-time ratio was 0.4863 across the paired sample window,
which also includes capture gaps. The 33.3 ms p99 performance gate did not pass.

The source stayed frozen, but browser cleanup returned
`PW_OWNED_CLEANUP_INCOMPLETE`; measurements are diagnostic, not acceptance.
Root subsequently observed the canonical owned-browser reaper remove the exact
abandoned capture profile after its processes had exited; that follow-up is an
operator observation in the task transcript, not a standalone acceptance log.
This cleanup failure remains recorded, not retroactively erased.

Across the two statistical CPU profiles, driver `getParameter` was a repeatable
large cost: 4,582.9 ms (28.55% of aggregate sampled time), of which 2,547.5 ms
had `adDrawScreens` in its stack. Inclusive stack totals are not additive.
That finding motivated the explicit-state boundary optimization above.
Terrain sampling was another major cost, including repeated air-history
height reads and unnecessary verifier projection of off-camera bodies.
GC accounted for only about 0.15% of sampled time; these profiles do not
support calling garbage collection the principal bottleneck.

First profile identity: HEAD
`d180831ca4eb3caffd8bb34dcf20004dbcd86b7f`, dirty worktree fingerprint
`4e473f58d60d1360c6c6bd0c7ea1bed5a118eaffb9ecf4559e3444df83be4d5e`,
tested package fingerprint
`5e4a0a528169b2beff7f69c7442c233475dea67641c7eb79e7b6ba1411c3c3fd`.
Source-runtime fingerprint:
`bb6e52547c799c84798bd886bbbbac82ea7a3881659773f975570c009fef19cb`;
tested entry `www/index.html`; source-drift checking and source stability true.
It predates the last ad-state/terrain and verifier follow-ups, so it is not
source-matched acceptance of those later changes.

A subsequent capture was rejected by the guard after an accidental
`bundle.mjs --help` invocation wrote `dist/massfront.html` during the freeze.
The bundler has no read-only `--help` mode. The exact failure and source
identity are retained in
[invalid-followup.json](../audit/stage12-high-unit-deep-profile-20260904/invalid-followup.json);
its partial images are
explicitly invalid for acceptance. Do not reuse that attempt as a passing run.

## Final source-matched follow-up — valid failure, not acceptance

[Final evidence](../audit/stage12-high-unit-deep-profile-20260904/final/evidence.json),
[start](../audit/stage12-high-unit-deep-profile-20260904/final/start.png),
[mid](../audit/stage12-high-unit-deep-profile-20260904/final/mid.png),
[end](../audit/stage12-high-unit-deep-profile-20260904/final/end.png).
Recorded 2026-09-04T20:22:53.028Z, High, 412×900 at DPR 2, hardware AMD 610M,
seed 99412. The same real UI entry and exact 2,500-body admission passed.
Both sample halves total 240 presented intervals / 242 RAF callbacks. Source
freeze, packed-source parity, error/context-loss checks and owned-browser
cleanup completed without failure. The process returned 1 because the measured
33.3 ms frame-p99 gate failed, not because evidence was missing.

| Measurement | p50 | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|
| Presented interval | 23.1 ms | 31.6 ms | 101.3 ms | 176.7 ms |
| Simulation CPU | 6.0 ms | 18.3 ms | 30.8 ms | 167.1 ms |
| Render CPU | 16.1 ms | 24.0 ms | 25.9 ms | 123.1 ms |
| GPU, 40 fresh queries | 15.36 ms | 16.61 ms | 17.52 ms | 17.52 ms |

The 224 committed simulation ticks advanced 7.46667 simulated seconds during
7.6639 wall seconds (ratio 0.9743 at 1×, maximum measured backlog 2.529 ticks).
Live authority was 2,359–2,383 during the sample; all ten full-scan checkpoints
agreed with independent counters. Normal participants remained at 2,000.
Camera/fog-visible Brood was zero, and sampled proxy counts were zero; the end
capture separately recorded 3 proxies / 1 cluster. Visible normal units were
497–500. This still does **not** cover dense visible Brood or close-camera
2,500-model combat.

GPU samples had no recorded disjoint or engine-dropped queries. Query latency
was p95 146.7 ms, separate from actual elapsed GPU work. JS heap peaked at
315.86 MiB. Host free RAM was 514–662 MiB during seven periodic observations,
below the host-pressure threshold. CPU profiling was off for this follow-up.
Different host memory, sampling duration, camera evolution and profiler use
prevent attributing the numerical difference from the first run solely to
code changes. No overall FPS multiplier is claimed.

Final worktree/input-closure fingerprint:
`7c1c4a2afcf5dd9be8586cabfdd517ef2f023c215d23292bdee032dbedfa33db`.
Source-runtime fingerprint:
`5dfc663f2edef5bc744d3a4786ebb89aa332071ee751b97ac5e4cca1d805feb3`.
Packed-runtime fingerprint:
`b8acfdc11acbc925f8ac1754fb2fc8cabac281b43c80dc52548bbd996a6f6d38`.
Entry `www/index.html` SHA-256:
`13fb0a0df584f9473d4f620688cb1e2726975aa4c607bac5fa00ddf0907a7b85`.
The evidence retains the complete input closure and equal start/end identities.

Root and a separate agent inspected the actual final images: no obvious
atlas takeover, missing terrain or shader corruption. They show strategic
icon LOD and an intentional benchmark overlay, not a clean gameplay/UI
acceptance or full-model fidelity comparison. Desktop emulation does not
reproduce Snapdragon/Adreno hardware, WebView, thermals or Safari.

### Next targeted work

The largest genuine sampled CPU hitch at `startMs=77590.8` is 176.1 ms:
`simDeformation` 96.3 ms, `simWorld` 65.1 ms, unit simulation 5.4 ms and
render 8.9 ms. A separate 123.1 ms render sample is dominated by 111.2 ms
in the billboard group. One 22.2 ms AI pulse exists, but AI is not the
principal cause of these largest retained spikes. This narrows the next work:

1. Instrument `processDeforms`, `waterFloodTick`, `deformMaintain`, and the
   `envTick`/`crateTick`/`sceneryTick`/`shardTick` members individually. Preserve
   deterministic authority and all terrain/deformation effects; then coalesce
   redundant updates or use fixed deterministic work slices where valid.
2. Split the billboard pass into its flush, ordnance, GPU-particle, cloud,
   icon and macro substeps. The current aggregate identifies a main-thread
   cost, not its precise child or CPU-vs-driver origin. Sampled GPU work is
   substantially lower, but the last resolved GPU timer is not necessarily
   the timer for that exact CPU hitch frame.
3. Serialize exact start/end timestamps for both sample halves. Current
   native checkpoints bracket the run but include the mid-capture interlude;
   the retained 355 ms render / 361–364 ms gaps there are not sampled frame
   costs. A 99.2 ms CPU / 86.2 ms sim spike falls just below the detailed
   100 ms hitch threshold, so its child-span attribution is unavailable.
4. Run a separately labeled dense-contact camera case with actual visible
   Brood/proxies and close-model combat, followed by the full population
   ladder and sustained test under controlled host-memory headroom. Do not
   substitute admission-only or off-camera numbers for this acceptance.

These are the next safe engineering actions, not completed optimizations.

## Commands, ownership and handoff

- PASS: `node tools/bundle.mjs` (112 sources, 27.14 MB), then
  `node tools/pack-www.mjs` (142.4 MiB, runtime compatibility `cdb5d8b5ad10`,
  unchanged balance compatibility `75d9cfcdbe67`).
- PASS: `tools/test-ai-high-unit-pulse-structure.mjs`,
  `test-sim-spatial-occupancy.mjs`, `test-terrain-height-coordinate-reuse.mjs`,
  `test-adboards-known-state-contract.mjs`, `test-high-unit-hitch-trace.mjs`,
  `test-render-world-hotpath-contract.mjs`, `test-render-dense-scan-contract.mjs`,
  `test-render-unit-cache.mjs`, the three `test-cpu-ai-*-contract.mjs` fixtures,
  `test-mobile-presentation-cadence.mjs`, `test-ai-perf-roster-source-contract.mjs`,
  `test-ai-perf-projection-culling.mjs`, and
  `tools/perf-lab/test-summarize-cpu-profile.mjs`.
- PASS: `node tools/perf-lab/perf-lab-self-test.mjs` — 116 checks. Focused diff
  whitespace check passed, apart from existing LF/CRLF warnings.
- Valid performance FAIL: `node tools/perf-lab/perf-probe-runner.mjs --scenario
  1v4_continental_conquest --units 500 --preset high --frames 240`.
  The initial diagnostic added `--cpu-profile`; the invalid intervening run
  and its reason are preserved above.
- Known unrelated fixture debt: `test-spatial-hash.mjs` still expects the old
  literal civic explosion cap rather than the existing continuous damping.
  Its earlier failure is not converted to a pass or repaired by reducing VFX.
  An agent also attempted the server-dependent city-terrain test on unused
  port 8982; connection refused is not terrain acceptance evidence.

Three subagents plus root were used, with sequential ownership handbacks:

- Root: `src/main.js`, `src/engine/perf.js`,
  `tools/test-high-unit-hitch-trace.mjs`, this handoff and Stage 12 status;
  integration, packing, hardware captures and retained failure records.
- `engine_ai_perf`: `src/game/ai.js`,
  `tools/test-ai-high-unit-pulse-structure.mjs`,
  `tools/perf-lab/scenario-manifests.mjs`, roster validation in
  `seeded-load-generator.mjs`, `tools/test-ai-perf-roster-source-contract.mjs`;
  initial probe-culling pass, then final exception-safety takeover in
  `src/adboards.js` and its focused contract after the prior owner handed back.
- `brood_terrain_instancing`: scoped `src/ui/render3d.js` work and
  `tools/test-render-world-hotpath-contract.mjs`, initial known-state ad path
  and its contract; CPU/GPU/host-memory harness, summarizer and its test;
  final `perf-probe-runner.mjs`, `seeded-load-generator.mjs` and
  `test-ai-perf-projection-culling.mjs` integrity follow-up after handback.
- `mobile_gui_perf`: `src/game/sim.js`,
  `tools/test-sim-spatial-occupancy.mjs`, `src/engine/terrain.js`,
  `tools/test-terrain-height-coordinate-reuse.mjs`; final profiler lifecycle
  fixes in `perf.js` and the hitch fixture after root handed those files over.

All implementation delegates are handed back; no active external writer or
browser verification lease remains. The continuity skill required bounded
ownership, preserved failed captures, matched source identity and this handoff.
The other 17 stage rows, art, faction balance, quality settings, release
activation and physical devices were not advanced by this pass.

Stage 12 remains partial until the integrated frame-time gate, sustained
high-population combat and visible Brood/proxy coverage are actually measured
and pass. No production update is implied by local implementation.
