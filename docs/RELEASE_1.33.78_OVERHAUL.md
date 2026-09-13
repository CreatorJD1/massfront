# MASSFRONT v1.33.78 OVERHAUL

Published 2026-09-07.

## Player-facing changes

- Prevented fleet navigation starvation and restored real-time repathing.
- Preserved the selected Space Module scene, system, and planet across reloads.
- Routed Aelos, Veyra, and Karak expeditions to their exact authored ground
  locations instead of normalizing them back to Aelos.
- Made survey signals planet-specific, stopped failed scans from consuming a
  probe, and persisted extracted/depleted survey targets without duplicate
  rewards.
- Shipped the verified shared UGA interior graph and explicitly excluded its
  superseded monolithic source asset from runtime delivery.

## Published channels

- Stable OTA: v1.33.78, 115 artifacts, 96,930,538 bytes, manifest root
  `d0ea7acac3b24c37c7f15262569414692b23cfd7e02d291602ec7557c93083f4`.
- Hugging Face OTA manifests: commit
  `5b7ececb8c84471dca65332e432227d8673e683d`.
- Cloudflare Stable and immutable payload/content namespaces: active at
  v1.33.78.
- Android: `releases/MASSFRONT-v1.33.78-mobile-install.apk`, 260,578,935
  bytes, SHA-256
  `9dfc79f1c45bd19d08299cfe3a6903f73e084751039c82984bc81376ba80b007`.
- Browser/PWA: `CREATORJD/massfront-playtest` commit
  `667aa14c0ad52d0f3cad61dc556141dd326f2c48`.
- Galactic content: 457 files, 147,627,666 bytes, manifest SHA-256
  `a325c32a6dbd3a5feebc44b0dc7112cbbdeb88c28eb12982cc7ccbf0e575eab5`.

## Verification

- Bundle, module/domain, route/bridge, pack optimization, and 60/60 exploration
  delivery contracts passed.
- Hardware Playwright verified survey ownership, probe accounting, depletion
  and reload persistence, Veyra -> Nordhall exact routing, the packed mobile
  mission/debrief/return flow, and the live HF Space on ANGLE D3D11 / NVIDIA
  RTX 4060 with no page, HTTP, request, application, WebGL, or overflow errors.
- Public channel comparison and CORS/range probes passed. A simulated v1.33.77
  client downloaded 96.9 MB, applied the release, and restarted on v1.33.78.
- Public Cloudflare readback reverified all 457 Galactic content files.

Physical Android device acceptance and Apple Safari-installed PWA acceptance
remain device-only checks. Native iOS release work is permanently retired.
