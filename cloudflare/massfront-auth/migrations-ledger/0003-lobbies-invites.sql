-- Additive, disabled-by-default multiplayer staging lobbies and friend invites.
CREATE TABLE IF NOT EXISTS multiplayer_lobbies (
  id         TEXT PRIMARY KEY,
  code       TEXT NOT NULL UNIQUE,
  host_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','closed')),
  revision   INTEGER NOT NULL DEFAULT 1,
  rules_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_lobbies_expiry ON multiplayer_lobbies(expires_at);

CREATE TABLE IF NOT EXISTS multiplayer_lobby_members (
  lobby_id   TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ready      INTEGER NOT NULL DEFAULT 0,
  joined_at  INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_members_user ON multiplayer_lobby_members(user_id,updated_at);

CREATE TABLE IF NOT EXISTS multiplayer_invites (
  id           TEXT PRIMARY KEY,
  lobby_id     TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  from_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  responded_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_multiplayer_invite_pending
  ON multiplayer_invites(lobby_id,to_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_multiplayer_invite_inbox
  ON multiplayer_invites(to_id,status,expires_at);
