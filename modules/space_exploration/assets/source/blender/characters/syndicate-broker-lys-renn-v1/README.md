# Broker Lys Renn — Syndicate Commander 1

Accepted source-art package for Broker Lys Renn, Synthetic Prime of the
Syndicate Coalition. The character is authored as a 5 ft 11 in (1.8034 m)
tall, slim athletic commander with a packed synthetic bodysuit surface,
Stage08 ponytail silhouette, six-part V4 neural device, and removable
eight-mesh flats.

## Deliverables

- `syndicate-broker-lys-renn-v1.blend` — final Blender authoring master.
- `deliverables/syndicate-broker-lys-renn-v1.vrm` — rebuilt VRM 1.0 with
  humanoid rig, expressions, and three retained spring chains.
- `derived/syndicate-broker-lys-renn-v1-stage.glb` — rest-pose interchange
  stage used by the deterministic VRM rebuild.
- `textures/` — the exact 14 accepted body, hair, and face source textures.
- `validation/` — centered 24-view proof sheet, deterministic source sidecar,
  authoring validation, and VRM round-trip validation.

The final face has 60 shape keys. In addition to standard VRM presets, the
VRM includes focused, determined, smirk, tired, shocked, worried, commanding,
softSmile, and pain custom expressions.

## Integration state

`SOURCE_ACCEPTED_RUNTIME_UNREGISTERED`

`runtimeReady` is intentionally `false`. This package is canonical source art;
MASSFRONT does not currently have a registered VRM character loader or catalog
identity for this asset. Do not add it to `boot.js` or the runtime manifest
until a separate runtime-integration task supplies and verifies that path.

The accepted master uses Stage08 hair only. Stage09 experiments, rejected
neural-device revisions, `.blend1` backups, temporary renders, and earlier
smoketest artifacts are deliberately excluded.
