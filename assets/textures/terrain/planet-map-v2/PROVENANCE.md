# MASSFRONT Planet Map Material Vertical Slice v2

These materials are original production assets for MASSFRONT. The two source
plates were generated specifically for the project on 2026-08-24 with the
built-in OpenAI image-generation tool. No pixels were copied from reference
games or third-party texture libraries.

Art direction was reviewed against
`source-media/concepts/planet-map-v2/verdant-ashland-map-concept-v1.png`
(SHA-256 `4e628cca810a1c4146a9a629e7aac63e6851fc378fea1687d3445f233b2d5d1b`).
That concept establishes regional palette, material scale, readable roads,
water separation, and civic-foundation language only. Its pixels are not read,
cropped, sampled, or transformed by the production bake.

`tools/planet-map-art/bake-planet-map-v2.py` performs deterministic production
processing: crop/resize, broad illumination correction, periodic seam repair,
exact edge locking, material-specific height inference, tangent-normal and
roughness packing, lossless WebP encoding, hash reporting, and 3x3 wrap proofs.

The vertical slice is deliberately small:

- `verdant-highland`: grass semantic slot; no large cracks.
- `ashland-basalt`: soil/rock semantic slot; restrained basalt-only fracture.

Both pairs are 1024x1024. Albedo is lighting-neutral RGB. Normal RGB is tangent
space and alpha stores roughness, matching the live terrain shader contract.
The active GPU cost is 8 MiB per selected pair because the loader uploads both
decoded images as RGBA8; only one region pair should be resident in that slot.

The adjacent JSON report is authoritative for source hashes, output hashes,
decoded border deltas, roughness ranges, and compressed size. These files are a
reviewed candidate pack and are not silently substituted into the current live
terrain mapping while shared renderer work is dirty.
