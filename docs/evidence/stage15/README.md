# Stage 15 local evidence summary

Captured: 2026-08-30  
Scope: local Wrangler/workerd, disposable local D1, SQLite Durable Objects, and
two real WebSocket clients. No production service was contacted or changed.

## Results

- Worker/social suite: 373/373
- Migration suite: 50/50
- Existing Worker/D1 E2E: 64/64, 121 HTTP exchanges
- Realtime two-client E2E: 26/26
- Browser match transport runtime: 22/22
- Browser deterministic match consumer: 16/16
- Browser launch UI: 12/12
- Fixed-tick sample: 30 ticks in 999 ms
- Durable Object audit: all nine required event classes; exact metadata-only
  columns `id`, `at`, `event`, `seat`, `code`, `count`
- Wrangler dry run: pass; 146.05 KiB, 28.99 KiB gzip

The raw local E2E transcript is intentionally not copied into documentation:
it contains disposable development account identifiers and verification codes.
This summary retains the acceptance result without publishing those values.

## Source fingerprints at handoff

- `src/updater.js`: `1ae401d198400909171bfff6a91539344fdb26ad1e96749d7e60e1b4fbfcfa7d`
- `tools/test-runtime-compatibility-accessor.mjs`: `bb3337431bdf15976f612e82757fee98bfdd32d6b8eaadda5dd2102a39af17f2`
- `cloudflare/massfront-auth/src/index.js`: `52688e6587e424a03cb2b30a9288459c1aca4c866c1ccf5cbbb1daaf7bf64388`
- `cloudflare/massfront-auth/test/e2e-realtime.mjs`: `dc643296a8ba056380f43a84a2f2ca234d3c6bee81e65d14709c9b1d0d9de63b`
- `cloudflare/massfront-auth/test/verify-realtime-local-audit.mjs`: `f894868ee66e1c62d8f79f94b3e7e3009526f4b8206077e5b32321ff20f4c86f`
- `src/game/matchconsumer.js`: `46208671759ef22b61bcaa60b54c579e37c1e321ce5701316e1a02612d5026cd`
- `tools/probe-stage15-match-consumer.mjs`: `53465f822cd5969f4dfe274819c29670860f0b10da236881b879e0416244361c`

These hashes bind the summary to the inspected files; a later source change
requires re-running the relevant acceptance lane.

## Match-consumer scope and remaining locks

The new consumer applies frozen authoritative tick packets without using local
selection state. Unit handles include generations, every command has an exact
schema, and each outer command row is checked against a concrete simulation
seat. Unsupported commands, stale handles, cross-seat ownership, non-integer
coordinates, and non-live matches fail closed. The browser replay probe applies
the same multi-seat packet in two independent clients and compares the resulting
command state byte for byte.

This is a command-application seam, not authorization to enable multiplayer.
`MULTIPLAYER_REALTIME_ENABLED` remains absent from active Wrangler variables and
the client capability fallback remains false. Activation is still blocked by
render-clock and `Math.random` gameplay mutation, the lack of a typed outbound
input takeover, the lack of a network-aware match bootstrap/global seat model,
unsupported production/build/research commands, and missing two-device soak,
reconnect, divergence, packaged-device, and physical-device acceptance.
