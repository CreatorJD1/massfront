# UGA authored section restoration

Follow-up: the runtime now uses the verified lossless texture derivative rather
than the initial byte-identical GLB copy described below. See
`UGA_LOSSLESS_DELIVERY.md` for current bytes, preservation proof and limitations.

The owner rejected the radial-deck replacement and requested preservation and
improvement of the original XCOM-inspired sectional headquarters. The canonical
source and packed local preview now load the original authored room asset.

## Completed in this pass

- Original 11 modeled sections restored through `uga-authored-sections.glb`.
  SHA256 `00c25f0021054597b006f90dde9bd0289c99b33bf8d783a40463bbc42fb9e87f`
  matches the preserved source GLB byte-for-byte. Source art was not regenerated.
- Side-on overview and shallow-oblique selected-room views replace radial disks.
  Camera fitting excludes hidden geometry and respects actual phone controls.
- Exterior hull/ring context no longer intrudes into focused compartments.
  Structural emission is restrained without changing source textures.
- One section tap opens its inspector. Upgrade controls lead the panel; mobile
  section names and important cost/requirement labels are readable.
- Construction routes also focus the matching physical room and select its
  deck; opening/closing the inspector re-fits the camera to the available area.
- Hidden deployment previews no longer intercept room taps and fabricate drafts.
- Initial space briefings wait for player acknowledgement.

## Ownership

- Scene agent: `src/core/uga_command_scene.js`, `src/ship/uga_blender_assets.js`
  under the space module; `tools/test-uga-authored-sections.mjs`.
- UI agent: module `src/ui/uga_command.js` and `.css`.
- Readiness agent: module `tools/readiness/` and manifest-builder rules.
- Root: runtime asset derivation tool/asset, hidden-preview pick guard,
  player-paced briefing, regression tests, manifest/packed preview and this record.

## Evidence and limitations

- `tmp/uga-authored-sections/report.json`: 33 real section selections and mesh
  taps across 1440x900, 412x900 and 900x412. All passed on RTX 4060 ANGLE D3D11;
  no page or GL errors. All room screenshots inspected. Recorded source hashes
  match the canonical source and packed counterparts.
- Eleven rooms contain 30 authored upgrade plots. Command is a fixed room,
  not a missing three-plot upgrade district.
- Bundle, readiness selftests (42 assertions), save recovery, launch sequence,
  campaign product model, transmission controller and hidden-pick tests pass.
- Final packed-phone route passes updater, settled original-art intro, local
  identity, player-paced briefings, Research construction with matching room
  focus, upgrade choice without spend, Classic Standard and Back, and commander
  commissioning. Evidence: `tmp/verification/launch-sequence-packed/result.json`.
  External services were intentionally blocked; this is not live-auth/OTA proof.
- Earlier procedural captures remain the before-state under the module's
  `tmp/browser-captures/uga-focus/`; they are not current acceptance evidence.
- Initial capture failures caught a phone-landscape inset error and invisible
  Hangar-preview interception; both were corrected before the final matrix.
- The attempted Draco conversion failed strict node-transform fidelity. The
  byte-identical runtime copy is 81,372,160 bytes. Existing optimization gates
  still FAIL model size, raw PNG share and triangle budget. Thresholds were not
  weakened. Packaged web payload is approximately 293.6 MiB, module 151.02 MiB.
- Original coarse/pale textures and darker Hangar styling remain art-polish
  limitations. Short landscape requires inspector scrolling for some actions.

## Remaining work and delivery boundary

The corrected target is preferred-faction commander selection plus optional AI
ally or human co-op teammate. The current Galactic adapter is solo-only. Existing
multiplayer transport can be reused only after a dedicated expedition/session
adapter binds objective, loadouts, deterministic battle and validated rewards.
Do not advertise a functional co-op or Versus branch yet.

The complete guided scan/deploy/return tutorial, crafting-route gaps and persistent
cross-page content downloading identified in the audit are not resolved here.
Next safe work is fidelity-preserving per-section delivery optimization and those
flow integrations, with explicit real-device/two-player acceptance.

No upload or activation occurred. Android/OTA artifacts prepared before this pass
are stale for these changes. Only canonical source and local packed preview have
been updated; no claim is made of Android, Safari or live-service acceptance.
