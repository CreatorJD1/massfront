# UGA Anime Human Master V1 — Source Provenance

This is an original MASSFRONT source candidate generated for the UGA ship, commander-cinematic, and personnel-content pipeline. It is not copied from a reference game or third-party character.

- Source tool: Spline
- Source scene: <https://my.spline.design/untitled-vii8cSRLttVJvb6YWxjZIvw3/>
- Spline root ID: `ee8bcfa5-230e-42d2-b076-ed17f988f682`
- Spline mesh ID: `0d7eaa4c-4812-494c-9ea8-0909d4ab37a6`
- Image generation ID: `bc293e81-3df9-4ede-9a6e-db2e4290078b`
- Image asset ID: `87331ac9-8391-49f4-a46d-7dff8f1c5e4c`
- Source GLB SHA-256: `1336d76bf02348209b9d62c4c0e852114cae75b0e51b8b2f80b0e69e00726d76`

The source visually passed the full-body framing requirement: head, both hands, and both boots are present, with the arms extended in a strict T-pose. Blender front/side/back inspection then exposed stretched, sliced surfaces and topology unsuitable for deformation or direct LOD production. The GLB is retained as provenance and rough reference only; it is rejected for runtime use and must not be decimated into production LODs.

The approved clean-rebuild reference is `assets/source/concepts/characters/uga-anime-human-master-v1/uga-expedition-specialist-turnaround-v1.png` (SHA-256 `ab31ed58d2132f42236840a5a33dff6a45b8c5f6841e523e6f304508b9edb75f`). The new mesh must be authored from that consistent front/side/back/three-quarter sheet.

The helmet and sealed face are intentional production constraints. MASSFRONT characters remain helmeted unless a later approved asset explicitly includes a facial rig, expression set, lip sync, and close-up animation evidence. This source does not claim facial animation.

The source mesh contains 375,004 triangles and has no rig or animation clips. It is deliberately classified as an authoring master, not a runtime asset. It must be normalized, retopologized, rigged, baked, LOD-authored, and verified before inclusion in any player content manifest.
