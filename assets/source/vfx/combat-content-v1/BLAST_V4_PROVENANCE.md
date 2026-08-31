# MASSFRONT Blast Flipbook V4 Provenance

`blast-evolution-source-v4-checker.png` is an original project-bound image edit
created with Codex's built-in image generation tool on 2026-08-21. The edit
target was `blast-evolution-source-v3.png`.

Final edit brief: preserve the existing 16-frame fire-to-soot-to-smoke identity
and chronological 4x4 order; fully contain every effect inside its equal cell
with at least 12% transparent margin; preserve natural scale progression; no
cross-cell content, cropped plume, detached specks, vehicles, text, borders, or
grid lines. A second background-extraction pass requested genuine straight
alpha while preserving frame content.

The image tool returned a baked neutral checker rather than alpha. That source
is never shipped directly. `tools/bake-combat-content-fx-v1.py
--blast-v4-only` deterministically recovers the keyed silhouette, fills enclosed
white-hot cores, removes checker RGB from feather pixels, preserves shared cell
registration, writes `assets/textures/vfx/mf-blast-flipbook-v4.png`, and rejects
any alpha in the nine-pixel runtime gutter.
