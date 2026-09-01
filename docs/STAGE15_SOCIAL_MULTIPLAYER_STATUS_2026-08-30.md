# Stage 15 — Social and multiplayer integration status

Date: 2026-08-31  
State: **LOCALLY COMPLETE FOR THE SUPPORTED 1.33.49 MODES — release configuration active; not deployed**

The earlier moderation-only checkpoint was misnumbered as Stage 14 and is now
preserved as a [historical Stage 15 foundation handoff](archive/stages/15/STAGE15_SOCIAL_MULTIPLAYER_FOUNDATION_HANDOFF_2026-08-30.md).

Remaining post-release work stays in
[`POST_1.33.49_MASTER_PLAN.md`](POST_1.33.49_MASTER_PLAN.md). This status does
not rewrite that plan.

## Owner decisions (1.33.49)

- Multiplayer is **ACTIVE** in the 1.33.49 release configuration.
- Supported layouts: two-player PvP Skirmish and two-to-four-player Co-op
  versus AI.
- Three- and four-player PvP are out of scope for this release.
- Social Command shows a real aggregate online count.
- World Chat exposes usernames and player actions: View, Add Friend, Block,
  Private Message, Report, and Invite to the current Co-op/Versus lobby.

## Just-verified local gates (2026-08-31)

- `npm run test:migrations` in `cloudflare/massfront-auth`: **55/55 ALL GREEN**,
  including `0007-world-chat.sql`, the `world_messages` table, indexes
  `idx_world_messages_page` and `idx_world_messages_user`, and wrangler local
  apply **7/7**.
- `npm test` (`social.test.mjs`): **430/430**.
- `node tools/probe-social-client.mjs`: **49/49**.
- `node tools/probe-social-ui.mjs`: **28/28**.
- `node tools/bundle.mjs`: **108** sources, `dist/massfront.html` **26.62 MB**.

These counts replace the earlier 375/375 Worker and 50/50 migration wording.
Production was not deployed in this pass. APK and OTA hashes are not recorded
here; another agent owns those packaged identities.

## Online counter

- Social Command displays a live aggregate online count, not a placeholder.
- Authenticated clients send 120-second heartbeats; the visible UI refreshes
  every 45 seconds.
- The Worker returns an aggregate count only.

## World Chat

- Authenticated verified/age/moderation gate before send or read.
- Visible usernames on a bounded feed.
- Reciprocal block filtering, reports, and rate limits.
- Conservative built-in safety fallback; preferred external `CONTENT_SAFETY`
  binding when present.
- Player actions: View, Add Friend, Block, Private Message, Report, and Invite
  to the current Co-op/Versus lobby.
- Friend-only private chat remains subject to the same block, report, and
  safety rules.

## Verified local foundation

- Moderation migrations and fail-closed social capability checks remain intact.
- Seat-bound, single-use launch credentials are consumed before WebSocket
  upgrade.
- A SQLite-backed Durable Object owns each match room.
- The bounded version-1 protocol relays deterministic 30 Hz ticks with two- or
  three-tick input delay, ordered command batches, explicit acknowledgements
  and rejections, state-hash agreement/divergence, rotating reconnect
  capabilities, grace expiry, deterministic forfeit, and privacy-safe audit
  metadata.
- Earlier local Worker/D1 and two-client WebSocket checks remain 64/64 and
  26/26. The fixed-tick lane measured 30 ticks in 999 ms.
- The 1.33.49 Worker configuration enables lobbies, invitations, realtime
  match rooms, the online aggregate, World Chat, and friend chat. No Worker
  deployment, production D1 mutation, secret installation, or remote
  activation occurred; production remains unchanged until the release is
  explicitly deployed.
- The browser transport now registers a typed, seat-aware gameplay consumer for
  move, stop, hold, attack, guard, construction, production, research, and
  commander signature commands. It preflights complete ticks, including
  within-tick queue/site/study reservations, validates generation handles and
  ownership, and fails closed on unsupported or cross-seat commands.
- Live local move/stop/hold/attack/guard controls now take over to the outbound
  command relay while a network room is running. Construction confirmation,
  production cards, research cards, and commander signature activation use the
  same takeover seam. A rejected network proposal never falls through to a
  local-only mutation; offline matches retain their existing controls.
- The consumer exposes an immutable welcome/start bootstrap snapshot containing
  the local seat, ordered seats, and frozen lobby rules. Browser checks pass
  16/16 for authoritative consumption, 11/11 for outbound takeover and expanded
  schemas, and 22/22 for the protocol transport. The 108-source bundle parses.
- A serializable simulation clock and seeded random stream own authoritative
  match randomness. The gameplay hash includes their snapshot; the deterministic
  contract and 14/14 gameplay-hash checks pass.
- After host launch, every frozen roster member can discover the immutable
  match receipt through the authenticated lobby endpoint, claim only their own
  single-use credential, and connect automatically. The current social
  client/UI probes pass 49/49 and 28/28; the real two-client local
  Worker/WebSocket run passes 26/26.
- Non-host clients select only their canonical units and buildings, cycle only
  their production structures, read their own economy bank, and submit their
  own commander signature through the same typed command lane.

The privacy-safe evidence summary and source fingerprints are retained in
[`evidence/stage15/README.md`](evidence/stage15/README.md).

## Accepted release scope

- Two-player PvP Skirmish.
- Two-to-four-player Co-op against AI.
- Three- and four-seat free-for-all/team PvP remain outside 1.33.49 because the
  current simulation has two global combat teams. Those layouts fail closed
  instead of mapping players onto the wrong army.

## Release/device gate carried to Stage 18

The exact packaged candidate still needs a physical two-device soak covering
mixed commands, reconnect, divergence, forfeit, suspend/resume, and mobile
network changes. This is a Stage 18 device/release acceptance gate, not missing
Stage 15 implementation. Multiplayer remains enabled in the release
configuration; when the production Worker is deployed, its active flags expose
the accepted modes.
