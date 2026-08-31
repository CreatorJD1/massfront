# MASSFRONT air-destruction master v2

- Source: built-in image generation, 2026-08-22.
- Purpose: original high-resolution art master for a future 4x4 air-vehicle
  destruction flipbook; it is **not** a live runtime asset yet.
- Prompt intent: an original transparent combustion progression from a hot
  rupture through asymmetric fire, charcoal smoke, and a thinning smoke column.
- Constraints: no copied game art, no logos/text, no black matte, no hard cell
  cutoffs, and no duplicate frames.
- Output QA: PNG, 1233x1275, `Format32bppArgb`; corner alpha is 0.  Its
  non-square output must be normalized, cell-cut, guttered, and alpha-dilated
  by the VFX bake before it can replace a production atlas.

The source master is intentionally retained under `assets/source/`, which the
mobile packer excludes. Runtime assets must only reference a separately baked,
validated sibling under `assets/textures/vfx/`.
