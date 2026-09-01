# Cursor handoff — Stage 15 and 1.33.49 release

Date: 2026-08-31  
Canonical checkout: `C:\Users\Jason\Documents\Codex\2026-08-01\massfront-rts-mobile-game-for-apple`  
Permanent user path: `C:\Users\Jason\Documents\Codex\MASSFRONT-main-source`

## Owner decisions

- Stage 10 models are accepted and locked. The admitted set is 327 models:
  320 world-kit plus 7 retained Spline models. Do not regenerate them.
- Multiplayer must be active in 1.33.49, not disabled.
- Supported release layouts are two-player PvP Skirmish and two-to-four-player
  Co-op against AI. Three/four-player PvP is deliberately outside this release.
- Social Command must show a real aggregate online count.
- World Chat exposes usernames and player actions: View, Add Friend, Block,
  Private Message, Report, and Invite to the current Co-op/Versus lobby.

## Completed Stage 15 implementation

- Deterministic simulation clock, serializable seeded RNG, and gameplay hash.
- Typed authoritative command consumer for move, stop, hold, attack, guard,
  build, production, research, and commander signature commands.
- Host and non-host launch admission. After host launch, every frozen roster
  member privately discovers the immutable match receipt, claims only their
  assigned one-time credential, and enters the same MatchRoom.
- Non-host unit/building ownership, own-bank HUD, own production cycling, and
  commander signature takeover.
- Durable Object realtime relay: fixed 30 Hz ticks, delayed commands, hashes,
  reconnect token rotation, grace expiry, forfeit, and abuse bounds.
- Active release flags in `cloudflare/massfront-auth/wrangler.toml`:
  lobbies, invites, realtime, online count, World Chat, and friend chat.
- Online aggregate: authenticated 120-second heartbeats, 45-second visible-UI
  refresh, aggregate count only.
- World Chat: authenticated verified/age/moderation gate, visible usernames,
  bounded feed, reciprocal block filtering, reports, rate limits, conservative
  built-in safety fallback, and preferred external `CONTENT_SAFETY` binding.
- Friend-only private chat remains subject to the same block/report/safety rules.

## Current verification

- Game bundle: 108 sources, PASS (26.62 MB on the final handoff run).
- Multiplayer Worker/API before World Chat: 397/397.
- Real local two-client WebSocket relay: 26/26.
- Match runtime: 22/22; consumer: 16/16; takeover: 11/11.
- Gameplay hash: 14/14; deterministic clock/RNG contract: PASS.
- Launch client/UI: 24/24 and 14/14 before World Chat.
- World Chat Worker/API: 430/430.
- World Chat social client/UI: 49/49 and 28/28.

## First task for Cursor

Finish the migration-test bookkeeping that was interrupted for handoff:

1. Update `cloudflare/massfront-auth/test/migrations.test.mjs` hardcoded
   `0002–0006` expectations to include `0007-world-chat.sql`.
2. Apply 0007 in its August-19 fixture and expect `world_messages` plus indexes.
3. Run:
   - `npm run test:migrations` in `cloudflare/massfront-auth`
   - `npm test` in `cloudflare/massfront-auth`
   - `node tools/probe-social-client.mjs`
   - `node tools/probe-social-ui.mjs`
   - `node tools/bundle.mjs`

The last migration-suite run failed only because its hardcoded list stopped at
0006; do not waive it and do not delete migration 0007.

## Rebuild required

`MASSFRONT.apk`, `www/`, and the 1.33.49 OTA staging payload were built before
the final World Chat edits and are stale. Rebuild only after the migration test
passes:

1. `node tools/pack-www.mjs`
2. `npx cap sync android`
3. `cd android && .\gradlew.bat assembleDebug --offline`
4. From repo root, run Git Bash explicitly:
   `C:\Program Files\Git\bin\bash.exe tools/shrink-apk.sh`
5. `node tools/bundle-update.mjs 1.33.49`
6. Record the new APK and OTA sizes/SHA-256 in
   `docs/RELEASE_1.33.49_LOCAL_HANDOFF_2026-08-31.md`.
7. Refresh and verify the local `www/` preview, including Social tabs, World
   Chat action states, and the multiplayer lobby/launch route.

## Production boundary

No remote deployment, D1 mutation, OTA activation, Hugging Face upload, store
submission, or production flag change was performed in this pass. Production
still requires explicit release execution. Before Worker deployment:

- apply additive migrations 0004 through 0007 through the guarded production
  migration procedure, with backup/bookmark evidence;
- deploy the Worker with the active release flags already in `wrangler.toml`;
- verify capabilities and real remote routes;
- upload immutable artifacts first and update the live OTA pointer last.

Do not deploy new Worker code before migrations 0004–0007 are present; the
capabilities intentionally fail closed when their tables are absent.

## Documentation to refresh after rebuild

- `docs/STAGE15_SOCIAL_MULTIPLAYER_STATUS_2026-08-30.md`: add online counter,
  World Chat, final 430/430 and UI/client counts.
- `docs/MASTER_PLAN_STATUS.md`: Stage 15 is locally complete for supported
  modes and active in the 1.33.49 configuration; device/release acceptance is
  Stage 18.
- `docs/RELEASE_1.33.49_LOCAL_HANDOFF_2026-08-31.md`: replace stale 107-source,
  APK hash/size, multiplayer-disabled, and old open-gate wording.
- Keep `docs/POST_1.33.49_MASTER_PLAN.md` as the remaining-work plan after this
  release.
