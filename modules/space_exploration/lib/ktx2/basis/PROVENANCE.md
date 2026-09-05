# Basis transcoder — provenance

Copied verbatim from three.js **r128**, `examples/js/libs/basis/`.

This is deliberately NOT the copy in the repo root at `assets/basis/`. That one
pairs with the main game's own KTX2 path in `src/engine/materials.js` and is a
different build — the two differ by sha256 for both the `.js` and the `.wasm`.

The loader chain in this directory (`KTX2Loader.js`, `BasisTextureLoader.js`) is
vendored from r128, and `modules/space_exploration/lib/GLTFLoader.js` and
`DRACOLoader.js` are byte-identical to r128's classic builds. Pairing the
transcoder with the same release makes the API match a fact rather than an
assumption; mixing releases here would fail at transcode time, on device, in a
way that is painful to trace back to a version skew.

If the module's three is ever upgraded, re-copy all of these together from the
new release — loaders and transcoder are a set.
