# Caldris white-structure union repair v1

## Outcome

The flickering pale/white pieces cannot be safely merged from the repository yet because the Caldris modular road scene was closed without an exported Spline scene, generator, or source GLB. A complete repository search found no literal `CAL_END_*`, `CAL_X_*`, `CAL_T_*`, `CAL_CR_*`, or `CAL_ST_*` authoring objects. The correct status is **source repair required / geometry evidence unknown**, not fixed.

The authoritative source repair contract is [caldris-white-structure-union-repair.v1.json](caldris-white-structure-union-repair.v1.json). It defines one fail-closed structural operand set and one expected pale structural output for each module:

| Module | Exact source selector | Expected output |
| --- | --- | --- |
| End cap | prefix `CAL_END_` + role `STRUCTURAL_WHITE` | `CAL_END_STRUCTURAL_WHITE_UNION` |
| Four-way plaza | prefix `CAL_X_` + role `STRUCTURAL_WHITE` | `CAL_X_STRUCTURAL_WHITE_UNION` |
| T junction | prefix `CAL_T_` + role `STRUCTURAL_WHITE` | `CAL_T_STRUCTURAL_WHITE_UNION` |
| Corner | prefix `CAL_CR_` + role `STRUCTURAL_WHITE` | `CAL_CR_STRUCTURAL_WHITE_UNION` |
| Straight | prefix `CAL_ST_` + role `STRUCTURAL_WHITE` | `CAL_ST_STRUCTURAL_WHITE_UNION` |

These selectors are deliberately semantic rather than invented literal object lists. On source export, every pale structural object beneath the prefix must be assigned `MF_CALDRIS_STRUCT_WHITE` and admitted to the operand collection. Any unclassified pale object is a hard failure. Dark roadway, cyan guidance, amber hazards, sockets, navigation proxies, lights, and cameras are expressly excluded.

## Required repair

For each module:

1. Export or preserve an editable source scene before changing geometry.
2. Classify every prefixed object by material role.
3. Replace stacked curb/cap/frame plates with one extruded perimeter/profile solid where possible.
4. Where primitives are necessary, overlap intended operands by at least 5 mm; Boolean-union touching clusters with the exact solver before beveling.
5. Remove interior faces, merge vertices within 0.5 mm, recalculate outward normals, then bevel the union result.
6. Join disconnected pale structural clusters into the named module output without altering their topology.
7. Keep the dark roadway as a separate continuous solid.
8. Keep cyan and amber as distinct material regions. Prefer emissive masks in the roadway material; if geometry is unavoidable, use recessed inlays, never coplanar plates.
9. Re-run duplicate-triangle, near-coplanar overlap, intersection, socket-clearance, and grazing-angle mobile checks.

The repair is rejected if it only joins objects while preserving overlapping interior faces. The objective is one non-overlapping structural topology per touching cluster, not merely one object name.

## N7 deployer lane

`MF_HY3D_N7_DEPLOYER_LANE_8X8_V1` also lacks a checked-in editable scene or source GLB, so its geometric overlap state remains **UNKNOWN**. Published runtime metadata exposes enough names to prepare candidate wall and socket clusters, which are recorded in the JSON contract, but it is not authoritative enough for a blind Boolean operation.

The N7 repair may begin only after editable-source export. Preserve `NX7 Lane Deck`, both side walks, cyan guidance objects, and all eight amber warning objects as separate material regions. Audit the named ceramic wall, backing, band, skirt, flange, rib, jamb, head, and threshold candidates against their real materials and transforms before merging.

## Prevention rule for all future road modules

White curb and frame language is topology, not decoration. Build it as an extruded/swept solid, cut sockets into it, then bevel. Do not assemble a final module from coincident thin white plates. Guide markings belong in roadway texture/emission masks or physically recessed inlays. Every new Spline/Hunyuan road source must ship with the named material-role collections and the overlap evidence listed in the contract before it can become a runtime candidate.

## Validation

Run:

```text
node source-media/content-library/validate-caldris-white-structure-union-repair.mjs
node source-media/content-library/validate-caldris-white-structure-union-repair.mjs --self-test
```

This validates the fail-closed authoring contract and negative fixtures. It does not claim geometry repair; geometry remains blocked until source export.
