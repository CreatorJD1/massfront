# MASSFRONT raymarch density/emission source master v1

- Origin: original MASSFRONT art generated on 2026-08-22 with the local image-generation workflow.
- Intended use: a source reference for a later, reviewed bake into separate density and emission driver textures for the High/Cinematic raymarch pass.
- Content: sixteen fire-to-soot stages on opaque black, arranged as a 4x4 progression; no third-party game imagery was used.
- Not a runtime asset: the master is 1254x1254 RGB and must be cell-cropped, guttered, resampled, channel-packed, alpha/edge-checked, and verified in a real GPU capture before it may be registered in the manifest.
- Guardrail: retain shader faction tinting and physically distinct fire/soot fields; this master must not become a replacement flat billboard layer.
