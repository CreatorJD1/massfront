-- Authenticated global chat. Usernames are resolved from users at read time,
-- the row stores no e-mail, token, presence, IP address or last-seen data.
CREATE TABLE IF NOT EXISTS world_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_world_messages_page
  ON world_messages(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_world_messages_user
  ON world_messages(user_id,created_at DESC,id DESC);
