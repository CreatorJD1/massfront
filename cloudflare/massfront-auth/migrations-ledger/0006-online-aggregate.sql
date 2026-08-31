-- Aggregate-only live population. This is deliberately separate from friend
-- presence: appearing in the global count must never change a player's chosen
-- friend-presence state or create a last-seen directory.
CREATE TABLE IF NOT EXISTS online_heartbeats (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_online_heartbeats_expires
  ON online_heartbeats(expires_at);
