# MASSFRONT multiplayer session contract

Status: staging lobby and friend invitations are implemented locally in Worker
migration `0003-lobbies-invites.sql`, the authenticated client, and Social UI.
They remain disabled in the shipped Worker configuration until the migration is
applied and `MULTIPLAYER_LOBBIES_ENABLED` / `MULTIPLAYER_INVITES_ENABLED` are
explicitly enabled. Match launch, matchmaking, command relay, reconnect, and
authoritative realtime sessions are not implemented. The client therefore
continues to advertise `multiplayer:false` and locks launch until a future
server returns `realtimeMatch:true`.

Minimum authenticated API:

- `POST /multiplayer/lobbies` creates a lobby and returns its opaque ID, invite
  code, host, revision, expiry, and authoritative rules snapshot.
- `GET /multiplayer/lobbies/:id` returns roster, presence, ready state, host,
  rules revision, and launch state. Membership is required.
- `POST /multiplayer/lobbies/join` joins by invite code. `POST
  /multiplayer/lobbies/:id/leave` and `/ready` perform revision-checked state
  transitions and return the new lobby revision.
- `POST /multiplayer/invites` accepts `{lobbyId, username}` and returns an
  expiring opaque invite ID. Only accepted, unblocked friends are eligible.
- `GET /multiplayer/invites` lists pending invitations for the signed-in user;
  `POST /multiplayer/invites/:id/respond` accepts or declines one.
- `POST /multiplayer/lobbies/:id/launch` returns a short-lived match token only
  when the authoritative roster and rules are locked and every required player
  is ready.
- A realtime authenticated session channel relays deterministic player commands
  by monotonic tick/sequence, acknowledges them, supports bounded reconnect and
  state resync, detects desync, and records disconnect/forfeit outcomes.

Security and operations requirements:

- The account/social gate, two-way block filter, rate limits, opaque identifiers,
  expiry, and server-side authorization apply to every route and channel event.
- Host migration, duplicate-device sessions, stale revisions, invite revocation,
  reconnect deadlines, version mismatch, and content/rules mismatch must have
  explicit protocol outcomes.
- A new versioned capability handshake should return literal booleans for
  `lobbies`, `invites`, and `realtimeMatch`; UI may enable multiplayer only when
  all required capabilities are true.
