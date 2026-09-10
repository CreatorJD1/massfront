# UGA lossless delivery

The first-pass record below is historical. The September 6 continuation adds
exact-byte shared-resource delivery; it does not claim that a smaller transfer
automatically clears mobile GPU residency or full-game release acceptance.

Owner requirements: keep original title art and all11 authored XCOM-inspired
section rooms, no decimation or texture downscaling, base-game availability,
existing update/recovery contracts, and the documented eight-step player flow.

## Implemented

- `tools/uga-lossless-textures.py` builds a delivery GLB directly from preserved
  authoring source.22 metadata-free PNGs become exact lossless WebP;22 PNGs with
  gamma/chromaticity/sRGB metadata remain byte-identical. Every decoded RGBA
  pixel is compared. Geometry buffer views, nodes, transforms, materials,
  accessors, UVs and all other scene semantics are preserved.
- Original:81,372,160bytes. Candidate:76,164,512bytes. Saving:5,207,648bytes
  (6.40%). Candidate SHA256:
  `d8c1c7645e4a9b89f94c6859dae59b1e70ebd24833b9264ffb8c193f41994350`.
- Command scene receives exclusive ownership of its freshly parsed resources,
  eliminating its retained decoded master and deep geometry copy. Exterior
  caching remains unchanged. No unsafe shared-texture disposal scheme was added.
- Restoration and readiness tools now verify decoded fidelity instead of
  requiring identical compressed-file bytes. No budget threshold was relaxed.
- Canonical source and local packed preview updated; module146.06MiB,
  full packed preview approximately288.6MiB. No APK/OTA upload or activation.

## Evidence

- `tmp/uga-lossless/texture-report.json`: all44 texture pixels exact; scene and
  geometry exact. `--verify-only` independently checks actual runtime against
  source without writing files.
- `tools/test-uga-lossless-proof.py`: rejects scene metadata, geometry-byte and
  single-decoded-pixel tampering.
- `tools/test-uga-asset-ownership.mjs`: material/transform equivalence, exclusive
  resource identity, independent concurrent callers, cancellation, retry and
  unchanged exterior cache all pass. This is not measured device memory usage.
- `tmp/uga-lossless/matched/`: controlled current-renderer original-vs-candidate
  captures.22/24 frames exact. Command portrait differs at one pixel(3channels),
  navigation portrait at one channel. Original-vs-original control also differs
  in4frames. Strict zero-rendered-pixel-difference gate remains FAIL; it has not
  been relaxed or hidden. Independent decoded asset data remains exactly equal.
- Earlier `before/after` comparison is retained as preliminary evidence: moving
  traffic affected camera fitting. Matched captures normalize traffic and DPI.
- Current `tmp/uga-authored-sections/report.json`:33 real room selections and
  mesh taps pass across desktop, portrait and short landscape; no page/GL errors.
  Source hashes match the current candidate and loader.11 rooms/30 plots retained.
- Browser route interception with an81MB in-memory response failed; rewriting
  the request URL to fetch the preserved source normally resolved that capture
  infrastructure issue. No gameplay workaround was introduced.

## Remaining boundaries

Per-model budgets still fail on the whole headquarters:72.6MiB file,42.1MiB
retained PNG data,262,248triangles. These are not Android platform limits. Actual
Android/Safari memory, startup latency and performance remain unmeasured.
Per-section/shared-resource delivery remains future work, not a claim that this
first pass makes all phones fast or clears release acceptance. Original-source
geometry and title art remain untouched. Multiplayer co-op integration and other
previously recorded flow gaps were not expanded in this optimization pass.

Ownership: root owns texture derivation/proof, packed preview and docs;
resource agent owns loader/lifecycle test; readiness agent owns acceptance-tool
integration; visual agent owns comparison harness/captures and room navigation
verification. No source branches/worktrees or external release mutations.

## September 6 continuation — shared resources

- The runtime now loads `assets/runtime/models/uga-sections/scene.gltf`, keeping
  the complete authored eleven-room graph. Its 48 dependencies comprise the
  scene document, three aligned geometry buffers and 44 original runtime images.
  No room, transform, material, texture pixel or triangle was simplified.
- Identical geometry buffer views are stored once: all 2,944 views remain
  byte-equivalent when decoded. Geometry storage falls from 16,351,088 to
  10,685,128 bytes. Resources plus the 12,211-byte manifest transfer 70,507,896
  bytes versus the previous 76,164,512-byte GLB. Largest resource: 4,194,096 bytes.
  This is bounded-file delivery, not lazy per-room loading or reduced GPU detail.
- A parse-scoped image promise cache avoids duplicate network requests for
  different samplers sharing one image. Samplers retain independent textures;
  ownership and disposal stay local to the scene. PNG alpha/opaque metadata
  preserves the pinned Three.js renderer's original texture format behavior.
- The runtime allowlist validates the entire manifest/hash/size/reference closure.
  It excludes the superseded monolithic runtime GLB from new packages without
  deleting either that preserved GLB or the original authoring model.
- Independent verification chains original authoring pixels/semantics to the
  prior runtime, then exact prior-runtime geometry/image bytes to the new graph.
  Missing dependencies, altered PNG metadata and changed geometry with a newly
  forged manifest hash are rejected. No asset budget threshold was relaxed.

`tmp/uga-section-delivery/` contains the proofs and controlled before/after
overview. Both current PNGs hash
`9811532a0d46f0c64edf1e6567eb3f71157a9173085d07481d14fa8d016c373d`.
On the desktop RTX 4060 cold-HTTP-cache sample, load time was 1.938s versus
1.390s. Renderer resource counts stayed unchanged. This is neither a phone
benchmark nor proof of full rendered-frame performance. The earlier duplicate
request failure is recorded separately in `intermediate-failure.json`; its
overwritten profile screenshot was not retained and must not be claimed.

Final packed room interaction, mission return and startup-content evidence are
tracked in `docs/NAV_EXPLORATION_NEXT_UPDATE.md`. The original title artwork and
authoring assets remain unchanged.
