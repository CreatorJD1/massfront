-- Additive, disabled-by-default match launch compatibility foundation.
-- This does not provide a realtime transport. It only proves that a complete,
-- ready lobby agreed on byte-identical immutable inputs before issuing short-
-- lived, single-use credentials for a future internal MatchRoom.

CREATE TABLE IF NOT EXISTS multiplayer_lobby_compatibility (
  lobby_id       TEXT NOT NULL REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lobby_revision INTEGER NOT NULL,
  build_version  TEXT NOT NULL,
  manifest_hash  TEXT NOT NULL,
  balance_hash   TEXT NOT NULL,
  rules_hash     TEXT NOT NULL,
  submitted_at   INTEGER NOT NULL,
  PRIMARY KEY(lobby_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_compatibility_revision
  ON multiplayer_lobby_compatibility(lobby_id,lobby_revision);

CREATE TABLE IF NOT EXISTS multiplayer_matches (
  id              TEXT PRIMARY KEY,
  lobby_id        TEXT NOT NULL UNIQUE REFERENCES multiplayer_lobbies(id) ON DELETE CASCADE,
  launch_revision INTEGER NOT NULL,
  host_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  build_version   TEXT NOT NULL,
  manifest_hash   TEXT NOT NULL,
  balance_hash    TEXT NOT NULL,
  rules_hash      TEXT NOT NULL,
  roster_size     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  expires_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_matches_expiry
  ON multiplayer_matches(expires_at);

CREATE TABLE IF NOT EXISTS multiplayer_match_seats (
  match_id          TEXT NOT NULL REFERENCES multiplayer_matches(id) ON DELETE CASCADE,
  lobby_id          TEXT NOT NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat_number       INTEGER NOT NULL,
  build_version     TEXT NOT NULL,
  manifest_hash     TEXT NOT NULL,
  balance_hash      TEXT NOT NULL,
  rules_hash        TEXT NOT NULL,
  token_hash        TEXT UNIQUE,
  token_issued_at   INTEGER,
  token_expires_at  INTEGER,
  token_consumed_at INTEGER,
  PRIMARY KEY(match_id,user_id),
  UNIQUE(match_id,seat_number)
);
CREATE INDEX IF NOT EXISTS idx_multiplayer_match_seats_user
  ON multiplayer_match_seats(user_id,match_id);
