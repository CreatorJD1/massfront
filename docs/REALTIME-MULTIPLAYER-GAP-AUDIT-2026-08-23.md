# Realtime multiplayer + moderation — gap audit

**Date:** 2026-08-23 · **Method:** read-only inspection of `cloudflare/massfront-auth/src/index.js`,
`wrangler.toml`, `src/authportal.js`, `src/socialui.js`. No deploy, no production change.

## One-line verdict

The lobby system is **roster coordination only**. It agrees *who* is in a match and *what
the rules are*; nothing in this repository can carry a single gameplay command between two
players. `realtimeMatch:false` is not a feature flag awaiting a flip — it is an accurate
statement that the transport does not exist.

## What exists today

| Capability | State | Evidence |
|---|---|---|
| Accounts, sessions, verification, age gate | Working | 296/296 + 59/59 |
| Friends, blocks, reports | Working | real-Worker E2E |
| Presence | Working, flag-gated | `handlePresenceWrite/List` |
| Chat | Implemented, **fails closed** | needs `CONTENT_SAFETY`; returns `503` without it |
| Lobby create/join/ready/leave, host migration | Working | optimistic `revision`, `409 stale_revision` |
| Invites (friend-only, dedupe, expiry) | Working | `409 already_invited` |
| Capability handshake | Working | `realtimeMatch:false` at `src/index.js:1441` |
| **Realtime match transport** | **Absent** | no WebSocket, no Durable Object, no binding |

`grep -niE "websocket|durable_?object" cloudflare/massfront-auth/src/index.js wrangler.toml`
returns **nothing**. The client mirrors the server honestly: `src/authportal.js:1480` sets
`multiplayer: c.realtimeMatch === true`, so the whole feature stays dark.

## The exact missing implementation

### 1. Authenticated realtime match transport
Nothing exists. D1 + `fetch` cannot carry a match; this needs a **Durable Object** per match
(the only Cloudflare primitive giving a single authoritative coordination point with
in-memory state and WebSocket hibernation). Required: `[[durable_objects.bindings]]` +
a migration tag in `wrangler.toml`, a `MatchRoom` class, and a `GET /match/:id/socket`
upgrade route that authenticates **before** `101 Switching Protocols` — a socket accepted
first and authorised later is an unauthenticated pipe for however long that takes.

### 2. Deterministic command relay
The simulation is already lockstep-friendly (fixed `1/30` step, seeded RNG, `mfPhysStateHash`
exists). Missing: turn/tick sequencing, per-tick command batching, an input-delay window
(2–3 ticks), and a periodic state-hash exchange so divergence is *detected* rather than
silently played out. Without the hash exchange two clients drift apart and both believe
they won.

### 3. Reconnect deadlines
`sessions` has `expires_at`, but a match has no concept of a *seat* that survives a dropped
socket. Needed: seat state (`connected|grace|forfeit`), a grace window (~45–90 s), command
buffering for the absent player, and a deterministic forfeit when the deadline passes —
decided by the room, never by a client claiming its opponent left.

### 4. Version / content / rules compatibility
`lobbyRules()` validates mode/slots/map only. A match must refuse to start unless every
participant agrees on: build version, `assets/data/manifest.json` hash, unit/balance table
hash, and the rules object. Two clients on different balance tables desync immediately and
it presents as "cheating".

### 5. Match launch tokens
No such concept. `POST /multiplayer/lobbies/:id/launch` should mint a short-TTL,
single-use, seat-bound token (host-only, all members ready, capacity satisfied) that the
socket upgrade requires. Without it, lobby membership and match entry are separate
truths and the second one is unguarded.

### 6. Host migration
Exists for the **lobby** (`handleLobbyAction` reassigns `host_id` to the earliest joiner).
Does **not** exist for a running match, and the lobby answer does not transfer: mid-match
authority is the Durable Object, so "host" is a UI role only. What is actually missing is
what happens when the host *disconnects mid-match* — see (3).

### 7. Abuse prevention and rate limiting
`RATE_LIMITS` covers HTTP buckets well. A socket bypasses all of it. Needed: per-connection
command-rate ceilings, payload size caps, per-match join attempt limits, and a bucket for
socket upgrades. A command flood is currently limited only by the client's own good manners.

### 8. `CONTENT_SAFETY` service binding
Consumed at `src/index.js:874` and `:914`; **no binding in `wrangler.toml`**. The code fails
closed — chat reports capability `false` and routes return `503 feature_disabled` — which is
correct and is why chat is currently dark. Enabling chat requires the service to exist,
plus a decision about what it does on timeout (fail closed, or the feature is theatre).

### 9. Report review and enforcement operations
`reports` rows accumulate with `resolved` and `idx_reports_open`; `social_banned` exists on
`users`. There is **no** review surface, no enforcement endpoint, no audit trail of who acted
and why, and no appeal path. Reports are currently write-only — a moderation queue nobody
can read is not moderation, and for store review it is the part that gets asked about.

## Recommended build order

1. `CONTENT_SAFETY` binding + moderation queue/enforcement (unblocks chat; smallest, and
   required for store review regardless of multiplayer).
2. Match launch tokens + compatibility handshake (pure HTTP, testable with the existing E2E).
3. `MatchRoom` Durable Object + authenticated socket upgrade.
4. Deterministic relay + state-hash divergence detection.
5. Reconnect/forfeit deadlines.
6. Socket-layer rate limiting.
7. Only then flip `realtimeMatch:true`, and only behind a passing end-to-end two-client test.

## Constraint honoured

`realtimeMatch` remains `false`. Nothing here was deployed, and production configuration was
not altered.
