# Stage 12 — mobile resource performance handoff

Date: 2026-09-04. Local implementation; no release, version bump, APK, HF upload,
or production activation in this pass.

## Scope and present result

The requested ceiling is **four normal participants at 500 units each**, plus
an optional Brood system force. The current stress fixture admits another 500
real Brood bodies, for 2,500 authoritative units. Decorative Brood instances do
not count as extra gameplay entities. Older proposals describing 5,000–10,000
units or percentage speedups are not measurements or the current acceptance
target.

This pass reduces repeated CPU traversal and allocation, limits unnecessary
high-refresh presentation work, and bounds browser media-cache residency. It
does not lower the unit cap, AI difficulty, model fidelity, texture settings,
or combat-effect settings. It does not move simulation to workers or claim to
use every CPU core. Storage caching improves loading/offline resilience, not
simulation throughput.

Stage 12 remains partial until the integrated frame-time and sustained-load
gates pass. Tests use a mobile browser profile on the computer's real GPU;
they do not reproduce Snapdragon/Adreno timing, phone thermals, or Safari.
No physical phone was used, as requested.

## Implemented in this pass

| Owner | Files | Change and bounded evidence |
|---|---|---|
| CPU agent | `src/game/ai.js` | Ordered building subsets reused during an AI pulse and invalidated on building creation; dense unit census shared across seats. Fixtures: 132,960 → 25,596 building visits; 8,568 → 2,142 unit visits. These are work counts, not game FPS gains. |
| CPU agent | `src/game/statehash.js` | Reusable unit/projectile scratch, bounded short-string encoding cache, typed number writes. The 2,500-unit / 600-projectile fixture retains the exact 4,051,203-byte canonical output. Isolated VM timing was 102.74 → 80.75 ms; host-load sensitivity makes this diagnostic only. |
| Renderer agent | `src/ui/render3d.js` | Reuse the dense live-unit view and maintain live particle slots. A reusable bitset preserves the old ascending alpha draw order after wrap/reset. At 2,000 particles, 2,000 state probes replace 9,000, with additional 282-word bitset enumeration. |
| Storage agent | `sw.js` | Separate durable shell/runtime resources from bounded media caching: 240 entries, 160 MiB charged budget, 48 MiB per media item. Preserve previous offline-good data when a replacement fails; unknown size receives a conservative 4 MiB charge; explicit no-store requests bypass this cache. |
| Storage agent | `src/updater.js`, `src/assetpack.js` | Preallocate normal download/range assembly buffers, avoid unnecessary chunk copies, retain integrity checks and atomic file persistence. Request persistent storage during explicit optional-pack download; refusal does not prevent downloading. |
| Integration owner | `src/main.js` | Detect high-refresh callbacks and cap presentation near 60 FPS while authority stays at fixed 30 Hz. Camera/simulation processing is independent of the render gate. Evaluate victory after each committed step and stop catch-up at the terminal tick. Preserve existing AI/fog cadence. |
| Integration owner | `src/engine/perf.js` | Presented-frame FPS and draw counts, explicit AI/fog profiling, CPU/memory/storage diagnostics, asynchronous storage estimate. No claim of additional CPU worker execution. |

The earlier dense simulation, bounded flow fields, multiplayer order chunks,
Brood crowd/terrain work, top bar, notification feed, and scrollable unit bar
are preserved. They are not all newly implemented by this resource pass.

## Verification ledger

- `node tools/bundle.mjs`: PASS, 112 scripts / 27.11 MB concatenated source.
- `node tools/pack-www.mjs`: PASS, packed 142.3 MiB, manifest/audio references
  resolved. Runtime compatibility `9ca47f5bd3df`; balance `243f81181bc4`.
- Local preview `http://127.0.0.1:8901/`: sampled main, profiler, renderer, AI,
  updater and service-worker responses were HTTP 200 and matched `www/` bytes.
- `tools/test-cpu-ai-building-view-contract.mjs`,
  `tools/test-cpu-ai-seat-census-contract.mjs`,
  `tools/test-cpu-ai-statehash-contract.mjs`: PASS.
- `tools/test-render-dense-scan-contract.mjs`,
  `tools/test-render-unit-cache.mjs`: PASS, including particle wrap/order cases.
- `tools/test-mobile-presentation-cadence.mjs`: PASS for 60/90/120 Hz callbacks,
  presented metrics, local terminal ticks, and lockstep packet/commit ordering.
- `tools/test-mobile-storage-resilience.mjs`: PASS, including unknown-size
  charging, eviction, media migration, offline shell, no-store and failed
  replacement preservation.
- Updater range retries, boot retries, two-launch recovery, optional-pack
  integrity/resume/GC and hardware-browser pack checks: PASS in this pass.
- High-unit simulation browser contract: PASS, 2,000 normal + 500 Brood units,
  8,192 navigation cells per tick, 499-unit cohort sharing one flow request,
  kill/respawn dense-index consistency, valid positions.
- Stage 15 determinism regression: PASS. The additional VM check proves that
  a missing lockstep packet causes no simulation or victory evaluation and
  accepted packets commit before victory. This is not a new live two-peer test.
- `tools/perf-lab/perf-lab-self-test.mjs`: 111 PASS.
- `tools/test-pw-browser-cleanup-bounds.mjs`: PASS. The runner/tooling owner
  updated `tools/perf-lab/perf-probe-runner.mjs`, its self-test, and
  `tools/pw-browser.mjs`: actual package provenance, presented-frame sampling,
  paired in-page wall/tick measurement, a bounded graceful close, safely
  authorized transient cleanup retries, and diagnostic-only preservation when
  browser cleanup cannot finish. This is verifier tooling, not game runtime.
- PWA shell browser gate: controlled service worker, 112 expected runtime
  scripts present, no missing shell entries, offline reload ready. Assertions
  printed PASS; the runner subsequently stalled during teardown and was
  interrupted. Do not represent that command as a clean exit.

## Combined battle evidence

The preserved preliminary run is under
`tmp/mobile-performance-stage-20260904/before/`. Its 60-frame p99 was 169.2 ms,
but the old runner used a retired simulation step and hashed root source as
though it were the served package. It is retained as historical diagnostic
evidence, **not a valid matched before/after speed comparison**.

The corrected runner counts presented intervals, reads actual authority ticks
and `MF_SIM_DT`, fingerprints served `www/` independently, rejects stale packed
JavaScript, and separates exact initial admission from measured live/visible
population. A first 240-frame capture completed visually but its command failed
with a locked Chrome Crashpad cleanup file before releasing the queued metrics.
Another earlier attempt timed out clicking the launcher before battle. Neither
attempt is accepted as a passing integrated benchmark.

The final corrected attempt at **2026-09-04T19:31:50.813Z** is preserved in
[`audit/stage12-mobile-resource-performance-20260904/diagnostic.json`](../audit/stage12-mobile-resource-performance-20260904/diagnostic.json),
with start/mid/end PNGs in that directory. It is explicitly diagnostic and
`acceptanceEligible=false`: Windows process enumeration timed out during
cleanup and the profile stayed locked through eight authorized deletion
attempts. The canonical orphan reaper later removed this disposable test
profile successfully; no personal browser or other application was closed.

The measurements themselves also miss the 33.3 ms p99 gate by a wide margin:

| Measured quantity | Result |
|---|---:|
| Presented intervals | 240 |
| Frame p50 / p95 / p99 | 55.9 / 1,116.9 / 5,659.8 ms |
| Mean-derived FPS | 3.3, diagnostic only |
| CPU simulation p50 / p95 | 15.0 / 204.3 ms |
| CPU render p50 / p95 | 22.8 / 196.3 ms |
| GPU p50 / p95 | 19.54 / 451.28 ms |
| JS heap p95 | 323.16 MiB; not total process or GPU memory |
| Initial exact admission | 2,500 |
| Measured live population | 2,381–2,385 |
| Visible normal units | 487–500 |
| Visible Brood / decorative proxy bodies | 0 / 0 — GPU crowd coverage absent |
| Paired simulation / wall time | 25.26667 / 98.0577 seconds at 1x |

Windows reported only **123,224 KiB (~120 MiB) free physical RAM** out of
24,340,160 KiB (~23.2 GiB) immediately after this diagnostic. System commit was
also high. The read-only observation is preserved as
[`host-memory.json`](../audit/stage12-mobile-resource-performance-20260904/host-memory.json).
Widespread scheduling/paging interference is plausible, but this post-run
snapshot does not prove it caused every stall or absolve the game. Do not
compare this trace against the earlier short run as a regression/speedup, or
forecast S25 FPS from it. A repeat with recorded host headroom is required.

The game still has actionable cost: simulation and CPU rendering each consume
substantial median time, with bursty AI and fog work. Their separately measured
medians are not a synchronized per-frame sum or a clean-host baseline. Broad
multi-second maxima in otherwise tiny rendering/UI phases cannot identify a
specific algorithm; the current aggregate report lacks chronological GC,
scheduling and per-frame attribution. Add a bounded >100 ms hitch trace with
AI seat/subsystem, step count, fog, unaccounted render time, heap deltas and GPU
query age before changing authority cadence or lowering graphics. The memory
observation is not a reason to declare the engine optimized.

The actual package was source-stable throughout this capture, using High,
412×900 CSS pixels at DPR 2, mobile branch enabled, AMD 610M / ANGLE D3D11:

- Git HEAD: `d180831ca4eb3caffd8bb34dcf20004dbcd86b7f`, dirty shared checkout.
- Served package SHA-256: `01d93e5a832ae67b93d260eaf3051e3d48405f61e8f9c307e2f2145353bddd2d`.
- Root runtime fingerprint: `62e19cb2dc75665209f1ce0defef90f78de14f0d3bf07923a7155c00605f332e`.
- Executing-input/worktree fingerprint: `6e5d74f3d496bb593767cebef2f35aa159fa98438703da1d227bb6fe8b937672`.
- Archived diagnostic SHA-256: `264d1310e6a5cde3532a9cd6c0ed73c8f18fd097fe802952fb9835545b5b90ba`.

Real UI deployment, advancing authority, source stability, and no page errors,
console errors or context loss were observed. The final image was inspected:
terrain, units, shields, top rail and lower dock render. The upper-left benchmark
caption is test-only. The minimap communications overlay still needs its own
contrast/layout acceptance. This one capture does not accept all GUI states,
resolutions or a visible Brood battle. Internal perf-lab schema names that still
say “Stage 8” are historical; this work belongs to delivery Stage 12.

## Limits and next work

1. First repeat the same capture after host RAM headroom is restored, with
   memory/paging and CPU/GC profiling recorded. Do not close unrelated apps or
   processes without the user's direction. Then use a valid integrated trace
   to choose the next CPU/render bottleneck; do not claim stable 30 FPS from
   admission counts or isolated microbenchmarks.
2. Add visible, fighting Brood/proxy coverage and sustained battle runs. A camera
   showing only normal forces cannot accept the decorative Brood GPU path.
3. Separate heavy AI, fog and hashing work only with deterministic authority
   tests. Fog also writes discovery state; moving its pulse was deliberately
   rejected here. Navigation workers need deterministic readiness/fallback
   rules before implementation.
4. The media limit is a charged budget, not exact physical storage: compressed
   or unknown Content-Length can differ from retained bytes. A failed legacy
   migration can leave old media intact for safety. Test persistent/quota
   behavior across Android WebView and Safari before release.
5. Download decoding still requires a full final file buffer and, for scripts,
   a decoded string. Very large or malformed advertised sizes need an explicit
   upper-bound policy; bounded caching is not unlimited-memory support.
6. The profiler's long-frame counter still describes raw RAF stalls. On 90 Hz,
   a 60 FPS cap alternates approximately 11/22 ms presentation intervals; an
   average alone does not certify evenly spaced frames.

The immutable 18-stage plan is unchanged. No unrelated model or release
artifacts were removed. Continue in the canonical Local checkout; no worktree
or replacement source tree was created.

All three collaboration agents have handed back their changes; there are no
remaining concurrent writers. Local implementation and focused contracts are
complete for this pass. Integrated performance acceptance, sustained load,
visible Brood coverage, physical-device acceptance and release remain open.
